const { isPortOpen, delay } = require('../utils');
const { getServers } = require('../servers');
const { getSSH } = require('../ssh');

module.exports = {
  name: 'shutdown',
  ownerOnly: true,
  description: 'shut PC down',
  usage: 'shutdown',
  run: async (msg, args, client) => {
    const srvs = await getServers();
    for (const srv of srvs) {
      const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
      if (on) return msg.reply(`Cannot shut down — ${srv.name} is still running. Stop it first with \`stop ${srv.id}\`.`);
    }
    const secs = parseInt(process.env.SHUTDOWN_COUNTDOWN_SECS);
    const m = await msg.reply(`Shutting down PC in ${secs}s — reply \`cancel\` to abort.`);
    let cancelled = false;
    const collector = msg.channel.createMessageCollector({
      filter: m => m.author.id === msg.author.id && m.content.toLowerCase() === 'cancel',
      time: secs * 1000, max: 1
    });
    collector.on('collect', () => { cancelled = true; });
    await delay(secs * 1000);
    if (cancelled) return m.edit('Shutdown cancelled.');
    try {
      const ssh = await getSSH();
      await ssh.execCommand('shutdown /s /t 0');
      ssh.dispose();
    } catch (err) {
      return m.edit(`SSH error: ${err.message}`);
    }
    m.edit('PC is shutting down. Good night.');
  }
};
