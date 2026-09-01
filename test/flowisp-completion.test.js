const test = require('node:test');
const assert = require('node:assert/strict');
const {
  montarMensagemConclusao,
  processarConclusoesFlowIsp
} = require('../flowisp-completion');

const completion = {
  id: 'reference-1',
  requesterDiscordId: '1471147859934969927',
  ticketCode: '#abc12345',
  teamName: 'N.O.C',
  title: '[NOC/TI] Financeiro - Impressora não funciona',
  summary: 'A impressora do setor financeiro não está imprimindo.'
};

test('mensagem privada contém código, resumo e conclusão', () => {
  const message = montarMensagemConclusao(completion);
  assert.match(message, /#abc12345/);
  assert.match(message, /impressora do setor financeiro/i);
  assert.match(message, /marcado como \*\*concluído\*\*/i);
});

test('confirma no Flow somente depois de enviar a mensagem privada', async () => {
  const calls = [];
  const delivered = await processarConclusoesFlowIsp({
    client: {
      users: {
        fetch: async id => {
          calls.push(`fetch:${id}`);
          return {
            send: async payload => calls.push(`send:${payload.content}`)
          };
        }
      }
    },
    reivindicar: async () => {
      calls.push('claim');
      return calls.filter(item => item === 'claim').length === 1
        ? completion
        : null;
    },
    confirmar: async id => {
      calls.push(`ack:${id}`);
      return { acknowledged: true };
    }
  });

  assert.equal(delivered, 1);
  assert.ok(calls.findIndex(item => item.startsWith('send:')) < calls.indexOf('ack:reference-1'));
});

test('não confirma a conclusão quando a DM falha', async () => {
  let claimed = false;
  let acknowledged = false;
  const errors = [];

  const delivered = await processarConclusoesFlowIsp({
    client: {
      users: {
        fetch: async () => ({
          send: async () => {
            throw new Error('DM bloqueada');
          }
        })
      }
    },
    reivindicar: async () => {
      if (claimed) return null;
      claimed = true;
      return completion;
    },
    confirmar: async () => {
      acknowledged = true;
      return { acknowledged: true };
    },
    onError: error => errors.push(error.message)
  });

  assert.equal(delivered, 0);
  assert.equal(acknowledged, false);
  assert.deepEqual(errors, ['DM bloqueada']);
});
