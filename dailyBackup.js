const { NodeSSH } = require('node-ssh');
const { getServers } = require('./servers');
const { addLog } = require('./autoShutdown');

async function runDailyBackup(client) {
  const srvs = await getServers();
  const owner = await client.users.fetch(process.env.OWNER_ID);
  addLog('Running daily 6am backup');

  for (const srv of srvs) {
    const ssh = new NodeSSH();
    try {
      await ssh.connect({
        host: process.env.PC_TAILSCALE_IP,
        username: process.env.PC_SSH_USER,
        privateKeyPath: `${process.env.HOME}/.ssh/id_ed25519`,
        readyTimeout: 5000
      });

      const today = new Date().toISOString().slice(0, 10);
      const dest = `D:\\MinecraftBackups\\Daily\\${srv.id}`;
      const result = await ssh.execCommand(
        `powershell -Command "` +
        `New-Item -ItemType Directory -Force -Path '${dest}' | Out-Null;` +
        `$zip = '${dest}\\daily_${today}.zip';` +
        `if (-not (Test-Path $zip)) {` +
        `  Compress-Archive -Path '${srv.worldDir}' -DestinationPath $zip -Force;` +
        `  $files = Get-ChildItem '${dest}' -Filter *.zip | Sort-Object CreationTime;` +
        `  if ($files.Count -gt 7) { $files | Select-Object -First ($files.Count - 7) | Remove-Item -Force };` +
        `  Write-Output 'backup_complete'` +
        `} else { Write-Output 'already_done' }"`
      );

      if (result.stdout.includes('backup_complete')) {
        addLog(`Daily backup complete for ${srv.name}`);
      } else if (result.stdout.includes('already_done')) {
        addLog(`Daily backup already exists for ${srv.name}`);
      }
    } catch (err) {
      console.error(`Daily backup error for ${srv.name}:`, err.message);
      owner.send(`Daily backup failed for ${srv.name}: ${err.message}`);
    } finally {
      try { ssh.dispose(); } catch {}
    }
  }
}

function startDailyBackup(client) {
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setHours(6, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const ms = next - now;
    console.log(`Daily backup scheduled in ${Math.round(ms / 60000)} minutes`);
    setTimeout(async () => {
      await runDailyBackup(client);
      scheduleNext();
    }, ms);
  }
  scheduleNext();
}

module.exports = { startDailyBackup };
