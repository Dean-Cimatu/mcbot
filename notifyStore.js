const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, 'notify-subscriptions.json');

function load() {
  try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { return {}; }
}

function save(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

function subscribe(discordId, serverId) {
  const data = load();
  if (!data[serverId]) data[serverId] = [];
  if (data[serverId].includes(discordId)) return false;
  data[serverId].push(discordId);
  save(data);
  return true;
}

function unsubscribe(discordId, serverId) {
  const data = load();
  if (!data[serverId]) return false;
  const before = data[serverId].length;
  data[serverId] = data[serverId].filter(id => id !== discordId);
  save(data);
  return data[serverId].length < before;
}

function getSubscribers(serverId) {
  return load()[serverId] || [];
}

module.exports = { subscribe, unsubscribe, getSubscribers };
