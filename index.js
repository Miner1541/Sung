    const { Client, GatewayIntentBits, Collection } = require('discord.js');
    const admin = require('firebase-admin');
    const fs = require('fs');
    const path = require('path');
    const config = require('./config.json');

    // Initialize Discord Client
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    // Attach config to client for easy access
    client.config = config;
    client.commands = new Collection();

    // Initialize Firebase
    const serviceAccount = require('./firebase-key.json');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: config.databaseURL
    });

    client.db = admin.database();

    // Create necessary directories if they don't exist
    const commandsPath = path.join(__dirname, 'commands');
    const utilsPath = path.join(__dirname, 'utils');
    const accountsPath = path.join(__dirname, 'accounts');

    [commandsPath, utilsPath, accountsPath].forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });

    // Load Commands
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
      const command = require(path.join(commandsPath, file));
      client.commands.set(command.data.name, command);
    }

    // Add rate limiting for commands
    const commandCooldowns = new Collection();
    const userCooldowns = new Collection();

    // Configure cooldowns for specific commands (in milliseconds)
    const COOLDOWN_DURATIONS = {
      default: 3000, // 3 seconds default cooldown
      purchase: 30000, // 30 seconds cooldown for purchase command
      addstock: 5000, // 5 seconds cooldown for addstock command
      stock: 5000, // 5 seconds for stock command
      balance: 3000, // 3 seconds for balance command
      // Add more command-specific cooldowns as needed
    };

    // Configure global user cooldown (regardless of command)
    const USER_GLOBAL_COOLDOWN = 1000; // 1 second between any commands

    client.once('ready', () => {
      console.log(`✅ ${client.user.tag} is online!`);
    });

    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isCommand()) return;

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        // Check global user cooldown first
        const userId = interaction.user.id;
        const now = Date.now();

        // Check if user is on global cooldown
        if (userCooldowns.has(userId)) {
          const lastGlobalCommandTime = userCooldowns.get(userId);
          const globalTimeLeft = lastGlobalCommandTime + USER_GLOBAL_COOLDOWN - now;

          if (globalTimeLeft > 0) {
            // User is on global cooldown
            const secondsLeft = (globalTimeLeft / 1000).toFixed(1);
            return interaction.reply({ 
              content: `⏱️ Please wait ${secondsLeft} more second${secondsLeft !== "1.0" ? "s" : ""} before using any command.`, 
              ephemeral: true 
            });
          }
        }

        // Update global user cooldown
        userCooldowns.set(userId, now);

        // Check command-specific cooldown
        const commandName = interaction.commandName;
        const cooldownDuration = COOLDOWN_DURATIONS[commandName] || COOLDOWN_DURATIONS.default;

        // Initialize cooldown collection for this command if it doesn't exist
        if (!commandCooldowns.has(commandName)) {
          commandCooldowns.set(commandName, new Collection());
        }

        const timestamps = commandCooldowns.get(commandName);

        // Check if user has a cooldown for this specific command
        if (timestamps.has(userId)) {
          const expirationTime = timestamps.get(userId) + cooldownDuration;

          if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return interaction.reply({ 
              content: `⏱️ Please wait ${timeLeft.toFixed(1)} more second${timeLeft.toFixed(1) !== "1.0" ? "s" : ""} before using the **/${commandName}** command again.`, 
              ephemeral: true 
            });
          }
        }

        // Set the command cooldown for this user
        timestamps.set(userId, now);

        // Clean up old timestamps occasionally to prevent memory leaks
        setTimeout(() => timestamps.delete(userId), cooldownDuration);

        // If we got here, the user is not rate-limited, execute the command
        await command.execute(interaction, client);

      } catch (error) {
        console.error(`Error executing command ${interaction.commandName}:`, error);

        // Try to send an error message if possible
        try {
          const errorMessage = interaction.replied || interaction.deferred
            ? await interaction.editReply({ content: '❗ An error occurred while executing the command.', ephemeral: true })
            : await interaction.reply({ content: '❗ An error occurred while executing the command.', ephemeral: true });
        } catch (replyError) {
          console.error('Failed to send error message:', replyError);
        }
      }
    });

    // Handle button interactions for commands like stock pagination
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isButton()) return;

      // Handle buttons from the stock command
      if (interaction.customId.startsWith('stock_prev_') || interaction.customId.startsWith('stock_next_')) {
        // The button handling is in the stock command itself
        // We don't need to do anything here as it creates its own collector
        return;
      }

      // Add other button handlers here if needed
    });

    // Global error handling
    process.on('unhandledRejection', (error) => {
      console.error('Unhandled promise rejection:', error);
    });

    // Login to Discord with the bot token

    client.login(config.token);
