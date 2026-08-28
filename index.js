require('dotenv').config();
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { readEnv, requireEnv } = require('./env');
const { criarChamadoFlowIsp, flowIspConfigurado } = require('./flowisp');
const { criarMenuSetoresChamadoTi, criarModalChamadoTi } = require('./chamado-ti-ui');
const {
  diagnoseDiscordConnection,
  formatError,
  isRetryableConnectionError,
  loginWithRetry
} = require('./connection');
const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  PermissionFlagsBits,
  AttachmentBuilder
} = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers]
});

const dadosTickets = new Map();
const RELATORIOS_PATH = path.join(__dirname, 'data', 'relatorios.json');
const DB_PATH = path.resolve(__dirname, readEnv('DATABASE_PATH') || path.join('data', 'tickets.db'));
const TRANSCRIPT_PUBLIC_DIR = path.resolve(__dirname, readEnv('TRANSCRIPT_PUBLIC_DIR') || path.join('data', 'public', 'transcripts'));
const env = requireEnv([
  'TOKEN',
  'CANAL_ABERTURA_ID',
  'CATEGORIA_RH_ID',
  'CATEGORIA_FINANCEIRO_ID',
  'CATEGORIA_NOC_ID',
  'CATEGORIA_ESTOQUE_ID',
  'CATEGORIA_COBRANCA_ID',
  'CATEGORIA_SUPORTE_ID',
  'CATEGORIA_AGENDAMENTO_ID',
  'CATEGORIA_COMERCIAL_ID',
  'CARGO_RH_ID',
  'CARGO_FINANCEIRO_ID',
  'CARGO_NOC_ID',
  'CARGO_ESTOQUE_ID',
  'CARGO_COBRANCA_ID',
  'CARGO_SUPORTE_ID',
  'CARGO_AGENDAMENTO_ID',
  'CARGO_COMERCIAL_ID'
], 'bot');

const CONFIG = {
  canalAberturaId:    env.CANAL_ABERTURA_ID,
  canalAberturaComercialId: readEnv('CANAL_ABERTURA_TICKET_COMERCIAL') || readEnv('CANAL_ABERTURA_COMERCIAL_ID') || readEnv('CANAL_TICKETS_COMERCIAL_ID') || readEnv('CANAL_COMERCIAL_TICKETS_ID'),
  canalRelatoriosTicketsId: readEnv('CANAL_RELATORIOS_TICKETS_ID'),
  canalRankingTicketsId: readEnv('CANAL_RANKING_TICKETS_ID'),
  setores: {
    rh:          { nome: '🤝 RH',          descricao: 'Solicitações relacionadas a colaboradores, documentos e processos internos.',          categoriaId: env.CATEGORIA_RH_ID,          cargoId: env.CARGO_RH_ID,          canalFechadosId: readEnv('CANAL_FECHADOS_RH_ID') },
    financeiro:  { nome: '💸 Financeiro',  descricao: 'Demandas sobre pagamentos, notas fiscais, faturamento e assuntos financeiros.',       categoriaId: env.CATEGORIA_FINANCEIRO_ID,  cargoId: env.CARGO_FINANCEIRO_ID,  canalFechadosId: readEnv('CANAL_FECHADOS_FINANCEIRO_ID') },
    noc:         { nome: '🧠 NOC',         descricao: 'Incidentes de rede, monitoramento, quedas e instabilidades de link, TI.',             categoriaId: env.CATEGORIA_NOC_ID,         cargoId: env.CARGO_NOC_ID,         canalFechadosId: readEnv('CANAL_FECHADOS_NOC_ID') },
    estoque:     { nome: '📦 Estoque',     descricao: 'Controle de equipamentos, materiais, reposição e movimentação de itens.',             categoriaId: env.CATEGORIA_ESTOQUE_ID,     cargoId: env.CARGO_ESTOQUE_ID,     canalFechadosId: readEnv('CANAL_FECHADOS_ESTOQUE_ID') },
    cobranca:    { nome: '💸 Cobrança',    descricao: 'Pendências financeiras, negociação, inadimplência e retorno de cobrança.',            categoriaId: env.CATEGORIA_COBRANCA_ID,    cargoId: env.CARGO_COBRANCA_ID,    canalFechadosId: readEnv('CANAL_FECHADOS_COBRANCA_ID') },
    suporte:     { nome: '🎧 Suporte',     descricao: 'Problemas técnicos, falhas de acesso, equipamentos e atendimento operacional.',        categoriaId: env.CATEGORIA_SUPORTE_ID,     cargoId: env.CARGO_SUPORTE_ID,     canalFechadosId: readEnv('CANAL_FECHADOS_SUPORTE_ID') },
    agendamento: { nome: '📅 Agendamento', descricao: 'Marcação de visitas técnicas, instalações, ativações e remanejamentos.',              categoriaId: env.CATEGORIA_AGENDAMENTO_ID, cargoId: env.CARGO_AGENDAMENTO_ID, canalFechadosId: readEnv('CANAL_FECHADOS_AGENDAMENTO_ID') },
    comercial:   { nome: '💰 Comercial',   descricao: 'Solicitações sobre vendas, propostas, planos, contratos e relacionamento comercial.', categoriaId: env.CATEGORIA_COMERCIAL_ID,   cargoId: env.CARGO_COMERCIAL_ID,   canalFechadosId: readEnv('CANAL_FECHADOS_COMERCIAL_ID') }
  }
};

const DESTINOS_CHAMADO_TI = {
  sistemas: { label: 'SISTEMA (CHRISTIAN E DIEISSON)', teamName: 'SISTEMAS' },
  noc: { label: 'N.O.C / TI', teamName: 'N.O.C' }
};

const normalize = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const row       = (...c) => new ActionRowBuilder().addComponents(...c);
const ephemeral = content => ({ content, flags: 64 });
const esc       = str => String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const extOf     = url => url.split('?')[0].split('.').pop().toLowerCase();
const eImagem   = url => ['png','jpg','jpeg','gif','webp','svg'].includes(extOf(url));
const eVideo    = url => ['mp4','webm','mov'].includes(extOf(url));
const RELATORIO_DIARIO_HORA = Number(readEnv('RELATORIO_DIARIO_HORA') || readEnv('RELATORIO_SEMANAL_HORA') || 8);
const TRANSCRIPT_BASE_URL = readEnv('TRANSCRIPT_BASE_URL');
const TRANSCRIPT_HTTP_PORT = Number(readEnv('TRANSCRIPT_HTTP_PORT') || 0);
const TRANSCRIPT_ROUTE_PREFIX = normalizarPrefixoRota(readEnv('TRANSCRIPT_ROUTE_PREFIX') || '/transcripts');
const CORES = {
  ticket: 0x5865F2,
  atendimento: 0x57F287,
  transcript: 0xFEE75C,
  fechado: 0xED4245,
  relatorio: 0x00A8FC
};

const COMERCIAL_MOTIVOS = {
  sem_conexao: 'Sem conexão',
  conexao_lenta: 'Conexão lenta'
};

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
fs.mkdirSync(TRANSCRIPT_PUBLIC_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);

function normalizarPrefixoRota(value) {
  const limpo = String(value || '/transcripts').trim().replace(/\/+$/g, '');
  if (!limpo || limpo === '/') return '/transcripts';
  return limpo.startsWith('/') ? limpo : `/${limpo}`;
}

function normalizarNomeArquivo(nome) {
  return String(nome || 'transcript.html')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'transcript.html';
}

function montarUrlTranscriptPublico(nomePublico) {
  if (!TRANSCRIPT_BASE_URL) return null;
  const base = TRANSCRIPT_BASE_URL.replace(/\/+$/g, '');
  return `${base}${TRANSCRIPT_ROUTE_PREFIX}/${encodeURIComponent(nomePublico)}`;
}

