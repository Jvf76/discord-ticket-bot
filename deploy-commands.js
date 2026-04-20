require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { requireEnv } = require('./env');
const {
  diagnoseDiscordConnection,
  formatError,
  isRetryableConnectionError
} = require('./connection');

const commands = [
  new SlashCommandBuilder()
    .setName('painel')
    .setDescription('Envia o painel de abertura de tickets')
    .toJSON()
];

const env = requireEnv(['TOKEN', 'CLIENT_ID'], 'registro de comandos');
const rest = new REST({ version: '10' }).setToken(env.TOKEN);

(async () => {
  try {
    const connectionCheck = await diagnoseDiscordConnection();

    if (!connectionCheck.ok) {
      console.error(`[discord:dns] Falha ao resolver discord.com: ${formatError(connectionCheck.error)}`);
    } else {
      console.log(`[discord:dns] discord.com -> ${connectionCheck.address} (IPv${connectionCheck.family})`);
    }

    console.log('Registrando comandos...');

    await rest.put(
      Routes.applicationCommands(env.CLIENT_ID),
      { body: commands }
    );

    console.log('Comando /painel registrado com sucesso!');
  } catch (error) {
    if (isRetryableConnectionError(error)) {
      console.error(`[discord:deploy] Falha de conectividade: ${formatError(error)}`);
      console.error('[discord:deploy] Verifique DNS, firewall ou acesso de rede para discord.com.');
      return;
    }

    console.error(`[discord:deploy] Erro ao registrar comando: ${formatError(error)}`);
  }
})();
