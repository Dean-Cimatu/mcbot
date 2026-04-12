const { deny } = require('../auth');

module.exports = {
  name: 'deny',
  ownerOnly: true,
  description: 'deny a user',
  usage: 'deny [discord-id]',
  run: async (msg, args) => {
    if (!args[0]) return msg.reply('Usage: deny [discord-id]');
    deny(args[0]);
    try {
      const user = await msg.client.users.fetch(args[0]);
      user.send('Your link request was denied.');
    } catch {}
    msg.reply(`Denied ${args[0]}.`);
  }
};
