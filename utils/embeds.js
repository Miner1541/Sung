const { EmbedBuilder } = require('discord.js');
/**
 * Create a Solo Leveling themed embed
 * @param {string} title - Embed title
 * @param {string} description - Embed description
 * @returns {EmbedBuilder} - The created embed
 */
function soloLevelingEmbed(title, description) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor('#6F00FF')
    .setTimestamp();
}
module.exports = { soloLevelingEmbed };
