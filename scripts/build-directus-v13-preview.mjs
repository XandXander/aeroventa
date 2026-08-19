import { spawn } from 'node:child_process';

const directusUrlRaw = process.env.DIRECTUS_URL;
const token = process.env.DIRECTUS_STATIC_TOKEN;

if (!directusUrlRaw) throw new Error('DIRECTUS_URL is required for V13 draft preview build');
if (!token) throw new Error('DIRECTUS_STATIC_TOKEN is required for V13 draft preview build');

const directusUrl = new URL(directusUrlRaw);
if (directusUrl.protocol !== 'https:') throw new Error('V13 draft preview requires HTTPS DIRECTUS_URL');
const child = spawn('npm', ['--workspace', '@aeroventa/web', 'run', 'build'], {
  shell: process.platform === 'win32',
  stdio: 'inherit',
  env: {
    ...process.env,
    AEROVENTA_RELEASE_MODE: 'preview',
  },
});

child.once('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once('exit', (code) => {
  if (code !== 0) process.exitCode = code ?? 1;
});
