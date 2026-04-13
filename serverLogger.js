const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');

function getServerLogDir(serverId) {
  const dir = path.join(LOGS_DIR, serverId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getTimestamp() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function getArchiveStamp() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

// Called when server starts — archive current.log then wipe it
function rotateLog(serverId) {
  const dir = getServerLogDir(serverId);
  const current = path.join(dir, 'current.log');
  if (fs.existsSync(current) && fs.statSync(current).size > 0) {
    const stamp = getArchiveStamp();
    fs.renameSync(current, path.join(dir, `${stamp}.log`));
  }
  fs.writeFileSync(current, `[${getTimestamp()}] === Session started ===\n`);
}

// Append a line to a server's current.log
function logServer(serverId, message) {
  const dir = getServerLogDir(serverId);
  const current = path.join(dir, 'current.log');
  const line = `[${getTimestamp()}] ${message}\n`;
  fs.appendFileSync(current, line);
}

// Read last N lines of current.log for a server
function readLog(serverId, lines = 50) {
  const current = path.join(getServerLogDir(serverId), 'current.log');
  if (!fs.existsSync(current)) return null;
  const content = fs.readFileSync(current, 'utf8');
  const all = content.trim().split('\n');
  return all.slice(-lines);
}

// Read full current.log as a buffer (for file attachment)
function readLogFull(serverId) {
  const current = path.join(getServerLogDir(serverId), 'current.log');
  if (!fs.existsSync(current)) return null;
  return current; // return path so discord can attach it
}

module.exports = { rotateLog, logServer, readLog, readLogFull };
