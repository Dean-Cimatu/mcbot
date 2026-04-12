module.exports = {
  name: 'panel',
  ownerOnly: true,
  description: 'get MCPanel access link',
  usage: 'panel',
  run: async (msg) => {
    const { createInviteCode } = require('../../mcpanel/db');
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    createInviteCode(code);
    msg.reply('**MCPanel**\nURL: http://100.79.153.43:3002\nInvite Code: ' + code + '\nExpires in 24 hours.');
  }
};
