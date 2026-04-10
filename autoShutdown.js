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

function getLog() {
  return activityLog;
}

async function getSSH() {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: process.env.PC_TAILSCALE_IP,
    username: process.env.PC_SSH_USER,
    privateKeyPath: `${process.env.HOME}/.ssh/id_ed25519`,
    readyTimeout: 10000,
    keepaliveInterval: 5000,
    keepaliveCountMax: 10
  });
  return ssh;
}

async function runDailyBackupIfNeeded(ssh, srv) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const dest = `D:\\MinecraftBackups\\Daily\\${srv.id}\\daily_${today}`;
    const result = await ssh.execCommand(
      `powershell -Command "` +
      `$dest = '${dest}';` +
      `if (-not (Test-Path $dest)) {` +
      `  New-Item -ItemType Directory -Force -Path $dest | Out-Null;` +
      `  robocopy '${srv.worldDir}' $dest /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NC /NS | Out-Null;` +
      `  $folders = Get-ChildItem 'D:\\MinecraftBackups\\Daily\\${srv.id}' -Directory | Sort-Object CreationTime;` +
      `  if ($folders.Count -gt 7) { $folders | Select-Object -First ($folders.Count - 7) | Remove-Item -Recurse -Force };` +
      `  Write-Output 'daily_backup_complete'` +
      `} else { Write-Output 'already_done' }"`
    );
    if (result.stdout.includes('daily_backup_complete')) {
      addLog(`Daily backup complete for ${srv.name}`);
    } else {
      addLog(`Daily backup already exists for ${srv.name}`);
    }
  } catch (err) {
    console.error(`Daily backup error for ${srv.name}:`, err.message);
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
    owner.send(`All servers stopped. PC is in use (${pcStatus.processes}) — leaving on.\nRun \`shutdown\` when you're done.`);
    addLog('All servers stopped. PC in use — leaving on.');
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

  setInterval(async () => {
    try {
      const srvs = await getServers();
      const owner = await client.users.fetch(process.env.OWNER_ID);

      for (const srv of srvs) {
        const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (!on) { emptyCounts[srv.id] = 0; continue; }

        const players = await getPlayerList(srv);
        if (players === null) continue;

        if (players.length > 0) {
          emptyCounts[srv.id] = 0;
          continue;
        }

        emptyCounts[srv.id]++;
        const threshold = Math.ceil(parseInt(process.env.EMPTY_TIMEOUT_MINS) / 5);

        if (emptyCounts[srv.id] === threshold - 1) {
          try {
            await rconCommand(srv, 'say [MCBot] Server empty — shutting down in 5 minutes.');
            addLog(`5 min warning sent to ${srv.name}`);
          } catch {}
          continue;
        }

        if (emptyCounts[srv.id] < threshold) continue;

        emptyCounts[srv.id] = 0;

        try {
          await rconCommand(srv, 'say [MCBot] Server shutting down in 1 minute. Goodbye!');
          addLog(`1 min warning sent to ${srv.name}`);
        } catch {}
        await delay(60000);

        owner.send(`${srv.name} empty for ${process.env.EMPTY_TIMEOUT_MINS} min — backing up...`);
        addLog(`Auto-stopping ${srv.name} due to inactivity`);

        let ssh;
        try {
          ssh = await getSSH();

          // Save world before backup
          try { await rconCommand(srv, 'save-all'); } catch {}
          await delay(3000);

          const backup = await ssh.execCommand(
            `powershell -File "C:\\MinecraftServer\\backup.ps1" -serverId ${srv.id}`
          );

          if (backup.stdout.includes('backup_complete')) {
            await runDailyBackupIfNeeded(ssh, srv);
            await rconCommand(srv, 'stop');
            await delay(10000);
            owner.send(`${srv.name} stopped and backed up.`);
            addLog(`${srv.name} stopped and backed up.`);
            await checkAllStoppedAndShutdown(client);
          } else {
            owner.send(`Backup failed for ${srv.name} — server left running.\nOutput: ${backup.stdout}`);
            addLog(`Backup failed for ${srv.name}`);
          }
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

module.exports = { startAutoShutdownLoop, checkAllStoppedAndShutdown, getLog, addLog, runDailyBackupIfNeeded };
