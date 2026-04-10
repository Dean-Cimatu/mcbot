const path = require('path');
const fs = require('fs');

let servers = [];

async function loadServers() {
  try {
    const data = fs.readFileSync(path.join(__dirname, 'servers.json'), 'utf8');
    const config = JSON.parse(data);
    servers = config.servers;
    console.log(`Loaded ${servers.length} server(s) from config.`);
    return servers;
  } catch (err) {
    console.error('Failed to load servers:', err.message);
    return servers;
  }
}

async function getServers() {
  if (servers.length === 0) await loadServers();
  return servers;
}

module.exports = { loadServers, getServers };