function publicarTranscriptEmDisco(buffer, nomeArq) {
  const nomeBase = normalizarNomeArquivo(nomeArq);
  const nomePublico = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${nomeBase}`;
  const caminho = path.join(TRANSCRIPT_PUBLIC_DIR, nomePublico);
  fs.writeFileSync(caminho, buffer);

  return {
    caminho,
    nomePublico,
    url: montarUrlTranscriptPublico(nomePublico)
  };
}

function iniciarServidorTranscripts() {
  if (!TRANSCRIPT_HTTP_PORT) return;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Metodo nao permitido.');
    }

    if (!url.pathname.startsWith(`${TRANSCRIPT_ROUTE_PREFIX}/`)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Nao encontrado.');
    }

    let nomeArquivo = '';
    try {
      nomeArquivo = decodeURIComponent(url.pathname.slice(`${TRANSCRIPT_ROUTE_PREFIX}/`.length)).trim();
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('URL invalida.');
    }
    if (!nomeArquivo || nomeArquivo.includes('/') || nomeArquivo.includes('\\')) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo invalido.');
    }

    const caminho = path.join(TRANSCRIPT_PUBLIC_DIR, nomeArquivo);
    if (!fs.existsSync(caminho) || !fs.statSync(caminho).isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Transcript nao encontrado.');
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff'
    });

    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(caminho).pipe(res);
  });

  server.listen(TRANSCRIPT_HTTP_PORT, () => {
    console.log(`[transcript] Servidor HTTP ativo na porta ${TRANSCRIPT_HTTP_PORT} em ${TRANSCRIPT_ROUTE_PREFIX}`);
    if (TRANSCRIPT_BASE_URL) console.log(`[transcript] URLs publicas em ${TRANSCRIPT_BASE_URL}${TRANSCRIPT_ROUTE_PREFIX}`);
  });

  server.on('error', error => {
    console.error(`[transcript] Falha ao iniciar servidor HTTP: ${formatError(error)}`);
  });
}

function iniciarBanco() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ticket_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_tag TEXT,
      username TEXT,
      setor_key TEXT NOT NULL,
      setor_nome TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(ticket_id, event_type)
    );

    CREATE INDEX IF NOT EXISTS idx_ticket_events_type ON ticket_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_user ON ticket_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_setor ON ticket_events(setor_key);
    CREATE INDEX IF NOT EXISTS idx_ticket_events_created_at ON ticket_events(created_at);

    CREATE TABLE IF NOT EXISTS bot_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function lerEstadoBot(key) {
  return db.prepare('SELECT value FROM bot_state WHERE key = ?').get(key)?.value;
}

function salvarEstadoBot(key, value) {
  db.prepare(`
    INSERT INTO bot_state (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `).run(key, value, new Date().toISOString());
}

function inserirEventoTicket({ ticketId, eventType, userId, userTag, username, setorKey, setorNome, createdAt }) {
  db.prepare(`
    INSERT OR IGNORE INTO ticket_events
      (ticket_id, event_type, user_id, user_tag, username, setor_key, setor_nome, created_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(ticketId, eventType, userId, userTag, username, setorKey || 'sem_setor', setorNome || 'Sem setor', createdAt || new Date().toISOString());
}

function repetir(total, fn) {
  const n = Number(total) || 0;
  for (let i = 0; i < n; i++) fn(i);
}

function migrarRelatoriosJson() {
  if (!fs.existsSync(RELATORIOS_PATH)) return;

  const totalEventos = db.prepare('SELECT COUNT(*) AS total FROM ticket_events').get()?.total || 0;
  if (totalEventos > 0) return;

  try {
    const dados = JSON.parse(fs.readFileSync(RELATORIOS_PATH, 'utf8'));

    const abertosPorUsuario = Object.values(dados.abertosPorUsuario || {});
    const assumidosPorUsuario = Object.values(dados.assumidosPorUsuario || {});

    for (const item of abertosPorUsuario) {
      const setores = Object.entries(item.setores || {});
      if (!setores.length) setores.push(['sem_setor', item.total]);
      for (const [setorKey, totalSetor] of setores) {
        repetir(totalSetor, i => inserirEventoTicket({
          ticketId: `json-aberto-usuario-${item.userId}-${setorKey}-${i}`,
          eventType: 'aberto',
          userId: item.userId,
          userTag: item.tag,
          username: item.username,
          setorKey,
          setorNome: dados.abertosPorSetor?.[setorKey]?.setorNome || 'Importado do JSON',
          createdAt: item.ultimoAbertoEm || dados.atualizadoEm
        }));
      }
    }

    for (const item of assumidosPorUsuario) {
      const setores = Object.entries(item.setores || {});
      if (!setores.length) setores.push(['sem_setor', item.total]);
      for (const [setorKey, totalSetor] of setores) {
        repetir(totalSetor, i => inserirEventoTicket({
          ticketId: `json-assumido-usuario-${item.userId}-${setorKey}-${i}`,
          eventType: 'assumido',
          userId: item.userId,
          userTag: item.tag,
          username: item.username,
          setorKey,
          setorNome: dados.respondidosPorSetor?.[setorKey]?.setorNome || 'Importado do JSON',
          createdAt: item.ultimoAssumidoEm || dados.atualizadoEm
        }));
      }
    }

    if (!abertosPorUsuario.length) {
      for (const item of Object.values(dados.abertosPorSetor || {})) {
        repetir(item.total, i => inserirEventoTicket({
          ticketId: `json-aberto-setor-${item.setorKey}-${i}`,
          eventType: 'aberto',
          userId: 'importado-json',
          userTag: 'Importado do JSON',
          username: 'Importado do JSON',
          setorKey: item.setorKey,
          setorNome: item.setorNome,
          createdAt: dados.atualizadoEm
        }));
      }
    }

    if (!assumidosPorUsuario.length) {
      for (const item of Object.values(dados.respondidosPorSetor || {})) {
        repetir(item.total, i => inserirEventoTicket({
          ticketId: `json-assumido-setor-${item.setorKey}-${i}`,
          eventType: 'assumido',
          userId: 'importado-json',
          userTag: 'Importado do JSON',
          username: 'Importado do JSON',
          setorKey: item.setorKey,
          setorNome: item.setorNome,
          createdAt: dados.atualizadoEm
        }));
      }
    }

    console.log('[relatorios] Dados antigos do JSON importados para o SQLite.');
  } catch (error) {
    console.error(`[relatorios] Falha ao migrar JSON para SQLite: ${formatError(error)}`);
  }
}

iniciarBanco();
migrarRelatoriosJson();

function registrarTicketAberto(interaction, dados) {
  inserirEventoTicket({
    ticketId: dados.ticketId || interaction.channelId || `aberto-${Date.now()}`,
    eventType: 'aberto',
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    username: interaction.user.username,
    setorKey: dados.setorKey,
    setorNome: dados.setorNome
  });
}

function registrarTicketAssumido(interaction, dados) {
  inserirEventoTicket({
    ticketId: dados.ticketId || interaction.channelId || `assumido-${Date.now()}`,
    eventType: 'assumido',
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    username: interaction.user.username,
    setorKey: dados.setorKey,
    setorNome: dados.setorNome
  });
}

function montarRanking(sql, params, formatarLinha) {
  const ranking = db.prepare(sql).all(...params);
  if (!ranking.length) return 'Sem registros ainda.';

  return ranking.map((item, index) => {
    const total = Number(item.total);
    const plural = total === 1 ? 'ticket' : 'tickets';
    return formatarLinha(item, index, total, plural);
  }).join('\n');
}

function obterAnoSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric'
  }).formatToParts(date);
  return Number(parts.find(part => part.type === 'year')?.value || date.getFullYear());
}

function obterPeriodoAtualRelatorio(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit'
  }).formatToParts(date);
  return {
    ano: Number(parts.find(part => part.type === 'year')?.value || date.getFullYear()),
    mes: Number(parts.find(part => part.type === 'month')?.value || (date.getMonth() + 1))
  };
}

function criarFiltroRelatorio({ mes, ano } = {}) {
  const anoNormalizado = Number(ano);
  const anoFiltro = Number.isInteger(anoNormalizado) && anoNormalizado >= 2000 && anoNormalizado <= 9999
    ? anoNormalizado
    : null;
  const mesNormalizado = Number(mes);
  const mesFiltro = Number.isInteger(mesNormalizado) && mesNormalizado >= 1 && mesNormalizado <= 12
    ? mesNormalizado
    : null;

  if (!mesFiltro && !anoFiltro) {
    return {
      where: '',
      params: [],
      titulo: 'Periodo: todos os registros'
    };
  }

  if (!mesFiltro) {
    const inicio = new Date(anoFiltro, 0, 1, 0, 0, 0, 0);
    const fim = new Date(anoFiltro + 1, 0, 1, 0, 0, 0, 0);
    return {
      where: ' AND created_at >= ? AND created_at < ?',
      params: [inicio.toISOString(), fim.toISOString()],
      titulo: `Periodo: ${anoFiltro}`
    };
  }

  if (!anoFiltro) {
    return {
      where: " AND strftime('%m', created_at) = ?",
      params: [String(mesFiltro).padStart(2, '0')],
      titulo: `Periodo: mes ${String(mesFiltro).padStart(2, '0')} em todos os anos`
    };
  }

  const inicio = new Date(anoFiltro, mesFiltro - 1, 1, 0, 0, 0, 0);
  const fim = new Date(anoFiltro, mesFiltro, 1, 0, 0, 0, 0);

  return {
    where: ' AND created_at >= ? AND created_at < ?',
    params: [inicio.toISOString(), fim.toISOString()],
    titulo: `Periodo: ${String(mesFiltro).padStart(2, '0')}/${anoFiltro}`
  };
}

