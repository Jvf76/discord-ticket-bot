require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const dadosTickets = new Map();

const CONFIG = {
  canalAberturaId: process.env.CANAL_ABERTURA_ID,
  setores: {
    rh: {
      nome: 'RH',
      descricao: 'Solicitações relacionadas a colaboradores, documentos e processos internos.',
      categoriaId: process.env.CATEGORIA_RH_ID,
      cargoId: process.env.CARGO_RH_ID
    },
    financeiro: {
      nome: 'Financeiro',
      descricao: 'Demandas sobre pagamentos, notas fiscais, faturamento e assuntos financeiros.',
      categoriaId: process.env.CATEGORIA_FINANCEIRO_ID,
      cargoId: process.env.CARGO_FINANCEIRO_ID
    },
    noc: {
      nome: 'NOC',
      descricao: 'Incidentes de rede, monitoramento, quedas e instabilidades de link.',
      categoriaId: process.env.CATEGORIA_NOC_ID,
      cargoId: process.env.CARGO_NOC_ID
    },
    estoque: {
      nome: 'Estoque',
      descricao: 'Controle de equipamentos, materiais, reposição e movimentação de itens.',
      categoriaId: process.env.CATEGORIA_ESTOQUE_ID,
      cargoId: process.env.CARGO_ESTOQUE_ID
    },
    cobranca: {
      nome: 'Cobrança',
      descricao: 'Pendências financeiras, negociação, inadimplência e retorno de cobrança.',
      categoriaId: process.env.CATEGORIA_COBRANCA_ID,
      cargoId: process.env.CARGO_COBRANCA_ID
    },
    suporte: {
      nome: 'Suporte',
      descricao: 'Problemas técnicos, falhas de acesso, equipamentos e atendimento operacional.',
      categoriaId: process.env.CATEGORIA_SUPORTE_ID,
      cargoId: process.env.CARGO_SUPORTE_ID
    },
    agendamento: {
      nome: 'Agendamento',
      descricao: 'Marcação de visitas técnicas, instalações, ativações e remanejamentos.',
      categoriaId: process.env.CATEGORIA_AGENDAMENTO_ID,
      cargoId: process.env.CARGO_AGENDAMENTO_ID
    },
    comercial: {
      nome: 'Comercial',
      descricao: 'Solicitações sobre vendas, propostas, planos, contratos e relacionamento comercial.',
      categoriaId: process.env.CATEGORIA_COMERCIAL_ID,
      cargoId: process.env.CARGO_COMERCIAL_ID
    }
  }
};

