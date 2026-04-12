const { loadServers } = require('../servers');

module.exports = {
  name: 'reload',
  ownerOnly: true,
  description: 'reload server config',
  usage: 'reload',
  run: async (msg) => {
    await msg.reply('Reloading server config...');
    const srvs = await loadServers();
    msg.reply(`Reloaded. ${srvs.length} server(s): ${srvs.map(s => s.id).join(', ')}`);
  }
};
