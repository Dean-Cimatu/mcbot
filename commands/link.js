const { isApproved } = require('../auth');

module.exports = {
  name: 'link',
  public: true,
  description: 'request server access',
  usage: 'link [minecraft-username]',
  run: async (msg, args) => {
    if (!args[0]) return msg.reply('Usage: link [minecraft-username]');
    if (isApproved(msg.author.id)) return msg.reply('You are already approved.');
    const owner = await msg.client.users.fetch(process.env.OWNER_ID);
    owner.send(
      `**Link request**\n` +
      `Discord: ${msg.author.tag} (\`${msg.author.id}\`)\n` +
      `Minecraft: \`${args[0]}\`\n\n` +
      `Reply \`approve ${msg.author.id} ${args[0]}\` or \`deny ${msg.author.id}\``
    );
    msg.reply('Request sent. You will be notified when approved.');
  }
};
