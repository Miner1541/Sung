const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { generateItemId, hasAdminRole } = require('../utils/helpers');
const { logAction } = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addstock')
    .setDescription('Add accounts to the shop.')
    .addStringOption(option => option.setName('category').setDescription('Account category').setRequired(true))
    .addStringOption(option => option.setName('name').setDescription('Account name').setRequired(true))
    .addIntegerOption(option => option.setName('quantity').setDescription('Number of accounts').setRequired(true))
    .addNumberOption(option => option.setName('price').setDescription('Account price').setRequired(true))
    .addStringOption(option => option.setName('username').setDescription('Public username (for logs)').setRequired(true))
    .addStringOption(option => option.setName('password').setDescription('Public password (for logs)').setRequired(true))
    .addStringOption(option => option.setName('details').setDescription('Account details (one per line)').setRequired(true)),
    
  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ content: '❗ You do not have permission to use this command.', ephemeral: true });
    }
    
    const category = interaction.options.getString('category').toLowerCase();
    const name = interaction.options.getString('name');
    const quantity = interaction.options.getInteger('quantity');
    const price = interaction.options.getNumber('price');
    const username = interaction.options.getString('username');
    const password = interaction.options.getString('password');
    const details = interaction.options.getString('details').split('\n');

    // Check if we have enough details for the quantity
    if (details.length < quantity) {
      return interaction.reply({ 
        content: `❗ Not enough account details provided. You specified ${quantity} accounts but only provided ${details.length} details.`, 
        ephemeral: true 
      });
    }
    
    // Check if the item already exists
    const categoryRef = client.db.ref(`categories/${category}/items`);
    const snapshot = await categoryRef.once('value');
    let existingItemId = null;
    let existingQuantity = 0;
    let existingDetails = {};
    
    snapshot.forEach(itemSnap => {
      const item = itemSnap.val();
      if (item.name && item.name.toLowerCase() === name.toLowerCase()) {
        existingItemId = itemSnap.key;
        existingQuantity = item.quantity || 0;
        
        // Get existing details if available
        if (itemSnap.child('details').exists()) {
          existingDetails = itemSnap.child('details').val() || {};
        }
      }
    });
    
    if (existingItemId) {
      // Item exists, update it
      const newQuantity = existingQuantity + quantity;
      
      // Merge new details with existing ones
      const lastDetailIndex = Object.keys(existingDetails).length;
      details.forEach((detail, index) => {
        existingDetails[`detail${lastDetailIndex + index}`] = detail;
      });
      
      await client.db.ref(`categories/${category}/items/${existingItemId}`).update({ 
        quantity: newQuantity,
        price: price,
        username: username,
        password: password
      });
      
      await client.db.ref(`categories/${category}/items/${existingItemId}/details`).set(existingDetails);
      
      // Log action with username/password but NOT account details
      await logAction(client, `🔄 Updated stock: ${name} (Category: ${category}) - Added ${quantity} units (Total: ${newQuantity}) at $${price}\n**Username:** \`${username}\`\n**Password:** \`${password}\``);
      
      return interaction.reply({ 
        embeds: [soloLevelingEmbed('Stock Updated', 
          `**${name}** has been updated in category **${category}**.\n\nAdded: ${quantity}\nNew Total: ${newQuantity}\nPrice: $${price}`)],
        ephemeral: true
      });
    } else {
      // Item doesn't exist, create a new one
      const itemId = generateItemId(category);
      const itemData = { 
        name, 
        quantity, 
        price, 
        category,
        username,
        password
      };
      
      // Add the account details to the database
      const detailsData = {};
      details.slice(0, quantity).forEach((detail, index) => {
        detailsData[`detail${index}`] = detail;
      });
      
      await client.db.ref(`categories/${category}/items/${itemId}`).set(itemData);
      await client.db.ref(`categories/${category}/items/${itemId}/details`).set(detailsData);
      
      // Log action with username/password but NOT account details
      await logAction(client, `➕ Added item to **${category}**: \`${name}\` ($${price}) x${quantity}\n**Username:** \`${username}\`\n**Password:** \`${password}\``);
      
      return interaction.reply({ 
        embeds: [soloLevelingEmbed('Stock Added', 
          `**${name}** has been added to category **${category}**.\n\nQuantity: ${quantity}\nPrice: $${price}`)],
        ephemeral: true
      });
    }
  }
};
