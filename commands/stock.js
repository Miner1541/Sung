const { SlashCommandBuilder } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Check available stock')
    .addStringOption(option => option.setName('category').setDescription('Filter by category'))
    .addIntegerOption(option => option.setName('page').setDescription('Page number').setMinValue(1)),
  
  async execute(interaction, client) {
    // Get options from the slash command
    const category = interaction.options.getString('category')?.toLowerCase();
    const page = interaction.options.getInteger('page') || 1;
    
    await handleStockCommand(interaction, client, page, category, true);
  }
};

// Separated the logic into a helper function to handle both initial commands and button interactions
async function handleStockCommand(interaction, client, page = 1, category = null, isInitial = false) {
  const itemsPerPage = 5; // Number of items to show per page
  
  // Get all items (filtered by category if specified)
  let allItems = [];
  
  if (category) {
    // If a specific category is requested
    const categoryRef = client.db.ref(`categories/${category}/items`);
    const snapshot = await categoryRef.once('value');
    
    if (!snapshot.exists()) {
      const embed = soloLevelingEmbed('No Stock', `No items available in category **${category}**.`);
      return interaction.replied || interaction.deferred 
        ? interaction.editReply({ embeds: [embed], components: [] }) 
        : interaction.reply({ embeds: [embed] });
    }
    
    snapshot.forEach(itemSnap => {
      const item = itemSnap.val();
      if (item.quantity > 0) {
        allItems.push({
          name: item.name,
          quantity: item.quantity,
          price: item.price,
          category: category
        });
      }
    });
  } else {
    // If no category is specified, show all categories
    const categoriesRef = client.db.ref('categories');
    const snapshot = await categoriesRef.once('value');
    
    if (!snapshot.exists()) {
      const embed = soloLevelingEmbed('No Stock', 'No items available.');
      return interaction.replied || interaction.deferred 
        ? interaction.editReply({ embeds: [embed], components: [] }) 
        : interaction.reply({ embeds: [embed] });
    }
    
    snapshot.forEach(catSnap => {
      const catName = catSnap.key;
      const itemsRef = catSnap.child('items');
      
      itemsRef.forEach(itemSnap => {
        const item = itemSnap.val();
        if (item.quantity > 0) {
          allItems.push({
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            category: catName
          });
        }
      });
    });
  }
  
  // Sort items by category then by name
  allItems.sort((a, b) => {
    if (a.category !== b.category) {
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name);
  });
  
  // No items found
  if (allItems.length === 0) {
    const embed = soloLevelingEmbed('No Stock', 'No items currently available in stock.');
    return interaction.replied || interaction.deferred 
      ? interaction.editReply({ embeds: [embed], components: [] }) 
      : interaction.reply({ embeds: [embed] });
  }
  
  // Calculate pagination
  const totalPages = Math.ceil(allItems.length / itemsPerPage);
  
  // Check if page is valid
  if (page > totalPages) {
    const embed = soloLevelingEmbed('Invalid Page', `There are only ${totalPages} pages available.`);
    return interaction.replied || interaction.deferred 
      ? interaction.editReply({ embeds: [embed], components: [] }) 
      : interaction.reply({ embeds: [embed], ephemeral: true });
  }
  
  // Get items for current page
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, allItems.length);
  const pageItems = allItems.slice(startIndex, endIndex);
  
  // Generate the response
  let response = `**Stock Listing (Page ${page}/${totalPages})**\n\n`;
  
  let currentCategory = '';
  pageItems.forEach(item => {
    if (currentCategory !== item.category) {
      currentCategory = item.category;
      response += `**Category: ${currentCategory}**\n`;
    }
    response += `🔸 **${item.name}** - Quantity: ${item.quantity} - Price: $${item.price}\n`;
  });
  
  // Create pagination buttons with encoded data
  const categoryParam = category ? category : 'none';
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`stock_prev_${page}_${categoryParam}`)
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`stock_next_${page}_${categoryParam}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= totalPages)
  );
  
  // Send the response with buttons
  const messageOptions = { 
    embeds: [soloLevelingEmbed('Stock Available', response)],
    components: totalPages > 1 ? [row] : []
  };
  
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply(messageOptions);
  } else {
    await interaction.reply(messageOptions);
  }
  
  // Only set up the collector for the initial command, not for button interactions
  if (isInitial && totalPages > 1) {
    const filter = i => 
      i.customId.startsWith('stock_prev_') || 
      i.customId.startsWith('stock_next_');
    
    const collector = interaction.channel.createMessageComponentCollector({ 
      filter, 
      time: 60000 // 1 minute timeout
    });
    
    collector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ 
          content: "You can't use these buttons as they're not from your command.", 
          ephemeral: true 
        });
      }
      
      await i.deferUpdate();
      
      // Parse button data
      const buttonData = i.customId.split('_');
      const buttonAction = buttonData[1]; // prev or next
      const currentPage = parseInt(buttonData[2]);
      const buttonCategory = buttonData[3] === "none" ? null : buttonData[3];
      
      // Calculate new page
      let newPage = currentPage;
      if (buttonAction === 'prev') {
        newPage = currentPage - 1;
      } else if (buttonAction === 'next') {
        newPage = currentPage + 1;
      }
      
      // Call the same handler function with the new page and the button interaction
      // Pass false for isInitial to avoid creating a new collector
      await handleStockCommand(i, client, newPage, buttonCategory, false);
      
      // Don't stop the collector here!
      // This allows us to handle multiple button clicks
    });
    
    collector.on('end', () => {
      // Remove buttons after timeout if the message still exists
      if (!interaction.ephemeral) {
        interaction.editReply({ components: [] }).catch(console.error);
      }
    });
  }
}
