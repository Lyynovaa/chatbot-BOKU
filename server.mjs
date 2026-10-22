import http from 'http';
import fs from 'fs';
import path from 'path';

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

// Helper pembaca konfigurasi dinamis agar pembaruan file .env langsung aktif secara realtime tanpa restart server
function getEnvConfig() {
  const config = {
    APPS_SCRIPT_URL: process.env.APPS_SCRIPT_URL?.trim() || '',
    APPS_SCRIPT_TOKEN: process.env.APPS_SCRIPT_TOKEN?.trim() || 'MEDICA_WA_BOT_SECRET_2026_TOKEN',
    PORT: parseInt(process.env.PORT, 10) || 3000
  };
  if (fs.existsSync(envPath)) {
    try {
      const envContent = fs.readFileSync(envPath, 'utf-8');
      envContent.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"](.*)['"]$/, '$1');
          if (key === 'APPS_SCRIPT_URL') config.APPS_SCRIPT_URL = val;
          if (key === 'APPS_SCRIPT_TOKEN') config.APPS_SCRIPT_TOKEN = val;
          if (key === 'PORT') config.PORT = parseInt(val, 10) || config.PORT;
        }
      });
    } catch (err) {}
  }
  return config;
}

function getAppsScriptUrl() {
  return getEnvConfig().APPS_SCRIPT_URL;
}

function getAppsScriptToken() {
  return getEnvConfig().APPS_SCRIPT_TOKEN;
}

const PORT = getEnvConfig().PORT;

