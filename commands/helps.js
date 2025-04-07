const { SlashCommandBuilder } = require('discord.js');
const { soloLevelingEmbed } = require('../utils/embeds');
const { hasAdminRole } = require('../utils/helpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Get a list of all available commands.'),

  async execute(interaction, client) {
    const isAdmin = hasAdminRole(interaction.member, client.config.adminRoleId);

    let commandsList = [
      '**📌 User Commands:**',
      '`/listcategories` - 🗂️ List all available categories.',
      '`/stock` - 📦 Check available stock.',
      '`/purchase` - 🛒 Purchase an account.',
      '`/balance` - 💰 Check your balance.',
      '`/help` - ❓ Show this help menu.'

    ];

    if (isAdmin) {
      commandsList = commandsList.concat([
        '',
        '▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬',
        '**🔧 Admin Commands:**',
        '`/addstock` - ➕ Add accounts to the shop.',
        '`/removeitem` - ❌ Remove an item from the shop.',
        '`/deletecategory` - 🗑️ Delete a category and its items.',
        '`/addbalance` - 💸 Add balance to a user.',
        '`/removebalance` - 🔻 Remove balance from a user.'

      ]);
    }

    const embed = soloLevelingEmbed('📜 **Sung Shop Commands**', commandsList.join('\n'));

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
