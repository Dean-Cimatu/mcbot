const { NodeSSH } = require('node-ssh');

async function getSSH() {
  const ssh = new NodeSSH();
  await ssh.connect({
    host: process.env.PC_TAILSCALE_IP,
    username: process.env.PC_SSH_USER,
    privateKeyPath: `${process.env.HOME}/.ssh/id_ed25519`,
    readyTimeout: 15000,
    keepaliveInterval: 0,
    keepaliveCountMax: 0
  });
  try {
    const conn = ssh.connection;
    if (conn && conn._sock) {
      conn._sock.on('error', err => {
        console.error('SSH connection reset — ignoring.', err.code);
      });
    }
  } catch {}
  return ssh;
}

module.exports = { getSSH };