function normalizarTexto(texto) {
  return texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function criarMenuSetores() {
  return new StringSelectMenuBuilder()
    .setCustomId('selecionar_setor')
    .setPlaceholder('Selecione o setor para abrir o ticket')
    .addOptions([
      { label: 'RH', description: 'Colaboradores, documentos e processos internos.', value: 'rh' },
      { label: 'Financeiro', description: 'Pagamentos, faturamento e notas fiscais.', value: 'financeiro' },
      { label: 'NOC', description: 'Rede, monitoramento e incidentes.', value: 'noc' },
      { label: 'Estoque', description: 'Equipamentos, materiais e controle de itens.', value: 'estoque' },
      { label: 'Cobrança', description: 'Pendências, negociação e inadimplência.', value: 'cobranca' },
      { label: 'Suporte', description: 'Falhas técnicas e atendimento operacional.', value: 'suporte' },
      { label: 'Agendamento', description: 'Visitas, instalações e agenda técnica.', value: 'agendamento' },
      { label: 'Comercial', description: 'Vendas, propostas, contratos e planos.', value: 'comercial' }
    ]);
}

function criarBotoesTicket(ticketId) {
  const dados = dadosTickets.get(ticketId);
  const assumido = Boolean(dados?.responsavelId);

  const botaoAssumir = new ButtonBuilder()
    .setCustomId(`assumir_ticket_${ticketId}`)
    .setLabel(assumido ? `Assumido por ${dados.responsavelTag}` : 'Assumir Ticket')
    .setStyle(ButtonStyle.Success)
    .setDisabled(assumido);

  const botaoAdicionar = new ButtonBuilder()
    .setCustomId(`adicionar_ticket_${ticketId}`)
    .setLabel('Adicionar Pessoa/Cargo')
    .setStyle(ButtonStyle.Secondary);

  const botaoFechar = new ButtonBuilder()
    .setCustomId(`fechar_ticket_${ticketId}`)
    .setLabel('Fechar Ticket')
    .setStyle(ButtonStyle.Danger);

  return new ActionRowBuilder().addComponents(botaoAssumir, botaoAdicionar, botaoFechar);
}

function montarMensagemTicket(ticketId) {
  const dados = dadosTickets.get(ticketId);
  if (!dados) return 'Dados do ticket não encontrados.';

  return (
    `# 🎫 Ticket Aberto\n\n` +
    `**Solicitante:** <@${dados.solicitanteId}>\n` +
    `**Setor:** ${dados.setorNome}\n` +
    `**Descrição do setor:** ${dados.setorDescricao}\n` +
    `**Cargo responsável:** <@&${dados.cargoSetorId}>\n` +
    `**Status:** ${dados.responsavelId ? 'Em atendimento' : 'Aguardando atendimento'}\n` +
    `**Responsável:** ${dados.responsavelId ? `<@${dados.responsavelId}>` : 'Ainda não assumido'}\n\n` +
    `Descreva sua solicitação com o máximo de detalhes possível para agilizar o atendimento.`
  );
}

async function garantirPainelFixo(guild) {
  const canal = await guild.channels.fetch(CONFIG.canalAberturaId).catch(() => null);
  if (!canal || canal.type !== ChannelType.GuildText) return;

  const mensagens = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (!mensagens) return;

  const painelExistente = mensagens.find(
    msg =>
      msg.author.id === client.user.id &&
      msg.components?.length &&
      msg.components[0]?.components?.[0]?.data?.custom_id === 'selecionar_setor'
  );

  const row = new ActionRowBuilder().addComponents(criarMenuSetores());
  const conteudo =
    `# 🎫 Central de Tickets\n\n` +
    `Selecione abaixo o setor responsável pelo seu atendimento.`;

  if (painelExistente) {
    await painelExistente.edit({
      content: conteudo,
      components: [row]
    }).catch(() => { });
    return;
  }

  await canal.send({
    content: conteudo,
    components: [row]
  }).catch(() => { });
}

client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    await garantirPainelFixo(guild);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isStringSelectMenu() && interaction.customId === 'selecionar_setor') {
      if (interaction.channelId !== CONFIG.canalAberturaId) {
        await interaction.reply({
          content: `A abertura de tickets só pode ser feita no canal <#${CONFIG.canalAberturaId}>.`,
          flags: 64
        });
        return;
      }

      const setorEscolhido = interaction.values[0];
      const setor = CONFIG.setores[setorEscolhido];

      if (!setor || !setor.categoriaId || !setor.cargoId) {
        await interaction.reply({
          content: 'Setor inválido ou configuração incompleta.',
          flags: 64
        });
        return;
      }

      const categoria = await interaction.guild.channels.fetch(setor.categoriaId).catch(() => null);
      if (!categoria || categoria.type !== ChannelType.GuildCategory) {
        await interaction.reply({
          content: 'Categoria do setor não encontrada.',
          flags: 64
        });
        return;
      }

      const usernameLimpo = normalizarTexto(interaction.user.username);
      const nomeSetorLimpo = normalizarTexto(setor.nome);

      const canaisDoSetor = interaction.guild.channels.cache.filter(
        c => c.parentId === setor.categoriaId && c.type === ChannelType.GuildText
      );

      const numeroTicket = canaisDoSetor.size + 1;
      const nomeCanal = `ticket-${nomeSetorLimpo}-${numeroTicket}`;

      const canalTicket = await interaction.guild.channels.create({
        name: nomeCanal,
        type: ChannelType.GuildText,
        parent: setor.categoriaId,
        topic: `Ticket de ${interaction.user.tag} | Setor: ${setor.nome}`,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: setor.cargoId,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory
            ]
          },
          {
            id: interaction.guild.members.me.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels
            ]
          }
        ]
      });

      const ticketId = canalTicket.id;

      dadosTickets.set(ticketId, {
        solicitanteId: interaction.user.id,
        solicitanteTag: interaction.user.tag,
        setorKey: setorEscolhido,
        setorNome: setor.nome,
        setorDescricao: setor.descricao,
        cargoSetorId: setor.cargoId,
        responsavelId: null,
        responsavelTag: null,
        numeroTicket
      });

      await canalTicket.send({
        content: `<@&${setor.cargoId}> novo ticket aberto por ${interaction.user}.`,
      });

      await canalTicket.send({
        content: montarMensagemTicket(ticketId),
        components: [criarBotoesTicket(ticketId)]
      });

      await interaction.reply({
        content: `Seu ticket foi criado com sucesso: ${canalTicket}`,
        flags: 64
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('assumir_ticket_')) {
      const ticketId = interaction.customId.replace('assumir_ticket_', '');
      const dados = dadosTickets.get(ticketId);

      if (!dados) {
        await interaction.reply({
          content: 'Dados do ticket não encontrados.',
          flags: 64
        });
        return;
      }

      if (interaction.user.id === dados.solicitanteId) {
        await interaction.reply({
          content: 'Você não pode assumir o próprio ticket.',
          flags: 64
        });
        return;
      }

      const membro = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!membro || !membro.roles.cache.has(dados.cargoSetorId)) {
        await interaction.reply({
          content: 'Apenas alguém do setor responsável pode assumir este ticket.',
          flags: 64
        });
        return;
      }

      if (dados.responsavelId) {
        await interaction.reply({
          content: `Este ticket já foi assumido por <@${dados.responsavelId}>.`,
          flags: 64
        });
        return;
      }

      dados.responsavelId = interaction.user.id;
      dados.responsavelTag = interaction.user.username;
      dadosTickets.set(ticketId, dados);

      const novoNomeCanal =
        `${normalizarTexto(interaction.user.username)}-${normalizarTexto(dados.setorNome)}-${dados.numeroTicket}`
          .slice(0, 90);

      await interaction.channel.setName(novoNomeCanal).catch(() => { });

      await interaction.update({
        content: montarMensagemTicket(ticketId),
        components: [criarBotoesTicket(ticketId)]
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('adicionar_ticket_')) {
      const ticketId = interaction.customId.replace('adicionar_ticket_', '');
      const dados = dadosTickets.get(ticketId);

      if (!dados) {
        await interaction.reply({
          content: 'Dados do ticket não encontrados.',
          flags: 64
        });
        return;
      }

      const userMenu = new UserSelectMenuBuilder()
        .setCustomId(`selecionar_usuario_${ticketId}`)
        .setPlaceholder('Selecione uma pessoa para adicionar')
        .setMinValues(1)
        .setMaxValues(1);

      const roleMenu = new RoleSelectMenuBuilder()
        .setCustomId(`selecionar_cargo_${ticketId}`)
        .setPlaceholder('Selecione um cargo para adicionar')
        .setMinValues(1)
        .setMaxValues(1);

      const rowUser = new ActionRowBuilder().addComponents(userMenu);
      const rowRole = new ActionRowBuilder().addComponents(roleMenu);

      await interaction.reply({
        content: 'Escolha abaixo uma pessoa ou um cargo para adicionar ao ticket:',
        components: [rowUser, rowRole],
        flags: 64
      });

      return;
    }
    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_adicionar_')) {
      const ticketId = interaction.customId.replace('modal_adicionar_', '');
      const tipo = interaction.fields.getTextInputValue('tipo').trim().toLowerCase();
      const id = interaction.fields.getTextInputValue('id').trim();

      if (!interaction.channel) {
        await interaction.reply({
          content: 'Canal do ticket não encontrado.',
          flags: 64
        });
        return;
      }

      if (tipo !== 'pessoa' && tipo !== 'cargo') {
        await interaction.reply({
          content: 'Tipo inválido. Digite exatamente: pessoa ou cargo.',
          flags: 64
        });
        return;
      }

      if (tipo === 'pessoa') {
        await interaction.channel.permissionOverwrites.edit(id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(async () => {
          await interaction.reply({
            content: 'Não consegui adicionar essa pessoa. Verifique se o ID está correto.',
            flags: 64
          });
        });

        if (!interaction.replied) {
          await interaction.reply({
            content: `Pessoa <@${id}> adicionada ao ticket com sucesso.`,
            flags: 64
          });
        }
        return;
      }

      if (tipo === 'cargo') {
        await interaction.channel.permissionOverwrites.edit(id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch(async () => {
          await interaction.reply({
            content: 'Não consegui adicionar esse cargo. Verifique se o ID está correto.',
            flags: 64
          });
        });

        if (!interaction.replied) {
          await interaction.reply({
            content: `Cargo <@&${id}> adicionado ao ticket com sucesso.`,
            flags: 64
          });
        }
        return;
      }
    }

    if (interaction.isButton() && interaction.customId.startsWith('fechar_ticket_')) {
      const ticketId = interaction.customId.replace('fechar_ticket_', '');

      await interaction.reply({
        content: 'Fechando ticket em 3 segundos...',
        flags: 64
      });

      setTimeout(async () => {
        try {
          dadosTickets.delete(ticketId);
          if (interaction.channel) {
            await interaction.channel.delete('Ticket fechado manualmente.');
          }
        } catch (error) {
          console.error('Erro ao fechar ticket:', error);
        }
      }, 3000);
      return;
    }
  } catch (error) {
    console.error('Erro na interação:', error);

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Ocorreu um erro ao processar sua solicitação.',
        flags: 64
      }).catch(() => { });
    }
  }
});

client.login(process.env.TOKEN);