function obterAtualizadoRelatorio(filtro) {
  const ultimoEvento = db.prepare(`SELECT MAX(created_at) AS atualizadoEm FROM ticket_events WHERE 1=1${filtro.where}`).get(...filtro.params);
  const atualizado = ultimoEvento?.atualizadoEm
    ? new Date(ultimoEvento.atualizadoEm).toLocaleString('pt-BR')
    : 'sem data';
  return atualizado;
}

function rankingUsuariosPorEvento(eventType, filtro, limit = 5) {
  return montarRanking(
    `SELECT user_id AS userId, COALESCE(MAX(user_tag), MAX(username), user_id) AS nome, COUNT(*) AS total
       FROM ticket_events
      WHERE event_type = ? AND user_id != 'importado-json'${filtro.where}
      GROUP BY user_id
      ORDER BY total DESC
      LIMIT ${limit}`,
    [eventType, ...filtro.params],
    (item, index, total, plural) => `${index + 1}. <@${item.userId}> - **${total}** ${plural}`
  );
}

function rankingSetoresPorEvento(eventType, filtro, limit = 10) {
  return montarRanking(
    `SELECT setor_key AS setorKey, setor_nome AS setorNome, COUNT(*) AS total
       FROM ticket_events
      WHERE event_type = ?${filtro.where}
      GROUP BY setor_key, setor_nome
      ORDER BY total DESC
      LIMIT ${limit}`,
    [eventType, ...filtro.params],
    (item, index, total, plural) => `${index + 1}. ${item.setorNome} - **${total}** ${plural}`
  );
}

function montarGuiaRelatorios() {
  return [
    '# Central de relatorios e rankings',
    '',
    'Use o botao abaixo para abrir o menu interativo de consulta.',
    '',
    '**Como funciona**',
    '1. Clique em **Abrir menu de relatorio**.',
    '2. Escolha o tipo de ranking e ajuste mes/ano se quiser.',
    '3. Clique em **Consultar agora** para publicar o card neste canal.',
    '',
    '**Tipos disponiveis**',
    'Ranking geral: quem mais assumiu tickets e quem mais abriu tickets.',
    'Ranking de respostas: setores com mais tickets respondidos e pessoas que mais assumiram atendimentos.',
    '',
    '**Observacoes**',
    'Somente administradores podem usar o menu.',
    'As consultas feitas pelo menu aparecem apenas para quem consultou.',
    'O canal configurado em `CANAL_RANKING_TICKETS_ID` recebe o ranking automatico diario.'
  ].join('\n');
}

function montarRelatorioRespostas({ mes, ano } = {}) {
  const filtro = criarFiltroRelatorio({ mes, ano });
  const atualizado = obterAtualizadoRelatorio(filtro);
  const respondidosPorSetor = rankingSetoresPorEvento('assumido', filtro);
  const respondidosPorUsuario = rankingUsuariosPorEvento('assumido', filtro, 10);

  return `# Ranking de respostas\n\n${filtro.titulo}\n\n**Setores com mais tickets respondidos**\n${respondidosPorSetor}\n\n**Pessoas que mais assumiram atendimentos**\n${respondidosPorUsuario}\n\nÚltimo registro considerado: ${atualizado}`;
}

function montarRelatorioTickets({ mes, ano } = {}) {
  const filtro = criarFiltroRelatorio({ mes, ano });
  const atualizado = obterAtualizadoRelatorio(filtro);
  const assumidosPorUsuario = rankingUsuariosPorEvento('assumido', filtro);
  const abertosPorUsuario = rankingUsuariosPorEvento('aberto', filtro);

  return `# Ranking geral de tickets\n\n${filtro.titulo}\n\n**Pessoas que mais assumiram atendimentos**\n${assumidosPorUsuario}\n\n**Pessoas que mais abriram tickets**\n${abertosPorUsuario}\n\nÚltimo registro considerado: ${atualizado}`;
}

function montarCardRelatorio({ tipo = 'geral', mes, ano, destaque = 'relatorio' } = {}) {
  const filtro = criarFiltroRelatorio({ mes, ano });
  const atualizado = obterAtualizadoRelatorio(filtro);
  const ehRanking = destaque === 'ranking';
  const titulo = ehRanking
    ? (tipo === 'respostas' ? 'Ranking de Respostas' : 'Ranking Geral de Tickets')
    : (tipo === 'respostas' ? 'Relatorio de Respostas' : 'Relatorio Geral de Tickets');
  const embed = new EmbedBuilder()
    .setColor(ehRanking ? CORES.ticket : CORES.relatorio)
    .setTitle(titulo)
    .setDescription([
      filtro.titulo,
      '',
      ehRanking
        ? 'Atualizacao automatica do card de ranking.'
        : 'Resumo em formato de card para facilitar a leitura no canal.'
    ].join('\n'))
    .setFooter({ text: `Ultimo registro considerado: ${atualizado}` })
    .setTimestamp(new Date());

  if (tipo === 'respostas') {
    embed.addFields(
      {
        name: 'Setores com mais tickets respondidos',
        value: truncarTexto(rankingSetoresPorEvento('assumido', filtro), 1024),
        inline: false
      },
      {
        name: 'Pessoas que mais assumiram atendimentos',
        value: truncarTexto(rankingUsuariosPorEvento('assumido', filtro, 10), 1024),
        inline: false
      }
    );
    return embed;
  }

  embed.addFields(
    {
      name: 'Pessoas que mais assumiram atendimentos',
      value: truncarTexto(rankingUsuariosPorEvento('assumido', filtro), 1024),
      inline: false
    },
    {
      name: 'Pessoas que mais abriram tickets',
      value: truncarTexto(rankingUsuariosPorEvento('aberto', filtro), 1024),
      inline: false
    }
  );

  return embed;
}

function normalizarEstadoRelatorio({ tipo = 'geral', mes = null, ano = null } = {}) {
  const tipoValido = tipo === 'respostas' ? 'respostas' : 'geral';
  const mesNumero = Number(mes);
  const anoNumero = Number(ano);
  return {
    tipo: tipoValido,
    mes: Number.isInteger(mesNumero) && mesNumero >= 1 && mesNumero <= 12 ? mesNumero : null,
    ano: Number.isInteger(anoNumero) && anoNumero >= 2000 && anoNumero <= 9999 ? anoNumero : null
  };
}

function serializarEstadoRelatorio({ tipo = 'geral', mes = null, ano = null, acao }) {
  const estado = normalizarEstadoRelatorio({ tipo, mes, ano });
  return ['painel_relatorio', estado.tipo, estado.mes || 0, estado.ano || 0, acao].join('|');
}

function parseEstadoRelatorio(customId) {
  const [prefixo, tipo, mes, ano, acao] = String(customId || '').split('|');
  if (prefixo !== 'painel_relatorio' || !acao) return null;
  return {
    ...normalizarEstadoRelatorio({ tipo, mes: Number(mes), ano: Number(ano) }),
    acao
  };
}

function obterAnosRelatorio() {
  const anoAtual = obterPeriodoAtualRelatorio().ano;
  const anosRegistrados = db.prepare(`
    SELECT DISTINCT CAST(strftime('%Y', created_at) AS INTEGER) AS ano
      FROM ticket_events
     WHERE created_at IS NOT NULL
     ORDER BY ano DESC
     LIMIT 24
  `).all()
    .map(item => Number(item.ano))
    .filter(ano => Number.isInteger(ano) && ano >= 2000 && ano <= 9999);

  return [...new Set([anoAtual, ...anosRegistrados])].sort((a, b) => b - a).slice(0, 24);
}

function criarMenuTipoRelatorio(estado) {
  return new StringSelectMenuBuilder()
    .setCustomId(serializarEstadoRelatorio({ ...estado, acao: 'tipo' }))
    .setPlaceholder('Escolha o tipo de relatorio')
    .addOptions(
      { label: 'Ranking geral', description: 'Quem mais assumiu e quem mais abriu tickets', value: 'geral', default: estado.tipo === 'geral' },
      { label: 'Ranking de respostas', description: 'Setores e pessoas com mais atendimentos assumidos', value: 'respostas', default: estado.tipo === 'respostas' }
    );
}

