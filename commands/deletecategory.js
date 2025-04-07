const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deletecategory')
    .setDescription('Delete a category and all its items.')
    .addStringOption(option => 
      option.setName('category')
        .setDescription('Category name')
        .setRequired(true)),

  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ content: '❗ You do not have permission to use this command.', ephemeral: true });
    }

    const inputCategory = interaction.options.getString('category');
    const snapshot = await client.db.ref('categories').once('value');

    let matchedCategory = null;
    snapshot.forEach(catSnap => {
      if (catSnap.key.toLowerCase() === inputCategory.toLowerCase()) {
        matchedCategory = catSnap;
      }
    });

    if (!matchedCategory) {
      return interaction.reply({ 
        embeds: [soloLevelingEmbed('Not Found', `Category **${inputCategory}** does not exist.`)], 
        ephemeral: true 
      });
    }

    const categoryRef = matchedCategory.ref;
    const itemCount = matchedCategory.child('items').numChildren();
    
    await categoryRef.remove();
    await logAction(client, `❌ Category **${matchedCategory.key}** deleted, including ${itemCount} items.`);

    return interaction.reply({ 
      embeds: [soloLevelingEmbed('Category Deleted', 
        `Category **${matchedCategory.key}** has been successfully deleted. (${itemCount} items removed)`)], 
      ephemeral: true 
    });
  }
};
