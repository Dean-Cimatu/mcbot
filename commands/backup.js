const { isPortOpen, rconCommand, delay, findServer } = require('../utils');
const { getSSH } = require('../ssh');

module.exports = {
  name: 'backup',
  ownerOnly: true,
  description: 'manual backup',
  usage: 'backup [server]',
  run: async (msg, args) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
    if (!pcUp) return msg.reply('PC is currently offline.');
    const m = await msg.reply(`Saving world and backing up ${srv.name}...`);
    let ssh;
    try {
      ssh = await getSSH();
      const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
      if (on) {
        try { await rconCommand(srv, 'save-all'); } catch {}
        await delay(3000);
      }
      const backup = await ssh.execCommand(
        `powershell -File "C:\\MinecraftServer\\backup.ps1" -serverId ${srv.id} -shutdown`
      );
      if (backup.stdout.includes('backup_complete')) {
        await m.edit(`**${srv.name}** archived successfully.`);
      } else if (backup.stdout.includes('world_not_found')) {
        await m.edit(`**${srv.name}** has no world data yet — server not set up.`);
      } else {
        await m.edit(`Backup failed for ${srv.name}.\nOutput: ${backup.stdout}\nError: ${backup.stderr}`);
      }
    } catch (err) {
      await m.edit(`SSH error: ${err.message}`);
    } finally {
      try { if (ssh) ssh.dispose(); } catch {}
    }
  }
};
