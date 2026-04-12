const { isPortOpen } = require('../utils');
const { exec } = require('child_process');

module.exports = {
  name: 'uptime',
  approvedOnly: true,
  description: 'how long PC has been on',
  usage: 'uptime',
  run: async (msg) => {
    const pcUp = await isPortOpen(process.env.PC_TAILSCALE_IP, 22);
    if (!pcUp) return msg.reply('PC is currently offline.');
    try {
      const result = await new Promise((res, rej) => {
        exec(
          `ssh deani@${process.env.PC_TAILSCALE_IP} "powershell -Command \\"(Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime | Select-Object -ExpandProperty TotalMinutes\\""`,
          (err, stdout) => err ? rej(err) : res(stdout.trim())
        );
      });
      const mins = Math.floor(parseFloat(result));
      const hours = Math.floor(mins / 60);
      const remainMins = mins % 60;
      msg.reply(`PC has been on for **${hours}h ${remainMins}m**.`);
    } catch {
      msg.reply('Could not get uptime — PC may be offline.');
    }
  }
};
