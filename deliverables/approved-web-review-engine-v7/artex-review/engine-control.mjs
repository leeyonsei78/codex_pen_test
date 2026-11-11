import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, 'engine-runtime');
const envFile = path.join(runtime, '.env');
const action = process.argv[2] || 'status';
const dockerArgs = ['compose', '--project-directory', root, '--env-file', envFile, '-f', path.join(root, 'compose.engine.yml')];
function docker(args, quiet = false) {
  const r = spawnSync('docker', args, { cwd: root, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true, ...(quiet ? { timeout: 15000 } : {}) });
  if (r.error || r.status !== 0) {
    const denied = /access is denied|permission denied|액세스가 거부/i.test(r.stderr || '');
    throw Error(quiet ? (denied ? 'Docker access denied for this process. Docker Desktop may be running, but this account or managed environment cannot access its control socket. Run run.bat in your own Windows session or ask company IT to check Docker access.' : 'Docker Desktop is not ready. Start Docker Desktop in Linux containers mode and try again.') : 'Docker command failed. Review the message above.');
  }
  return r.stdout;
}
try {
  if (!['start', 'stop', 'status', 'logs', 'setup', 'check'].includes(action)) throw Error('Usage: node engine-control.mjs start|stop|status|logs|setup|check');
  if (action === 'setup') {
    if (!fs.existsSync(envFile)) throw Error('Start the engine first.');
    const token = fs.readFileSync(envFile, 'utf8').match(/^ARTEX_SETUP_TOKEN=(.+)$/m)?.[1];
    console.log('Open http://127.0.0.1:8790/setup and enter this setup token:'); console.log(token);
    console.log('Keep this token private. Create your own administrator password in ARTEX.');
  } else {
    docker(['version', '--format', '{{.Server.Version}}'], true);
    docker(['compose', 'version'], true);
    if (action === 'check') { console.log('Docker engine and Compose are ready.'); }
    else if (action !== 'start' && !fs.existsSync(envFile)) { console.log('Engine has not been initialized. Choose Start first.'); }
    else {
      if (action === 'start') {
        fs.mkdirSync(runtime, { recursive: true });
        if (!fs.existsSync(envFile)) fs.writeFileSync(envFile, `POSTGRES_PASSWORD=${crypto.randomBytes(32).toString('hex')}\nARTEX_SETUP_TOKEN=${crypto.randomBytes(32).toString('hex')}\n`, { mode: 0o600, flag: 'wx' });
        docker([...dockerArgs, 'up', '-d', '--wait', '--wait-timeout', '180']);
        console.log('\nARTEX UI: http://127.0.0.1:8790');
        console.log('First run: choose Setup token from run.bat, then create the admin password in /setup.');
        console.log('Configure your LLM provider, model and API key in ARTEX Settings.');
      }
      if (action === 'stop') { docker([...dockerArgs, 'stop']); console.log('Engine stopped. Database and reports are retained.'); }
      if (action === 'status') docker([...dockerArgs, 'ps']);
      if (action === 'logs') docker([...dockerArgs, 'logs', '--tail', '80', 'artex']);
    }
  }
} catch (e) { console.error('[ERROR] ' + e.message); process.exitCode = 1; }
