# cdn.haywood.ltd — Full Setup Guide

Drop a file into a folder on your PC → it auto-uploads → you get a URL at `cdn.haywood.ltd/randomname.ext`.

---

## What you'll do (overview)

1. Add a DNS record in GoDaddy pointing `cdn.haywood.ltd` at your VPS
2. Install and start the server on the VPS
3. Test it works over plain HTTP first
4. Get a free HTTPS certificate with **win-acme**
5. Make the server start automatically after a reboot with **PM2**
6. Install the watcher on your local PC

Everything runs on Windows. No Linux, no Docker.

---

## Before you start — note your VPS IP

RDP into your VPS. Open **Command Prompt** (search "cmd" in Start) and run:

```
ipconfig
```

Find the **IPv4 Address** — it will look like `123.456.78.90`. Write it down.

---

## Step 1 — Add a DNS record in GoDaddy

1. Log into [godaddy.com](https://godaddy.com) → **My Products** → click **DNS** next to `haywood.ltd`
2. Click **Add New Record**
3. Fill in:
   - **Type**: `A`
   - **Name**: `cdn`
   - **Value**: your VPS IPv4 address (e.g. `123.456.78.90`)
   - **TTL**: 1 Hour
4. Click **Save**

> **Note:** If your GoDaddy DNS page shows nameservers pointing to Hostinger (they look like `ns1.hostinger.com`), you need to add the record inside your **Hostinger control panel** instead, under Domains → Manage → DNS Zone.

DNS changes take anywhere from a few minutes to a few hours to spread worldwide.

---

## Step 2 — Open firewall ports on the VPS

Still on the VPS, open **Windows Defender Firewall with Advanced Security** (search it in Start).

Click **Inbound Rules** → **New Rule** (right panel) → repeat this three times:

| Rule name | Port | Protocol |
|-----------|------|----------|
| CDN HTTP  | 80   | TCP      |
| CDN HTTPS | 443  | TCP      |
| CDN Test  | 3000 | TCP      |

For each rule: choose **Port** → **TCP** → enter the port number → **Allow the connection** → check all profiles → give it a name → Finish.

---

## Step 3 — Set up the server on the VPS

**3a. Copy the `server` folder to your VPS.**

The easiest way is to zip the `server` folder on your PC, copy-paste it into the RDP window (drag-and-drop works into RDP), and unzip it on the VPS desktop or `C:\cdn-server\`.

**3b. Create your `.env` file.**

Inside `C:\cdn-server\`, copy `.env.example` and rename the copy to `.env`.

Open `.env` in Notepad and set your API key — make it a long random string, like:

```
API_KEY=xK9mQ2pLvR7nW4jY8bT3uA6eD1cF5hG0
DOMAIN=cdn.haywood.ltd
```

Leave `CERT_PATH` and `KEY_PATH` blank for now (comment them out with `#`). The server will run on port 3000 for the HTTP test.

**3c. Install dependencies.**

Open **Command Prompt** on the VPS, navigate to the server folder, and run:

```
cd C:\cdn-server
npm install
```

**3d. Start the server.**

```
node server.js
```

You should see:
```
HTTP server on :3000  (no certs configured — HTTP only)
```

Leave this window open.

---

## Step 4 — Test it works (HTTP first)

On your **local PC**, open a browser and go to:

```
http://YOUR_VPS_IP:3000/health
```

You should see: `{"ok":true}`

Now test a file upload. Open **PowerShell** on your local PC and run (replace the IP and key):

```powershell
$form = @{ file = Get-Item "C:\path\to\any-image.jpg" }
Invoke-RestMethod -Uri "http://YOUR_VPS_IP:3000/upload" `
  -Method POST `
  -Headers @{ "x-api-key" = "your-api-key-here" } `
  -Form $form
```

You should get back something like: `{ url: "http://cdn.haywood.ltd/a3f7b2e1c4d8.jpg" }`

---

## Step 5 — Get HTTPS with win-acme

> **Do this only after DNS has propagated.** Check by running `nslookup cdn.haywood.ltd` — it should return your VPS IP.

**5a. Download win-acme.**

On the VPS, download the latest release from: `https://github.com/win-acme/win-acme/releases`

Get the `wacs.exe` (no installer needed). Put it in `C:\win-acme\wacs.exe`.

**5b. Stop the server temporarily.**

Press `Ctrl+C` in the server Command Prompt window to stop it. Port 80 needs to be free so win-acme can prove you own the domain.

**5c. Run win-acme as Administrator.**

Right-click **Command Prompt** → **Run as administrator**, then:

```
cd C:\win-acme
wacs.exe --target manual --host cdn.haywood.ltd --validation selfhosting --store pemfiles --pemfilespath C:\cdn-certs
```

win-acme will:
- Temporarily listen on port 80 to prove domain ownership to Let's Encrypt
- Fetch a free certificate valid for 90 days
- Save it to `C:\cdn-certs\` as PEM files
- Auto-schedule a renewal task in Windows Task Scheduler

When it finishes, check `C:\cdn-certs\` — you should see files like:
- `cdn.haywood.ltd-crt.pem`
- `cdn.haywood.ltd-key.pem`

**5d. Update `.env` with the cert paths.**

Open `C:\cdn-server\.env` in Notepad and add (or uncomment):

```
CERT_PATH=C:\cdn-certs\cdn.haywood.ltd-crt.pem
KEY_PATH=C:\cdn-certs\cdn.haywood.ltd-key.pem
```

**5e. Restart the server.**

```
cd C:\cdn-server
node server.js
```

You should now see:
```
HTTPS listening on :443  ->  https://cdn.haywood.ltd
HTTP redirect on :80
```

Test it: open `https://cdn.haywood.ltd/health` in your browser. You should see the padlock and `{"ok":true}`.

---

## Step 6 — Keep the server running after a reboot (PM2)

Right now if the VPS restarts, the server stops. PM2 fixes that.

**6a. Install PM2 globally** (in Command Prompt on VPS):

```
npm install -g pm2
npm install -g pm2-windows-startup
```

**6b. Register PM2 as a startup program:**

```
pm2-windows-startup install
```

**6c. Start the server through PM2:**

```
cd C:\cdn-server
pm2 start server.js --name cdn-server
pm2 save
```

PM2 commands you'll use:

| Command | What it does |
|---------|-------------|
| `pm2 status` | See if the server is running |
| `pm2 logs cdn-server` | See recent log output |
| `pm2 restart cdn-server` | Restart the server |
| `pm2 stop cdn-server` | Stop the server |

**6d. Test it.** Restart the VPS (Start → Power → Restart). After it comes back up, wait 30 seconds and open `https://cdn.haywood.ltd/health` — it should still work.

---

## Step 7 — Set up the local watcher on your PC

**7a. Copy the `watcher` folder** to your local PC (e.g. `C:\cdn-watcher\`).

**7b. Create your `.env` file.**

Copy `.env.example` → rename to `.env`. Open in Notepad:

```
API_KEY=xK9mQ2pLvR7nW4jY8bT3uA6eD1cF5hG0
VPS_URL=https://cdn.haywood.ltd
WATCH_FOLDER=C:\CDN-Upload
```

Use the same `API_KEY` you set on the server.

**7c. Install dependencies.**

Open Command Prompt and run:

```
cd C:\cdn-watcher
npm install
```

**7d. Start the watcher.**

```
node watcher.js
```

You'll see:
```
==================================================
CDN Watcher running
Watching : C:\CDN-Upload
Server   : https://cdn.haywood.ltd
==================================================
Drop an image or video into the folder above.
```

**7e. Test it.** Drag any `.jpg`, `.png`, `.gif`, `.webp`, `.mp4`, or `.webm` file into `C:\CDN-Upload`.

Within a few seconds you'll see:
```
Uploading: photo.jpg ...
Done!  https://cdn.haywood.ltd/a3f7b2e1c4d8.jpg
(URL copied to clipboard)
```

Paste the URL into your browser — your file will be there.

---

## Step 8 — Make the watcher start with Windows (optional)

If you want the watcher to start automatically when you log into your PC:

1. Press `Win + R`, type `shell:startup`, press Enter
2. In that folder, right-click → **New** → **Shortcut**
3. Location: `cmd.exe /k "cd C:\cdn-watcher && node watcher.js"`
4. Name it "CDN Watcher"
5. Click Finish

Now the watcher starts every time you log in.

---

## Troubleshooting

**"Unauthorized" error when uploading**
The `API_KEY` in `watcher/.env` doesn't match `server/.env`. They must be identical.

**win-acme fails with "connection refused"**
- Make sure port 80 is open in the Windows Firewall (Step 2)
- Make sure the Node.js server is stopped before running win-acme
- Make sure DNS has propagated (`nslookup cdn.haywood.ltd` returns your VPS IP)

**Files upload but the URL returns 404**
The file is in `C:\cdn-server\uploads\`. Check it exists there. If the server restarted and `uploads/` was deleted, the folder needs to exist.

**Certificate expired**
win-acme installs a Windows Task Scheduler job that auto-renews. Check it exists: search "Task Scheduler" in Start → look for a task with "win-acme" in the name.

**Large video uploads time out**
The watcher has a 5-minute timeout. For very large files (>100 MB over a slow connection), just wait — the `awaitWriteFinish` setting also waits for the file to finish copying before uploading starts.
