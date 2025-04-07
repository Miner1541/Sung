const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('purchasehistory')
    .setDescription('View your purchase history.')
    .addIntegerOption(option => option.setName('page').setDescription('Page number').setMinValue(1))
    .addUserOption(option => option.setName('user').setDescription('View history for a specific user (admin only)')),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const page = interaction.options.getInteger('page') || 1;
    const itemsPerPage = 5;

    // Determine the target user
    const targetUser = interaction.options.getUser('user') || interaction.user;

    // Restrict access if a non-admin tries to view another user's history
    if (targetUser.id !== interaction.user.id && !hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.editReply({
        embeds: [soloLevelingEmbed('❌ Permission Denied', 'You do not have permission to view another user\'s purchase history.')]
      });
    }

    // Fetch purchase history
    const userRef = client.db.ref(`users/${targetUser.id}/purchases`);
    const snapshot = await userRef.once('value');

    if (!snapshot.exists()) {
      return interaction.editReply({
        embeds: [soloLevelingEmbed('📦 No Purchases', targetUser.id === interaction.user.id
          ? 'You have not made any purchases yet.'
          : `${targetUser.tag} has not made any purchases yet.`)]
      });
    }

    // Convert snapshot to array and sort by timestamp (latest first)
    const purchases = [];
    snapshot.forEach(child => purchases.push({ id: child.key, ...child.val() }));
    purchases.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate total pages
    const totalPages = Math.ceil(purchases.length / itemsPerPage);

    // Validate page number
    if (page > totalPages) {
      return interaction.editReply({
        embeds: [soloLevelingEmbed('⚠️ Invalid Page', `Only **${totalPages}** pages of purchase history are available.`)]
      });
    }

    // Get current page's purchases
    const startIndex = (page - 1) * itemsPerPage;
    const pagePurchases = purchases.slice(startIndex, startIndex + itemsPerPage);

    // Format history output
    let history = `**📜 Purchase History for ${targetUser.tag}**\n`;
    history += `**Page ${page}/${totalPages}**\n\n`;

    pagePurchases.forEach((purchase, index) => {
      const date = new Date(purchase.timestamp).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      history += `**${startIndex + index + 1}.** ${purchase.quantity}x **${purchase.itemName}** (${purchase.category})\n`;
      history += `- **Price:** $${purchase.price}\n`;
      history += `- **Date:** ${date}\n\n`;
    });

    // Calculate total spent
    const totalSpent = purchases.reduce((total, purchase) => total + purchase.price, 0);
    history += `💰 **Total Spent:** $${totalSpent}`;

    // Pagination buttons
    const components = totalPages > 1 ? [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`history_prev_${targetUser.id}_${page}`)
          .setLabel('⬅️ Previous')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page <= 1),
        new ButtonBuilder()
          .setCustomId(`history_next_${targetUser.id}_${page}`)
          .setLabel('Next ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page >= totalPages)
      )
    ] : [];

    // Send response
    const reply = await interaction.editReply({
      embeds: [soloLevelingEmbed('🛒 Purchase History', history)],
      components: components
    });

    // Handle pagination buttons
    if (totalPages > 1) {
      const filter = i => i.customId.startsWith('history_prev_') || i.customId.startsWith('history_next_');
      const collector = reply.createMessageComponentCollector({ filter, time: 60000 });

      collector.on('collect', async i => {
        if (i.user.id !== interaction.user.id) {
          return i.reply({ content: "❗ You can't use these buttons.", ephemeral: true });
        }

        await i.deferUpdate();
        const [_, action, userId, currentPage] = i.customId.split('_');
        const newPage = action === 'prev' ? parseInt(currentPage) - 1 : parseInt(currentPage) + 1;

        // Update the interaction options for new page
        interaction.options.getInteger = (name) => name === 'page' ? newPage : null;
        interaction.options.getUser = (name) => name === 'user' ? targetUser : null;

        // Re-run the command with updated options
        await this.execute(interaction, client);
        collector.stop();
      });

      collector.on('end', () => {
        interaction.editReply({ embeds: reply.embeds, components: [] }).catch(console.error);
      });
    }
  }
};
