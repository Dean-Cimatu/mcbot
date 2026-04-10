const net = require('net');
const { Rcon } = require('rcon-client');

function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

function isPortOpen(host, port, timeout = 3000) {
  return new Promise(res => {
    const sock = new net.Socket();
    sock.setTimeout(timeout);
    sock.on('connect', () => { sock.destroy(); res(true); });
    sock.on('error', () => res(false));
    sock.on('timeout', () => { sock.destroy(); res(false); });
    sock.connect(port, host);
  });
}

async function rconCommand(srv, command) {
  const rcon = new Rcon({
    host: process.env.PC_TAILSCALE_IP,
    port: srv.rconPort,
    password: srv.rconPassword,
    timeout: 3000
  });
  try {
    await rcon.connect();
    const res = await rcon.send(command);
    await rcon.end();
    return res;
  } catch (err) {
    try { await rcon.end(); } catch {}
    throw err;
  }
}

async function getPlayerList(srv) {
  try {
    const res = await rconCommand(srv, 'minecraft:list');
    const count = res.match(/There are (\d+) of/);
    if (!count || count[1] === '0') return [];
    const names = res.match(/online: (.+)$/);
    if (!names) return [];
    return names[1].split(', ').map(p => p.trim());
  } catch {
    return null;
  }
}

async function pollUntil(fn, timeoutMs, intervalMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return true;
    await delay(intervalMs);
  }
  return false;
}

async function findServer(serverId, msg) {
  const { getServers } = require('./servers');
  if (!serverId) {
    await msg.reply('Specify a server. Use `list` to see all.');
    return null;
  }
  const srvs = await getServers();
  const srv = srvs.find(s => s.id === serverId);
  if (!srv) {
    await msg.reply(`Unknown server \`${serverId}\`. Use \`list\` to see all.`);
    return null;
  }
  return srv;
}

module.exports = {
  delay, isPortOpen, rconCommand,
  getPlayerList, pollUntil, findServer
};
