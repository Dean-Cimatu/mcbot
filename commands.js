const { NodeSSH } = require('node-ssh');
const { getServers, loadServers } = require('./servers');
const { isPortOpen, rconCommand, getPlayerList, pollUntil, findServer, delay } = require('./utils');
const { isApproved, approve, deny, getApproved } = require('./auth');
const { checkAllStoppedAndShutdown, getLog, runHourlySnapshot, runShutdownBackup } = require('./autoShutdown');
const { exec } = require('child_process');

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

async function handleHelp(msg, isOwner) {
  const approved = isApproved(msg.author.id);

  if (!approved && !isOwner) {
    return msg.reply(
      '**MCBot Help**\n' +
      'You are not yet linked. To request access:\n' +
      '`link [minecraft-username]` — send a link request to the server owner\n\n' +
      'Example: `link Steve`'
    );
  }

  let text = '**MCBot commands**\n' +
    '`list` — all servers and player counts\n' +
    '`start [server]` — wake PC and start a server\n' +
    '`stop [server]` — backup and stop a server\n' +
    '`status [server]` — detailed status\n' +
    '`players [server]` — who\'s online\n' +
    '`say [server] [msg]` — broadcast to in-game chat\n' +
    '`uptime` — how long PC has been on\n' +
    '`link [minecraft-username]` — request access\n';
  if (isOwner) {
    text += '`backup [server]` — manual backup (owner only)\n' +
      '`console [server] [command]` — run server command (owner only)\n' +
      '`log` — recent bot activity (owner only)\n' +
      '`shutdown` — shut PC down (owner only)\n' +
      '`reload` — reload server config (owner only)\n' +
      '`approved` — list approved users (owner only)';
  }
  msg.reply(text);
}

async function handleList(msg) {
  const srvs = await getServers();
  let reply = '**Servers**\n';
  for (const srv of srvs) {
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    if (on) {
      const players = await getPlayerList(srv) || [];
      reply += `✓ \`${srv.id}\` ${srv.name} — ${players.length} player(s)`;
      if (players.length) reply += `: ${players.join(', ')}`;
    } else {
      reply += `✗ \`${srv.id}\` ${srv.name} — offline`;
    }
    reply += '\n';
  }
  msg.reply(reply);
}

async function handleStatus(msg, serverId) {
  const srvs = await getServers();
  const targets = serverId ? srvs.filter(s => s.id === serverId) : srvs;
  if (!targets.length) return msg.reply('Unknown server. Use `list` to see all.');
  let reply = '';
  for (const srv of targets) {
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    reply += `**${srv.name}**: ${on ? 'online' : 'offline'}\n`;
    if (on) {
      const players = await getPlayerList(srv) || [];
      reply += `Players: ${players.length ? players.join(', ') : 'none'}\n`;
      reply += `Address: \`${srv.address}\`\n`;
    }
  }
  msg.reply(reply);
}

async function handlePlayers(msg, serverId) {
  const srv = await findServer(serverId, msg);
  if (!srv) return;
  const players = await getPlayerList(srv);
  if (players === null) return msg.reply(`${srv.name} is offline.`);
  if (!players.length) return msg.reply(`Nobody online on ${srv.name}.`);
  msg.reply(`${srv.name} (${players.length}): ${players.join(', ')}`);
}

async function handleSay(msg, serverId, message) {
  const srv = await findServer(serverId, msg);
  if (!srv) return;
  if (!message) return msg.reply('Usage: say [server] [message]');
  await rconCommand(srv, `say [Discord] ${message}`);
  msg.reply(`Sent to ${srv.name}.`);
}

async function handleStart(msg, serverId) {
  const srv = await findServer(serverId, msg);
  if (!srv) return;

  if (await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port))
    return msg.reply(`${srv.name} is already online.`);

  const m = await msg.reply('Checking PC...');
  const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);

  if (!pcUp) {
    await m.edit('Waking PC...');
    await new Promise((res, rej) =>
      exec(`sudo etherwake -i eth0 ${process.env.PC_MAC}`,
        e => e ? rej(e) : res())
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
    await ssh.execCommand(
      `powershell -File "C:\\MinecraftServer\\start_server.ps1" -serverId ${srv.id}`
    );
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

async function handleStop(msg, serverId, client) {
  const srv = await findServer(serverId, msg);
  if (!srv) return;

  const players = await getPlayerList(srv);
  if (players === null) return msg.reply(`${srv.name} is already offline.`);
  if (players.length > 0)
    return msg.reply(
      `Cannot stop ${srv.name} — ${players.length} player(s) online: ${players.join(', ')}`
    );

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
      await m.edit(`**${srv.name} stopped.** Archive failed but hourly snapshots preserved.\nOutput: ${backup.stdout}`);
    }
    await checkAllStoppedAndShutdown(client);
  } catch (err) {
    return m.edit(`SSH error: ${err.message}`);
  } finally {
    try { if (ssh) ssh.dispose(); } catch {}
  }
}

