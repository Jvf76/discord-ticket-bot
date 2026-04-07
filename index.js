require('dotenv').config();
const {
  Client, GatewayIntentBits, Events,
  ActionRowBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder,
  RoleSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ChannelType, PermissionFlagsBits, AttachmentBuilder
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

const dadosTickets = new Map();

const CONFIG = {
  canalAberturaId: process.env.CANAL_ABERTURA_ID,
  canalLogsTicketsId: process.env.CANAL_LOGS_TICKETS_ID,
  setores: {
    rh:          { nome: '🤝 RH',          descricao: 'Solicitações relacionadas a colaboradores, documentos e processos internos.',          categoriaId: process.env.CATEGORIA_RH_ID,          cargoId: process.env.CARGO_RH_ID },
    financeiro:  { nome: '💸 Financeiro',  descricao: 'Demandas sobre pagamentos, notas fiscais, faturamento e assuntos financeiros.',       categoriaId: process.env.CATEGORIA_FINANCEIRO_ID,  cargoId: process.env.CARGO_FINANCEIRO_ID },
    noc:         { nome: '🧠 NOC',         descricao: 'Incidentes de rede, monitoramento, quedas e instabilidades de link, TI.',             categoriaId: process.env.CATEGORIA_NOC_ID,         cargoId: process.env.CARGO_NOC_ID },
    estoque:     { nome: '📦 Estoque',     descricao: 'Controle de equipamentos, materiais, reposição e movimentação de itens.',             categoriaId: process.env.CATEGORIA_ESTOQUE_ID,     cargoId: process.env.CARGO_ESTOQUE_ID },
    cobranca:    { nome: '💸 Cobrança',    descricao: 'Pendências financeiras, negociação, inadimplência e retorno de cobrança.',            categoriaId: process.env.CATEGORIA_COBRANCA_ID,    cargoId: process.env.CARGO_COBRANCA_ID },
    suporte:     { nome: '🎧 Suporte',     descricao: 'Problemas técnicos, falhas de acesso, equipamentos e atendimento operacional.',        categoriaId: process.env.CATEGORIA_SUPORTE_ID,     cargoId: process.env.CARGO_SUPORTE_ID },
    agendamento: { nome: '📅 Agendamento', descricao: 'Marcação de visitas técnicas, instalações, ativações e remanejamentos.',              categoriaId: process.env.CATEGORIA_AGENDAMENTO_ID, cargoId: process.env.CARGO_AGENDAMENTO_ID },
    comercial:   { nome: '💰 Comercial',   descricao: 'Solicitações sobre vendas, propostas, planos, contratos e relacionamento comercial.', categoriaId: process.env.CATEGORIA_COMERCIAL_ID,   cargoId: process.env.CARGO_COMERCIAL_ID }
  }
};

const normalize = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const row = (...components) => new ActionRowBuilder().addComponents(...components);
const ephemeral = (content) => ({ content, flags: 64 });

function criarMenuSetores() {
  return new StringSelectMenuBuilder()
    .setCustomId('selecionar_setor')
    .setPlaceholder('Selecione o setor para abrir o ticket')
    .addOptions(
      Object.entries(CONFIG.setores).map(([value, { nome, descricao }]) => ({
        label: nome,
        description: descricao.slice(0, 100),
        value
      }))
    );
}

function criarBotoesTicket(ticketId) {
  const dados = dadosTickets.get(ticketId);
  const assumido = Boolean(dados?.responsavelId);
  return row(
    new ButtonBuilder()
      .setCustomId(`assumir_ticket_${ticketId}`)
      .setLabel(assumido ? `Assumido por ${dados.responsavelTag}` : 'Assumir Ticket')
      .setStyle(ButtonStyle.Success)
      .setDisabled(assumido),
    new ButtonBuilder()
      .setCustomId(`adicionar_ticket_${ticketId}`)
      .setLabel('Adicionar Pessoa/Cargo')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`fechar_ticket_${ticketId}`)
      .setLabel('Fechar Ticket')
      .setStyle(ButtonStyle.Danger)
  );
}

function montarMensagemTicket(ticketId) {
  const d = dadosTickets.get(ticketId);
  if (!d) return 'Dados do ticket não encontrados.';
  return (
    `# 🎫 Ticket Aberto\n\n` +
    `**Solicitante:** <@${d.solicitanteId}>\n` +
    `**Setor:** ${d.setorNome}\n` +
    `**Descrição do setor:** ${d.setorDescricao}\n` +
    `**Cargo responsável:** <@&${d.cargoSetorId}>\n` +
    `**Status:** ${d.responsavelId ? 'Em atendimento' : 'Aguardando atendimento'}\n` +
    `**Responsável:** ${d.responsavelId ? `<@${d.responsavelId}>` : 'Ainda não assumido'}\n\n` +
    `Descreva sua solicitação com o máximo de detalhes possível para agilizar o atendimento.`
  );
}

function podeGerenciarTicket({ member, user }, dados) {
  if (!member) return false;
  return (
    member.permissions?.has(PermissionFlagsBits.Administrator) ||
    dados.responsavelId === user.id ||
    member.roles?.cache?.has(dados.cargoSetorId)
  );
}

