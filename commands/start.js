const { isPortOpen, pollUntil, findServer } = require('../utils');
const { getSSH } = require('../ssh');
const { exec } = require('child_process');

module.exports = {
  name: 'start',
  approvedOnly: true,
  description: 'wake PC and start a server',
  usage: 'start [server]',
  run: async (msg, args) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    if (await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port))
      return msg.reply(`${srv.name} is already online.`);
    const m = await msg.reply('Checking PC...');
    const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
    if (!pcUp) {
      await m.edit('Waking PC...');
      await new Promise((res, rej) =>
        exec(`sudo etherwake -i eth0 ${process.env.PC_MAC}`, e => e ? rej(e) : res())
      );
      const booted = await pollUntil(
        () => isPortOpen(process.env.PC_TAILSCALE_IP, 22),
        parseInt(process.env.MAX_START_WAIT_SECS) * 1000, 5000
      );
      if (!booted) return m.edit('PC did not respond in time. Check manually.');
    }
    await m.edit(`Starting ${srv.name}...`);
    try {
      const ssh = await getSSH();
      await ssh.execCommand(`powershell -File "C:\\MinecraftServer\\start_server.ps1" -serverId ${srv.id}`);
      ssh.dispose();
    } catch (err) {
      return m.edit(`Failed to SSH into PC: ${err.message}`);
    }
    const started = await pollUntil(
      () => isPortOpen(process.env.PC_TAILSCALE_IP, srv.port),
      parseInt(process.env.MAX_START_WAIT_SECS) * 1000, 5000
    );
    if (started) {
      await m.edit(`**${srv.name} is online** — join at \`${srv.address}\``);
    } else {
      await m.edit(`${srv.name} did not come online in time. Check logs.`);
    }
  }
};
