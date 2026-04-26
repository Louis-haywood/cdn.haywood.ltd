require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const { randomBytes } = require('crypto');

const app = express();

const API_KEY = process.env.API_KEY;
const DOMAIN = process.env.DOMAIN || 'cdn.haywood.ltd';
const CERT_PATH = process.env.CERT_PATH;
const KEY_PATH = process.env.KEY_PATH;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!API_KEY) {
  console.error('ERROR: Set API_KEY in your .env file before starting.');
  process.exit(1);
}

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm']);

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, randomBytes(6).toString('hex') + ext);
  }
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, ALLOWED_EXT.has(ext));
  },
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

function requireApiKey(req, res, next) {
  if (req.headers['x-api-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/upload', requireApiKey, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded or file type not allowed' });
  }
  const protocol = (CERT_PATH && KEY_PATH) ? 'https' : 'http';
  const url = `${protocol}://${DOMAIN}/${req.file.filename}`;
  console.log(`[${new Date().toISOString()}] upload: ${req.file.originalname} -> ${url}`);
  res.json({ url, filename: req.file.filename });
});

app.use(express.static(UPLOADS_DIR));

app.get('/health', (_req, res) => res.json({ ok: true }));

// Multer / general error handler
app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

if (CERT_PATH && KEY_PATH) {
  const tlsOptions = {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH)
  };
  https.createServer(tlsOptions, app).listen(443, () =>
    console.log(`HTTPS listening on :443  ->  https://${DOMAIN}`)
  );
  // Redirect all plain HTTP to HTTPS
  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${DOMAIN}${req.url}` });
    res.end();
  }).listen(80, () => console.log('HTTP redirect on :80'));
} else {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () =>
    console.log(`HTTP server on :${PORT}  (no certs configured — HTTP only)`)
  );
}
