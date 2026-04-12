const { subscribe, unsubscribe, getSubscribers } = require('../notifyStore');
const { getServers } = require('../servers');

module.exports = {
  name: 'notify',
  approvedOnly: true,
  description: 'subscribe to player join notifications',
  usage: 'notify [server|off server|list]',
  run: async (msg, args) => {
    const srvs = await getServers();

    // notify list — show current subscriptions
    if (!args[0] || args[0] === 'list') {
      const subscribed = srvs.filter(s => getSubscribers(s.id).includes(msg.author.id));
      if (!subscribed.length) return msg.reply('You are not subscribed to any servers.');
      return msg.reply(`You are subscribed to: ${subscribed.map(s => `\`${s.id}\``).join(', ')}`);
    }

    // notify off [server] — unsubscribe
    if (args[0] === 'off') {
      const serverId = args[1];
      if (!serverId) return msg.reply('Usage: notify off [server]');
      const srv = srvs.find(s => s.id === serverId);
      if (!srv) return msg.reply(`Unknown server \`${serverId}\`. Use \`list\` to see all.`);
      const removed = unsubscribe(msg.author.id, serverId);
      return msg.reply(removed ? `Unsubscribed from **${srv.name}**.` : `You weren't subscribed to **${srv.name}**.`);
    }

    // notify [server] — subscribe
    const srv = srvs.find(s => s.id === args[0]);
    if (!srv) return msg.reply(`Unknown server \`${args[0]}\`. Use \`list\` to see all.`);
    const added = subscribe(msg.author.id, args[0]);
    return msg.reply(added ? `Subscribed to **${srv.name}** — you'll be notified when players join.` : `You're already subscribed to **${srv.name}**.`);
  }
};
