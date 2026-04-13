const { ActivityType } = require('discord.js');
const { getServers } = require('./servers');
const { isPortOpen, rconCommand } = require('./utils');
const { getSubscribers } = require('./notifyStore');
const { rotateLog, logServer } = require('./serverLogger');

const playerCache = {};
const serverStateCache = {};

function stripColorCodes(str) {
  return str.replace(/§[0-9a-fk-or]/gi, '');
}

function parseTPS(response) {
  const clean = stripColorCodes(response);
  const match = clean.match(/(\d+\.?\d*),\s*(\d+\.?\d*),\s*(\d+\.?\d*)/);
  if (!match) return null;
  return {
    m1: parseFloat(match[1]),
    m5: parseFloat(match[2]),
    m15: parseFloat(match[3])
  };
}

async function startStatusLoop(client) {
  const owner = await client.users.fetch(process.env.OWNER_ID);

  async function updateStatus() {
    try {
      const srvs = await getServers();
      const onlineParts = [];

      for (const srv of srvs) {
        const online = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        const wasOnline = serverStateCache[srv.id];

        if (online !== wasOnline) {
          serverStateCache[srv.id] = online;
          if (online) {
            rotateLog(srv.id);
            logServer(srv.id, `Server started`);
            owner.send(`✅ **${srv.name}** has started.`);
          } else {
            logServer(srv.id, `Server stopped`);
            owner.send(`🔴 **${srv.name}** has stopped.`);
            playerCache[srv.id] = [];
          }
        }

        if (!online) continue;

        try {
          const listRes = await rconCommand(srv, 'minecraft:list');
          const countMatch = listRes.match(/There are (\d+) of/);
          const count = countMatch ? parseInt(countMatch[1]) : 0;
          const namesMatch = listRes.match(/online: (.+)$/);
          const currentPlayers = namesMatch ? namesMatch[1].split(', ').map(p => p.trim()) : [];
          const prevPlayers = playerCache[srv.id] || [];

          const joined = currentPlayers.filter(p => !prevPlayers.includes(p));
          const left = prevPlayers.filter(p => !currentPlayers.includes(p));

          for (const p of joined) {
            logServer(srv.id, `${p} joined`);
            owner.send(`👋 **${p}** joined **${srv.name}**`);
            for (const subId of getSubscribers(srv.id)) {
              if (subId === process.env.OWNER_ID) continue;
              try {
                const user = await client.users.fetch(subId);
                user.send(`👋 **${p}** joined **${srv.name}**`);
              } catch {}
            }
            setTimeout(async () => {
              try {
                const pingRes = await rconCommand(srv, 'spark ping');
                const clean = stripColorCodes(pingRes);
                const lines = clean.split('\n').filter(l => l.includes(p));
                if (lines.length) {
                  owner.send(`📶 **${p}** ping: ${lines[0].trim()}`);
                }
              } catch {}
            }, 10000);
          }

          for (const p of left) {
            logServer(srv.id, `${p} left`);
            owner.send(`👋 **${p}** left **${srv.name}**`);
          }

          playerCache[srv.id] = currentPlayers;
          onlineParts.push(`${srv.name}: ${count} online`);

          const tpsRes = await rconCommand(srv, 'tps');
          const tps = parseTPS(tpsRes);
          if (tps && tps.m1 < 15) {
            logServer(srv.id, `TPS warning: ${tps.m1} (1m), ${tps.m5} (5m), ${tps.m15} (15m)`);
            owner.send(`⚠️ **${srv.name}** is lagging — TPS: ${tps.m1} (1m), ${tps.m5} (5m), ${tps.m15} (15m)`);
          }
        } catch {
          onlineParts.push(`${srv.name}: online`);
        }
      }

      const statusText = onlineParts.length ? onlineParts.join(' | ') : 'All servers offline';
      console.log('Setting status:', statusText);
      await client.user.setPresence({
        activities: [{ name: statusText, type: ActivityType.Watching }],
        status: 'online'
      });
    } catch (err) {
      console.error('Status loop error:', err.message);
    }
  }

  async function autosave() {
    try {
      const srvs = await getServers();
      for (const srv of srvs) {
        const online = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (!online) continue;
        try {
          await rconCommand(srv, 'save-all');
          logServer(srv.id, 'Autosaved');
          console.log(`Autosaved ${srv.name}`);
        } catch (err) {
          console.error(`Autosave failed for ${srv.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Autosave error:', err.message);
    }
  }

  async function blueMapUpdate() {
    try {
      const srvs = await getServers();
      for (const srv of srvs) {
        const online = await isPortOpen(process.env.PC_TAILSCALE_IP, srv.port);
        if (!online) continue;
        try {
          await rconCommand(srv, 'bluemap update');
          console.log(`BlueMap update triggered for ${srv.name}`);
        } catch (err) {
          console.error(`BlueMap update failed for ${srv.name}:`, err.message);
        }
      }
    } catch (err) {
      console.error('BlueMap update error:', err.message);
    }
  }

  await updateStatus();
  setInterval(updateStatus, 60_000);
  setInterval(autosave, 60 * 60 * 1000);
  setInterval(blueMapUpdate, 60 * 60 * 1000);
}

module.exports = { startStatusLoop };
