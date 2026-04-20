const PLACEHOLDER_PREFIXES = ['COLOQUE_', 'ID_DO_', 'ID_DA_'];

function readEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (PLACEHOLDER_PREFIXES.some(prefix => trimmed.startsWith(prefix))) return undefined;

  return trimmed;
}

function requireEnv(names, context = 'aplicacao') {
  const values = {};
  const missing = [];

  for (const name of names) {
    const value = readEnv(name);
    if (!value) missing.push(name);
    else values[name] = value;
  }

  if (missing.length) {
    throw new Error(
      `Variaveis obrigatorias ausentes ou com placeholder para ${context}: ${missing.join(', ')}`
    );
  }

  return values;
}

module.exports = { readEnv, requireEnv };
