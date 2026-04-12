const { isPortOpen, rconCommand } = require('../utils');
const { getServers } = require('../servers');
const { approve } = require('../auth');

module.exports = {
  name: 'approve',
  ownerOnly: true,
  description: 'approve a user',
  usage: 'approve [discord-id] [minecraft-username]',
  run: async (msg, args) => {
    const discordId = args[0];
    const minecraftName = args[1];
    if (!discordId || !minecraftName) return msg.reply('Usage: approve [discord-id] [minecraft-username]');
    const added = approve(discordId, `User_${discordId}`, minecraftName);
    if (!added) return msg.reply('User already approved.');
    const srvs = await getServers();
    for (const srv of srvs) {
      const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
      if (on) { try { await rconCommand(srv, `whitelist add ${minecraftName}`); } catch {} }
    }
    try {
      const user = await msg.client.users.fetch(discordId);
      user.send(`You have been approved! You can now use MCBot commands.`);
    } catch {}
    msg.reply(`Approved ${minecraftName} (${discordId}).`);
  }
};
