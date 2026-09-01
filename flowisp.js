const { readEnv } = require('./env');

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 3;
const ALLOWED_IMAGE_TYPES = new Set([
  'image/avif',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp'
]);
const ALLOWED_DISCORD_HOSTS = new Set([
  'cdn.discordapp.com',
  'media.discordapp.net'
]);
const ALLOWED_DESTINATIONS = new Set(['noc', 'sistemas']);

class FlowIspError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = 'FlowIspError';
    this.status = status;
  }
}

function flowIspConfigurado() {
  return Boolean(readEnv('FLOWISP_BASE_URL') && readEnv('FLOWISP_INTEGRATION_KEY'));
}

function configuracao() {
  const baseUrl = readEnv('FLOWISP_BASE_URL');
  const integrationKey = readEnv('FLOWISP_INTEGRATION_KEY');
  if (!baseUrl || !integrationKey) {
    throw new FlowIspError('Integração com o FlowISP ainda não configurada.');
  }
  return {
    baseUrl: baseUrl.replace(/\/+$/, ''),
    integrationKey
  };
}

function validarAnexoDiscord(attachment) {
  if (!attachment?.url || !attachment?.name) {
    throw new FlowIspError('O Discord retornou um anexo inválido.');
  }
  if (!ALLOWED_IMAGE_TYPES.has(String(attachment.contentType || '').toLowerCase())) {
    throw new FlowIspError(`O arquivo ${attachment.name} não é uma imagem compatível.`);
  }
  if (Number(attachment.size || 0) > MAX_IMAGE_SIZE_BYTES) {
    throw new FlowIspError(`O arquivo ${attachment.name} excede o limite de 10 MB.`);
  }

  let url;
  try {
    url = new URL(attachment.url);
  } catch {
    throw new FlowIspError(`O endereço do arquivo ${attachment.name} é inválido.`);
  }
  if (url.protocol !== 'https:' || !ALLOWED_DISCORD_HOSTS.has(url.hostname)) {
    throw new FlowIspError(`O arquivo ${attachment.name} não veio do CDN do Discord.`);
  }
  return url;
}

async function fetchComTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function baixarAnexoDiscord(attachment) {
  const url = validarAnexoDiscord(attachment);
  const response = await fetchComTimeout(url, { redirect: 'error' }, 20_000);
  if (!response.ok) {
    throw new FlowIspError(`Não foi possível baixar o arquivo ${attachment.name}.`);
  }
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_SIZE_BYTES) {
    throw new FlowIspError(`O arquivo ${attachment.name} excede o limite de 10 MB.`);
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_SIZE_BYTES) {
    throw new FlowIspError(`O arquivo ${attachment.name} excede o limite de 10 MB.`);
  }
  return new Blob([bytes], { type: attachment.contentType });
}

async function criarChamadoFlowIsp(data) {
  const { baseUrl, integrationKey } = configuracao();
  const destination = String(data.destination || 'noc').trim().toLowerCase();
  if (!ALLOWED_DESTINATIONS.has(destination)) {
    throw new FlowIspError('Destino de chamado inválido.');
  }
  const attachments = Array.from(
    data.attachments?.values?.() || data.attachments || []
  );
  if (attachments.length > MAX_IMAGES) {
    throw new FlowIspError('Envie no máximo três imagens por chamado.');
  }

  const form = new FormData();
  const fields = {
    externalId: data.externalId,
    requesterDiscordId: data.requesterDiscordId,
    requesterName: data.requesterName,
    sector: data.sector,
    problem: data.problem,
    discordChannelId: data.discordChannelId,
    discordGuildId: data.discordGuildId
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && String(value).trim()) {
      form.append(key, String(value));
    }
  }

  for (const attachment of attachments) {
    const blob = await baixarAnexoDiscord(attachment);
    form.append('files', blob, attachment.name);
  }

  const response = await fetchComTimeout(`${baseUrl}/integrations/discord/tickets`, {
    method: 'POST',
    headers: {
      'x-flowisp-integration-key': integrationKey,
      'x-flowisp-ticket-destination': destination
    },
    body: form
  }, 30_000);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join('; ')
      : body.message;
    throw new FlowIspError(message || 'O FlowISP recusou a criação do chamado.', response.status);
  }
  return body;
}

async function requisicaoFlowIspJson(path, options = {}) {
  const { baseUrl, integrationKey } = configuracao();
  const response = await fetchComTimeout(`${baseUrl}${path}`, {
    method: options.method || 'POST',
    headers: {
      'x-flowisp-integration-key': integrationKey,
      'content-type': 'application/json',
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  }, options.timeoutMs || 15_000);

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const message = Array.isArray(body.message)
      ? body.message.join('; ')
      : body.message;
    throw new FlowIspError(
      message || 'O FlowISP recusou a consulta de conclusões.',
      response.status
    );
  }
  return body;
}

async function reivindicarConclusaoFlowIsp() {
  const body = await requisicaoFlowIspJson(
    '/integrations/discord/tickets/completions/claim'
  );
  return body.completion || null;
}

async function confirmarConclusaoFlowIsp(referenceId) {
  if (!referenceId) {
    throw new FlowIspError('Identificador da conclusão não informado.');
  }
  return requisicaoFlowIspJson(
    `/integrations/discord/tickets/completions/${encodeURIComponent(referenceId)}/ack`
  );
}

module.exports = {
  FlowIspError,
  confirmarConclusaoFlowIsp,
  criarChamadoFlowIsp,
  flowIspConfigurado,
  reivindicarConclusaoFlowIsp
};