function criarMenuMesRelatorio(estado) {
  const meses = [
    'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return new StringSelectMenuBuilder()
    .setCustomId(serializarEstadoRelatorio({ ...estado, acao: 'mes' }))
    .setPlaceholder('Filtrar por mes')
    .addOptions(
      { label: 'Todos os meses', description: 'Consulta o historico completo', value: '0', default: !estado.mes },
      ...meses.map((mes, index) => ({
        label: mes,
        description: `Consultar apenas ${mes.toLowerCase()}`,
        value: String(index + 1),
        default: estado.mes === (index + 1)
      }))
    );
}

function criarMenuAnoRelatorio(estado) {
  const anos = obterAnosRelatorio();
  return new StringSelectMenuBuilder()
    .setCustomId(serializarEstadoRelatorio({ ...estado, acao: 'ano' }))
    .setPlaceholder('Filtrar por ano')
    .addOptions(
      {
        label: 'Todos os anos',
        description: 'Inclui registros de todos os anos',
        value: '0',
        default: !estado.ano
      },
      ...anos.map(ano => ({
        label: String(ano),
        description: `Consultar registros de ${ano}`,
        value: String(ano),
        default: estado.ano === ano
      }))
    );
}

function montarResumoPainelRelatorio(estado) {
  const tipoTexto = estado.tipo === 'respostas' ? 'Ranking de respostas' : 'Ranking geral';
  const mesTexto = estado.mes ? String(estado.mes).padStart(2, '0') : 'Todos';
  const anoTexto = estado.ano || 'Todos';
  return new EmbedBuilder()
    .setColor(CORES.relatorio)
    .setTitle('Menu De Consulta De Relatorios')
    .setDescription('Escolha os filtros abaixo e visualize o card em modo privado.')
    .addFields(
      { name: 'Tipo selecionado', value: tipoTexto, inline: true },
      { name: 'Mes', value: String(mesTexto), inline: true },
      { name: 'Ano', value: String(anoTexto), inline: true }
    )
    .setFooter({ text: 'O resultado aparece apenas para voce e some em 5 minutos.' });
}

function montarPainelRelatorioInterativo(estado = {}) {
  const estadoNormalizado = normalizarEstadoRelatorio(estado);
  return {
    content: 'Selecione os filtros e clique em `Consultar agora`.',
    embeds: [montarResumoPainelRelatorio(estadoNormalizado)],
    components: [
      row(criarMenuTipoRelatorio(estadoNormalizado)),
      row(criarMenuMesRelatorio(estadoNormalizado)),
      row(criarMenuAnoRelatorio(estadoNormalizado)),
      row(
        new ButtonBuilder()
          .setCustomId(serializarEstadoRelatorio({ ...estadoNormalizado, acao: 'consultar' }))
          .setLabel('Consultar agora')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(serializarEstadoRelatorio({ tipo: 'geral', mes: null, ano: null, acao: 'limpar' }))
          .setLabel('Limpar filtros')
          .setStyle(ButtonStyle.Secondary)
      )
    ]
  };
}

function agendarLimpezaRespostaRelatorio(interaction, delayMs = 5 * 60 * 1000) {
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delayMs);
}

function montarPainelFixoRelatorios() {
  const embed = new EmbedBuilder()
    .setColor(CORES.relatorio)
    .setTitle('Central De Relatorios')
    .setDescription('Abra o menu interativo para consultar relatorios sem poluir o canal.')
    .addFields(
      { name: 'Acesso', value: 'Somente administradores podem abrir e usar o painel.', inline: false },
      { name: 'Privacidade', value: 'Os cards gerados pelo menu aparecem apenas para quem fez a consulta.', inline: false }
    );

  return {
    content: montarGuiaRelatorios(),
    embeds: [embed],
    components: [row(
      new ButtonBuilder()
        .setCustomId('abrir_menu_relatorio')
        .setLabel('Abrir menu de relatorio')
        .setStyle(ButtonStyle.Primary)
    )]
  };
}

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

function formatarTextoTranscript(texto, rCargo, rUser, rCanal) {
  return esc(texto)
    .replace(/&lt;@!?(\d+)&gt;/g,   (_, id) => `<span class="mention">@${esc(rUser(id))}</span>`)
    .replace(/&lt;@&amp;(\d+)&gt;/g, (_, id) => `<span class="mention role">@${esc(rCargo(id))}</span>`)
    .replace(/&lt;#(\d+)&gt;/g,      (_, id) => `<span class="mention channel">#${esc(rCanal(id))}</span>`)
    .replace(/\n/g, '<br>');
}

function renderEmbed(embed, rCargo, rUser, rCanal) {
  const cor = embed.color ? '#' + embed.color.toString(16).padStart(6, '0') : '#5865F2';
  let h = `<div class="embed" style="border-left-color:${cor}">`;
  if (embed.author?.name)  h += `<div class="embed-author">${esc(embed.author.name)}</div>`;
  if (embed.title)         h += `<div class="embed-title">${esc(embed.title)}</div>`;
  if (embed.description)   h += `<div class="embed-description">${formatarTextoTranscript(embed.description, rCargo, rUser, rCanal)}</div>`;
  if (embed.fields?.length) {
    h += `<div class="embed-fields">`;
    for (const f of embed.fields)
      h += `<div class="embed-field${f.inline ? ' inline' : ''}"><div class="field-name">${esc(f.name)}</div><div class="field-value">${formatarTextoTranscript(f.value, rCargo, rUser, rCanal)}</div></div>`;
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
        const txt = formatarTextoTranscript(msg.content, rCargo, rUser, rCanal);
        c += `<div class="message-content">${txt}</div>`;
      }
      if (msg.attachments.size) {
        c += `<div class="attachments">`;
        for (const [, a] of msg.attachments) c += renderAnexo(a, b64);
        c += `</div>`;
      }
      for (const e of msg.embeds ?? []) c += renderEmbed(e, rCargo, rUser, rCanal);
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

function truncarTexto(texto, limite = 1024) {
  const valor = String(texto || '');
  return valor.length > limite ? `${valor.slice(0, limite - 1)}…` : valor;
}

function montarCardTranscript({ titulo, descricao, urlPublica, dados, interaction }) {
  const embed = new EmbedBuilder()
    .setColor(urlPublica ? CORES.transcript : CORES.fechado)
    .setTitle(titulo)
    .setDescription(descricao)
    .addFields(
      { name: 'Ticket', value: `#${dados.canalNome}`, inline: true },
      { name: 'Setor', value: dados.setorNome, inline: true },
      { name: 'Solicitante', value: `<@${dados.solicitanteId}>`, inline: true },
      { name: 'Responsavel', value: dados.responsavelId ? `<@${dados.responsavelId}>` : 'Nao assumido', inline: true },
      { name: 'Fechado por', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Acesso', value: urlPublica ? `[Abrir transcript](${urlPublica})` : 'Arquivo HTML anexado abaixo.', inline: true }
    )
    .setTimestamp(new Date());

  return embed;
}

function montarPayloadTranscriptHtml({ titulo, descricao, buffer, nomeArq, urlPublica, dados, interaction, content }) {
  const embed = montarCardTranscript({ titulo, descricao, urlPublica, dados, interaction });
  if (urlPublica) {
    return {
      content,
      embeds: [embed]
    };
  }

  return {
    content,
    embeds: [embed],
    files: [new AttachmentBuilder(buffer, { name: nomeArq })]
  };
}

async function enviarTranscriptHtml(destino, payload) {
  const mensagem = await destino.send(payload).catch(e => {
    console.error(e);
    return null;
  });

  const htmlUrl = mensagem?.attachments?.first()?.url;
  if (htmlUrl) {
    const content = `${payload.content}\n\n🔗 Baixar transcript HTML: ${htmlUrl}`;
    await mensagem.edit({ content }).catch(e => console.error(e));
  }

  return Boolean(mensagem);
}

function montarPainelTicketsComercial() {
  return {
    content: [
      '# Atendimento Comercial Para Suporte',
      '',
      'Abra um ticket para o suporte quando o cliente estiver em loja com problema de conexão.'
    ].join('\n'),
    components: [row(
      new ButtonBuilder()
        .setCustomId('abrir_ticket_comercial')
        .setLabel('Abrir ticket para suporte')
        .setStyle(ButtonStyle.Primary)
    )]
  };
}

function criarModalComercial() {
  return new ModalBuilder()
    .setCustomId('modal_ticket_comercial')
    .setTitle('Ticket Comercial Para Suporte')
    .addComponents(
      row(new TextInputBuilder()
        .setCustomId('cliente_id')
        .setLabel('ID do cliente')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)),
      row(new TextInputBuilder()
        .setCustomId('relato')
        .setLabel('Relato do cliente')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000)),
      row(new TextInputBuilder()
        .setCustomId('atendente')
        .setLabel('Nome de quem esta solicitando')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(120)),
      row(new TextInputBuilder()
        .setCustomId('telefone')
        .setLabel('Telefone de contato')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(40)),
      row(new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Motivo: sem conexao ou conexao lenta')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Sem conexao ou Conexao lenta')
        .setMaxLength(40))
    );
}

