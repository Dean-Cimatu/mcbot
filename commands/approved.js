const { getApproved } = require('../auth');

module.exports = {
  name: 'approved',
  ownerOnly: true,
  description: 'list approved users',
  usage: 'approved',
  run: async (msg) => {
    const list = getApproved();
    if (!list.length) return msg.reply('No approved users yet.');
    const text = list.map(u => `${u.discordName} (${u.discordId}) → MC: ${u.minecraftName}`).join('\n');
    msg.reply(`**Approved users:**\n${text}`);
  }
};
