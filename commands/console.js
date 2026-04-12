const { isPortOpen, rconCommand, findServer } = require('../utils');

module.exports = {
  name: 'console',
  ownerOnly: true,
  description: 'run a server command',
  usage: 'console [server] [command]',
  run: async (msg, args) => {
    if (!args[0]) return msg.reply('Usage: console [server] [command]');
    if (!args[1]) return msg.reply('Usage: console [server] [command]');
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    if (!on) return msg.reply(`${srv.name} is offline.`);
    try {
      const result = await rconCommand(srv, args.slice(1).join(' '));
      const clean = result?.replace(/§[0-9a-fk-or]/gi, '').trim();
      msg.reply(clean ? `\`\`\`\n${clean}\n\`\`\`` : 'Command sent (no output).');
    } catch (err) {
      msg.reply(`RCON error: ${err.message}`);
    }
  }
};
