const { rconCommand, findServer } = require('../utils');

module.exports = {
  name: 'say',
  approvedOnly: true,
  description: 'broadcast to in-game chat',
  usage: 'say [server] [message]',
  run: async (msg, args) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const message = args.slice(1).join(' ');
    if (!message) return msg.reply('Usage: say [server] [message]');
    await rconCommand(srv, `say [Discord] ${message}`);
    msg.reply(`Sent to ${srv.name}.`);
  }
};
