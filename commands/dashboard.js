const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dashboard')
    .setDescription('View shop analytics and statistics.')
    .addStringOption(option => option.setName('timeframe')
      .setDescription('Timeframe for analytics')
      .setRequired(false)
      .addChoices(
        { name: 'Today', value: 'today' },
        { name: 'This Week', value: 'week' },
        { name: 'This Month', value: 'month' },
        { name: 'All Time', value: 'all' }
      )),
  
  async execute(interaction, client) {
    if (!hasAdminRole(interaction.member, client.config.adminRoleId)) {
      return interaction.reply({ content: '❗ You do not have permission to use this command.', ephemeral: true });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const timeframe = interaction.options.getString('timeframe') || 'all';
    
    // Get time boundaries
    const now = Date.now();
    let startTime = 0;
    
    if (timeframe === 'today') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startTime = today.getTime();
    } else if (timeframe === 'week') {
      const weekStart = new Date();
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      weekStart.setHours(0, 0, 0, 0);
      startTime = weekStart.getTime();
    } else if (timeframe === 'month') {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      startTime = monthStart.getTime();
    }
    
    // Collect data from all users
    const usersRef = client.db.ref('users');
    const snapshot = await usersRef.once('value');
    
    // Analytics variables
    let totalSales = 0;
    let totalRevenue = 0;
    let topCategories = {};
    let topProducts = {};
    let uniqueCustomers = 0;
    
    // Process each user
    snapshot.forEach(userSnap => {
      const userData = userSnap.val();
      let userMadePurchase = false;
      
      // Check if user has purchases
      if (userData.purchases) {
        Object.entries(userData.purchases).forEach(([id, purchase]) => {
          // Check if purchase is within timeframe
          if (purchase.timestamp >= startTime) {
            totalSales += purchase.quantity;
            totalRevenue += purchase.price * purchase.quantity;
            userMadePurchase = true;
            
            // Track top categories
            if (!topCategories[purchase.category]) {
              topCategories[purchase.category] = 0;
            }
            topCategories[purchase.category] += purchase.price * purchase.quantity;

            
            // Track top products
            const productKey = `${purchase.itemName}|${purchase.category}`;
            if (!topProducts[productKey]) {
              topProducts[productKey] = { revenue: 0, quantity: 0, name: purchase.itemName, category: purchase.category };
            }
            topProducts[productKey].revenue += purchase.price * purchase.quantity;

            topProducts[productKey].quantity += purchase.quantity;
          }
        });
        
        if (userMadePurchase) {
          uniqueCustomers++;
        }
      }
    });
    
    // Sort top categories and products
    const sortedCategories = Object.entries(topCategories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    const sortedProducts = Object.values(topProducts)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 3);
    
    // Format timeframe for display
    let timeframeDisplay = '';
    switch (timeframe) {
      case 'today': timeframeDisplay = 'Today'; break;
      case 'week': timeframeDisplay = 'This Week'; break;
      case 'month': timeframeDisplay = 'This Month'; break;
      default: timeframeDisplay = 'All Time';
    }
    
    // Create the analytics embed
    const analyticsEmbed = soloLevelingEmbed(
      `Shop Analytics (${timeframeDisplay})`,
      `**Summary:**
      📊 Total Sales: ${totalSales} accounts
      💰 Total Revenue: $${totalRevenue}
      👥 Unique Customers: ${uniqueCustomers}
      
      **Top Categories:**
      ${sortedCategories.length > 0 
        ? sortedCategories.map((c, i) => `${i+1}. **${c[0]}** - $${c[1]}`).join('\n')
        : 'No sales in this period'}
      
      **Top Products:**
      ${sortedProducts.length > 0
        ? sortedProducts.map((p, i) => `${i+1}. **${p.name}** (${p.category}) - ${p.quantity} sold - $${p.revenue}`).join('\n')
        : 'No sales in this period'}
      `
    );
    
    return interaction.editReply({ embeds: [analyticsEmbed] });
  }
};
