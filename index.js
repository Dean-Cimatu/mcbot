process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err.code, err.message);
});

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.message || err);
});

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadServers } = require('./servers');
const { startStatusLoop } = require('./statusLoop');
const { startAutoShutdownLoop } = require('./autoShutdown');
const { isApproved } = require('./auth');

// Auto-load all commands from commands/ folder
const registry = new Map();
const commandsPath = path.join(__dirname, 'commands');
fs.readdirSync(commandsPath).filter(f => f.endsWith('.js')).forEach(file => {
  const cmd = require(path.join(commandsPath, file));
  registry.set(cmd.name, cmd);
  console.log(`Loaded command: ${cmd.name}`);
});

const client = new Client({
  intents: [32767],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    const online = client.ws.status === 0;
    res.writeHead(online ? 200 : 503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: online ? 'ok' : 'degraded',
      uptime: process.uptime(),
      ping: client.ws.ping,
      tag: client.user?.tag || 'not ready'
    }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(8766, () => console.log('Health endpoint running on :8766'));

client.once('ready', async () => {
  console.log(`MCBot online as ${client.user.tag}`);
  try { await loadServers(); } catch (err) { console.error('Failed to load servers:', err.message); }
  startStatusLoop(client);
  startAutoShutdownLoop(client);
});

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.channel.isDMBased()) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmdName = parts[0].toLowerCase();
  const args = parts.slice(1);

  const isOwner = msg.author.id === process.env.OWNER_ID;
  const approved = isApproved(msg.author.id);

  const cmd = registry.get(cmdName);
  if (!cmd) return;

  // Access control
  if (cmd.ownerOnly && !isOwner) return;
  if (cmd.approvedOnly && !approved && !isOwner) return;

  try {
    await cmd.run(msg, args, client, registry);
  } catch (err) {
    console.error(`Error in command ${cmdName}:`, err.message);
    msg.reply(`Error: ${err.message}`).catch(() => {});
  }
});

client.login(process.env.DISCORD_TOKEN);
