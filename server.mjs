import http from 'http';
import fs from 'fs';
import path from 'path';
import { BaileysHospitalBot } from './src/bot-manager.mjs';

// Memuat konfigurasi environment variable dari berkas .env jika tersedia
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  try {
    if (typeof process.loadEnvFile === 'function') {
      process.loadEnvFile(envPath);
    } else {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      });
    }
  } catch (err) {
    console.warn('[Env] Peringatan saat memuat file .env:', err.message);
  }
}

// Validasi environment variable wajib saat server dinyalakan
const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL?.trim();
const APPS_SCRIPT_TOKEN = process.env.APPS_SCRIPT_TOKEN?.trim();
const PORT = parseInt(process.env.PORT, 10) || 3000;

if (!APPS_SCRIPT_URL || !APPS_SCRIPT_TOKEN) {
  console.error('\n======================================================');
  console.error('[FATAL ERROR] Environment variable belum dikonfigurasi!');
  console.error('- APPS_SCRIPT_URL   : ' + (APPS_SCRIPT_URL ? 'OK' : 'TIDAK ADA (Wajib)'));
  console.error('- APPS_SCRIPT_TOKEN : ' + (APPS_SCRIPT_TOKEN ? 'OK' : 'TIDAK ADA (Wajib)'));
  console.error('\nSilakan buat file .env dari template .env.example dan isi nilainya.');
  console.error('======================================================\n');
  process.exit(1);
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Fungsi rekursif untuk menghapus kolom password dari semua respons data
function stripPasswords(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(stripPasswords);
  }
  const clean = {};
  for (const [key, value] of Object.entries(data)) {
    if (key.toLowerCase().includes('password') || key === 'settingsData') continue;
    clean[key] = stripPasswords(value);
  }
  return clean;
}

// Inisialisasi Baileys WhatsApp Engine
const waBot = new BaileysHospitalBot({
  appsScriptUrl: APPS_SCRIPT_URL,
  appsScriptToken: APPS_SCRIPT_TOKEN
});
waBot.start();

// Sinkronisasi menu, FAQ, dan aturan darurat dari Google Apps Script ke memori Baileys
async function syncFromGoogleAppsScript() {
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=bot_bundle&token=${APPS_SCRIPT_TOKEN}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        waBot.updateData(json.data);
        console.log(`[Google Apps Script] Sinkronisasi berhasil! ${json.data.categories?.length || 0} kategori aktif.`);
        return json.data;
      }
    }
  } catch (err) {
    console.warn('[Google Apps Script] Gagal sinkronisasi data:', err.message);
  }
  return null;
}

syncFromGoogleAppsScript();
setInterval(syncFromGoogleAppsScript, 60000);

const server = http.createServer(async (req, res) => {
  const urlParts = req.url.split('?');
  const reqPath = decodeURI(urlParts[0]);

  // Header CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // --- BAILEYS WHATSAPP REST API ENDPOINTS ---
  if (reqPath === '/api/wa/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(waBot.getStatus()));
    return;
  }

  if (reqPath === '/api/wa/restart' && req.method === 'POST') {
    try {
      await waBot.restart();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Restart WhatsApp bot berhasil dipicu' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath === '/api/wa/logout' && req.method === 'POST') {
    try {
      await waBot.logout();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Sesi WhatsApp berhasil diputuskan' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath === '/api/wa/send-test' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { targetPhone, message } = JSON.parse(body || '{}');
        if (!targetPhone || !message) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'Nomor telepon dan pesan wajib diisi' }));
          return;
        }

        const cleanPhone = targetPhone.replace(/[^0-9]/g, '');
        const jid = `${cleanPhone}@s.whatsapp.net`;
        await waBot.sendMessage(jid, message);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: `Pesan dikirim ke +${cleanPhone}` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- BOT DATA SYNC ENDPOINTS ---
  if (reqPath === '/api/bot/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stripPasswords(waBot.data)));
    return;
  }

  if (reqPath === '/api/bot/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        waBot.updateData(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Data bot WhatsApp berhasil disinkronkan ke memori server' }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // --- GOOGLE APPS SCRIPT WEB APP PROXY ENDPOINTS ---
  if (reqPath === '/api/gas/bundle' && req.method === 'GET') {
    try {
      const freshData = await syncFromGoogleAppsScript();
      const returnData = freshData ? {
        ...freshData,
        emergencyRules: (freshData.emergencyRules && Array.isArray(freshData.emergencyRules) && freshData.emergencyRules.length > 0)
          ? freshData.emergencyRules
          : waBot.emergencyRules
      } : waBot.data;

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords({ success: true, data: returnData })));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath === '/api/gas/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');

        // Meneruskan payload langsung ke Google Apps Script tanpa menyuntik kredensial hardcoded
        const gasRes = await fetch(APPS_SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'follow'
        });
        const gasJson = await gasRes.json();
        syncFromGoogleAppsScript().catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stripPasswords(gasJson)));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (reqPath === '/api/gas/metrics' && req.method === 'GET') {
    try {
      const gasRes = await fetch(`${APPS_SCRIPT_URL}?action=metrics`);
      const gasJson = await gasRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords(gasJson)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath === '/api/gas/logs' && req.method === 'GET') {
    try {
      const type = urlParts[1]?.includes('type=audit') ? 'audit_logs' : 'event_logs';
      const gasRes = await fetch(`${APPS_SCRIPT_URL}?action=${type}&limit=50`);
      const gasJson = await gasRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords(gasJson)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath === '/api/gas/users' && req.method === 'GET') {
    // Memeriksa keberadaan header autentikasi X-Admin-Token
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken || !String(adminToken).trim()) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: 'Akses ditolak: Header X-Admin-Token diperlukan untuk mengakses pengguna' }));
      return;
    }

    try {
      // Meneruskan permintaan get_users ke Google Apps Script menggunakan token admin dari browser
      const gasRes = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_users', token: String(adminToken).trim() }),
        redirect: 'follow'
      });
      const gasJson = await gasRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords(gasJson)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- STATIC FILE SERVER DENGAN PROTEKSI KEAMANAN ---
  let filePath = reqPath === '/' ? '/index.html' : reqPath;
  const projectRoot = process.cwd();
  const safeFullPath = path.resolve(projectRoot, '.' + filePath);

  // 1. Mencegah directory traversal (path traversal attack)
  if (!safeFullPath.startsWith(projectRoot)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: '403 Forbidden: Akses ke luar direktori ditolak' }));
    return;
  }

  // 2. Mencegah akses ke berkas sensitif atau kode backend
  const relativeFile = path.relative(projectRoot, safeFullPath).replace(/\\/g, '/').toLowerCase();
  const isProtectedPath = 
    relativeFile === 'server.mjs' ||
    relativeFile.startsWith('src/') ||
    relativeFile === 'src' ||
    relativeFile === '.env' ||
    relativeFile.startsWith('.env.') ||
    relativeFile.startsWith('auth_info_baileys/') ||
    relativeFile === 'auth_info_baileys';

  if (isProtectedPath) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: false, error: '403 Forbidden: Berkas dilindungi dan tidak dapat diakses' }));
    return;
  }

  fs.stat(safeFullPath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(safeFullPath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    fs.createReadStream(safeFullPath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`[HTTP SERVER] Portal Web & API RSUD Margono Soekarjo: http://localhost:${PORT}`);
  console.log(`[BAILEYS] WhatsApp Engine BOKU: Berjalan`);
  console.log(`======================================================\n`);
});
