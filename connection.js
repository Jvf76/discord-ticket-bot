const dns = require('node:dns').promises;

const RETRYABLE_CODES = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'UND_ERR_CONNECT_TIMEOUT'
]);

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetryableConnectionError(error) {
  if (!error) return false;
  return RETRYABLE_CODES.has(error.code);
}

function formatError(error) {
  if (!error) return 'Erro desconhecido.';

  const code = error.code ? ` [${error.code}]` : '';
  return `${error.name || 'Error'}${code}: ${error.message || 'sem detalhes'}`;
}

async function diagnoseDiscordConnection() {
  try {
    const lookup = await dns.lookup('discord.com');
    return { ok: true, address: lookup.address, family: lookup.family };
  } catch (error) {
    return { ok: false, error };
  }
}

async function loginWithRetry(client, token, options = {}) {
  const {
    attempts = 3,
    delayMs = 5000,
    onAttempt = () => {},
    onFailure = () => {}
  } = options;

  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    onAttempt(attempt);

    try {
      await client.login(token);
      return;
    } catch (error) {
      lastError = error;
      onFailure(error, attempt);

      if (attempt >= attempts || !isRetryableConnectionError(error)) break;
      await wait(delayMs);
    }
  }

  throw lastError;
}

module.exports = {
  diagnoseDiscordConnection,
  formatError,
  isRetryableConnectionError,
  loginWithRetry
};