async function garantirPainelFixo(guild) {
  const canal = await guild.channels.fetch(CONFIG.canalAberturaId).catch(() => null);
  if (!canal || canal.type !== ChannelType.GuildText) return;

  const mensagens = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (!mensagens) return;

  const painelExistente = mensagens.find(
    msg => msg.author.id === client.user.id &&
      msg.components?.[0]?.components?.[0]?.data?.custom_id === 'selecionar_setor'
  );

  const conteudo = `# 🎫 Central de Tickets\n\nSelecione abaixo o setor responsável pelo seu atendimento.`;
  const components = [row(criarMenuSetores())];

  if (painelExistente) await painelExistente.edit({ content: conteudo, components }).catch(() => {});
  else await canal.send({ content: conteudo, components }).catch(() => {});
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) await garantirPainelFixo(guild);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    const { customId } = interaction;

    if (interaction.isStringSelectMenu() && customId === 'selecionar_setor') {
      if (interaction.channelId !== CONFIG.canalAberturaId)
        return interaction.reply(ephemeral(`A abertura de tickets só pode ser feita no canal <#${CONFIG.canalAberturaId}>.`));

      const setor = CONFIG.setores[interaction.values[0]];
      if (!setor?.categoriaId || !setor?.cargoId)
        return interaction.reply(ephemeral('Setor inválido ou configuração incompleta.'));

      const categoria = await interaction.guild.channels.fetch(setor.categoriaId).catch(() => null);
      if (!categoria || categoria.type !== ChannelType.GuildCategory)
        return interaction.reply(ephemeral('Categoria do setor não encontrada.'));

      const canaisDoSetor = interaction.guild.channels.cache.filter(
        c => c.parentId === setor.categoriaId && c.type === ChannelType.GuildText
      );
      const numeroTicket = canaisDoSetor.size + 1;
      const nomeCanal = `ticket-${normalize(setor.nome)}-${numeroTicket}`;

      const canalTicket = await interaction.guild.channels.create({
        name: nomeCanal,
        type: ChannelType.GuildText,
        parent: setor.categoriaId,
        topic: `Ticket de ${interaction.user.tag} | Setor: ${setor.nome}`,
        permissionOverwrites: [
          { id: interaction.guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id,             allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: setor.cargoId,                   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
        ]
      });

      const ticketId = canalTicket.id;
      dadosTickets.set(ticketId, {
        solicitanteId: interaction.user.id,
        solicitanteTag: interaction.user.tag,
        setorNome: setor.nome,
        setorDescricao: setor.descricao,
        cargoSetorId: setor.cargoId,
        responsavelId: null,
        responsavelTag: null,
        numeroTicket
      });

      await canalTicket.send({ content: `<@&${setor.cargoId}> novo ticket aberto por ${interaction.user}.` });
      await canalTicket.send({ content: montarMensagemTicket(ticketId), components: [criarBotoesTicket(ticketId)] });
      await interaction.reply(ephemeral(`Seu ticket foi criado com sucesso: ${canalTicket}`));
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      return;
    }

    if (interaction.isButton() && customId.startsWith('assumir_ticket_')) {
      const ticketId = customId.replace('assumir_ticket_', '');
      const dados = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (interaction.user.id === dados.solicitanteId) return interaction.reply(ephemeral('Você não pode assumir o próprio ticket.'));

      const membro = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!membro?.roles.cache.has(dados.cargoSetorId))
        return interaction.reply(ephemeral('Apenas alguém do setor responsável pode assumir este ticket.'));
      if (dados.responsavelId)
        return interaction.reply(ephemeral(`Este ticket já foi assumido por <@${dados.responsavelId}>.`));

      dados.responsavelId = interaction.user.id;
      dados.responsavelTag = interaction.user.username;
      dadosTickets.set(ticketId, dados);

      await interaction.channel.setName(
        `${normalize(interaction.user.username)}-${normalize(dados.setorNome)}-${dados.numeroTicket}`.slice(0, 90)
      ).catch(() => {});

      return interaction.update({ content: montarMensagemTicket(ticketId), components: [criarBotoesTicket(ticketId)] });
    }

    if (interaction.isButton() && customId.startsWith('adicionar_ticket_')) {
      const ticketId = customId.replace('adicionar_ticket_', '');
      const dados = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (!podeGerenciarTicket(interaction, dados))
        return interaction.reply(ephemeral('Somente o responsável, alguém do setor ou um administrador pode adicionar pessoas ou cargos.'));

      return interaction.reply({
        content: 'Escolha apenas uma opção:',
        components: [row(
          new ButtonBuilder().setCustomId(`escolher_add_pessoa_${ticketId}`).setLabel('Adicionar Pessoa').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`escolher_add_cargo_${ticketId}`).setLabel('Adicionar Cargo').setStyle(ButtonStyle.Secondary)
        )],
        flags: 64
      });
    }

    if (interaction.isButton() && customId.startsWith('escolher_add_pessoa_')) {
      const ticketId = customId.replace('escolher_add_pessoa_', '');
      const dados = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (!podeGerenciarTicket(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar pessoas neste ticket.'));

      return interaction.update({
        content: 'Selecione a pessoa que será adicionada ao ticket:',
        components: [row(new UserSelectMenuBuilder().setCustomId(`selecionar_usuario_${ticketId}`).setPlaceholder('Selecione uma pessoa').setMinValues(1).setMaxValues(1))]
      });
    }

    if (interaction.isButton() && customId.startsWith('escolher_add_cargo_')) {
      const ticketId = customId.replace('escolher_add_cargo_', '');
      const dados = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (!podeGerenciarTicket(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar cargos neste ticket.'));

      return interaction.update({
        content: 'Selecione o cargo que será adicionado ao ticket:',
        components: [row(new RoleSelectMenuBuilder().setCustomId(`selecionar_cargo_${ticketId}`).setPlaceholder('Selecione um cargo').setMinValues(1).setMaxValues(1))]
      });
    }

    if ((interaction.isUserSelectMenu() || interaction.isRoleSelectMenu()) &&
        (customId.startsWith('selecionar_usuario_') || customId.startsWith('selecionar_cargo_'))) {
      const isUser = interaction.isUserSelectMenu();
      const ticketId = customId.replace(isUser ? 'selecionar_usuario_' : 'selecionar_cargo_', '');
      const dados = dadosTickets.get(ticketId);
      const targetId = interaction.values[0];

      await interaction.deferReply({ flags: 64 });
      if (!dados) return interaction.editReply({ content: 'Dados do ticket não encontrados.' });
      if (!interaction.channel) return interaction.editReply({ content: 'Canal do ticket não encontrado.' });
      if (!podeGerenciarTicket(interaction, dados))
        return interaction.editReply({ content: `Você não tem permissão para adicionar ${isUser ? 'pessoas' : 'cargos'} neste ticket.` });

      await interaction.channel.permissionOverwrites.edit(targetId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true
      });

      return interaction.editReply({ content: `${isUser ? `Pessoa <@${targetId}>` : `Cargo <@&${targetId}>`} adicionado ao ticket com sucesso.` });
    }

    if (interaction.isButton() && customId.startsWith('fechar_ticket_')) {
      const ticketId = customId.replace('fechar_ticket_', '');
      const dados = dadosTickets.get(ticketId);

      if (interaction.user.id !== dados?.solicitanteId)
        return interaction.reply(ephemeral('Apenas quem abriu o ticket pode fechá-lo.'));

      await interaction.reply(ephemeral('Gerando transcript e fechando ticket...'));

      try {
        let mensagens = [];
        let ultimaId;

        while (true) {
          const options = { limit: 100, ...(ultimaId && { before: ultimaId }) };
          const msgs = await interaction.channel.messages.fetch(options);
          if (!msgs.size) break;
          mensagens.push(...msgs.values());
          ultimaId = msgs.last().id;
          if (msgs.size < 100) break;
        }

        mensagens.reverse();

        const linhas = [
          `Transcript do Ticket`,
          `Canal: #${interaction.channel.name}`,
          `Solicitante: ${dados.solicitanteTag}`,
          `Setor: ${dados.setorNome}`,
          `Fechado por: ${interaction.user.tag}`,
          `Gerado em: ${new Date().toLocaleString('pt-BR')}`,
          '',
          ...mensagens.flatMap(msg => [
            `[${msg.createdAt.toLocaleString('pt-BR')}] ${msg.author.tag}`,
            msg.content || '[sem texto]',
            ...[...msg.attachments.values()].map(a => `Anexo: ${a.url}`),
            ''
          ])
        ];

        const buffer = Buffer.from(linhas.join('\n'), 'utf-8');
        const nomeArquivo = `transcript-${interaction.channel.name}.txt`;

        const user = await client.users.fetch(dados.solicitanteId).catch(() => null);
        if (user) await user.send({ content: 'Aqui está o transcript do seu ticket.', files: [new AttachmentBuilder(buffer, { name: nomeArquivo })] }).catch(() => {});

        const canalLogs = await interaction.guild.channels.fetch(CONFIG.canalLogsTicketsId).catch(() => null);
        if (canalLogs?.isTextBased()) {
          await canalLogs.send({
            content: `Ticket fechado\nSolicitante: <@${dados.solicitanteId}>\nSetor: ${dados.setorNome}\nFechado por: <@${interaction.user.id}>`,
            files: [new AttachmentBuilder(buffer, { name: nomeArquivo })]
          }).catch(e => console.error('Erro ao enviar para o canal de logs:', e));
        }

        dadosTickets.delete(ticketId);
        setTimeout(() => interaction.channel?.delete('Ticket fechado com transcript.'), 3000);

      } catch (error) {
        console.error('Erro ao gerar transcript:', error);
        await interaction.editReply({ content: 'Erro ao gerar o transcript.' }).catch(() => {});
      }
    }

  } catch (error) {
    console.error('Erro na interação:', error);
    const reply = { content: 'Ocorreu um erro ao processar sua solicitação.' };
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ ...reply, flags: 64 }).catch(() => {});
    else if (interaction.deferred) await interaction.editReply(reply).catch(() => {});
  }
});

client.login(process.env.TOKEN);