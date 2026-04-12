const { getLog } = require('../autoShutdown');

module.exports = {
  name: 'log',
  ownerOnly: true,
  description: 'recent bot activity',
  usage: 'log',
  run: async (msg) => {
    const lines = getLog();
    if (!lines.length) return msg.reply('No activity logged yet.');
    const text = lines.slice(-20).join('\n');
    msg.reply(`**Recent activity:**\n\`\`\`\n${text}\n\`\`\``);
  }
};
