import url from 'url';
import del from 'del';
import gulp from 'gulp';
import log from 'fancy-log';
import mkdirp from 'mkdirp';
import selfsigned from 'selfsigned';
import { promises as fs } from 'fs';
import Graceful from 'node-graceful';
import { spawn } from 'child_process';
import { Docker } from 'docker-cli-js';
import { cleanEnv, str } from 'envalid';

const TEST_WEBSITE_TUNNEL_IMAGE = 'educandu/inlets:1.0.0';
const TEST_WEBSITE_TUNNEL_CONTAINER_NAME = 'website-tunnel';

let server = null;
Graceful.on('exit', () => {
  server?.kill();
});

const isMac = process.platform === 'darwin';
const containerCommandTimeoutMs = isMac ? 2000 : 1000;
const certDir = url.fileURLToPath(new URL('./.tmp', import.meta.url).href);

const env = cleanEnv(process.env, {
  TUNNEL_TOKEN: str(),
  TUNNEL_WEBSITE_DOMAIN: str()
});

const runDockerCommand = async (command, waitMs = 0) => {
  const result = await new Docker({ echo: false }).command(command);
  await new Promise(resolve => setTimeout(resolve, waitMs));
  return result;
};

const ensureContainerRunning = async ({ containerName, runArgs }) => {
  const data = await runDockerCommand('ps -a');
  const container = data.containerList.find(c => c.names === containerName);
  if (!container) {
    await runDockerCommand(`run --name ${containerName} ${runArgs}`, containerCommandTimeoutMs);
  } else if (!container.status.startsWith('Up')) {
    await runDockerCommand(`restart ${containerName}`, containerCommandTimeoutMs);
  }
};

const ensureContainerRemoved = async ({ containerName }) => {
  try {
    await runDockerCommand(`rm -f ${containerName}`, containerCommandTimeoutMs);
  } catch (err) {
    if (!err.toString().includes('No such container')) {
      throw err;
    }
  }
};

export async function clean() {
  await del(['.tmp']);
}

export async function certificate() {
  log('Generating new certificate for encryption')
  const attrs = [{ name: 'commonName', value: env.TUNNEL_WEBSITE_DOMAIN }];
  const pems = selfsigned.generate(attrs, { days: 100 * 365 });
  console.log(pems);

  await mkdirp(certDir);
  await fs.writeFile(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.key`, pems.private, 'utf8');
  await fs.writeFile(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.pub`, pems.public, 'utf8');
  await fs.writeFile(`${certDir}/encrypt-${env.TUNNEL_WEBSITE_DOMAIN}.cert`, pems.cert, 'utf8');
}

export async function startTunnel() {
  const dockerLocalhost = isMac ? 'host.docker.internal' : 'localhost';

  log('Opening tunnel connections');
  await ensureContainerRunning({
    containerName: TEST_WEBSITE_TUNNEL_CONTAINER_NAME,
    runArgs: [
      '-d',
      '--net=host',
      TEST_WEBSITE_TUNNEL_IMAGE,
      'client',
      `--token ${env.TUNNEL_TOKEN}`,
      `--url=wss://${env.TUNNEL_WEBSITE_DOMAIN}`,
      `--upstream=http://${dockerLocalhost}:3000`
    ].join(' ')
  });

  Graceful.on('exit', async () => {
    log('Closing tunnel connections');
    await Promise.all([
      ensureContainerRemoved({ containerName: TEST_WEBSITE_TUNNEL_CONTAINER_NAME })
    ]);
  });
}

function spawnServer() {
  server = spawn(process.execPath, ['src/index.js'], { env: { ...process.env }, stdio: 'inherit' });
  server.once('exit', () => {
    server = null;
  });
}

export function startServer(done) {
  spawnServer();
  done();
}

export function restartServer(done) {
  if (!server) {
    startServer(done);
  } else {
    server.once('exit', () => {
      startServer(done);
    });
    server.kill();
  }
}

export function startWatching(done) {
  gulp.watch(['src/**/*.js'], restartServer);
  done();
}

export const watch = gulp.series(startTunnel, startServer, startWatching);

export default watch;