function normalizarMotivoComercial(valor) {
  const motivo = normalize(valor);
  if (['semconexao', 'semconexaoointernet', 'semsinal'].includes(motivo)) return COMERCIAL_MOTIVOS.sem_conexao;
  if (['conexaolenta', 'lentidao', 'internetlenta'].includes(motivo)) return COMERCIAL_MOTIVOS.conexao_lenta;
  return null;
}

function lerDadosFormularioComercial(interaction) {
  const campo = id => interaction.fields.getTextInputValue(id).trim();
  const dados = {
    clienteId: campo('cliente_id'),
    relato: campo('relato'),
    atendente: campo('atendente'),
    telefone: campo('telefone'),
    motivoInformado: campo('motivo')
  };

  const camposObrigatorios = [
    ['ID do cliente', dados.clienteId],
    ['Relato', dados.relato],
    ['Nome do atendente', dados.atendente],
    ['Telefone de contato', dados.telefone],
    ['Motivo', dados.motivoInformado]
  ];
  const faltando = camposObrigatorios.filter(([, valor]) => !valor).map(([nome]) => nome);
  const motivo = normalizarMotivoComercial(dados.motivoInformado);

  return {
    ok: !faltando.length && Boolean(motivo),
    faltando,
    motivo,
    dados
  };
}

function montarResumoComercial(formulario) {
  return [
    `**ID do cliente:** ${formulario.clienteId}`,
    `**Relato:** ${formulario.relato}`,
    `**Solicitante/atendente:** ${formulario.atendente}`,
    `**Telefone de contato:** ${formulario.telefone}`,
    `**Motivo:** ${formulario.motivo}`
  ].join('\n');
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
  if (!d) return { content: 'Dados do ticket não encontrados.' };

  const emAtendimento = Boolean(d.responsavelId);
  const embed = new EmbedBuilder()
    .setColor(emAtendimento ? CORES.atendimento : CORES.ticket)
    .setTitle(emAtendimento ? 'Ticket Em Atendimento' : 'Ticket Aberto')
    .setDescription(truncarTexto(d.setorDescricao, 400))
    .addFields(
      { name: 'Solicitante', value: `<@${d.solicitanteId}>`, inline: true },
      { name: 'Setor', value: d.setorNome, inline: true },
      { name: 'Cargo responsavel', value: `<@&${d.cargoSetorId}>`, inline: true },
      { name: 'Status', value: emAtendimento ? 'Em atendimento' : 'Aguardando atendimento', inline: true },
      { name: 'Responsavel', value: d.responsavelId ? `<@${d.responsavelId}>` : 'Ainda nao assumido', inline: true },
      { name: 'Canal', value: `#${d.canalNome}`, inline: true }
    )
    .setFooter({ text: 'Descreva sua solicitacao com o maximo de detalhes possivel para agilizar o atendimento.' })
    .setTimestamp(new Date());

  if (d.formularioComercial) {
    embed.addFields(
      { name: 'Origem', value: 'Comercial / loja', inline: true },
      { name: 'ID do cliente', value: truncarTexto(d.formularioComercial.clienteId, 1024), inline: true },
      { name: 'Motivo', value: truncarTexto(d.formularioComercial.motivo, 1024), inline: true },
      { name: 'Atendente', value: truncarTexto(d.formularioComercial.atendente, 1024), inline: true },
      { name: 'Telefone de contato', value: truncarTexto(d.formularioComercial.telefone, 1024), inline: true },
      { name: 'Relato', value: truncarTexto(d.formularioComercial.relato, 1024), inline: false }
    );
  }

  return { embeds: [embed] };
}

const podeAdicionarAoTicket = ({ user }, d) =>
  Boolean(user && d && (d.solicitanteId === user.id || d.responsavelId === user.id));

const podeFecharTicket = ({ user }, d) =>
  Boolean(user && d && (d.solicitanteId === user.id || d.responsavelId === user.id));

async function abrirTicketSetor(interaction, setorKey, extras = {}) {
  const setor = CONFIG.setores[setorKey];
  if (!setor?.categoriaId || !setor?.cargoId) {
    return { ok: false, motivo: 'Setor inválido ou configuração incompleta.' };
  }

  const categoria = await interaction.guild.channels.fetch(setor.categoriaId).catch(() => null);
  if (!categoria || categoria.type !== ChannelType.GuildCategory) {
    return { ok: false, motivo: 'Categoria do setor não encontrada.' };
  }

  const numeroTicket = interaction.guild.channels.cache.filter(c => c.parentId === setor.categoriaId && c.type === ChannelType.GuildText).size + 1;
  const nomeCanal = `ticket-${normalize(setor.nome)}-${numeroTicket}`;

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
  const dadosTicket = {
    ticketId: canalTicket.id,
    setorKey,
    solicitanteId: interaction.user.id, solicitanteTag: interaction.user.tag,
    setorNome: setor.nome, setorDescricao: setor.descricao,
    cargoSetorId: setor.cargoId, cargoSetorNome: cargoObj?.name || 'Desconhecido',
    responsavelId: null, responsavelTag: null, numeroTicket, canalNome: nomeCanal,
    ...extras
  };

  dadosTickets.set(canalTicket.id, dadosTicket);
  try {
    registrarTicketAberto(interaction, dadosTicket);
  } catch (error) {
    console.error(`[relatorios] Falha ao registrar ticket aberto: ${formatError(error)}`);
  }

  const origemComercial = extras.formularioComercial
    ? `\n\n${montarResumoComercial(extras.formularioComercial)}`
    : '';
  await canalTicket.send({ content: `<@&${setor.cargoId}> novo ticket aberto por ${interaction.user}.${origemComercial}` });
  await canalTicket.send({ ...montarMensagemTicket(canalTicket.id), components: [criarBotoesTicket(canalTicket.id)] });

  return { ok: true, canal: canalTicket };
}

async function garantirPainelFixo(guild) {
  const canal = await guild.channels.fetch(CONFIG.canalAberturaId).catch(() => null);
  if (!canal || canal.type !== ChannelType.GuildText) return;
  const msgs = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (!msgs) return;
  const existente = msgs.find(m =>
    m.author.id === client.user.id &&
    m.components?.some(actionRow =>
      actionRow.components?.some(component =>
        component.data?.custom_id === 'selecionar_setor' ||
        component.data?.custom_id?.startsWith('abrir_chamado_ti')
      )
    )
  );
  const payload   = {
    content: `# Central de Chamado\n\nEscolha a equipe responsável. Depois informe seu setor, descreva o problema e anexe imagens ou prints, se necessário.`,
    components: [
      row(
        new ButtonBuilder()
          .setCustomId('abrir_chamado_ti|noc')
          .setLabel(DESTINOS_CHAMADO_TI.noc.label)
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('abrir_chamado_ti|sistemas')
          .setLabel(DESTINOS_CHAMADO_TI.sistemas.label)
          .setStyle(ButtonStyle.Primary)
      )
    ]
  };
  existente ? await existente.edit(payload).catch(() => {}) : await canal.send(payload).catch(() => {});
}

