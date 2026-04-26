require('dotenv').config();
const chokidar = require('chokidar');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WATCH_FOLDER = process.env.WATCH_FOLDER || 'C:\\CDN-Upload';
const VPS_URL = (process.env.VPS_URL || 'https://cdn.haywood.ltd').replace(/\/$/, '');
const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('ERROR: Set API_KEY in your .env file before starting.');
  process.exit(1);
}

const ALLOWED = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']);

if (!fs.existsSync(WATCH_FOLDER)) {
  fs.mkdirSync(WATCH_FOLDER, { recursive: true });
  console.log(`Created watch folder: ${WATCH_FOLDER}`);
}

async function uploadFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED.has(ext)) return;

  const filename = path.basename(filePath);
  console.log(`\nUploading: ${filename} ...`);

  try {
    const form = new FormData();
    form.append('file', fs.createReadStream(filePath), filename);

    const { data } = await axios.post(`${VPS_URL}/upload`, form, {
      headers: { ...form.getHeaders(), 'x-api-key': API_KEY },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 300_000 // 5 min — large video files can be slow
    });

    console.log(`Done!  ${data.url}`);

    // Copy URL to clipboard — platform-aware
    try {
      if (process.platform === 'darwin') {
        execSync(`echo ${JSON.stringify(data.url)} | pbcopy`);
      } else {
        execSync(`powershell -command "Set-Clipboard -Value '${data.url}'"`);
      }
      console.log('(URL copied to clipboard)');
    } catch (_) {
      // clipboard copy is best-effort — don't fail the upload over it
    }
  } catch (err) {
    const msg = err.response?.data?.error ?? err.message;
    console.error(`Upload failed: ${msg}`);
  }
}

console.log('='.repeat(50));
console.log(`CDN Watcher running`);
console.log(`Watching : ${WATCH_FOLDER}`);
console.log(`Server   : ${VPS_URL}`);
console.log('='.repeat(50));
console.log('Drop an image or video into the folder above.\n');

chokidar
  .watch(WATCH_FOLDER, {
    persistent: true,
    ignoreInitial: true,
    // Wait until file stops growing before uploading (important for large videos)
    awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 200 }
  })
  .on('add', uploadFile);
