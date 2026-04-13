const { getLog } = require('../autoShutdown');
const { readLog, readLogFull } = require('../serverLogger');
const { getServers } = require('../servers');
const { AttachmentBuilder } = require('discord.js');

module.exports = {
  name: 'log',
  ownerOnly: true,
  description: 'view server logs',
  usage: 'log [server] [full]',
  run: async (msg, args) => {
    // No server specified — show global activity log
    if (!args[0]) {
      const lines = getLog();
      if (!lines.length) return msg.reply('No activity logged yet.');
      const text = lines.slice(-20).join('\n');
      return msg.reply(`**Recent activity:**\n\`\`\`\n${text}\n\`\`\``);
    }

    const srvs = await getServers();
    const srv = srvs.find(s => s.id === args[0]);
    if (!srv) return msg.reply(`Unknown server \`${args[0]}\`. Use \`list\` to see all.`);

    // Full log as file attachment
    if (args[1] === 'full') {
      const logPath = readLogFull(args[0]);
      if (!logPath) return msg.reply(`No log found for **${srv.name}**.`);
      const attachment = new AttachmentBuilder(logPath, { name: `${args[0]}-current.log` });
      return msg.reply({ content: `**${srv.name}** — full session log:`, files: [attachment] });
    }

    // Last 50 lines
    const lines = readLog(args[0], 50);
    if (!lines) return msg.reply(`No log found for **${srv.name}**.`);
    if (!lines.length) return msg.reply(`Log is empty for **${srv.name}**.`);
    const text = lines.join('\n');
    if (text.length > 1900) {
      const attachment = new AttachmentBuilder(
        Buffer.from(text), { name: `${args[0]}-current.log` }
      );
      return msg.reply({ content: `**${srv.name}** log (last 50 lines):`, files: [attachment] });
    }
    msg.reply(`**${srv.name}** log:\n\`\`\`\n${text}\n\`\`\``);
  }
};
