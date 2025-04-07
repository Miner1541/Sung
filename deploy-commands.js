const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config.json');
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Get the application ID from environment or config
const clientId = process.env.CLIENT_ID || '1350048633629708338'; // Replace with your bot's actual client ID

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands.`);
    
    // For global commands
    await rest.put(
      Routes.applicationCommands(clientId),
      { body: commands },
    );
    
    console.log(`Successfully reloaded application (/) commands.`);
  } catch (error) {
    console.error(error);
  }
})();
