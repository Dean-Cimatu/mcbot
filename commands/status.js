const { isPortOpen, getPlayerList } = require('../utils');
const { getServers } = require('../servers');

module.exports = {
  name: 'status',
  approvedOnly: true,
  description: 'detailed server status',
  usage: 'status [server]',
  run: async (msg, args) => {
    const srvs = await getServers();
    const targets = args[0] ? srvs.filter(s => s.id === args[0]) : srvs;
    if (!targets.length) return msg.reply('Unknown server. Use `list` to see all.');
    let reply = '';
    for (const srv of targets) {
      const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
      reply += `**${srv.name}**: ${on ? 'online' : 'offline'}\n`;
      if (on) {
        const players = await getPlayerList(srv) || [];
        reply += `Players: ${players.length ? players.join(', ') : 'none'}\n`;
        reply += `Address: \`${srv.address}\`\n`;
      }
    }
    msg.reply(reply);
  }
};
