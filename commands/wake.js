const { isPortOpen } = require('../utils');
const { exec } = require('child_process');

module.exports = {
  name: 'wake',
  ownerOnly: true,
  description: 'wake the PC via WoL',
  usage: 'wake',
  run: async (msg) => {
    const alreadyOn = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
    if (alreadyOn) return msg.reply('PC is already on.');
    const m = await msg.reply('Sending Wake-on-LAN packet...');
    try {
      await new Promise((res, rej) =>
        exec(`sudo etherwake -i eth0 ${process.env.PC_MAC}`, e => e ? rej(e) : res())
      );
      await m.edit('WoL packet sent. PC should be online in ~30 seconds. No servers will auto-start.');
    } catch (err) {
      await m.edit(`Failed to send WoL packet: ${err.message}`);
    }
  }
};
