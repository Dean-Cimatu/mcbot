const { isPortOpen, getPlayerList } = require('../utils');
const { getServers } = require('../servers');

module.exports = {
  name: 'list',
  approvedOnly: true,
  description: 'all servers and player counts',
  usage: 'list',
  run: async (msg) => {
    const srvs = await getServers();
    let reply = '**Servers**\n';
    for (const srv of srvs) {
      const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
      if (on) {
        const players = await getPlayerList(srv) || [];
        reply += `✓ \`${srv.id}\` ${srv.name} — ${players.length} player(s)`;
        if (players.length) reply += `: ${players.join(', ')}`;
      } else {
        reply += `✗ \`${srv.id}\` ${srv.name} — offline`;
      }
      reply += '\n';
    }
    msg.reply(reply);
  }
};
