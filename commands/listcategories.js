const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
module.exports = {
  data: new SlashCommandBuilder()
    .setName('listcategories')
    .setDescription('List all available categories.'),
  async execute(interaction, client) {
    const snapshot = await client.db.ref('categories').once('value');
    if (!snapshot.exists()) {
      return interaction.reply({ embeds: [soloLevelingEmbed('No Categories', 'There are no categories available.')] });
    }
    const categories = Object.keys(snapshot.val());
    const embed = soloLevelingEmbed('Available Categories', categories.map(c => `🔹 **${c}**`).join('\n'));
    interaction.reply({ embeds: [embed] });
  }
}; 
