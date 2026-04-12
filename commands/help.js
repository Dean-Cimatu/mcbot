const { isApproved } = require('../auth');

module.exports = {
  name: 'help',
  public: true,
  description: 'show available commands',
  usage: 'help',
  run: async (msg, args, client, registry) => {
    const approved = isApproved(msg.author.id);
    const isOwner = msg.author.id === process.env.OWNER_ID;

    if (!approved && !isOwner) {
      return msg.reply(
        '**MCBot Help**\n' +
        'You are not yet linked. To request access:\n' +
        '`link [minecraft-username]` — send a link request to the server owner\n\n' +
        'Example: `link Steve`'
      );
    }

    let text = '**MCBot commands**\n';
    for (const cmd of registry.values()) {
      if (cmd.ownerOnly && !isOwner) continue;
      text += `\`${cmd.usage}\` — ${cmd.description}\n`;
    }
    msg.reply(text);
  }
};
