async function logAction(client, message) {
  try {
    const logChannel = await client.channels.fetch(client.config.logChannelId);
    if (logChannel) {
      await logChannel.send(`📝 ${message}`);
    }
  } catch (error) {
    console.error('Error logging action:', error);
  }
}

module.exports = { logAction };
