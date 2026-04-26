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
const IMAGE_EXT   = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);

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
  limits: { fileSize: 500 * 1024 * 1024 }
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

// ── helpers ──────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d) {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function browsePage(files, protocol) {
  const cards = files.map(f => {
    const url  = `${protocol}://${DOMAIN}/${f.name}`;
    const ext  = path.extname(f.name).toLowerCase();
    const preview = IMAGE_EXT.has(ext)
      ? `<img class="preview" src="/${f.name}" alt="" loading="lazy">`
      : `<video class="preview" src="/${f.name}" preload="metadata" muted></video>`;
    return `
    <div class="card" data-name="${f.name}">
      <a href="${url}" target="_blank" rel="noopener">${preview}</a>
      <div class="card-body">
        <div class="filename">${f.name}</div>
        <div class="meta">${formatSize(f.size)} &middot; ${formatDate(f.mtime)}</div>
        <div class="actions">
          <button class="btn btn-copy" onclick="copyUrl('${url}',this)">Copy URL</button>
          <a class="btn btn-open" href="${url}" target="_blank" rel="noopener">Open</a>
        </div>
      </div>
    </div>`;
  }).join('');

  const empty = `<div class="empty"><strong>No files yet</strong><p>Drop a file into your watch folder to get started.</p></div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>CDN · haywood.ltd</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9f9f9;color:#1a1a1a;min-height:100vh}

    /* nav */
    nav{background:#fff;border-bottom:1px solid #e5e7eb;padding:.875rem 2rem;display:flex;align-items:center;justify-content:space-between}
    nav a{color:#1a1a1a;text-decoration:none;font-size:.875rem;font-weight:500}
    nav a:hover{color:#0d9488}
    .nav-right{font-size:.8rem;color:#9ca3af}

    /* header */
    .page-header{padding:2rem 2rem .75rem;max-width:1400px;margin:0 auto}
    h1{font-size:1.75rem;font-weight:700;letter-spacing:-.02em}
    .subtitle{color:#6b7280;margin-top:.2rem;font-size:.9rem}

    /* toolbar */
    .toolbar{padding:.75rem 2rem 1rem;max-width:1400px;margin:0 auto;display:flex;align-items:center;gap:1rem;flex-wrap:wrap}
    .search{padding:.5rem 1rem;border:1px solid #e5e7eb;border-radius:6px;font-size:.875rem;width:280px;outline:none;background:#fff;font-family:inherit}
    .search:focus{border-color:#0d9488;box-shadow:0 0 0 3px rgba(13,148,136,.1)}
    .file-count{font-size:.8rem;color:#9ca3af;margin-left:auto}

    /* grid */
    .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:1rem;padding:0 2rem 3rem;max-width:1400px;margin:0 auto}

    /* card */
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;transition:box-shadow .15s,transform .15s}
    .card:hover{box-shadow:0 8px 24px rgba(0,0,0,.08);transform:translateY(-2px)}

    /* preview */
    .preview{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#f3f4f6}
    video.preview{background:#111}

    /* card body */
    .card-body{padding:.875rem}
    .filename{font-size:.76rem;color:#374151;word-break:break-all;margin-bottom:.35rem;font-family:'SF Mono','Fira Code',monospace}
    .meta{font-size:.72rem;color:#9ca3af;margin-bottom:.75rem}
    .actions{display:flex;gap:.4rem}
    .btn{flex:1;padding:.4rem .25rem;font-size:.75rem;border:none;border-radius:5px;cursor:pointer;text-align:center;text-decoration:none;font-family:inherit;transition:background .1s;display:inline-block;line-height:1.4}
    .btn-copy{background:#f3f4f6;color:#374151}
    .btn-copy:hover{background:#e5e7eb}
    .btn-copy.copied{background:#dcfce7;color:#15803d}
    .btn-open{background:#0d9488;color:#fff}
    .btn-open:hover{background:#0f766e}

    /* empty */
    .empty{text-align:center;padding:6rem 2rem;color:#9ca3af;max-width:1400px;margin:0 auto}
    .empty strong{display:block;font-size:1rem;color:#6b7280;margin-bottom:.4rem}

    @media(max-width:600px){
      nav,.page-header,.toolbar,.grid{padding-left:1rem;padding-right:1rem}
      .grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
      .search{width:100%}
      .file-count{margin-left:0}
    }
  </style>
</head>
<body>
  <nav>
    <a href="https://louishaywood.uk">&#8592; louishaywood.uk</a>
    <span class="nav-right">cdn.haywood.ltd</span>
  </nav>

  <div class="page-header">
    <h1>CDN</h1>
    <p class="subtitle">All uploaded files</p>
  </div>

  <div class="toolbar">
    <input class="search" type="text" id="search" placeholder="Search files&hellip;" oninput="filter()">
    <span class="file-count" id="count">${files.length} file${files.length !== 1 ? 's' : ''}</span>
  </div>

  ${files.length === 0 ? empty : `<div class="grid" id="grid">${cards}</div>`}

  <script>
    function filter(){
      const q=document.getElementById('search').value.toLowerCase();
      const cards=document.querySelectorAll('.card');
      let n=0;
      cards.forEach(c=>{const show=c.dataset.name.toLowerCase().includes(q);c.style.display=show?'':'none';if(show)n++;});
      document.getElementById('count').textContent=n+' file'+(n!==1?'s':'');
    }
    async function copyUrl(url,btn){
      try{
        await navigator.clipboard.writeText(url);
        btn.textContent='Copied!';btn.classList.add('copied');
        setTimeout(()=>{btn.textContent='Copy URL';btn.classList.remove('copied');},2000);
      }catch(e){prompt('Copy this URL:',url);}
    }
  </script>
</body>
</html>`;
}

// ── routes ────────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => {
  const protocol = (CERT_PATH && KEY_PATH) ? 'https' : 'http';
  let files = [];
  try {
    files = fs.readdirSync(UPLOADS_DIR)
      .filter(n => ALLOWED_EXT.has(path.extname(n).toLowerCase()))
      .map(n => {
        const stat = fs.statSync(path.join(UPLOADS_DIR, n));
        return { name: n, size: stat.size, mtime: stat.mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
  } catch (_) { /* empty uploads dir */ }
  res.send(browsePage(files, protocol));
});

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

app.use((err, _req, res, _next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

// ── start ─────────────────────────────────────────────────────────────────────

if (CERT_PATH && KEY_PATH) {
  const tlsOptions = {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH)
  };
  https.createServer(tlsOptions, app).listen(443, () =>
    console.log(`HTTPS listening on :443  ->  https://${DOMAIN}`)
  );
  http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${DOMAIN}${req.url}` });
    res.end();
  }).listen(80, () => console.log('HTTP redirect on :80'));
} else {
  const PORT = process.env.PORT || 80;
  app.listen(PORT, () =>
    console.log(`HTTP server on :${PORT}  (no certs configured — HTTP only)`)
  );
}
