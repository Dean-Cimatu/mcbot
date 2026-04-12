const { getPlayerList, findServer } = require('../utils');

module.exports = {
  name: 'players',
  approvedOnly: true,
  description: 'who\'s online',
  usage: 'players [server]',
  run: async (msg, args) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const players = await getPlayerList(srv);
    if (players === null) return msg.reply(`${srv.name} is offline.`);
    if (!players.length) return msg.reply(`Nobody online on ${srv.name}.`);
    msg.reply(`${srv.name} (${players.length}): ${players.join(', ')}`);
  }
};