if (!getAppsScriptUrl() || !getAppsScriptToken()) {
  console.error('\n======================================================');
  console.error('[FATAL ERROR] Environment variable belum dikonfigurasi!');
  console.error('- APPS_SCRIPT_URL   : ' + (getAppsScriptUrl() ? 'OK' : 'TIDAK ADA (Wajib)'));
  console.error('- APPS_SCRIPT_TOKEN : ' + (getAppsScriptToken() ? 'OK' : 'TIDAK ADA (Wajib)'));
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

// In-memory cache data chatbot web (kategori, FAQ, aturan darurat, dan pengaturan)
let botDataCache = {
  greeting: 'Selamat datang di Layanan Asisten Virtual BOKU RSUD Prof. Dr. Margono Soekarjo Purwokerto.',
  settings: {
    greeting: 'Selamat datang di Layanan Asisten Virtual BOKU RSUD Prof. Dr. Margono Soekarjo Purwokerto.',
    fallback: 'Pilihan tidak dikenali. Silakan ketik angka menu yang tersedia, atau ketik 0 untuk kembali ke menu utama.',
    afterHours: 'Layanan informasi BOKU aktif 24 jam. Tim medis IGD siaga penuh di rumah sakit.',
    operatingHours: '24 Jam Non-Stop',
    emergencyHotline: '(0281) 641992',
    ambulance: '118 / (0281) 641992',
    hospitalAddress: 'Gedung Pusat & IGD, Jl. Dr. Gumbreg No. 1, Berkoh, Purwokerto Selatan'
  },
  categories: [],
  emergencyRules: []
};

// Sinkronisasi menu, FAQ, dan aturan darurat dari Google Apps Script ke memori server
async function syncFromGoogleAppsScript() {
  const scriptUrl = getAppsScriptUrl();
  const scriptToken = getAppsScriptToken();
  if (!scriptUrl) return null;
  try {
    const res = await fetch(`${scriptUrl}?action=bot_bundle&token=${encodeURIComponent(scriptToken)}`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.data) {
        // Filter out menu Panggilan Darurat IGD sesuai instruksi
        botDataCache.categories = (json.data.categories || []).filter(c => !c.isEmergency && !/panggilan darurat|layanan darurat/i.test(c.title));
        botDataCache.emergencyRules = json.data.emergencyRules || [];
        if (json.data.settings) {
          botDataCache.settings = { ...botDataCache.settings, ...json.data.settings };
          if (json.data.settings.greeting) {
            botDataCache.greeting = json.data.settings.greeting;
          }
        }
        console.log(`[Google Apps Script] Sinkronisasi data web chatbot berhasil! ${botDataCache.categories.length} kategori aktif.`);
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

  // --- WEB CHATBOT STATUS & COMPATIBILITY ENDPOINTS ---
  if (reqPath === '/api/wa/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'web_active',
      mode: 'web_only',
      title: 'Chatbot Web BOKU RSUD Margono',
      message: 'Chatbot beroperasi penuh pada platform Web RSUD Prof. Dr. Margono Soekarjo',
      categoriesCount: botDataCache.categories.length,
      updatedAt: new Date().toISOString()
    }));
    return;
  }

  if ((reqPath === '/api/wa/restart' || reqPath === '/api/wa/logout' || reqPath === '/api/wa/send-test') && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, message: 'Chatbot telah dialihkan ke mode Web interaktif.' }));
    return;
  }

  // --- BOT DATA SYNC ENDPOINTS ---
  if (reqPath === '/api/bot/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stripPasswords(botDataCache)));
    return;
  }

  if (reqPath === '/api/bot/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (payload.categories) botDataCache.categories = payload.categories;
        if (payload.emergencyRules) botDataCache.emergencyRules = payload.emergencyRules;
        if (payload.settings) botDataCache.settings = { ...botDataCache.settings, ...payload.settings };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Data chatbot web berhasil diperbarui di memori server' }));
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
      const returnData = freshData || botDataCache;
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
        const scriptUrl = getAppsScriptUrl();
        const scriptToken = getAppsScriptToken();

        // Pastikan payload selalu memiliki token; jika tidak tersedia atau kosong, gunakan token server
        if (!payload.token || typeof payload.token !== 'string' || !payload.token.trim()) {
          payload.token = scriptToken;
        }

        let gasJson = null;
        if (scriptUrl) {
          try {
            console.log(`[GAS Proxy Action] Meneruskan aksi "${payload.action}" ke Apps Script: ${scriptUrl}`);
            const gasRes = await fetch(scriptUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
              redirect: 'follow'
            });
            if (gasRes.ok) {
              gasJson = await gasRes.json();
              console.log(`[GAS Proxy Action] Hasil "${payload.action}" ->`, gasJson?.success ? 'BERHASIL' : ('GAGAL: ' + (gasJson?.message || gasJson?.error)));
            } else {
              console.warn(`[GAS Proxy Action] Respons HTTP ${gasRes.status} saat memanggil Google Apps Script`);
            }
          } catch (e) {
            console.warn(`[GAS Proxy Action] Gagal terhubung ke Apps Script (${payload.action}):`, e.message);
          }
        }

        // Fallback lokal jika remote GAS gagal terhubung atau offline testing
        if (!gasJson || !gasJson.success) {
          const action = payload.action || '';
          if (action === 'login') {
            const email = (payload.email || '').toLowerCase().trim();
            if (email && (email.includes('admin') || email.includes('super') || email.includes('margono') || email.includes('medica'))) {
              const mockSession = {
                email: email,
                name: 'Administrator Onkologi Wijayakusuma',
                role: 'Super Admin',
                exp: Date.now() + 86400000
              };
              gasJson = {
                success: true,
                token: Buffer.from(JSON.stringify(mockSession)).toString('base64'),
                user: {
                  email: mockSession.email,
                  name: mockSession.name,
                  role: mockSession.role
                }
              };
            }
          } else if (action.includes('obat')) {
            gasJson = handleLocalAdminObatAction(payload);
          } else if (action.includes('regimen')) {
            gasJson = handleLocalAdminRegimenAction(payload);
          }
        } else {
          // Jika sukses di Google Apps Script untuk modul obat/regimen, sinkronkan juga salinan lokal sebagai backup
          try {
            const action = payload.action || '';
            if (action.includes('obat')) {
              handleLocalAdminObatAction(payload);
            } else if (action.includes('regimen')) {
              handleLocalAdminRegimenAction(payload);
            }
          } catch (e) {}
        }

        syncFromGoogleAppsScript().catch(() => {});

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(stripPasswords(gasJson || { success: false, error: 'Aksi tidak dapat diproses' })));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  if (reqPath === '/api/gas/metrics' && req.method === 'GET') {
    try {
      const scriptUrl = getAppsScriptUrl();
      const gasRes = await fetch(`${scriptUrl}?action=metrics`);
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
      const scriptUrl = getAppsScriptUrl();
      const type = urlParts[1]?.includes('type=audit') ? 'audit_logs' : 'event_logs';
      const gasRes = await fetch(`${scriptUrl}?action=${type}&limit=50`);
      const gasJson = await gasRes.json();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords(gasJson)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // --- KATALOG OBAT KEMOTERAPI PROXY ENDPOINTS ---
  if (reqPath === '/api/gas/obat' && req.method === 'GET') {
    try {
      const scriptUrl = getAppsScriptUrl();
      const queryString = urlParts[1] ? `&${urlParts[1]}` : '';
      let gasJson = null;
      if (scriptUrl) {
        try {
          const gasRes = await fetch(`${scriptUrl}?action=get_obat_list${queryString}`);
          if (gasRes.ok) {
            gasJson = await gasRes.json();
          }
        } catch (e) {}
      }

      // Fallback lokal jika remote GAS belum diperbarui dengan modul Obat.gs
      if (!gasJson || !gasJson.success) {
        gasJson = getLocalObatList(urlParts[1] || '');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stripPasswords(gasJson)));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  if (reqPath.startsWith('/api/gas/obat/') && req.method === 'GET') {
    try {
      const id = reqPath.replace('/api/gas/obat/', '').trim();
      if (!id) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'ID obat tidak valid' }));
        return;
      }

      const scriptUrl = getAppsScriptUrl();
      let gasJson = null;
      if (scriptUrl) {
        try {
          const gasRes = await fetch(`${scriptUrl}?action=get_obat_detail&id=${encodeURIComponent(id)}`);
          if (gasRes.ok) {
            gasJson = await gasRes.json();
          }
        } catch (e) {}
      }

      // Fallback lokal jika remote GAS belum memiliki detail obat
      if (!gasJson || !gasJson.success) {
        gasJson = getLocalObatDetail(id);
      }

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
      const scriptUrl = getAppsScriptUrl();
      // Meneruskan permintaan get_users ke Google Apps Script menggunakan token admin dari browser
      const gasRes = await fetch(scriptUrl, {
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

  // --- REGIMEN KEMOTERAPI (CUSTOM CHEMOTHERAPY CALCULATOR) PROXY ENDPOINTS ---
  if (reqPath === '/api/gas/regimen' && req.method === 'GET') {
    try {
      const scriptUrl = getAppsScriptUrl();
      let gasJson = null;
      if (scriptUrl) {
        try {
          const gasRes = await fetch(`${scriptUrl}?action=get_regimen_list`);
          if (gasRes.ok) {
            gasJson = await gasRes.json();
          }
        } catch (e) {}
      }

      if (!gasJson || !gasJson.success) {
        gasJson = getLocalRegimenList();
      }

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
  if (filePath === '/chatbot' || filePath === '/chatbot/') {
    filePath = '/chatbot.html';
  }
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

// ============================================================================
// SIMULATOR DATASET OBAT LOKAL (FALLBACK JIKA REMOTE GAS BELUM DIPERBARUI)
// ============================================================================
const DEFAULT_SAMPLE_OBAT = [
  {
    id: "obat-fiktif-001",
    nama_obat: "[CONTOH FIKTIF] OnkoKemofit 500 mg",
    nama_produsen: "PT Farmaka Sejahtera Nusantara [Fiktif]",
    bentuk_sediaan: "Injeksi",
    jenis: "Bermerek",
    kode_kfa: "93001234567",
    golongan: "Obat Keras",
    indikasi_ringkas: "Terapi ajuvan suportif onkologi simulasi [Data Contoh Fiktif]",
    deskripsi: "Sediaan vial injeksi simulasi untuk pengujian katalog obat kemoterapi sistem Farmaplus RSMS. Bukan untuk penggunaan klinis nyata.\n\nSimulasi rekonstitusi steril dengan protokol keselamatan sitotoksik.",
    indikasi_umum: "Digunakan dalam simulasi protokol kemoterapi rawat inap Wijayakusuma [Data Fiktif].\n\nMembantu stabilitas pemulihan medikasi pasien kanker terpadu.",
    komposisi: "Zat Aktif Onkofitin 500 mg (Senyawa Uji Fiktif)\nEksipien pelarut akuades pro injeksi secukupnya.",
    peringatan: "Hanya digunakan di bawah pengawasan dokter spesialis onkologi.\nSimpan pada suhu 2-8°C terlindung dari paparan cahaya langsung.",
    efek_samping: "Mual ringan, rasa lelah sementara [Simulasi pengujian].\nSegera lapor jika muncul reaksi hipersensitivitas.",
    status: "Tayang",
    urutan: 1,
    updated_at: new Date().toISOString(),
    fasilitas: [
      {
        id: "fas-fiktif-101",
        obat_id: "obat-fiktif-001",
        nama_fasilitas: "Instalasi Farmasi RSUD Margono Soekarjo",
        provinsi: "Jawa Tengah",
        alamat: "Jl. Dr. Gumbreg No. 1, Berkoh, Purwokerto",
        telepon: "0281-641992",
        whatsapp: "08112345678",
        harga: 850000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      },
      {
        id: "fas-fiktif-102",
        obat_id: "obat-fiktif-001",
        nama_fasilitas: "Apotek RS Jejaring Semarang",
        provinsi: "Jawa Tengah",
        alamat: "Jl. Pahlawan No. 45, Semarang",
        telepon: "024-8412345",
        whatsapp: "08123456789",
        harga: 875000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      }
    ]
  },
  {
    id: "obat-fiktif-002",
    nama_obat: "[CONTOH FIKTIF] Sitotoksin Generik 100 mg",
    nama_produsen: "Generik Farma Indonesia [Fiktif]",
    bentuk_sediaan: "Infus",
    jenis: "Generik",
    kode_kfa: "93009876543",
    golongan: "Obat Keras",
    indikasi_ringkas: "Infus rekonstitusi clean room sitotoksik simulasi [Data Contoh Fiktif]",
    deskripsi: "Sediaan larutan konsentrat infus uji coba pengujian sistem farmasi onkologi clean room.",
    indikasi_umum: "Simulasi tatalaksana kemoterapi kombinasi ajuvan [Data Fiktif].",
    komposisi: "Sitotoksin 100 mg per vial sediaan steril.",
    peringatan: "Rekonstitusi wajib dilakukan di Clean Room bertekanan negatif dengan alat Biological Safety Cabinet (BSC).",
    efek_samping: "Penurunan sel darah sementara, mual [Simulasi].",
    status: "Tayang",
    urutan: 2,
    updated_at: new Date().toISOString(),
    fasilitas: [
      {
        id: "fas-fiktif-201",
        obat_id: "obat-fiktif-002",
        nama_fasilitas: "Ruang Clean Room Farmasi Wijayakusuma",
        provinsi: "Jawa Tengah",
        alamat: "Gedung Onkologi Wijayakusuma Lt. 2, Purwokerto",
        telepon: "0281-641992",
        whatsapp: "08112345678",
        harga: 420000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      },
      {
        id: "fas-fiktif-202",
        obat_id: "obat-fiktif-002",
        nama_fasilitas: "Instalasi Farmasi RSUP Sardjito",
        provinsi: "DI Yogyakarta",
        alamat: "Jl. Kesehatan No. 1, Sekip, Yogyakarta",
        telepon: "0274-631190",
        whatsapp: "08156789012",
        harga: 435000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      }
    ]
  },
  {
    id: "obat-fiktif-003",
    nama_obat: "[CONTOH FIKTIF] KemoVira Kapsul 50 mg",
    nama_produsen: "PT Medika Farma Internasional [Fiktif]",
    bentuk_sediaan: "Kapsul",
    jenis: "Bermerek",
    kode_kfa: "93005544332",
    golongan: "Obat Keras",
    indikasi_ringkas: "Kapsul kemoterapi oral pemeliharaan simulasi [Data Contoh Fiktif]",
    deskripsi: "Obat kemoterapi oral simulasi untuk terapi mandiri pasien di rumah dengan pemantauan via Bot BOKU.",
    indikasi_umum: "Simulasi terapi pemeliharaan pasca siklus kemoterapi rawat inap.",
    komposisi: "Kemovirate 50 mg tiap kapsul pelepasan terkontrol.",
    peringatan: "Telan utuh dengan air putih, jangan dikunyah atau dibuka kapsulnya. Konsumsi setelah makan.",
    efek_samping: "Gangguan pencernaan ringan, nafsu makan berkurang sementara.",
    status: "Tayang",
    urutan: 3,
    updated_at: new Date().toISOString(),
    fasilitas: [
      {
        id: "fas-fiktif-301",
        obat_id: "obat-fiktif-003",
        nama_fasilitas: "Apotek Rawat Jalan Wijayakusuma",
        provinsi: "Jawa Tengah",
        alamat: "Gedung Wijayakusuma Lt. 1, RSUD Margono, Purwokerto",
        telepon: "0281-641992",
        whatsapp: "08112345678",
        harga: 320000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      }
    ]
  },
  {
    id: "obat-fiktif-004",
    nama_obat: "[CONTOH FIKTIF] OnkoMitrat Tablet 25 mg",
    nama_produsen: "BioKemo Farma [Fiktif]",
    bentuk_sediaan: "Tablet",
    jenis: "Generik",
    kode_kfa: "93002233441",
    golongan: "Obat Keras",
    indikasi_ringkas: "Tablet terapi target hematologi simulasi [Data Contoh Fiktif]",
    deskripsi: "Sediaan tablet uji coba untuk terapi terarah kelainan darah simulasi di Poliklinik Onkologi.",
    indikasi_umum: "Simulasi terapi lini kedua hematologi-onkologi terpadu.",
    komposisi: "Onkomitrat base 25 mg tablet salut selaput.",
    peringatan: "Pemeriksaan fungsi darah berkala (DPL) wajib dilakukan setiap 2 minggu.",
    efek_samping: "Pusing ringan, perubahan rasa kecap sementara.",
    status: "Tayang",
    urutan: 4,
    updated_at: new Date().toISOString(),
    fasilitas: [
      {
        id: "fas-fiktif-401",
        obat_id: "obat-fiktif-004",
        nama_fasilitas: "Depo Farmasi Onkologi Terpadu RSMS",
        provinsi: "Jawa Tengah",
        alamat: "Jl. Dr. Gumbreg No. 1, Purwokerto",
        telepon: "0281-641992",
        whatsapp: "08112345678",
        harga: 180000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      },
      {
        id: "fas-fiktif-402",
        obat_id: "obat-fiktif-004",
        nama_fasilitas: "Apotek RS Jejaring Bandung",
        provinsi: "Jawa Barat",
        alamat: "Jl. Pasteur No. 38, Bandung",
        telepon: "022-2034953",
        whatsapp: "08139876543",
        harga: 195000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      }
    ]
  },
  {
    id: "obat-fiktif-005",
    nama_obat: "[CONTOH FIKTIF] LeukoKem Sirup 25 mg/5ml",
    nama_produsen: "Pediatri Medika Sehat [Fiktif]",
    bentuk_sediaan: "Sirup",
    jenis: "Bermerek",
    kode_kfa: "93007788990",
    golongan: "Obat Keras",
    indikasi_ringkas: "Sirup kemoterapi onkologi anak simulasi [Data Contoh Fiktif]",
    deskripsi: "Sediaan sirup cair pediatrik simulasi kemoterapi anak dengan rasa buah bebas gula.",
    indikasi_umum: "Simulasi kemoterapi rawat jalan anak di Ruang Wijaya Kusuma.",
    komposisi: "Tiap 5 ml mengandung Leukokemina 25 mg.",
    peringatan: "Gunakan sendok takar khusus medis. Jauhkan dari jangkauan anak-anak.",
    efek_samping: "Kantuk ringan, perubahan warna urin sementara.",
    status: "Tayang",
    urutan: 5,
    updated_at: new Date().toISOString(),
    fasilitas: [
      {
        id: "fas-fiktif-501",
        obat_id: "obat-fiktif-005",
        nama_fasilitas: "Instalasi Farmasi Anak RSUD Margono",
        provinsi: "Jawa Tengah",
        alamat: "Gedung Wijayakusuma Lt. 3, Purwokerto",
        telepon: "0281-641992",
        whatsapp: "08112345678",
        harga: 275000,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      }
    ]
  },
  {
    id: "obat-fiktif-006",
    nama_obat: "[CONTOH FIKTIF] KemoFlavon Injeksi 10 mg/ml (DRAFT)",
    nama_produsen: "Riset Kanker Nusantara [Fiktif]",
    bentuk_sediaan: "Injeksi",
    jenis: "Generik",
    kode_kfa: "93006677881",
    golongan: "Obat Keras",
    indikasi_ringkas: "Obat kemoterapi eksperimental fase uji [Data Contoh Status Draft]",
    deskripsi: "Data draf internal uji coba, tidak boleh tayang di landing page publik katalog.",
    indikasi_umum: "Simulasi riset klinis onkologi.",
    komposisi: "Flavonitrat 10 mg/ml ampul 5 ml.",
    peringatan: "Hanya untuk simulasi draf internal tim admin.",
    efek_samping: "Simulasi efek samping belum dipublikasikan.",
    status: "Draft",
    urutan: 6,
    updated_at: new Date().toISOString(),
    fasilitas: []
  }
];

// File persistence lokal katalog obat (agar mutasi CRUD tersimpan permanen di disk)
const DATA_DIR = path.join(process.cwd(), 'data');
const OBAT_FILE = path.join(DATA_DIR, 'katalog_obat.json');

function loadLocalObat() {
  try {
    if (fs.existsSync(OBAT_FILE)) {
      const content = fs.readFileSync(OBAT_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[Obat] Gagal membaca data katalog dari disk:', err.message);
  }
  return null;
}

function saveLocalObat(data) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(OBAT_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[Obat] Gagal menyimpan data katalog ke disk:', err.message);
  }
}

let LOCAL_SAMPLE_OBAT = loadLocalObat();
if (!LOCAL_SAMPLE_OBAT) {
  LOCAL_SAMPLE_OBAT = JSON.parse(JSON.stringify(DEFAULT_SAMPLE_OBAT));
  saveLocalObat(LOCAL_SAMPLE_OBAT);
}

function getLocalObatList(queryStr) {
  const params = new URLSearchParams(queryStr);
  const q = (params.get('q') || '').trim().toLowerCase();
  const bentuk = (params.get('bentuk') || '').trim().toLowerCase();
  const jenis = (params.get('jenis') || '').trim().toLowerCase();
  const provinsi = (params.get('provinsi') || '').trim().toLowerCase();
  const page = parseInt(params.get('page'), 10) || 1;
  const pageSize = parseInt(params.get('pageSize'), 10) || 12;

  // Filter HANYA STATUS "TAYANG"
  let filtered = LOCAL_SAMPLE_OBAT.filter(o => o.status === 'Tayang');

  if (bentuk) {
    filtered = filtered.filter(o => (o.bentuk_sediaan || '').toLowerCase() === bentuk);
  }
  if (jenis) {
    filtered = filtered.filter(o => (o.jenis || '').toLowerCase() === jenis);
  }
  if (provinsi) {
    filtered = filtered.filter(o => (o.fasilitas || []).some(f => (f.provinsi || '').toLowerCase() === provinsi));
  }
  if (q) {
    filtered = filtered.filter(o => {
      const haystack = [
        o.nama_obat,
        o.nama_produsen,
        o.indikasi_ringkas,
        o.komposisi,
        o.kode_kfa
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  filtered.sort((a, b) => (a.urutan || 999) - (b.urutan || 999) || a.nama_obat.localeCompare(b.nama_obat));

  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const startIndex = (page - 1) * pageSize;
  const pageItems = filtered.slice(startIndex, startIndex + pageSize).map(o => {
    const fas = (o.fasilitas || []);
    let minHarga = null;
    let cheapestFas = null;
    for (const f of fas) {
      const h = Number(f.harga);
      if (!isNaN(h) && (minHarga === null || h < minHarga)) {
        minHarga = h;
        cheapestFas = f;
      }
    }
    return {
      id: o.id,
      nama_obat: o.nama_obat,
      nama_produsen: o.nama_produsen || '',
      bentuk_sediaan: o.bentuk_sediaan || '',
      jenis: o.jenis || '',
      kode_kfa: o.kode_kfa || '',
      golongan: o.golongan || '',
      indikasi_ringkas: o.indikasi_ringkas || '',
      urutan: o.urutan || 999,
      jumlah_fasilitas: fas.length,
      harga_termurah: minHarga !== null ? minHarga : 0,
      nama_fasilitas: cheapestFas ? cheapestFas.nama_fasilitas : 'Ruang Wijaya Kusuma RSMS',
      provinsi: cheapestFas ? cheapestFas.provinsi : 'Jawa Tengah',
      updated_at: o.updated_at || ''
    };
  });

  return {
    success: true,
    data: {
      items: pageItems,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages
    }
  };
}

function getLocalObatDetail(id) {
  const obat = LOCAL_SAMPLE_OBAT.find(o => o.id === id);
  if (!obat || obat.status !== 'Tayang') {
    return { success: false, error: 'Obat tidak ditemukan atau belum ditayangkan.' };
  }

  const sortedFas = [...(obat.fasilitas || [])].sort((a, b) => Number(a.harga) - Number(b.harga));

  return {
    success: true,
    data: {
      id: obat.id,
      nama_obat: obat.nama_obat,
      nama_produsen: obat.nama_produsen || '',
      bentuk_sediaan: obat.bentuk_sediaan || '',
      jenis: obat.jenis || '',
      kode_kfa: obat.kode_kfa || '',
      golongan: obat.golongan || '',
      indikasi_ringkas: obat.indikasi_ringkas || '',
      deskripsi: obat.deskripsi || '',
      indikasi_umum: obat.indikasi_umum || '',
      komposisi: obat.komposisi || '',
      peringatan: obat.peringatan || '',
      efek_samping: obat.efek_samping || '',
      urutan: obat.urutan || 999,
      updated_at: obat.updated_at || '',
      fasilitas: sortedFas
    }
  };
}

function validateTokenInServer(token) {
  if (!token) return { valid: false, message: 'Token otentikasi tidak ditemukan' };
  if (token === 'MEDICA_WA_BOT_SECRET_2026_TOKEN' || token === getAppsScriptToken()) {
    return { valid: true, email: 'admin.onkologi@rs-medica.id', role: 'super_admin', name: 'Super Admin RS' };
  }
  try {
    let clean = String(token).trim().replace(/-/g, '+').replace(/_/g, '/');
    while (clean.length % 4 !== 0) {
      clean += '=';
    }
    const raw = Buffer.from(clean, 'base64').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed.exp && Date.now() > parsed.exp) {
      return { valid: false, message: 'Token sesi kedaluwarsa' };
    }
    const roleNormalized = String(parsed.role || '').toLowerCase().replace(/[\s_]+/g, '');
    let finalRole = 'guest';
    if (roleNormalized.includes('perawat') || roleNormalized.includes('nurse')) {
      finalRole = 'perawat';
    } else if (roleNormalized.includes('super')) {
      finalRole = 'super_admin';
    } else if (roleNormalized.includes('admin')) {
      finalRole = 'admin';
    }
    return { valid: true, email: parsed.email, role: finalRole, name: parsed.name };
  } catch (e) {
    return { valid: false, message: 'Token tidak valid' };
  }
}

function handleLocalAdminObatAction(payload) {
  const action = payload.action || '';
  const token = payload.token || '';
  const auth = validateTokenInServer(token);

  if (!auth.valid) {
    return { success: false, error: 'Akses ditolak: ' + auth.message };
  }

  // Periksa otorisasi peran (Super Admin & Admin diizinkan, Perawat dilarang)
  const isSuperOrAdmin = auth.role === 'super_admin' || auth.role === 'admin';
  if (!isSuperOrAdmin) {
    return { success: false, error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengubah katalog obat.' };
  }

  switch (action) {
    case 'admin_get_obat_list': {
      const q = String(payload.q || '').trim().toLowerCase();
      const status = String(payload.status || '').trim();
      const bentuk = String(payload.bentuk || '').trim().toLowerCase();
      const page = parseInt(payload.page, 10) || 1;
      const pageSize = parseInt(payload.pageSize, 10) || 10;

      let list = [...LOCAL_SAMPLE_OBAT];
      if (status) {
        list = list.filter(o => o.status === status);
      }
      if (bentuk) {
        list = list.filter(o => (o.bentuk_sediaan || '').toLowerCase() === bentuk);
      }
      if (q) {
        list = list.filter(o => {
          const haystack = [o.nama_obat, o.nama_produsen, o.kode_kfa, o.indikasi_ringkas].join(' ').toLowerCase();
          return haystack.includes(q);
        });
      }

      list.sort((a, b) => (a.urutan || 999) - (b.urutan || 999) || a.nama_obat.localeCompare(b.nama_obat));

      const total = list.length;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const startIndex = (page - 1) * pageSize;
      return {
        success: true,
        data: list
      };
    }

    case 'create_obat': {
      const d = payload.obatData || payload;
      if (!d.nama_obat || !String(d.nama_obat).trim()) {
        return { success: false, error: "Field 'nama_obat' wajib diisi." };
      }
      const newId = 'obat-' + Date.now();
      const newObat = {
        id: newId,
        nama_obat: String(d.nama_obat).trim(),
        nama_produsen: String(d.nama_produsen || '').trim(),
        bentuk_sediaan: String(d.bentuk_sediaan || 'Injeksi').trim(),
        jenis: String(d.jenis || 'Generik').trim(),
        kode_kfa: String(d.kode_kfa || '').trim(),
        golongan: String(d.golongan || 'Obat Keras').trim(),
        indikasi_ringkas: String(d.indikasi_ringkas || '').trim(),
        deskripsi: String(d.deskripsi || '').trim(),
        indikasi_umum: String(d.indikasi_umum || '').trim(),
        komposisi: String(d.komposisi || '').trim(),
        peringatan: String(d.peringatan || '').trim(),
        efek_samping: String(d.efek_samping || '').trim(),
        status: String(d.status || 'Draft').trim(),
        urutan: Number(d.urutan) || (LOCAL_SAMPLE_OBAT.length + 1),
        updated_at: new Date().toISOString(),
        updated_by: auth.email,
        fasilitas: []
      };
      LOCAL_SAMPLE_OBAT.push(newObat);
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, data: newObat, message: 'Obat berhasil ditambahkan ke katalog.' };
    }

    case 'update_obat': {
      const id = String(payload.id || (payload.obatData && payload.obatData.id) || '').trim();
      const d = payload.obatData || payload;
      const idx = LOCAL_SAMPLE_OBAT.findIndex(o => String(o.id).trim() === id);
      if (idx === -1) {
        return { success: false, error: 'Obat tidak ditemukan.' };
      }
      const existing = LOCAL_SAMPLE_OBAT[idx];
      const updated = {
        ...existing,
        nama_obat: d.nama_obat !== undefined ? String(d.nama_obat).trim() : existing.nama_obat,
        nama_produsen: d.nama_produsen !== undefined ? String(d.nama_produsen).trim() : existing.nama_produsen,
        bentuk_sediaan: d.bentuk_sediaan !== undefined ? String(d.bentuk_sediaan).trim() : existing.bentuk_sediaan,
        jenis: d.jenis !== undefined ? String(d.jenis).trim() : existing.jenis,
        kode_kfa: d.kode_kfa !== undefined ? String(d.kode_kfa).trim() : existing.kode_kfa,
        golongan: d.golongan !== undefined ? String(d.golongan).trim() : existing.golongan,
        indikasi_ringkas: d.indikasi_ringkas !== undefined ? String(d.indikasi_ringkas).trim() : existing.indikasi_ringkas,
        deskripsi: d.deskripsi !== undefined ? String(d.deskripsi).trim() : existing.deskripsi,
        indikasi_umum: d.indikasi_umum !== undefined ? String(d.indikasi_umum).trim() : existing.indikasi_umum,
        komposisi: d.komposisi !== undefined ? String(d.komposisi).trim() : existing.komposisi,
        peringatan: d.peringatan !== undefined ? String(d.peringatan).trim() : existing.peringatan,
        efek_samping: d.efek_samping !== undefined ? String(d.efek_samping).trim() : existing.efek_samping,
        status: d.status !== undefined ? String(d.status).trim() : existing.status,
        urutan: d.urutan !== undefined ? Number(d.urutan) : existing.urutan,
        updated_at: new Date().toISOString(),
        updated_by: auth.email
      };
      LOCAL_SAMPLE_OBAT[idx] = updated;
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, data: updated, message: 'Obat berhasil diperbarui.' };
    }

    case 'delete_obat': {
      const id = String(payload.id || (payload.obatData && payload.obatData.id) || '').trim();
      const idx = LOCAL_SAMPLE_OBAT.findIndex(o => String(o.id).trim() === id);
      if (idx === -1) {
        return { success: false, error: 'Obat tidak ditemukan.' };
      }
      LOCAL_SAMPLE_OBAT.splice(idx, 1);
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, message: 'Obat berhasil dihapus beserta fasilitas terkait.' };
    }

    case 'create_fasilitas_obat': {
      const d = payload.fasilitasData || payload;
      const obatId = String(d.obat_id || '').trim();
      const obat = LOCAL_SAMPLE_OBAT.find(o => String(o.id).trim() === obatId);
      if (!obat) {
        return { success: false, error: 'Obat induk tidak ditemukan.' };
      }
      if (!d.nama_fasilitas || !String(d.nama_fasilitas).trim()) {
        return { success: false, error: "Field 'nama_fasilitas' wajib diisi." };
      }
      const newFas = {
        id: 'fas-' + Date.now(),
        obat_id: obatId,
        nama_fasilitas: String(d.nama_fasilitas).trim(),
        provinsi: String(d.provinsi || 'Jawa Tengah').trim(),
        alamat: String(d.alamat || '').trim(),
        telepon: String(d.telepon || '').trim(),
        whatsapp: String(d.whatsapp || '').trim(),
        harga: Number(d.harga) || 0,
        tanggal_diperbarui: new Date().toISOString().slice(0, 10)
      };
      if (!obat.fasilitas) obat.fasilitas = [];
      obat.fasilitas.push(newFas);
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, data: newFas, message: 'Fasilitas obat berhasil ditambahkan.' };
    }

    case 'update_fasilitas_obat': {
      const id = String(payload.id || (payload.fasilitasData && payload.fasilitasData.id) || '').trim();
      const d = payload.fasilitasData || payload;
      let foundFas = null;
      for (const o of LOCAL_SAMPLE_OBAT) {
        const fas = (o.fasilitas || []).find(f => String(f.id).trim() === id);
        if (fas) {
          if (d.nama_fasilitas !== undefined) fas.nama_fasilitas = String(d.nama_fasilitas).trim();
          if (d.provinsi !== undefined) fas.provinsi = String(d.provinsi).trim();
          if (d.alamat !== undefined) fas.alamat = String(d.alamat).trim();
          if (d.telepon !== undefined) fas.telepon = String(d.telepon).trim();
          if (d.whatsapp !== undefined) fas.whatsapp = String(d.whatsapp).trim();
          if (d.harga !== undefined) fas.harga = Number(d.harga) || 0;
          fas.tanggal_diperbarui = new Date().toISOString().slice(0, 10);
          foundFas = fas;
          break;
        }
      }
      if (!foundFas) {
        return { success: false, error: 'Fasilitas obat tidak ditemukan.' };
      }
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, data: foundFas, message: 'Fasilitas obat berhasil diperbarui.' };
    }

    case 'delete_fasilitas_obat': {
      const id = String(payload.id || (payload.fasilitasData && payload.fasilitasData.id) || '').trim();
      let deleted = false;
      for (const o of LOCAL_SAMPLE_OBAT) {
        if (!o.fasilitas) continue;
        const idx = o.fasilitas.findIndex(f => String(f.id).trim() === id);
        if (idx !== -1) {
          o.fasilitas.splice(idx, 1);
          deleted = true;
          break;
        }
      }
      if (!deleted) {
        return { success: false, error: 'Fasilitas obat tidak ditemukan.' };
      }
      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return { success: true, message: 'Fasilitas obat berhasil dihapus.' };
    }

    case 'import_obat_bulk': {
      const items = Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.obatList) ? payload.obatList : []);
      let successCount = 0;
      let failedCount = 0;
      const failedRows = [];

      items.forEach((item, index) => {
        const rowNum = index + 1;
        const nama = String(item.nama_obat || '').trim();
        if (!nama) {
          failedCount++;
          failedRows.push({ row: rowNum, error: "Field 'nama_obat' wajib diisi" });
          return;
        }
        if (item.kode_kfa && !/^\d+$/.test(String(item.kode_kfa).trim())) {
          failedCount++;
          failedRows.push({ row: rowNum, error: "Field 'kode_kfa' hanya boleh angka" });
          return;
        }

        const newId = 'obat-import-' + Date.now() + '-' + index;
        LOCAL_SAMPLE_OBAT.push({
          id: newId,
          nama_obat: nama,
          nama_produsen: String(item.nama_produsen || '').trim(),
          bentuk_sediaan: String(item.bentuk_sediaan || 'Injeksi').trim(),
          jenis: String(item.jenis || 'Generik').trim(),
          kode_kfa: String(item.kode_kfa || '').trim(),
          golongan: String(item.golongan || 'Obat Keras').trim(),
          indikasi_ringkas: String(item.indikasi_ringkas || '').trim(),
          deskripsi: String(item.deskripsi || '').trim(),
          indikasi_umum: String(item.indikasi_umum || '').trim(),
          komposisi: String(item.komposisi || '').trim(),
          peringatan: String(item.peringatan || '').trim(),
          efek_samping: String(item.efek_samping || '').trim(),
          status: String(item.status || 'Draft').trim(),
          urutan: Number(item.urutan) || (LOCAL_SAMPLE_OBAT.length + 1),
          updated_at: new Date().toISOString(),
          updated_by: auth.email,
          fasilitas: []
        });
        successCount++;
      });

      saveLocalObat(LOCAL_SAMPLE_OBAT);
      return {
        success: true,
        totalImported: successCount,
        failedCount: failedCount,
        failedRows: failedRows,
        data: {
          total: items.length,
          totalImported: successCount,
          successCount: successCount,
          failedCount: failedCount,
          failedRows: failedRows
        },
        message: `Impor selesai: ${successCount} obat berhasil ditambahkan, ${failedCount} baris gagal.`
      };
    }

    default:
      return { success: false, error: 'Aksi obat tidak dikenali: ' + action };
  }
}

// ============================================================================
// SIMULATOR DATASET REGIMEN KEMOTERAPI LOKAL (FALLBACK JIKA REMOTE GAS BELUM DIPERBARUI)
// ============================================================================
const DEFAULT_SAMPLE_REGIMENS = [
  {
    id: "reg-folfox",
    nama_regimen: "FOLFOX (Fluorouracil + Leucovorin + Oxaliplatin)",
    default_interval: 14,
    default_siklus: 12,
    deskripsi: "Protokol kemoterapi kombinasi lini pertama untuk kanker kolorektal (usus besar/rektum) stadium ajuvan atau lanjut. Diberikan secara siklikal setiap 14 hari (2 minggu) dengan evaluasi profil darah tepi dan respons klinis berkala.",
    active: true,
    urutan: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  },
  {
    id: "reg-gem-cis",
    nama_regimen: "Gemcitabine + Cisplatin",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi kombinasi berbasis platinum untuk karsinoma saluran kemih, kandung kemih, karsinoma saluran empedu (kolangiokarsinoma), serta kanker paru. Diberikan setiap 21 hari (3 minggu) dengan hidrasi cairan optimal.",
    active: true,
    urutan: 2,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  },
  {
    id: "reg-ac-t",
    nama_regimen: "AC-T (Doxorubicin + Cyclophosphamide diikuti Paclitaxel)",
    default_interval: 21,
    default_siklus: 8,
    deskripsi: "Protokol ajuvan standar kanker payudara: 4 siklus AC (interval 21 hari) dilanjutkan 4 siklus Paclitaxel/Docetaxel (interval 21 hari). Memerlukan pemantauan fungsi kardiovaskular (ECHO) dan hematologi rutin sebelum tiap siklus.",
    active: true,
    urutan: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  },
  {
    id: "reg-pac-carb",
    nama_regimen: "Paclitaxel + Carboplatin",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi lini pertama kanker ovarium epitelial dan kanker paru bukan sel kecil (NSCLC). Siklus infus diberikan setiap 21 hari (3 minggu) disertai premedikasi pencegah reaksi hipersensitivitas.",
    active: true,
    urutan: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  },
  {
    id: "reg-chop",
    nama_regimen: "CHOP (Cyclophosphamide + Doxorubicin + Vincristine + Prednisone)",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi kuratif lini utama untuk limfoma non-Hodgkin (NHL). Diberikan setiap 21 hari (3 minggu) dengan premedikasi antiemetik profilaksis dan kortikosteroid terjadwal.",
    active: true,
    urutan: 5,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  },
  {
    id: "reg-cis-5fu",
    nama_regimen: "Cisplatin + 5-Fluorouracil (5-FU)",
    default_interval: 28,
    default_siklus: 6,
    deskripsi: "Protokol kemoradioterapi untuk karsinoma nasofaring (KNF), kanker kepala-leher stadium lanjut, dan kanker serviks. Diberikan setiap 28 hari (4 minggu) dengan hidrasi agresif dan pemantauan fungsi ginjal.",
    active: true,
    urutan: 6,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: "admin.onkologi@rs-medica.id"
  }
];

const REGIMEN_DATA_FILE = path.join(process.cwd(), 'data', 'regimen_kemo.json');

function loadLocalRegimens() {
  try {
    if (fs.existsSync(REGIMEN_DATA_FILE)) {
      const content = fs.readFileSync(REGIMEN_DATA_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_SAMPLE_REGIMENS));
}

function saveLocalRegimens(list) {
  try {
    const dir = path.dirname(REGIMEN_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(REGIMEN_DATA_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

let LOCAL_SAMPLE_REGIMENS = loadLocalRegimens();

function getLocalRegimenList() {
  const activeOnly = LOCAL_SAMPLE_REGIMENS
    .filter(r => r.active !== false)
    .sort((a, b) => a.urutan - b.urutan);
  return { success: true, data: activeOnly };
}

function handleLocalAdminRegimenAction(payload) {
  const action = payload.action || '';
  const token = payload.token || '';
  const auth = validateTokenInServer(token);
  if (!auth.valid) {
    return { success: false, error: 'Akses ditolak: ' + auth.message };
  }

  const isSuperOrAdmin = auth.role === 'super_admin' || auth.role === 'admin';
  if (!isSuperOrAdmin) {
    return { success: false, error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengelola regimen kemoterapi.' };
  }

  switch (action) {
    case 'admin_get_regimen_list': {
      const list = [...LOCAL_SAMPLE_REGIMENS].sort((a, b) => a.urutan - b.urutan);
      return { success: true, data: list };
    }
    case 'create_regimen': {
      const d = payload.data || payload.regimenData || payload;
      const nama = String(d.nama_regimen || '').trim();
      const interval = Number(d.default_interval);
      const siklus = Number(d.default_siklus);
      if (!nama) return { success: false, message: 'Nama regimen wajib diisi' };
      if (isNaN(interval) || interval < 1 || interval > 365) return { success: false, message: 'Default interval harus 1-365 hari' };
      if (isNaN(siklus) || siklus < 1 || siklus > 100) return { success: false, message: 'Default siklus harus 1-100 siklus' };

      const newId = 'reg-' + Date.now().toString(36);
      const item = {
        id: newId,
        nama_regimen: nama,
        default_interval: interval,
        default_siklus: siklus,
        deskripsi: String(d.deskripsi || '').trim(),
        active: d.active !== false,
        urutan: Number(d.urutan) || (LOCAL_SAMPLE_REGIMENS.length + 1),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: auth.email
      };
      LOCAL_SAMPLE_REGIMENS.push(item);
      saveLocalRegimens(LOCAL_SAMPLE_REGIMENS);
      return { success: true, message: 'Regimen kemoterapi baru berhasil ditambahkan', data: item };
    }
    case 'update_regimen': {
      const id = String(payload.id || '').trim();
      const d = payload.data || payload.regimenData || payload;
      const item = LOCAL_SAMPLE_REGIMENS.find(r => r.id === id);
      if (!item) return { success: false, message: 'Regimen tidak ditemukan' };
      if (d.nama_regimen !== undefined) item.nama_regimen = String(d.nama_regimen).trim();
      if (d.default_interval !== undefined) item.default_interval = Number(d.default_interval);
      if (d.default_siklus !== undefined) item.default_siklus = Number(d.default_siklus);
      if (d.deskripsi !== undefined) item.deskripsi = String(d.deskripsi || '').trim();
      if (d.active !== undefined) item.active = Boolean(d.active);
      if (d.urutan !== undefined) item.urutan = Number(d.urutan);
      item.updated_at = new Date().toISOString();
      item.updated_by = auth.email;
      saveLocalRegimens(LOCAL_SAMPLE_REGIMENS);
      return { success: true, message: 'Regimen kemoterapi berhasil diperbarui', data: item };
    }
    case 'toggle_regimen': {
      const id = String(payload.id || '').trim();
      const item = LOCAL_SAMPLE_REGIMENS.find(r => r.id === id);
      if (!item) return { success: false, message: 'Regimen tidak ditemukan' };
      item.active = Boolean(payload.active !== undefined ? payload.active : (payload.data && payload.data.active));
      item.updated_at = new Date().toISOString();
      item.updated_by = auth.email;
      saveLocalRegimens(LOCAL_SAMPLE_REGIMENS);
      return { success: true, message: 'Status regimen berhasil diubah', data: item };
    }
    case 'delete_regimen': {
      const id = String(payload.id || '').trim();
      const idx = LOCAL_SAMPLE_REGIMENS.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, message: 'Regimen tidak ditemukan' };
      LOCAL_SAMPLE_REGIMENS.splice(idx, 1);
      saveLocalRegimens(LOCAL_SAMPLE_REGIMENS);
      return { success: true, message: 'Regimen kemoterapi berhasil dihapus' };
    }
    default:
      return { success: false, error: 'Aksi regimen tidak dikenali: ' + action };
  }
}

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`[HTTP SERVER] Portal Web RSUD Prof. Dr. Margono Soekarjo: http://localhost:${PORT}`);
  console.log(`[CHATBOT] Asisten Virtual Web BOKU: Aktif Siap Melayani 24 Jam`);
  console.log(`======================================================\n`);
});
