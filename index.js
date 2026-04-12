process.on('uncaughtException', err => {
  console.error('Uncaught exception:', err.code, err.message);
});

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err?.message || err);
});

require('dotenv').config();
const http = require('http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { loadServers } = require('./servers');
const { startStatusLoop } = require('./statusLoop');
const { startAutoShutdownLoop } = require('./autoShutdown');
const { isApproved } = require('./auth');
const commands = require('./commands');

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
  try {
    await loadServers();
  } catch (err) {
    console.error('Failed to load servers on startup:', err.message);
  }
  startStatusLoop(client);
  startAutoShutdownLoop(client);
});

client.on('messageCreate', async msg => {
  if (msg.author.bot) return;
  if (!msg.channel.isDMBased()) return;

  const parts = msg.content.trim().split(/\s+/);
  const cmd = parts[0].toLowerCase();

  const ownerId = process.env.OWNER_ID;
  const isOwner = msg.author.id === ownerId;

  if (cmd === 'link') return commands.handleLink(msg, parts[1]);
  if (cmd === 'help') return commands.handleHelp(msg, isOwner);

  if (isOwner) {
    if (cmd === 'approve') return commands.handleApprove(msg, parts);
    if (cmd === 'deny') return commands.handleDeny(msg, parts[1]);
    if (cmd === 'reload') return commands.handleReload(msg, client);
    if (cmd === 'shutdown') return commands.handleShutdown(msg, client);
    if (cmd === 'approved') return commands.handleApproved(msg);
    if (cmd === 'backup') return commands.handleBackup(msg, parts[1]);
    if (cmd === 'log') return commands.handleLog(msg);
    if (cmd === 'console') return commands.handleConsole(msg, parts[1], parts.slice(2).join(' '));
    if (cmd === 'panel') {
      const { createInviteCode } = require('./../mcpanel/db');
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      createInviteCode(code);
      return msg.reply('**MCPanel**\nURL: http://100.79.153.43:3002\nInvite Code: ' + code + '\nExpires in 24 hours.');
    }
  }

  if (!isApproved(msg.author.id) && !isOwner) return;

  if (cmd === 'list') return commands.handleList(msg);
  if (cmd === 'start') return commands.handleStart(msg, parts[1]);
  if (cmd === 'stop') return commands.handleStop(msg, parts[1], client);
  if (cmd === 'status') return commands.handleStatus(msg, parts[1]);
  if (cmd === 'players') return commands.handlePlayers(msg, parts[1]);
  if (cmd === 'say') return commands.handleSay(msg, parts[1], parts.slice(2).join(' '));
  if (cmd === 'uptime') return commands.handleUptime(msg);
});

client.login(process.env.DISCORD_TOKEN);
