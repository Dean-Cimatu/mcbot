const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, 'snapshots', 'last_snapshot.json');
const uptimeMinutes = {};

function ensureDir() {
  fs.mkdirSync(path.join(__dirname, 'snapshots'), { recursive: true });
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}

function saveState(state) {
  ensureDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

// Called every minute when server is online — returns current uptime in minutes
function tickUptime(serverId) {
  uptimeMinutes[serverId] = (uptimeMinutes[serverId] || 0) + 1;
  return uptimeMinutes[serverId];
}

// Called when server goes offline — resets uptime
function resetUptime(serverId) {
  uptimeMinutes[serverId] = 0;
}

// Returns true if today's snapshot hasn't been taken yet
function shouldSnapshot(serverId) {
  const state = loadState();
  return state[serverId] !== getToday();
}

// Records that today's snapshot was taken
function recordSnapshot(serverId) {
  const state = loadState();
  state[serverId] = getToday();
  saveState(state);
}

module.exports = { tickUptime, resetUptime, shouldSnapshot, recordSnapshot };
