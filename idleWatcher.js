const { isPortOpen } = require('./utils');
const { getServers } = require('./servers');

async function startIdleWatcher(client) {
  const owner = await client.users.fetch(process.env.OWNER_ID);

  setInterval(async () => {
    try {
      const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
      if (!pcUp) return;

      const srvs = await getServers();
      for (const srv of srvs) {
        const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (on) return; // at least one server running — no ping needed
      }

      owner.send(`⚠️ PC has been on for 30 minutes with no servers running. Use \`shutdown\` to turn it off or \`start [server]\` to start one.`);
    } catch (err) {
      console.error('Idle watcher error:', err.message);
    }
  }, 30 * 60 * 1000);
}

module.exports = { startIdleWatcher };
