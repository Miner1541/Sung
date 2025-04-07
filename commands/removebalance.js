const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { hasAdminRole } = require('../utils/helpers');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('removebalance')
    .setDescription('Remove balance from a user.')
    .addUserOption(option => option.setName('user').setDescription('User to remove balance from').setRequired(true))
    .addNumberOption(option => option.setName('amount').setDescription('Amount to remove').setRequired(true)),
  async execute(interaction, client) {
    // Check if the user has admin role
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ content: '❗ You do not have permission to use this command.', ephemeral: true });
    }
    const user = interaction.options.getUser('user');
    const amount = interaction.options.getNumber('amount');
    
    // Validate amount
    if (amount <= 0) {
      return interaction.reply({ 
        content: '❗ The amount to remove must be greater than zero.', 
        ephemeral: true 
      });
    }
    const userRef = client.db.ref(`users/${user.id}`);
    const userSnapshot = await userRef.once('value');
    const currentBalance = userSnapshot.val()?.balance || 0;
    
    // Check if user has enough balance
    if (currentBalance < amount) {
      return interaction.reply({ 
        embeds: [soloLevelingEmbed('Insufficient Balance', 
          `**${user.tag}** only has $${currentBalance} in their balance. You cannot remove $${amount}.`
        )],
        ephemeral: true
      });
    }
    // Update the user's balance
    await userRef.update({ balance: currentBalance - amount });
    // Log the action
    await logAction(client, `💸 Removed $${amount} from ${user.tag}'s balance.`);
    
    // Reply to the admin
    return interaction.reply({ 
      embeds: [soloLevelingEmbed('Balance Removed', 
        `Removed $${amount} from **${user.tag}**.\nNew Balance: $${currentBalance - amount}`
      )],
      ephemeral: true
    });
  }
};
