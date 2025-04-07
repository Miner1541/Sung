const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your balance.')
    .addUserOption(option => 
      option.setName('user')
        .setDescription('Check balance of a specific user')),

  async execute(interaction, client) {
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Prevent checking bot balances
    if (targetUser.bot) {
      return interaction.reply({ 
        content: '❗ Bots do not have a balance.', 
        ephemeral: true 
      });
    }

    const userRef = client.db.ref(`users/${targetUser.id}`);
    const snapshot = await userRef.once('value');
    const balance = snapshot.val()?.balance || 0;

    // Check if the requester is an admin and looking at someone else’s balance
    const isAdmin = hasAdminRole(interaction.member, client.config.adminRoleId);
    const isSelfCheck = targetUser.id === interaction.user.id;
    const ephemeral = isSelfCheck ? true : false;  // Make self-checks private

    // Log action if an admin checks another user's balance
    if (!isSelfCheck && isAdmin) {
      await logAction(client, `📊 Admin **${interaction.user.tag}** checked the balance of **${targetUser.tag}**.`);
    }

    return interaction.reply({ 
      embeds: [soloLevelingEmbed('Balance Check', 
        `**${targetUser.tag}** has a balance of **$${balance}**.`)], 
      ephemeral: ephemeral 
    });
  }
};
