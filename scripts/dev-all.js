const { spawn } = require('child_process');
const path = require('path');

const apps = [
  {
    name: 'ADMIN',
    prefix: '[Admin:3002]',
    color: '\x1b[35m', // Magenta
    cwd: path.resolve(__dirname, '../apps/admin'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev']
  },
  {
    name: 'OWNER',
    prefix: '[Owner:3001]',
    color: '\x1b[33m', // Yellow
    cwd: path.resolve(__dirname, '../apps/owner'),
    cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: ['run', 'dev']
  },
  {
    name: 'CUSTOMER',
    prefix: '[Customer:8081]',
    color: '\x1b[36m', // Cyan
    cwd: path.resolve(__dirname, '../apps/customer'),
    cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['expo', 'start', '--port', '8081', '--lan']
  },
  {
    name: 'STAFF',
    prefix: '[Staff:8082]',
    color: '\x1b[32m', // Green
    cwd: path.resolve(__dirname, '../apps/staff'),
    cmd: process.platform === 'win32' ? 'npx.cmd' : 'npx',
    args: ['expo', 'start', '--port', '8082', '--lan']
  }
];

const children = [];
const resetColor = '\x1b[0m';

const os = require('os');

function getLocalIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const localIp = getLocalIp();

console.log('\x1b[1m\x1b[34m================================================================');
console.log('  QuickCut Multi-App Orchestrator - Starting All 4 Services');
console.log('================================================================\x1b[0m\n');
console.log(`  - Customer App (Expo):   exp://${localIp}:8081 (or http://localhost:8081)`);
console.log(`  - Staff App (Expo):      exp://${localIp}:8082 (or http://localhost:8082)`);
console.log(`  - Owner Portal (Web):    http://localhost:3001 (or http://${localIp}:3001)`);
console.log(`  - Admin Portal (Web):    http://localhost:3002 (or http://${localIp}:3002)\n`);

for (const app of apps) {
  const child = spawn(app.cmd, app.args, {
    cwd: app.cwd,
    stdio: ['inherit', 'pipe', 'pipe'],
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' }
  });

  child.stdout.on('data', (data) => {
    process.stdout.write(`${app.color}${app.prefix}${resetColor} ${data}`);
  });

  child.stderr.on('data', (data) => {
    process.stderr.write(`${app.color}${app.prefix} [ERR]${resetColor} ${data}`);
  });

  child.on('exit', (code) => {
    console.log(`${app.color}${app.prefix}${resetColor} exited with code ${code}`);
  });

  children.push(child);
}

// Graceful cleanup on exit
function shutdown() {
  console.log('\n\x1b[31mShutting down all QuickCut services...\x1b[0m');
  for (const child of children) {
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', child.pid, '/f', '/t']);
      } else {
        child.kill('SIGINT');
      }
    } catch (_) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