async function garantirPainelComercialFixo(guild) {
  if (!CONFIG.canalAberturaComercialId) return;

  const canal = await guild.channels.fetch(CONFIG.canalAberturaComercialId).catch(() => null);
  if (!canal || canal.type !== ChannelType.GuildText) {
    console.error('[tickets] Canal de abertura comercial nao encontrado ou nao e um canal de texto.');
    return;
  }

  const msgs = await canal.messages.fetch({ limit: 20 }).catch(() => null);
  if (!msgs) return;
  const existente = msgs.find(m => m.author.id === client.user.id && m.components?.[0]?.components?.[0]?.data?.custom_id === 'abrir_ticket_comercial');
  const payload = montarPainelTicketsComercial();
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

async function enviarTranscriptPorDm(userId, payload) {
  if (!userId) return false;
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return false;
  return enviarTranscriptHtml(user, payload);
}

async function enviarTranscriptEmCanal(canal, payload) {
  if (!canal?.isTextBased()) return false;
  return enviarTranscriptHtml(canal, payload);
}

async function buscarCanalTexto(guild, channelId, contexto) {
  if (!channelId) return null;
  const canal = await guild.channels.fetch(channelId).catch(error => {
    console.error(`[${contexto}] Falha ao buscar canal ${channelId}: ${formatError(error)}`);
    return null;
  });
  return canal?.isTextBased() ? canal : null;
}

function criarResolversTranscript(guild) {
  return {
    cargo: criarResolver(guild, async (g, id) => (await g.roles.fetch(id).catch(() => null))?.name || id),
    user:  criarResolver(guild, async (g, id) => {
      const m = await g.members.fetch(id).catch(() => null);
      return m?.displayName || m?.user?.username || id;
    }),
    canal: criarResolver(guild, async (g, id) => (await g.channels.fetch(id).catch(() => null))?.name || id)
  };
}

async function preencherResolversTranscript(mensagens, resolvers) {
  const textosMensagem = msg => [
    msg.content,
    ...((msg.embeds ?? []).flatMap(embed => [
      embed.title,
      embed.description,
      embed.author?.name,
      embed.footer?.text,
      ...((embed.fields ?? []).flatMap(field => [field.name, field.value]))
    ]))
  ].filter(Boolean);

  for (const msg of mensagens) {
    for (const texto of textosMensagem(msg)) {
      for (const m of texto.matchAll(/<@&(\d+)>/g))  await resolvers.cargo(m[1]);
      for (const m of texto.matchAll(/<@!?(\d+)>/g)) await resolvers.user(m[1]);
      for (const m of texto.matchAll(/<#(\d+)>/g))   await resolvers.canal(m[1]);
    }
  }
}

async function atualizarNomesTranscript(dados, resolvers) {
  if (dados.solicitanteId) {
    dados.solicitanteTag = await resolvers.user(dados.solicitanteId);
  }

  if (dados.cargoSetorId) {
    dados.cargoSetorNome = await resolvers.cargo(dados.cargoSetorId);
  }
}

async function baixarAnexosTranscript(mensagens) {
  const anexos = new Map();
  for (const msg of mensagens) {
    for (const [, anexo] of msg.attachments) {
      const baixado = await baixarAnexo(anexo);
      if (baixado) anexos.set(anexo.id, baixado);
    }
  }
  return anexos;
}

function nomeArquivoTranscript(dados, date = new Date()) {
  const dataStr = date.toLocaleDateString('pt-BR').replace(/\//g, '-');
  const userNorm = normalize(dados.solicitanteTag.split('#')[0]);
  return `transcript-${userNorm}-${dataStr}.html`;
}

async function prepararTranscriptTicket(interaction, dados, mensagens) {
  const resolvers = criarResolversTranscript(interaction.guild);
  await preencherResolversTranscript(mensagens, resolvers);
  await atualizarNomesTranscript(dados, resolvers);
  const anexos = await baixarAnexosTranscript(mensagens);
  const nomeArq = nomeArquivoTranscript(dados);
  const buffer = Buffer.from(gerarTranscriptHtml(
    dados,
    mensagens,
    interaction.user.tag,
    resolvers.cargo.sync,
    resolvers.user.sync,
    resolvers.canal.sync,
    anexos
  ), 'utf-8');

  let publicacao = null;
  if (TRANSCRIPT_BASE_URL) {
    try {
      publicacao = publicarTranscriptEmDisco(buffer, nomeArq);
    } catch (error) {
      console.error(`[transcript] Falha ao publicar transcript em disco: ${formatError(error)}`);
    }
  }

  return { buffer, nomeArq, urlPublica: publicacao?.url || null };
}

async function enviarTranscriptTicket(interaction, dados, transcript) {
  const { buffer, nomeArq, urlPublica } = transcript;

  await enviarTranscriptPorDm(dados.solicitanteId, montarPayloadTranscriptHtml({
    titulo: 'Transcript Do Ticket',
    descricao: 'Seu transcript ja esta pronto para visualizacao.',
    buffer,
    nomeArq,
    urlPublica,
    dados,
    interaction
  }));

  if (dados.responsavelId && dados.responsavelId !== dados.solicitanteId) {
    await enviarTranscriptPorDm(dados.responsavelId, montarPayloadTranscriptHtml({
      titulo: 'Transcript Do Atendimento',
      descricao: `O transcript do ticket assumido por voce ja esta disponivel.\nSolicitante: ${dados.solicitanteTag}.`,
      buffer,
      nomeArq,
      urlPublica,
      dados,
      interaction
    }));
  }

  const canalFechadosSetorId = dados.setorKey ? CONFIG.setores[dados.setorKey]?.canalFechadosId : null;
  const canalFechadosSetor = await buscarCanalTexto(interaction.guild, canalFechadosSetorId, 'transcript');
  if (!canalFechadosSetor) return false;

  const responsavelLinha = dados.responsavelId
    ? `👨‍💼 Assumido por <@${dados.responsavelId}>`
    : '👨‍💼 Ticket não foi assumido';

  await enviarTranscriptEmCanal(canalFechadosSetor, montarPayloadTranscriptHtml({
    titulo: `Ticket Fechado Em ${dados.setorNome}`,
    descricao: responsavelLinha,
    buffer,
    nomeArq,
    urlPublica,
    dados,
    interaction,
    content: `📁 Ticket fechado no setor **${dados.setorNome}**`
  }));

  return true;
}

async function publicarRelatorioTickets(interaction) {
  const tipo = interaction.options?.getString('tipo') || 'geral';
  const mes = interaction.options?.getInteger('mes') || null;
  const ano = interaction.options?.getInteger('ano') || null;
  const embed = montarCardRelatorio({ tipo, mes, ano, destaque: 'relatorio' });

  if (!CONFIG.canalRelatoriosTicketsId) {
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  const canal = await interaction.guild.channels.fetch(CONFIG.canalRelatoriosTicketsId).catch(() => null);
  if (!canal?.isTextBased()) {
    return interaction.reply(ephemeral('Canal de relatórios não encontrado ou não é um canal de texto.'));
  }

  await canal.send({ embeds: [embed] });
  return interaction.reply(ephemeral(`Relatório enviado em <#${CONFIG.canalRelatoriosTicketsId}>.`));
}

async function publicarRelatorioPorEstado(guild, estado) {
  return {
    ok: true,
    embed: montarCardRelatorio({ ...estado, destaque: 'relatorio' })
  };
}

function dataHoraSaoPaulo(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value;
  return {
    dateKey: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday'),
    hour: Number(get('hour'))
  };
}

async function publicarRelatorioDiario() {
  if (!CONFIG.canalRelatoriosTicketsId) return false;

  const canal = await client.channels.fetch(CONFIG.canalRelatoriosTicketsId).catch(() => null);
  if (!canal?.isTextBased()) {
    console.error('[relatorios] Canal de relatórios não encontrado ou não é um canal de texto.');
    return false;
  }

  await canal.send({ embeds: [montarCardRelatorio({ tipo: 'geral', destaque: 'relatorio' })] });
  return true;
}

async function publicarRankingDiario() {
  if (!CONFIG.canalRankingTicketsId) return false;

  const canal = await client.channels.fetch(CONFIG.canalRankingTicketsId).catch(() => null);
  if (!canal?.isTextBased()) {
    console.error('[rankings] Canal de rankings não encontrado ou não é um canal de texto.');
    return false;
  }

  const payload = { embeds: [montarCardRelatorio({ tipo: 'geral', destaque: 'ranking' })] };
  const stateKey = 'ranking_diario_msg_id';
  const messageId = lerEstadoBot(stateKey);
  let mensagem = messageId ? await canal.messages.fetch(messageId).catch(() => null) : null;

  if (!mensagem) {
    const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    mensagem = mensagens?.find(msg =>
      msg.author.id === client.user.id &&
      msg.embeds?.[0]?.title === 'Ranking Geral de Tickets'
    ) || null;
  }

  if (mensagem) {
    await mensagem.edit(payload).catch(error => {
      console.error(`[rankings] Falha ao atualizar ranking diario fixo: ${formatError(error)}`);
    });
  } else {
    mensagem = await canal.send(payload).catch(error => {
      console.error(`[rankings] Falha ao enviar ranking diario fixo: ${formatError(error)}`);
      return null;
    });
  }

  if (!mensagem) return false;

  salvarEstadoBot(stateKey, mensagem.id);
  if (!mensagem.pinned) {
    await mensagem.pin('Ranking diario fixo').catch(error => {
      console.error(`[rankings] Falha ao fixar ranking diario: ${formatError(error)}`);
    });
  }

  return true;
}

async function garantirGuiaRelatoriosFixo() {
  if (!CONFIG.canalRelatoriosTicketsId) return false;

  const canal = await client.channels.fetch(CONFIG.canalRelatoriosTicketsId).catch(() => null);
  if (!canal?.isTextBased()) {
    console.error('[relatorios] Canal de relatórios não encontrado para publicar o guia.');
    return false;
  }

  const payload = montarPainelFixoRelatorios();
  const stateKey = 'guia_relatorios_msg_id';
  const messageId = lerEstadoBot(stateKey);
  let mensagem = messageId ? await canal.messages.fetch(messageId).catch(() => null) : null;

  if (!mensagem) {
    const mensagens = await canal.messages.fetch({ limit: 50 }).catch(() => null);
    mensagem = mensagens?.find(msg =>
      msg.author.id === client.user.id &&
      (msg.content.startsWith('# Como consultar relatórios e rankings')
        || msg.content.startsWith('# Central de relatorios e rankings'))
    ) || null;
  }

  if (mensagem) {
    await mensagem.edit(payload).catch(error => console.error(`[relatorios] Falha ao atualizar guia: ${formatError(error)}`));
  } else {
    mensagem = await canal.send(payload).catch(error => {
      console.error(`[relatorios] Falha ao enviar guia: ${formatError(error)}`);
      return null;
    });
  }

  if (!mensagem) return false;

  salvarEstadoBot(stateKey, mensagem.id);
  if (!mensagem.pinned) {
    await mensagem.pin('Guia de uso dos relatórios').catch(error => {
      console.error(`[relatorios] Falha ao fixar guia: ${formatError(error)}`);
    });
  }

  return true;
}

async function verificarRelatorioDiario() {
  const agora = dataHoraSaoPaulo();
  if (agora.hour < RELATORIO_DIARIO_HORA) return;
  if (lerEstadoBot('ultimo_relatorio_diario') === agora.dateKey) return;

  const publicado = await publicarRelatorioDiario();
  if (publicado) {
    salvarEstadoBot('ultimo_relatorio_diario', agora.dateKey);
    console.log(`[relatorios] Relatorio diario publicado em ${agora.dateKey}.`);
  }
}

async function verificarRankingDiario() {
  const agora = dataHoraSaoPaulo();
  if (agora.hour < RELATORIO_DIARIO_HORA) return;
  if (lerEstadoBot('ultimo_ranking_diario') === agora.dateKey) return;

  const publicado = await publicarRankingDiario();
  if (publicado) {
    salvarEstadoBot('ultimo_ranking_diario', agora.dateKey);
    console.log(`[rankings] Ranking diario publicado em ${agora.dateKey}.`);
  }
}

function iniciarAgendamentoRelatorioDiario() {
  console.log('[relatorios] Publicacao automatica no canal de relatorios desativada; use o menu fixo para consultas manuais.');
}

function iniciarAgendamentoRankingDiario() {
  if (!CONFIG.canalRankingTicketsId) {
    console.warn('[rankings] CANAL_RANKING_TICKETS_ID nao configurado; ranking diario automatico desativado.');
    return;
  }

  verificarRankingDiario().catch(error => console.error(`[rankings] Falha no agendamento diario: ${formatError(error)}`));
  setInterval(() => {
    verificarRankingDiario().catch(error => console.error(`[rankings] Falha no agendamento diario: ${formatError(error)}`));
  }, 60 * 60 * 1000);
}

function logDiscordError(event, error) {
  console.error(`[discord:${event}] ${formatError(error)}`);
}

client.on(Events.Error, error => logDiscordError('client-error', error));
client.on(Events.Warn, warning => console.warn(`[discord:warn] ${warning}`));
client.on(Events.ShardError, error => logDiscordError('shard-error', error));
client.on(Events.ShardDisconnect, (event, shardId) => {
  console.warn(`[discord:shard-disconnect] shard=${shardId} code=${event?.code ?? 'desconhecido'} reason=${event?.reason || 'sem motivo informado'}`);
});
client.on(Events.ShardReconnecting, shardId => {
  console.warn(`[discord:shard-reconnecting] shard=${shardId}`);
});
client.on(Events.ShardResume, (shardId, replayedEvents) => {
  console.log(`[discord:shard-resume] shard=${shardId} replayed=${replayedEvents}`);
});

client.once(Events.ClientReady, async () => {
  console.log(`Bot online como ${client.user.tag}`);
  for (const guild of client.guilds.cache.values()) {
    await garantirPainelFixo(guild);
    await garantirPainelComercialFixo(guild);
  }
  await garantirGuiaRelatoriosFixo().catch(error => console.error(`[relatorios] Falha ao preparar guia fixo: ${formatError(error)}`));
  iniciarAgendamentoRelatorioDiario();
  iniciarAgendamentoRankingDiario();
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    const { customId } = interaction;

    if (interaction.isChatInputCommand() && interaction.commandName === 'relatorio') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply(ephemeral('Apenas administradores podem consultar relatórios.'));
      }

      const destino = CONFIG.canalRelatoriosTicketsId
        ? `Use o painel fixado em <#${CONFIG.canalRelatoriosTicketsId}> para abrir o menu de relatório.`
        : 'Use o painel fixado no canal de relatórios para abrir o menu de relatório.';
      return interaction.reply(ephemeral(destino));
    }

    if (interaction.isButton() && customId === 'abrir_menu_relatorio') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply(ephemeral('Apenas administradores podem usar o menu de relatórios.'));
      }

      await interaction.deferReply({ flags: 64 });
      await interaction.editReply(montarPainelRelatorioInterativo());
      agendarLimpezaRespostaRelatorio(interaction);
      return;
    }

    if (interaction.isStringSelectMenu() && customId.startsWith('painel_relatorio|')) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply(ephemeral('Apenas administradores podem usar o menu de relatórios.'));
      }

      const estado = parseEstadoRelatorio(customId);
      if (!estado) return interaction.reply(ephemeral('Estado do menu de relatório inválido.'));

      await interaction.deferUpdate();
      const proximoEstado = { ...estado };
      if (estado.acao === 'tipo') proximoEstado.tipo = interaction.values[0];
      if (estado.acao === 'mes') proximoEstado.mes = Number(interaction.values[0]) || null;
      if (estado.acao === 'ano') proximoEstado.ano = Number(interaction.values[0]) || null;
      await interaction.editReply(montarPainelRelatorioInterativo(proximoEstado));
      agendarLimpezaRespostaRelatorio(interaction);
      return;
    }

    if (interaction.isButton() && customId.startsWith('painel_relatorio|')) {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply(ephemeral('Apenas administradores podem usar o menu de relatórios.'));
      }

      const estado = parseEstadoRelatorio(customId);
      if (!estado) return interaction.reply(ephemeral('Estado do menu de relatório inválido.'));

      await interaction.deferUpdate();
      if (estado.acao === 'limpar') {
        await interaction.editReply(montarPainelRelatorioInterativo());
        agendarLimpezaRespostaRelatorio(interaction);
        return;
      }

      if (estado.acao === 'consultar') {
        const resultado = await publicarRelatorioPorEstado(interaction.guild, estado);
        if (!resultado.ok) {
          await interaction.editReply({
            ...montarPainelRelatorioInterativo(estado),
            content: resultado.motivo
          });
          agendarLimpezaRespostaRelatorio(interaction);
          return;
        }

        await interaction.editReply({
          content: 'Consulta concluida. O resultado abaixo aparece apenas para voce.',
          embeds: [
            montarResumoPainelRelatorio(estado),
            resultado.embed
          ],
          components: montarPainelRelatorioInterativo(estado).components
        });
        agendarLimpezaRespostaRelatorio(interaction);
        return;
      }
    }

    if (interaction.isButton() && customId.startsWith('abrir_chamado_ti')) {
      if (interaction.channelId !== CONFIG.canalAberturaId) {
        return interaction.reply(ephemeral(`A abertura de chamados de TI só pode ser feita no canal <#${CONFIG.canalAberturaId}>.`));
      }
      const destination = customId.split('|')[1] || 'noc';
      const destinationConfig = DESTINOS_CHAMADO_TI[destination];
      if (!destinationConfig) {
        return interaction.reply(ephemeral('Destino de chamado inválido. Atualize o painel e tente novamente.'));
      }
      if (!flowIspConfigurado()) {
        return interaction.reply(ephemeral('A integração com o FlowISP ainda não está configurada. Avise o N.O.C.'));
      }
      return interaction.reply({
        content: `Equipe selecionada: **${destinationConfig.teamName}**\nQual é o seu setor?`,
        components: [row(criarMenuSetoresChamadoTi(CONFIG.setores, destination))],
        flags: 64
      });
    }

    if (interaction.isStringSelectMenu() && customId.startsWith('selecionar_setor_chamado_ti|')) {
      const destination = customId.split('|')[1];
      const setorKey = interaction.values[0];
      if (!DESTINOS_CHAMADO_TI[destination] || !CONFIG.setores[setorKey]) {
        return interaction.reply(ephemeral('Setor inválido. Tente novamente.'));
      }
      return interaction.showModal(criarModalChamadoTi(setorKey, destination));
    }

    if (interaction.isModalSubmit() && customId.startsWith('modal_chamado_ti|')) {
      const [, destination, setorKey] = customId.split('|');
      const destinationConfig = DESTINOS_CHAMADO_TI[destination];
      const setor = CONFIG.setores[setorKey];
      if (!destinationConfig || !setor) return interaction.reply(ephemeral('Destino ou setor inválido. Tente novamente.'));

      const problem = interaction.fields.getTextInputValue('problema_ti').trim();
      const attachments = interaction.fields.getUploadedFiles('imagens_ti') || [];
      await interaction.deferReply({ flags: 64 });

      try {
        const result = await criarChamadoFlowIsp({
          externalId: interaction.id,
          requesterDiscordId: interaction.user.id,
          requesterName: interaction.member?.displayName || interaction.user.globalName || interaction.user.username,
          sector: setor.nome.replace(/^[^\p{L}\p{N}]+/u, '').trim(),
          problem,
          discordChannelId: interaction.channelId,
          discordGuildId: interaction.guildId,
          destination,
          attachments
        });
        const code = result.task?.id ? `#${result.task.id.slice(0, 8)}` : 'indisponivel';
        const message = result.created === false
          ? `Este chamado já estava registrado no FlowISP.\n**ID do ticket:** ${code}\n**Equipe:** ${destinationConfig.teamName}\n\nO chamado será analisado e resolvido pela equipe responsável.`
          : `Chamado aberto com sucesso.\n**ID do ticket:** ${code}\n**Equipe:** ${destinationConfig.teamName}\n\nO chamado será analisado e resolvido pela equipe responsável.`;
        return interaction.editReply({ content: message });
      } catch (error) {
        console.error(`[flowisp] Falha ao criar chamado: ${formatError(error)}`);
        return interaction.editReply({
          content: `Não foi possível criar o chamado no FlowISP: ${error.message || 'erro inesperado'}. Tente novamente ou avise o N.O.C.`
        });
      }
    }

    if (interaction.isButton() && customId === 'abrir_ticket_comercial') {
      if (interaction.channelId !== CONFIG.canalAberturaComercialId) {
        return interaction.reply(ephemeral(`A abertura comercial só pode ser feita no canal <#${CONFIG.canalAberturaComercialId}>.`));
      }

      return interaction.showModal(criarModalComercial());
    }

    if (interaction.isModalSubmit() && customId === 'modal_ticket_comercial') {
      if (interaction.channelId !== CONFIG.canalAberturaComercialId) {
        return interaction.reply(ephemeral(`A abertura comercial só pode ser feita no canal <#${CONFIG.canalAberturaComercialId}>.`));
      }

      const formulario = lerDadosFormularioComercial(interaction);
      if (!formulario.ok) {
        const faltando = formulario.faltando.length ? `\nCampos faltando: ${formulario.faltando.join(', ')}.` : '';
        return interaction.reply(ephemeral(`Preencha todos os dados e use o motivo "Sem conexão" ou "Conexão lenta".${faltando}`));
      }

      await interaction.deferReply({ flags: 64 });
      const resultado = await abrirTicketSetor(interaction, 'suporte', {
        origemSetorKey: 'comercial',
        formularioComercial: {
          ...formulario.dados,
          motivo: formulario.motivo
        }
      });

      if (!resultado.ok) return interaction.editReply({ content: resultado.motivo });
      await interaction.editReply({ content: `Ticket comercial criado para o suporte: ${resultado.canal}` });
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
      try {
        registrarTicketAssumido(interaction, dados);
      } catch (error) {
        console.error(`[relatorios] Falha ao registrar ticket assumido: ${formatError(error)}`);
      }
      await interaction.channel.setName(`${normalize(interaction.user.username)}-${normalize(dados.setorNome)}-${dados.numeroTicket}`.slice(0, 90)).catch(() => {});
      return interaction.update({ ...montarMensagemTicket(ticketId), components: [criarBotoesTicket(ticketId)] });
    }

    if (interaction.isButton() && customId.startsWith('adicionar_ticket_')) {
      const ticketId = customId.replace('adicionar_ticket_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados) return interaction.reply(ephemeral('Dados do ticket não encontrados.'));
      if (!podeAdicionarAoTicket(interaction, dados)) return interaction.reply(ephemeral('Somente quem abriu o ticket ou quem assumiu o atendimento pode adicionar pessoas ou cargos.'));
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
      if (!dados || !podeAdicionarAoTicket(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar pessoas neste ticket.'));
      return interaction.update({ content: 'Selecione a pessoa:', components: [row(new UserSelectMenuBuilder().setCustomId(`selecionar_usuario_${ticketId}`).setPlaceholder('Selecione uma pessoa').setMinValues(1).setMaxValues(1))] });
    }

    if (interaction.isButton() && customId.startsWith('escolher_add_cargo_')) {
      const ticketId = customId.replace('escolher_add_cargo_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!dados || !podeAdicionarAoTicket(interaction, dados)) return interaction.reply(ephemeral('Você não tem permissão para adicionar cargos neste ticket.'));
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
      if (!podeAdicionarAoTicket(interaction, dados)) return interaction.editReply({ content: `Sem permissão para adicionar ${isUser ? 'pessoas' : 'cargos'}.` });

      await interaction.channel.permissionOverwrites.edit(targetId, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true });
      return interaction.editReply({ content: `${isUser ? `Pessoa <@${targetId}>` : `Cargo <@&${targetId}>`} adicionado com sucesso.` });
    }

    if (interaction.isButton() && customId.startsWith('fechar_ticket_')) {
      const ticketId = customId.replace('fechar_ticket_', '');
      const dados    = dadosTickets.get(ticketId);
      if (!podeFecharTicket(interaction, dados)) return interaction.reply(ephemeral('Apenas quem abriu o ticket ou quem assumiu o atendimento pode fechá-lo.'));

      await interaction.reply(ephemeral('Gerando transcript e fechando ticket...'));

      try {
        const mensagens = await coletarMensagens(interaction.channel);
        if (!dados.canalNome) dados.canalNome = interaction.channel.name;

        const transcript = await prepararTranscriptTicket(interaction, dados, mensagens);
        await enviarTranscriptTicket(interaction, dados, transcript);

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

process.on('unhandledRejection', error => {
  console.error(`[process:unhandledRejection] ${formatError(error)}`);
});

process.on('uncaughtException', error => {
  console.error(`[process:uncaughtException] ${formatError(error)}`);
});

async function iniciarBot() {
  if (TRANSCRIPT_BASE_URL && !TRANSCRIPT_HTTP_PORT) {
    console.log('[transcript] TRANSCRIPT_BASE_URL configurada sem TRANSCRIPT_HTTP_PORT; assumindo que outro servidor vai publicar os arquivos dessa pasta.');
  }
  if (TRANSCRIPT_HTTP_PORT && !TRANSCRIPT_BASE_URL) {
    console.warn('[transcript] TRANSCRIPT_HTTP_PORT configurada sem TRANSCRIPT_BASE_URL; os arquivos serao servidos, mas o bot continuara enviando anexo por nao ter URL publica para montar.');
  }
  iniciarServidorTranscripts();

  const connectionCheck = await diagnoseDiscordConnection();

  if (!connectionCheck.ok) {
    console.error(`[discord:dns] Falha ao resolver discord.com: ${formatError(connectionCheck.error)}`);
  } else {
    console.log(`[discord:dns] discord.com -> ${connectionCheck.address} (IPv${connectionCheck.family})`);
  }

  try {
    await loginWithRetry(client, env.TOKEN, {
      attempts: 3,
      delayMs: 5000,
      onAttempt: attempt => console.log(`[discord:login] Tentativa ${attempt}/3`),
      onFailure: (error, attempt) => console.error(`[discord:login] Falha na tentativa ${attempt}: ${formatError(error)}`)
    });
  } catch (error) {
    if (isRetryableConnectionError(error)) {
      console.error('[discord:login] Nao foi possivel conectar ao Discord depois de varias tentativas. Verifique DNS, firewall ou acesso de rede para discord.com.');
    } else {
      console.error('[discord:login] Falha nao relacionada a rede. Verifique o TOKEN e as permissoes do bot no portal do Discord.');
    }

    process.exitCode = 1;
  }
}

iniciarBot();
