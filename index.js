require('dotenv').config();
const {
  Client, GatewayIntentBits, Events, ActionRowBuilder,
  StringSelectMenuBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder,
  ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, AttachmentBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const dadosTickets = new Map();

const CONFIG = {
  canalAberturaId:    process.env.CANAL_ABERTURA_ID,
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
const row       = (...c) => new ActionRowBuilder().addComponents(...c);
const ephemeral = content => ({ content, flags: 64 });
const esc       = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const extOf     = url => url.split('?')[0].split('.').pop().toLowerCase();
const eImagem   = url => ['png','jpg','jpeg','gif','webp','svg'].includes(extOf(url));
const eVideo    = url => ['mp4','webm','mov'].includes(extOf(url));

const MIME = {
  png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml',
  mp4:'video/mp4', webm:'video/webm', mov:'video/quicktime', pdf:'application/pdf',
  zip:'application/zip', rar:'application/x-rar-compressed', txt:'text/plain',
  doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  mp3:'audio/mpeg', wav:'audio/wav'
};

const ICONES = { pdf:'📄', zip:'🗜️', rar:'🗜️', txt:'📝', doc:'📝', docx:'📝', xls:'📊', xlsx:'📊', csv:'📊', mp3:'🎵', wav:'🎵' };

async function baixarAnexo(anexo) {
  try {
    const res  = await fetch(anexo.url);
    if (!res.ok) return null;
    const ext  = extOf(anexo.url);
    const mime = MIME[ext] || 'application/octet-stream';
    return { dataUri: `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`, mime, ext };
  } catch { return null; }
}

function renderAnexo(anexo, b64) {
  const nome = esc(anexo.name || 'anexo');
  const loc  = b64?.get(anexo.id);
  const src  = loc?.dataUri || esc(anexo.url);

  const footer = (extra = '') => `
    <div class="attachment-footer">
      <span class="attachment-name">${nome}</span>
      <div class="attachment-actions">${extra}<a href="${src}" download="${nome}" class="btn-attachment btn-download">⬇ Download</a></div>
    </div>`;

  if (eImagem(anexo.url)) return `
    <div class="attachment image-attachment">
      <img src="${src}" alt="${nome}" loading="lazy" />
      ${footer()}
    </div>`;

  if (eVideo(anexo.url)) return `
    <div class="attachment video-attachment">
      <video controls><source src="${src}" type="${loc?.mime || 'video/mp4'}" />Seu navegador não suporta vídeo.</video>
      ${footer()}
    </div>`;

  const ext    = loc?.ext || extOf(anexo.url);
  const pdfBtn = ext === 'pdf'
    ? (loc
        ? `<details class="pdf-preview-wrap"><summary class="btn-attachment">👁 Visualizar PDF</summary><embed src="${src}" type="application/pdf" class="pdf-embed" /></details>`
        : `<a href="${src}" target="_blank" rel="noopener" class="btn-attachment">👁 Ver</a>`)
    : '';

  return `
    <div class="attachment file-attachment">
      <div class="file-card">
        <span class="file-icon">${ICONES[ext] || '📎'}</span>
        <div class="file-info"><span class="file-name">${nome}</span><span class="file-ext">.${esc(ext.toUpperCase())}</span></div>
        <div class="file-actions">${pdfBtn}<a href="${src}" download="${nome}" class="btn-attachment btn-download">⬇ Download</a></div>
      </div>
    </div>`;
}

function renderEmbed(embed) {
  const cor = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#5865F2';
  let h = `<div class="embed" style="border-left-color:${cor}">`;
  if (embed.author?.name)  h += `<div class="embed-author">${esc(embed.author.name)}</div>`;
  if (embed.title)         h += `<div class="embed-title">${esc(embed.title)}</div>`;
  if (embed.description)   h += `<div class="embed-description">${esc(embed.description)}</div>`;
  if (embed.fields?.length) {
    h += `<div class="embed-fields">`;
    for (const f of embed.fields)
      h += `<div class="embed-field${f.inline ? ' inline' : ''}"><div class="field-name">${esc(f.name)}</div><div class="field-value">${esc(f.value)}</div></div>`;
    h += `</div>`;
  }
  if (embed.image?.url)   h += `<img class="embed-image" src="${esc(embed.image.url)}" loading="lazy" />`;
  if (embed.footer?.text) h += `<div class="embed-footer">${esc(embed.footer.text)}</div>`;
  return h + `</div>`;
}

function gerarTranscriptHtml(dados, mensagens, fechadoPor, rCargo, rUser, rCanal, b64) {
  const grupos = [];
  for (const msg of mensagens) {
    const ult  = grupos[grupos.length - 1];
    const diff = ult ? msg.createdTimestamp - ult.msgs.at(-1).createdTimestamp : Infinity;
    ult && ult.autor.id === msg.author.id && diff < 420000
      ? ult.msgs.push(msg)
      : grupos.push({ autor: msg.author, msgs: [msg] });
  }

  const avatarUrl = (id, hash) => hash
    ? `https://cdn.discordapp.com/avatars/${id}/${hash}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(id) >> 22n) % 6n}.png`;

  const htmlMensagens = grupos.map(({ autor, msgs }) => {
    const corpo = msgs.map(msg => {
      let c = '';
      if (msg.content) {
        const txt = esc(msg.content)
          .replace(/&lt;@!?(\d+)&gt;/g,   (_, id) => `<span class="mention">@${esc(rUser(id))}</span>`)
          .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="mention role">@${esc(rCargo(id))}</span>`)
          .replace(/&lt;#(\d+)&gt;/g,      (_, id) => `<span class="mention channel">#${esc(rCanal(id))}</span>`)
          .replace(/\n/g, '<br>');
        c += `<div class="message-content">${txt}</div>`;
      }
      if (msg.attachments.size) {
        c += `<div class="attachments">`;
        for (const [, a] of msg.attachments) c += renderAnexo(a, b64);
        c += `</div>`;
      }
      for (const e of msg.embeds ?? []) c += renderEmbed(e);
      if (!c) c = `<div class="message-content deleted">[mensagem sem conteúdo]</div>`;
      const hora = msg.createdAt.toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      return `<div class="message-line"><span class="message-time" title="${msg.createdAt.toLocaleString('pt-BR')}">${hora}</span>${c}</div>`;
    }).join('');

    return `
      <div class="message-group">
        <img class="avatar" src="${avatarUrl(autor.id, autor.avatar)}" alt="${esc(autor.tag)}" loading="lazy" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" />
        <div class="group-body">
          <div class="group-header"><span class="username">${esc(autor.tag)}</span><span class="timestamp">${msgs[0].createdAt.toLocaleString('pt-BR')}</span></div>
          ${corpo}
        </div>
      </div>`;
  }).join('');

  const agora = new Date().toLocaleString('pt-BR');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Transcript — ${esc(dados.setorNome)}</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;600&display=swap');
:root{--bg-primary:#313338;--bg-secondary:#2b2d31;--bg-tertiary:#1e1f22;--bg-header:#232428;--bg-hover:#2e3035;--text-primary:#dbdee1;--text-secondary:#b5bac1;--text-muted:#80848e;--text-link:#00a8fc;--accent:#5865F2;--red:#f23f43;--border:#3f4147;--mention-bg:rgba(88,101,242,.15);--mention-text:#c9cdfb;--embed-bg:#2b2d31;--radius:8px;}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
body{font-family:'Noto Sans',sans-serif;font-size:15px;background:var(--bg-tertiary);color:var(--text-primary);line-height:1.375;}
.transcript-header{background:var(--bg-header);border-bottom:1px solid var(--border);position:sticky;top:0;z-index:100;box-shadow:0 2px 12px rgba(0,0,0,.3);}
.header-inner{max-width:900px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:16px;}
.header-icon{width:44px;height:44px;background:var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;}
.header-info{flex:1;min-width:0;}
.header-channel{font-size:17px;font-weight:600;}
.badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;}
.badge-closed{background:rgba(242,63,67,.15);color:var(--red);border:1px solid rgba(242,63,67,.3);}
.header-meta{display:flex;gap:20px;margin-top:4px;flex-wrap:wrap;}
.meta-item{font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:4px;}
.meta-item strong{color:var(--text-secondary);}
.transcript-body{max-width:900px;margin:0 auto;padding:24px 16px 80px;}
.message-group{display:flex;gap:14px;padding:4px 16px;border-radius:var(--radius);transition:background .08s;margin-bottom:2px;}
.message-group:hover{background:var(--bg-hover);}
.avatar{width:40px;height:40px;border-radius:50%;flex-shrink:0;margin-top:2px;object-fit:cover;background:var(--bg-secondary);}
.group-body{flex:1;min-width:0;}
.group-header{display:flex;align-items:baseline;gap:8px;margin-bottom:4px;}
.username{font-size:15px;font-weight:600;color:#fff;}
.timestamp{font-size:11px;color:var(--text-muted);}
.message-line{display:flex;gap:8px;align-items:flex-start;margin-bottom:2px;}
.message-time{font-size:11px;color:transparent;width:0;overflow:hidden;transition:color .1s,width .1s;flex-shrink:0;white-space:nowrap;margin-top:3px;}
.message-group:hover .message-time{color:var(--text-muted);width:45px;}
.message-content{color:var(--text-primary);word-break:break-word;white-space:pre-wrap;line-height:1.5;}
.message-content.deleted{color:var(--text-muted);font-style:italic;}
.mention{background:var(--mention-bg);color:var(--mention-text);padding:1px 3px;border-radius:4px;font-weight:500;}
.mention.channel{color:#9aaef4;background:rgba(154,174,244,.15);}
.mention.role{color:#d7a8ff;background:rgba(215,168,255,.15);}
.attachments{margin-top:6px;display:flex;flex-direction:column;gap:8px;}
.attachment{border-radius:var(--radius);overflow:hidden;}
.image-attachment img{max-width:520px;max-height:400px;width:100%;height:auto;object-fit:contain;display:block;border-radius:var(--radius) var(--radius) 0 0;cursor:zoom-in;background:var(--bg-secondary);transition:opacity .15s;}
.image-attachment img:hover{opacity:.9;}
.attachment-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--bg-secondary);border:1px solid var(--border);border-top:none;border-radius:0 0 var(--radius) var(--radius);padding:6px 10px;}
.attachment-name{font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;}
.attachment-actions{display:flex;gap:6px;flex-shrink:0;}
.btn-attachment{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:4px;font-size:12px;font-weight:500;text-decoration:none;background:var(--bg-tertiary);color:var(--text-secondary);border:1px solid var(--border);transition:background .1s,color .1s;cursor:pointer;}
.btn-attachment:hover{background:var(--bg-hover);color:var(--text-primary);}
.btn-download{background:rgba(88,101,242,.15);color:#c9cdfb;border-color:rgba(88,101,242,.3);}
.btn-download:hover{background:rgba(88,101,242,.28);color:#fff;}
.video-attachment video{max-width:520px;border-radius:var(--radius) var(--radius) 0 0;display:block;background:#000;}
.file-card{display:inline-flex;align-items:center;gap:10px;background:var(--bg-secondary);border:1px solid var(--border);border-radius:var(--radius);padding:10px 14px;max-width:460px;}
.file-icon{font-size:22px;flex-shrink:0;}
.file-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.file-name{font-size:14px;font-weight:500;color:var(--text-link);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.file-ext{font-size:11px;color:var(--text-muted);}
.file-actions{display:flex;gap:6px;flex-shrink:0;}
.pdf-preview-wrap{margin-top:8px;}
.pdf-preview-wrap summary{cursor:pointer;list-style:none;}
.pdf-preview-wrap summary::-webkit-details-marker{display:none;}
.pdf-embed{display:block;width:100%;max-width:700px;height:500px;border-radius:var(--radius);border:1px solid var(--border);margin-top:8px;background:var(--bg-secondary);}
.embed{background:var(--embed-bg);border-left:4px solid var(--accent);border-radius:0 var(--radius) var(--radius) 0;padding:10px 14px;margin-top:6px;max-width:520px;}
.embed-author{font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px;}
.embed-title{font-size:15px;font-weight:600;color:#fff;margin-bottom:6px;}
.embed-description{font-size:14px;color:var(--text-secondary);white-space:pre-wrap;}
.embed-fields{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}
.embed-field{min-width:140px;flex:1;}
.embed-field.inline{flex:0 1 auto;}
.field-name{font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:2px;}
.field-value{font-size:13px;color:var(--text-secondary);}
.embed-image{max-width:100%;border-radius:4px;margin-top:8px;}
.embed-footer{font-size:11px;color:var(--text-muted);margin-top:8px;}
.transcript-footer{max-width:900px;margin:0 auto;padding:16px 24px 32px;text-align:center;font-size:12px;color:var(--text-muted);border-top:1px solid var(--border);}
#lightbox{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:9999;align-items:center;justify-content:center;cursor:zoom-out;}
#lightbox.open{display:flex;}
#lightbox img{max-width:90vw;max-height:90vh;object-fit:contain;border-radius:var(--radius);}
::-webkit-scrollbar{width:8px;}::-webkit-scrollbar-track{background:var(--bg-tertiary);}::-webkit-scrollbar-thumb{background:#1a1b1e;border-radius:4px;}
@media(max-width:600px){.header-inner{padding:12px 14px;}.message-group{padding:4px 10px;}.image-attachment img,.video-attachment video{max-width:100%;}}
</style>
</head>
<body>
<div id="lightbox" onclick="this.classList.remove('open')"><img id="lightbox-img" src="" alt=""/></div>
<header class="transcript-header">
  <div class="header-inner">
    <div class="header-icon">🎫</div>
    <div class="header-info">
      <div class="header-channel">#${esc(dados.canalNome || 'ticket')} &nbsp;<span class="badge badge-closed">● Fechado</span></div>
      <div class="header-meta">
        <div class="meta-item">👤 Solicitante: <strong>${esc(dados.solicitanteTag)}</strong></div>
        <div class="meta-item">🗂️ Setor: <strong>${esc(dados.setorNome)}</strong></div>
        <div class="meta-item">👥 Cargo responsável: <strong>${esc(dados.cargoSetorNome || 'N/A')}</strong></div>
        <div class="meta-item">🔒 Fechado por: <strong>${esc(fechadoPor)}</strong></div>
        <div class="meta-item">📅 ${agora}</div>
        <div class="meta-item">💬 ${mensagens.length} mensagen${mensagens.length !== 1 ? 's' : ''}</div>
      </div>
    </div>
  </div>
</header>
<main class="transcript-body">${htmlMensagens}</main>
<footer class="transcript-footer">Transcript gerado automaticamente • ${agora}</footer>
<script>
  document.querySelectorAll('.image-attachment img').forEach(img => {
    img.addEventListener('click', e => { e.preventDefault(); document.getElementById('lightbox-img').src = img.src; document.getElementById('lightbox').classList.add('open'); });
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.getElementById('lightbox').classList.remove('open'); });
</script>
</body></html>`;
}

function criarMenuSetores() {
  return new StringSelectMenuBuilder()
    .setCustomId('selecionar_setor')
    .setPlaceholder('Selecione o setor para abrir o ticket')
    .addOptions(Object.entries(CONFIG.setores).map(([value, { nome, descricao }]) => ({ label: nome, description: descricao.slice(0, 100), value })));
}

function criarBotoesTicket(ticketId) {
  const d = dadosTickets.get(ticketId);
  return row(
    new ButtonBuilder().setCustomId(`assumir_ticket_${ticketId}`).setLabel(d?.responsavelId ? `Assumido por ${d.responsavelTag}` : 'Assumir Ticket').setStyle(ButtonStyle.Success).setDisabled(Boolean(d?.responsavelId)),
    new ButtonBuilder().setCustomId(`adicionar_ticket_${ticketId}`).setLabel('Adicionar Pessoa/Cargo').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`fechar_ticket_${ticketId}`).setLabel('Fechar Ticket').setStyle(ButtonStyle.Danger)
  );
}

function montarMensagemTicket(ticketId) {
  const d = dadosTickets.get(ticketId);
  if (!d) return 'Dados do ticket não encontrados.';
  return `# 🎫 Ticket Aberto\n\n**Solicitante:** <@${d.solicitanteId}>\n**Setor:** ${d.setorNome}\n**Descrição do setor:** ${d.setorDescricao}\n**Cargo responsável:** <@&${d.cargoSetorId}>\n**Status:** ${d.responsavelId ? 'Em atendimento' : 'Aguardando atendimento'}\n**Responsável:** ${d.responsavelId ? `<@${d.responsavelId}>` : 'Ainda não assumido'}\n\nDescreva sua solicitação com o máximo de detalhes possível para agilizar o atendimento.`;
}

const podeGerenciar = ({ member, user }, d) =>
  Boolean(member && (member.permissions?.has(PermissionFlagsBits.Administrator) || d.responsavelId === user.id || member.roles?.cache?.has(d.cargoSetorId)));

async function garantirPainelFixo(guild) {
  const canal = await guild.channels.fetch(CONFIG.canalAberturaId).catch(() => null);
  if (!canal || canal.type !== ChannelType.GuildText) return;
  const msgs = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (!msgs) return;
  const existente = msgs.find(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.data?.custom_id === 'selecionar_setor');
  const payload   = { content: `# 🎫 Central de Tickets\n\nSelecione abaixo o setor responsável pelo seu atendimento.`, components: [row(criarMenuSetores())] };
  existente ? await existente.edit(payload).catch(() => {}) : await canal.send(payload).catch(() => {});
}

async function coletarMensagens(channel) {
  const msgs = [];
  let ultimaId;
  while (true) {
    const lote = await channel.messages.fetch({ limit: 100, ...(ultimaId && { before: ultimaId }) });
    if (!lote.size) break;
    msgs.push(...lote.values());
    ultimaId = lote.last().id;
    if (lote.size < 100) break;
  }
  return msgs.reverse();
}

function criarResolver(guild, fetcher) {
  const cache = new Map();
  const fn = async id => {
    if (cache.has(id)) return cache.get(id);
    const val = await fetcher(guild, id);
    cache.set(id, val);
    return val;
  };
  fn.sync = id => cache.get(id) || id;
  return fn;
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
      if (!setor?.categoriaId || !setor?.cargoId) return interaction.reply(ephemeral('Setor inválido ou configuração incompleta.'));

      const categoria = await interaction.guild.channels.fetch(setor.categoriaId).catch(() => null);
      if (!categoria || categoria.type !== ChannelType.GuildCategory) return interaction.reply(ephemeral('Categoria do setor não encontrada.'));

      const numeroTicket = interaction.guild.channels.cache.filter(c => c.parentId === setor.categoriaId && c.type === ChannelType.GuildText).size + 1;
      const nomeCanal    = `ticket-${normalize(setor.nome)}-${numeroTicket}`;

      const canalTicket = await interaction.guild.channels.create({
        name: nomeCanal, type: ChannelType.GuildText, parent: setor.categoriaId,
        topic: `Ticket de ${interaction.user.tag} | Setor: ${setor.nome}`,
        permissionOverwrites: [
          { id: interaction.guild.id,            deny:  [PermissionFlagsBits.ViewChannel] },
          { id: interaction.user.id,             allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: setor.cargoId,                   allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
          { id: interaction.guild.members.me.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageChannels] }
        ]
      });

      const cargoObj = await interaction.guild.roles.fetch(setor.cargoId).catch(() => null);

      dadosTickets.set(canalTicket.id, {
        solicitanteId: interaction.user.id, solicitanteTag: interaction.user.tag,
        setorNome: setor.nome, setorDescricao: setor.descricao,
        cargoSetorId: setor.cargoId, cargoSetorNome: cargoObj?.name || 'Desconhecido',
        responsavelId: null, responsavelTag: null, numeroTicket, canalNome: nomeCanal
      });

      await canalTicket.send({ content: `<@&${setor.cargoId}> novo ticket aberto por ${interaction.user}.` });
      await canalTicket.send({ content: montarMensagemTicket(canalTicket.id), components: [criarBotoesTicket(canalTicket.id)] });
      await interaction.reply(ephemeral(`Seu ticket foi criado com sucesso: ${canalTicket}`));
      setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
      return;
    }

    if (interaction.isButton() && customId.startsWith('assumir_ticket_')) {
      const ticketId = customId.replace('assumir_ticket_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (interaction.user.id === dados.solicitanteId) return interaction.reply(ephemeral('Você não pode assumir o próprio ticket.'));
      const membro = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
      if (!membro?.roles.cache.has(dados.cargoSetorId)) return interaction.reply(ephemeral('Apenas alguém do setor responsável pode assumir este ticket.'));
      if (dados.responsavelId) return interaction.reply(ephemeral(`Este ticket já foi assumido por <@${dados.responsavelId}>.`));

      dados.responsavelId  = interaction.user.id;
      dados.responsavelTag = interaction.user.username;
      dadosTickets.set(ticketId, dados);
      await interaction.channel.setName(`${normalize(interaction.user.username)}-${normalize(dados.setorNome)}-${dados.numeroTicket}`.slice(0, 90)).catch(() => {});
      return interaction.update({ content: montarMensagemTicket(ticketId), components: [criarBotoesTicket(ticketId)] });
    }

    if (interaction.isButton() && customId.startsWith('adicionar_ticket_')) {
      const ticketId = customId.replace('adicionar_ticket_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (!podeGerenciar(interaction, dados)) return interaction.reply(ephemeral('Somente o responsável, alguém do setor ou um administrador pode adicionar pessoas ou cargos.'));
      return interaction.reply({
        content: 'Escolha apenas uma opção:',
        components: [row(
          new ButtonBuilder().setCustomId(`escolher_add_pessoa_${ticketId}`).setLabel('Adicionar Pessoa').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`escolher_add_cargo_${ticketId}`).setLabel('Adicionar Cargo').setStyle(ButtonStyle.Secondary)
        )], flags: 64
      });
    }

    if (interaction.isButton() && customId.startsWith('escolher_add_pessoa_')) {
      const ticketId = customId.replace('escolher_add_pessoa_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados || !podeGerenciar(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar pessoas neste ticket.'));
      return interaction.update({ content: 'Selecione a pessoa:', components: [row(new UserSelectMenuBuilder().setCustomId(`selecionar_usuario_${ticketId}`).setPlaceholder('Selecione uma pessoa').setMinValues(1).setMaxValues(1))] });
    }

    if (interaction.isButton() && customId.startsWith('escolher_add_cargo_')) {
      const ticketId = customId.replace('escolher_add_cargo_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados || !podeGerenciar(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar cargos neste ticket.'));
      return interaction.update({ content: 'Selecione o cargo:', components: [row(new RoleSelectMenuBuilder().setCustomId(`selecionar_cargo_${ticketId}`).setPlaceholder('Selecione um cargo').setMinValues(1).setMaxValues(1))] });
    }

    if ((interaction.isUserSelectMenu() || interaction.isRoleSelectMenu()) &&
        (customId.startsWith('selecionar_usuario_') || customId.startsWith('selecionar_cargo_'))) {
      const isUser   = interaction.isUserSelectMenu();
      const ticketId = customId.replace(isUser ? 'selecionar_usuario_' : 'selecionar_cargo_', '');
      const dados    = dadosTickets.get(ticketId);
      const targetId = interaction.values[0];

      await interaction.deferReply({ flags: 64 });
      if (!dados || !interaction.channel) return interaction.editReply({ content: 'Dados ou canal do ticket não encontrados.' });
      if (!podeGerenciar(interaction, dados)) return interaction.editReply({ content: `Sem permissão para adicionar ${isUser ? 'pessoas' : 'cargos'}.` });

      await interaction.channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return interaction.editReply({ content: `${isUser ? `Pessoa <@${targetId}>` : `Cargo <@&${targetId}>`} adicionado com sucesso.` });
    }

    if (interaction.isButton() && customId.startsWith('fechar_ticket_')) {
      const ticketId = customId.replace('fechar_ticket_', '');
      const dados    = dadosTickets.get(ticketId);
      if (interaction.user.id !== dados?.solicitanteId) return interaction.reply(ephemeral('Apenas quem abriu o ticket pode fechá-lo.'));

      await interaction.reply(ephemeral('Gerando transcript e fechando ticket...'));

      try {
        const mensagens = await coletarMensagens(interaction.channel);
        if (!dados.canalNome) dados.canalNome = interaction.channel.name;

        const rCargo = criarResolver(interaction.guild, async (g, id) => { const r = await g.roles.fetch(id).catch(() => null);    return r?.name || id; });
        const rUser  = criarResolver(interaction.guild, async (g, id) => { const m = await g.members.fetch(id).catch(() => null);  return m?.displayName || m?.user?.username || id; });
        const rCanal = criarResolver(interaction.guild, async (g, id) => { const c = await g.channels.fetch(id).catch(() => null); return c?.name || id; });

        for (const msg of mensagens) {
          const t = msg.content || '';
          for (const m of t.matchAll(/<@&(\d+)>/g))  await rCargo(m[1]);
          for (const m of t.matchAll(/<@!?(\d+)>/g)) await rUser(m[1]);
          for (const m of t.matchAll(/<#(\d+)>/g))   await rCanal(m[1]);
        }

        const b64 = new Map();
        for (const msg of mensagens)
          for (const [, a] of msg.attachments) {
            const r = await baixarAnexo(a);
            if (r) b64.set(a.id, r);
          }

        const agora    = new Date();
        const dataStr  = agora.toLocaleDateString('pt-BR').replace(/\//g, '-');
        const userNorm = normalize(dados.solicitanteTag.split('#')[0]);
        const nomeArq  = `transcript-${userNorm}-${dataStr}.html`;

        const buffer = Buffer.from(gerarTranscriptHtml(dados, mensagens, interaction.user.tag, rCargo.sync, rUser.sync, rCanal.sync, b64), 'utf-8');

        const user = await client.users.fetch(dados.solicitanteId).catch(() => null);
        if (user) await user.send({ content: `📄 Transcript do ticket **${dados.canalNome}**.\nAbra o **.html** no navegador.`, files: [new AttachmentBuilder(buffer, { name: nomeArq })] }).catch(() => {});

        const canalLogs = await interaction.guild.channels.fetch(CONFIG.canalLogsTicketsId).catch(() => null);
        if (canalLogs?.isTextBased())
          await canalLogs.send({ content: `🔒 **Ticket fechado**\n👤 <@${dados.solicitanteId}>\n🗂️ ${dados.setorNome}\n🔒 Fechado por <@${interaction.user.id}>`, files: [new AttachmentBuilder(buffer, { name: nomeArq })] }).catch(e => console.error(e));

        dadosTickets.delete(ticketId);
        setTimeout(() => interaction.channel?.delete('Ticket fechado com transcript.'), 3000);
      } catch (e) {
        console.error('Erro ao gerar transcript:', e);
        await interaction.editReply({ content: 'Erro ao gerar o transcript.' }).catch(() => {});
      }
    }

  } catch (e) {
    console.error('Erro na interação:', e);
    const reply = { content: 'Ocorreu um erro ao processar sua solicitação.' };
    if (!interaction.replied && !interaction.deferred) await interaction.reply({ ...reply, flags: 64 }).catch(() => {});
    else if (interaction.deferred) await interaction.editReply(reply).catch(() => {});
  }
});

client.login(process.env.TOKEN);