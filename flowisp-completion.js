function textoSeguro(value, fallback, maxLength = 1000) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function montarMensagemConclusao(completion) {
  const code = textoSeguro(completion?.ticketCode, 'indisponível', 32);
  const team = textoSeguro(completion?.teamName, 'Equipe responsável', 80);
  const summary = textoSeguro(
    completion?.summary,
    completion?.title || 'Chamado atendido pela equipe responsável.'
  );

  return [
    '✅ **Seu chamado foi concluído!**',
    '',
    `**ID do ticket:** ${code}`,
    `**Equipe responsável:** ${team}`,
    '',
    '**Resumo do chamado:**',
    summary,
    '',
    'O seu ticket foi marcado como **concluído** no FlowISP.'
  ].join('\n');
}

async function processarConclusoesFlowIsp({
  client,
  reivindicar,
  confirmar,
  onError = () => {},
  maxPerRun = 10
}) {
  let delivered = 0;

  for (let index = 0; index < maxPerRun; index += 1) {
    const completion = await reivindicar();
    if (!completion) break;

    try {
      if (!/^\d{15,25}$/.test(String(completion.requesterDiscordId || ''))) {
        throw new Error('ID do solicitante no Discord inválido');
      }

      const user = await client.users.fetch(completion.requesterDiscordId);
      await user.send({ content: montarMensagemConclusao(completion) });
      const result = await confirmar(completion.id);
      if (!result?.acknowledged) {
        throw new Error('O FlowISP não confirmou a entrega da notificação');
      }
      delivered += 1;
    } catch (error) {
      onError(error, completion);
    }
  }

  return delivered;
}

module.exports = {
  montarMensagemConclusao,
  processarConclusoesFlowIsp
};
