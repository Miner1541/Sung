const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { logAction } = require('../utils/logger');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('removeitem')
    .setDescription('Remove an item from the shop.')
    .addStringOption(option => 
      option.setName('name')
        .setDescription('Item name to remove')
        .setRequired(true)
    )
    .addStringOption(option => 
      option.setName('username')
        .setDescription('Username of the item')
        .setRequired(false)
    )
    .addStringOption(option => 
      option.setName('password')
        .setDescription('Password of the item')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ 
        content: '❗ You do not have permission to use this command.', 
        ephemeral: true 
      });
    }

    const itemName = interaction.options.getString('name');
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    
    // Defer the reply as this might take some time
    await interaction.deferReply({ ephemeral: true });
    
    const snapshot = await client.db.ref('categories').once('value');

    let found = false;
    let removedItems = 0;
    let categoryName = '';
    let itemId = '';

    snapshot.forEach(catSnap => {
      const items = catSnap.child('items');
      items.forEach(itemSnap => {
        const item = itemSnap.val();
        
        // Check if item name matches
        if (item.name && item.name.toLowerCase() === itemName.toLowerCase()) {
          // If username and password are provided, verify they match
          if (username && password) {
            if (item.username === username && item.password === password) {
              found = true;
              removedItems++;
              categoryName = catSnap.key;
              itemId = itemSnap.key;
              client.db.ref(`categories/${categoryName}/items/${itemId}`).remove();
            }
          } else {
            // If username and password not provided, just match by name
            found = true;
            removedItems++;
            categoryName = catSnap.key;
            itemId = itemSnap.key;
            client.db.ref(`categories/${categoryName}/items/${itemId}`).remove();
          }
        }
      });
    });

    if (!found) {
      return interaction.editReply({ 
        embeds: [soloLevelingEmbed('Not Found', `❌ No item found with name **${itemName}**${username ? ` and the specified credentials` : ``}.`)],
        ephemeral: true
      });
    }

    // Log the action
    await logAction(client, `🗑️ Removed item **${itemName}** from category **${categoryName}**${username ? ` with username: ${username}` : ``}`);

    return interaction.editReply({ 
      embeds: [soloLevelingEmbed('Item Removed', `✅ Successfully removed **${itemName}** from category **${categoryName}**.`)],
      ephemeral: true
    });
  }
};

