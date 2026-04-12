const { isPortOpen, rconCommand, getPlayerList, delay, findServer } = require('../utils');
const { getSSH } = require('../ssh');
const { checkAllStoppedAndShutdown } = require('../autoShutdown');

module.exports = {
  name: 'stop',
  approvedOnly: true,
  description: 'backup and stop a server',
  usage: 'stop [server]',
  run: async (msg, args, client) => {
    const srv = await findServer(args[0], msg);
    if (!srv) return;
    const players = await getPlayerList(srv);
    if (players === null) return msg.reply(`${srv.name} is already offline.`);
    if (players.length > 0)
      return msg.reply(`Cannot stop ${srv.name} — ${players.length} player(s) online: ${players.join(', ')}`);
    const m = await msg.reply(`Saving and stopping ${srv.name}...`);
    let ssh;
    try {
      ssh = await getSSH();
      try { await rconCommand(srv, 'save-all'); } catch {}
      await delay(3000);
      await rconCommand(srv, 'stop');
      await delay(10000);
      await m.edit(`${srv.name} stopped — compressing backup...`);
      const backup = await ssh.execCommand(
        `powershell -File "C:\\MinecraftServer\\backup.ps1" -serverId ${srv.id} -shutdown`
      );
      if (backup.stdout.includes('backup_complete')) {
        await m.edit(`**${srv.name} stopped** and archived successfully.`);
      } else if (backup.stdout.includes('world_not_found')) {
        await m.edit(`**${srv.name} stopped.** No world data to back up.`);
      } else {
        await m.edit(`**${srv.name} stopped.** Archive failed.\nOutput: ${backup.stdout}`);
      }
      await checkAllStoppedAndShutdown(client);
    } catch (err) {
      return m.edit(`SSH error: ${err.message}`);
    } finally {
      try { if (ssh) ssh.dispose(); } catch {}
    }
  }
};
