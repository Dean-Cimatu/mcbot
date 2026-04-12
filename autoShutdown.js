const { NodeSSH } = require('node-ssh');
const { getServers } = require('./servers');
const { isPortOpen, rconCommand, getPlayerList, delay } = require('./utils');

const emptyCounts = {};
const activityLog = [];

function addLog(entry) {
  const line = `[${new Date().toISOString()}] ${entry}`;
  activityLog.push(line);
  if (activityLog.length > 100) activityLog.shift();
  console.log(line);
}

function getLog() { return activityLog; }

async function getSSH() {
  const ssh = new NodeSSH();
  // Suppress socket-level errors so they don't become uncaught exceptions
  await ssh.connect({
    host: process.env.PC_TAILSCALE_IP,
    username: process.env.PC_SSH_USER,
    privateKeyPath: `${process.env.HOME}/.ssh/id_ed25519`,
    readyTimeout: 15000,
    keepaliveInterval: 0,
    keepaliveCountMax: 0
  });
  // Attach error handler to the underlying socket immediately after connect
  try {
    const conn = ssh.connection;
    if (conn && conn._sock) {
      conn._sock.on('error', err => {
        console.error('SSH connection reset — ignoring.', err.code);
      });
    }
  } catch {}
  return ssh;
}

async function runHourlySnapshot(ssh, srv) {
  try {
    const result = await ssh.execCommand(
      `powershell -File "C:\\MinecraftServer\\backup.ps1" -serverId ${srv.id} -hourly`
    );
    if (result.stdout.includes('world_not_found')) {
      return true; // silently skip — server not set up yet
    }
    if (result.stdout.includes('hourly_complete')) {
      addLog(`Hourly snapshot complete for ${srv.name}`);
      return true;
    }
    addLog(`Hourly snapshot failed for ${srv.name}: ${result.stdout}`);
    return false;
  } catch (err) {
    console.error(`Hourly snapshot error for ${srv.name}:`, err.message);
    return false;
  }
}

async function runShutdownBackup(ssh, srv) {
  try {
    const result = await ssh.execCommand(
      `powershell -File "C:\\MinecraftServer\\backup.ps1" -serverId ${srv.id} -shutdown`
    );
    if (result.stdout.includes('world_not_found')) {
      addLog(`Skipped backup for ${srv.name} — world not set up yet`);
      return true;
    }
    if (result.stdout.includes('backup_complete')) {
      addLog(`Shutdown backup complete for ${srv.name}`);
      return true;
    }
    addLog(`Shutdown backup failed for ${srv.name}: ${result.stdout}`);
    return false;
  } catch (err) {
    console.error(`Shutdown backup error for ${srv.name}:`, err.message);
    return false;
  }
}

async function checkAllStoppedAndShutdown(client) {
  const srvs = await getServers();
  for (const s of srvs) {
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, s.port);
    if (on) return;
  }

  let pcStatus = { in_use: false };
  try {
    const res = await fetch(`http://${process.env.PC_TAILSCALE_IP}:${process.env.PC_STATUS_PORT}`);
    pcStatus = await res.json();
  } catch {}

  const owner = await client.users.fetch(process.env.OWNER_ID);
  if (pcStatus.in_use) {
    owner.send(`All servers stopped. PC in use — leaving on.\nRun \`shutdown\` when done.`);
    addLog('PC in use — leaving on.');
    return;
  }

  owner.send('All servers stopped. Shutting down PC.');
  addLog('All servers stopped. Shutting down PC.');
  let ssh;
  try {
    ssh = await getSSH();
    await ssh.execCommand('shutdown /s /t 0');
  } catch (err) {
    console.error('Shutdown SSH error:', err.message);
  } finally {
    try { if (ssh) ssh.dispose(); } catch {}
  }
}

async function startAutoShutdownLoop(client) {
  const srvs = await getServers();
  srvs.forEach(s => { emptyCounts[s.id] = 0; });

  // Hourly snapshot loop
  setInterval(async () => {
    let ssh;
    try {
      const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
      if (!pcUp) return; // PC is off — skip entirely
      ssh = await getSSH();
      const servers = await getServers();
      for (const srv of servers) {
        const online = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (!online) continue;
        try { await rconCommand(srv, 'save-all'); } catch {}
        await delay(2000);
        await runHourlySnapshot(ssh, srv);
      }
    } catch (err) {
      console.error('Hourly snapshot loop error:', err.message);
    } finally {
      try { if (ssh) ssh.dispose(); } catch {}
    }
  }, 60 * 60 * 1000);

  // Auto shutdown loop
  setInterval(async () => {
    try {
      const srvs = await getServers();
      const owner = await client.users.fetch(process.env.OWNER_ID);

      for (const srv of srvs) {
        const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (!on) { emptyCounts[srv.id] = 0; continue; }

        const players = await getPlayerList(srv);
        if (players === null) continue;
        if (players.length > 0) { emptyCounts[srv.id] = 0; continue; }

        emptyCounts[srv.id]++;
        const threshold = Math.ceil(parseInt(process.env.EMPTY_TIMEOUT_MINS) / 5);

        if (emptyCounts[srv.id] === threshold - 1) {
          try { await rconCommand(srv, 'say [MCBot] Server empty — shutting down in 5 minutes.'); addLog(`5 min warning sent to ${srv.name}`); } catch {}
          continue;
        }
        if (emptyCounts[srv.id] < threshold) continue;
        emptyCounts[srv.id] = 0;

        try { await rconCommand(srv, 'say [MCBot] Server shutting down in 1 minute. Goodbye!'); addLog(`1 min warning sent to ${srv.name}`); } catch {}
        await delay(60000);

        owner.send(`${srv.name} empty — saving and stopping...`);
        addLog(`Auto-stopping ${srv.name} due to inactivity`);

        let ssh;
        try {
          ssh = await getSSH();
          try { await rconCommand(srv, 'save-all'); } catch {}
          await delay(3000);
          await rconCommand(srv, 'stop');
          await delay(10000);
          owner.send(`${srv.name} stopped — compressing backup...`);
          const success = await runShutdownBackup(ssh, srv);
          if (success) {
            owner.send(`✅ ${srv.name} backed up and stopped.`);
            addLog(`${srv.name} stopped and archived.`);
          } else {
            owner.send(`⚠️ ${srv.name} stopped. Archive failed but hourly snapshots preserved.`);
            addLog(`${srv.name} stopped, archive failed.`);
          }
          await checkAllStoppedAndShutdown(client);
        } catch (err) {
          console.error('Auto shutdown SSH error:', err.message);
          owner.send(`Error during auto shutdown for ${srv.name}: ${err.message}`);
        } finally {
          try { if (ssh) ssh.dispose(); } catch {}
        }
      }
    } catch (err) {
      console.error('Auto shutdown loop error:', err.message);
    }
  }, 5 * 60 * 1000);
}

module.exports = { startAutoShutdownLoop, checkAllStoppedAndShutdown, getLog, addLog, runHourlySnapshot, runShutdownBackup };
