const { isPortOpen, rconCommand, findServer } = require('../utils');

module.exports = {
  name: 'tps',
  approvedOnly: true,
  description: 'check server TPS',
  usage: 'tps [server]',
  run: async (msg, args) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    if (!on) return msg.reply(`${srv.name} is offline.`);
    const result = await rconCommand(srv, 'tps');
    msg.reply(`\`\`\`\n${result}\n\`\`\``);
  }
};
