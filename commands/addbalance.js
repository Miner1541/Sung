const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addbalance')
    .setDescription('Add balance to a user.')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('User to add balance to')
        .setRequired(true))
    .addNumberOption(option => 
      option.setName('amount')
        .setDescription('Amount to add')
        .setRequired(true)),

  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ content: '❗ You do not have permission to use this command.', ephemeral: true });
    }

    const user = interaction.options.getUser('user');
    const amount = interaction.options.getNumber('amount');

    // Prevent adding balance to bot accounts
    if (user.bot) {
      return interaction.reply({ 
        content: '❗ You cannot add balance to a bot account.', 
        ephemeral: true 
      });
    }

    // Validate amount
    if (amount <= 0) {
      return interaction.reply({ 
        content: '❗ The amount to add must be greater than zero.', 
        ephemeral: true 
      });
    }

    const userRef = client.db.ref(`users/${user.id}`);
    const userSnapshot = await userRef.once('value');
    const currentBalance = userSnapshot.val()?.balance || 0;

    // Update balance
    await userRef.update({ balance: currentBalance + amount });

    // Log action
    await logAction(client, `💰 Added $${amount} to ${user.tag} (ID: ${user.id}). New Balance: $${currentBalance + amount}`);

    return interaction.reply({ 
      embeds: [soloLevelingEmbed('Balance Added', 
        `Added $${amount} to **${user.tag}**.\nNew Balance: $${currentBalance + amount}`)], 
      ephemeral: true 
    });
  }
};
