const test = require('node:test');
const assert = require('node:assert/strict');
const {
  confirmarConclusaoFlowIsp,
  reivindicarConclusaoFlowIsp
} = require('../flowisp');

test('consulta e confirma conclusões usando a chave de integração', async t => {
  const originalFetch = global.fetch;
  const originalBaseUrl = process.env.FLOWISP_BASE_URL;
  const originalKey = process.env.FLOWISP_INTEGRATION_KEY;
  const requests = [];

  process.env.FLOWISP_BASE_URL = 'https://flowisp.exemplo.test';
  process.env.FLOWISP_INTEGRATION_KEY = 'integration-test-key';
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    const isClaim = String(url).endsWith('/completions/claim');
    return new Response(
      JSON.stringify(
        isClaim
          ? { completion: { id: 'reference-1' } }
          : { acknowledged: true }
      ),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (originalBaseUrl === undefined) delete process.env.FLOWISP_BASE_URL;
    else process.env.FLOWISP_BASE_URL = originalBaseUrl;
    if (originalKey === undefined) delete process.env.FLOWISP_INTEGRATION_KEY;
    else process.env.FLOWISP_INTEGRATION_KEY = originalKey;
  });

  const completion = await reivindicarConclusaoFlowIsp();
  const acknowledged = await confirmarConclusaoFlowIsp(completion.id);

  assert.equal(completion.id, 'reference-1');
  assert.equal(acknowledged.acknowledged, true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(
    requests[0].options.headers['x-flowisp-integration-key'],
    'integration-test-key'
  );
  assert.match(requests[0].url, /\/completions\/claim$/);
  assert.match(requests[1].url, /\/completions\/reference-1\/ack$/);
});
