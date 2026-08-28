const {
  FileUploadBuilder,
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

function criarMenuSetoresChamadoTi(setores, destination = 'noc') {
  return new StringSelectMenuBuilder()
    .setCustomId(`selecionar_setor_chamado_ti|${destination}`)
    .setPlaceholder('Selecione o seu setor')
    .addOptions(Object.entries(setores).map(([value, { nome }]) => ({
      label: nome,
      description: `Abrir chamado de TI para o setor ${nome}`.slice(0, 100),
      value
    })));
}

function criarModalChamadoTi(setorKey, destination = 'noc') {
  return new ModalBuilder()
    .setCustomId(`modal_chamado_ti|${destination}|${setorKey}`)
    .setTitle('Abrir chamado de TI')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Qual é o problema?')
        .setDescription('Descreva o erro e o que estava fazendo quando aconteceu.')
        .setTextInputComponent(
          new TextInputBuilder()
            .setCustomId('problema_ti')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(4000)
            .setPlaceholder('Ex.: o computador não liga após a queda de energia.')
        ),
      new LabelBuilder()
        .setLabel('Deseja anexar imagem ou print?')
        .setDescription('Opcional: até 3 imagens, com no máximo 10 MB cada.')
        .setFileUploadComponent(
          new FileUploadBuilder()
            .setCustomId('imagens_ti')
            .setMinValues(0)
            .setMaxValues(3)
            .setRequired(false)
        )
    );
}

module.exports = { criarMenuSetoresChamadoTi, criarModalChamadoTi };
