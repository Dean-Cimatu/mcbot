const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'approved-users.json');

function loadApproved() {
  if (!fs.existsSync(FILE)) {
    fs.writeFileSync(FILE, JSON.stringify([]));
    return [];
  }
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

function saveApproved(list) {
  fs.writeFileSync(FILE, JSON.stringify(list, null, 2));
}

function isApproved(userId) {
  if (userId === process.env.OWNER_ID) return true;
  return loadApproved().some(u => u.discordId === userId);
}

function approve(discordId, discordName, minecraftName) {
  const list = loadApproved();
  if (list.some(u => u.discordId === discordId)) return false;
  list.push({ discordId, discordName, minecraftName });
  saveApproved(list);
  return true;
}

function deny(discordId) {
  const list = loadApproved().filter(u => u.discordId !== discordId);
  saveApproved(list);
}

function getApproved() {
  return loadApproved();
}

module.exports = { isApproved, approve, deny, getApproved };