async function handleShutdown(msg, client) {
  const srvs = await getServers();
  for (const srv of srvs) {
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    if (on) return msg.reply(
      `Cannot shut down — ${srv.name} is still running. Stop it first with \`stop ${srv.id}\`.`
    );
  }

  const secs = parseInt(process.env.SHUTDOWN_COUNTDOWN_SECS);
  const m = await msg.reply(
    `Shutting down PC in ${secs}s — reply \`cancel\` to abort.`
  );

  let cancelled = false;
  const collector = msg.channel.createMessageCollector({
    filter: m => m.author.id === msg.author.id &&
                 m.content.toLowerCase() === 'cancel',
    time: secs * 1000,
    max: 1
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

async function handleBackup(msg, serverId) {
  const srv = await findServer(serverId, msg);
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

async function handleUptime(msg) {
  const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
  if (!pcUp) return msg.reply('PC is currently offline.');
  try {
    const result = await new Promise((res, rej) => {
      exec(
        `ssh deani@${process.env.PC_TAILSCALE_IP} "powershell -Command \\"(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalMinutes\\""`,
        (err, stdout) => err ? rej(err) : res(stdout.trim())
      );
    });
    const mins = Math.floor(parseFloat(result));
    const hours = Math.floor(mins / 60);
    const remainMins = mins % 60;
    msg.reply(`PC has been on for **${hours}h ${remainMins}m**.`);
  } catch (err) {
    msg.reply('Could not get uptime — PC may be offline.');
  }
}

async function handleLog(msg) {
  const lines = getLog();
  if (!lines.length) return msg.reply('No activity logged yet.');
  const text = lines.slice(-20).join('\n');
  msg.reply(`**Recent activity:**\n\`\`\`\n${text}\n\`\`\``);
}

async function handleReload(msg, client) {
  await msg.reply('Reloading server config...');
  const srvs = await loadServers();
  msg.reply(`Reloaded. ${srvs.length} server(s): ${srvs.map(s => s.id).join(', ')}`);
}

async function handleApproved(msg) {
  const list = getApproved();
  if (!list.length) return msg.reply('No approved users yet.');
  const text = list.map(u =>
    `${u.discordName} (${u.discordId}) → MC: ${u.minecraftName}`
  ).join('\n');
  msg.reply(`**Approved users:**\n${text}`);
}

async function handleLink(msg, minecraftName) {
  if (!minecraftName) return msg.reply('Usage: link [minecraft-username]');

  if (isApproved(msg.author.id))
    return msg.reply('You are already approved.');

  const owner = await msg.client.users.fetch(process.env.OWNER_ID);
  owner.send(
    `**Link request**\n` +
    `Discord: ${msg.author.tag} (\`${msg.author.id}\`)\n` +
    `Minecraft: \`${minecraftName}\`\n\n` +
    `Reply \`approve ${msg.author.id} ${minecraftName}\` or \`deny ${msg.author.id}\``
  );

  msg.reply('Request sent. You will be notified when approved.');
}

async function handleApprove(msg, parts) {
  const discordId = parts[1];
  const minecraftName = parts[2];
  if (!discordId || !minecraftName)
    return msg.reply('Usage: approve [discord-id] [minecraft-username]');

  const added = approve(discordId, `User_${discordId}`, minecraftName);
  if (!added) return msg.reply('User already approved.');

  const srvs = await getServers();
  for (const srv of srvs) {
    const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
    if (on) {
      try {
        await rconCommand(srv, `whitelist add ${minecraftName}`);
      } catch {}
    }
  }

  try {
    const user = await msg.client.users.fetch(discordId);
    user.send(`You have been approved! You can now use MCBot commands.`);
  } catch {}

  msg.reply(`Approved ${minecraftName} (${discordId}).`);
}

async function handleDeny(msg, discordId) {
  if (!discordId) return msg.reply('Usage: deny [discord-id]');
  deny(discordId);
  try {
    const user = await msg.client.users.fetch(discordId);
    user.send('Your link request was denied.');
  } catch {}
  msg.reply(`Denied ${discordId}.`);
}

async function handleConsole(msg, serverId, command) {
  if (!serverId) return msg.reply('Usage: console [server] [command]');
  if (!command) return msg.reply('Usage: console [server] [command]');
  const srv = await findServer(serverId, msg);
  if (!srv) return;
  const on = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
  if (!on) return msg.reply(`${srv.name} is offline.`);
  try {
    const result = await rconCommand(srv, command);
    const clean = result?.replace(/§[0-9a-fk-or]/gi, '').trim();
    msg.reply(clean ? `\`\`\`\n${clean}\n\`\`\`` : 'Command sent (no output).');
  } catch (err) {
    msg.reply(`RCON error: ${err.message}`);
  }
}

module.exports = {
  handleHelp, handleList, handleStatus, handlePlayers,
  handleSay, handleStart, handleStop, handleShutdown,
  handleReload, handleApproved, handleLink,
  handleApprove, handleDeny, handleBackup, handleUptime,
  handleLog, handleConsole
};
