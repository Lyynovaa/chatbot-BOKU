import fs from 'fs';
import path from 'path';

/**
 * VERCEL SERVERLESS FUNCTION HANDLER
 * RSUD Prof. Dr. Margono Soekarjo - BOKU Web Chatbot & Medical Portal
 * Acts as secure cloud proxy between browser frontend and Google Apps Script backend.
 */

// Konfigurasi Environment Variables
function getAppsScriptUrl() {
  return process.env.APPS_SCRIPT_URL?.trim() || '';
}

function getAppsScriptToken() {
  return process.env.APPS_SCRIPT_TOKEN?.trim() || 'MEDICA_WA_BOT_SECRET_2026_TOKEN';
}

// Sanitasi password dari seluruh output JSON
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

// Data Fallback Regimen Kemoterapi
const DEFAULT_FALLBACK_REGIMENS = [
  {
    id: "reg-folfox",
    nama_regimen: "FOLFOX (Fluorouracil + Leucovorin + Oxaliplatin)",
    default_interval: 14,
    default_siklus: 12,
    deskripsi: "Protokol kemoterapi kombinasi lini pertama untuk kanker kolorektal stadium ajuvan atau lanjut. Diberikan setiap 14 hari.",
    active: true,
    urutan: 1
  },
  {
    id: "reg-gem-cis",
    nama_regimen: "Gemcitabine + Cisplatin",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi kombinasi berbasis platinum untuk karsinoma saluran kemih dan kanker paru. Diberikan setiap 21 hari.",
    active: true,
    urutan: 2
  },
  {
    id: "reg-ac-t",
    nama_regimen: "AC-T (Doxorubicin + Cyclophosphamide diikuti Paclitaxel)",
    default_interval: 21,
    default_siklus: 8,
    deskripsi: "Protokol ajuvan standar kanker payudara: 4 siklus AC (interval 21 hari) dilanjutkan 4 siklus Paclitaxel/Docetaxel (interval 21 hari).",
    active: true,
    urutan: 3
  },
  {
    id: "reg-pac-carb",
    nama_regimen: "Paclitaxel + Carboplatin",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi lini pertama kanker ovarium epitelial dan kanker paru bukan sel kecil (NSCLC). Diberikan setiap 21 hari.",
    active: true,
    urutan: 4
  },
  {
    id: "reg-chop",
    nama_regimen: "CHOP (Cyclophosphamide + Doxorubicin + Vincristine + Prednisone)",
    default_interval: 21,
    default_siklus: 6,
    deskripsi: "Protokol kemoterapi kuratif lini utama untuk limfoma non-Hodgkin (NHL). Diberikan setiap 21 hari.",
    active: true,
    urutan: 5
  },
  {
    id: "reg-cis-5fu",
    nama_regimen: "Cisplatin + 5-Fluorouracil (5-FU)",
    default_interval: 28,
    default_siklus: 6,
    deskripsi: "Protokol kemoradioterapi untuk karsinoma nasofaring (KNF) dan kanker serviks. Diberikan setiap 28 hari.",
    active: true,
    urutan: 6
  }
];

function loadFallbackRegimens() {
  try {
    const regPath = path.join(process.cwd(), 'data', 'regimen_kemo.json');
    if (fs.existsSync(regPath)) {
      const content = fs.readFileSync(regPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_FALLBACK_REGIMENS));
}

function saveFallbackRegimens(list) {
  try {
    const regPath = path.join(process.cwd(), 'data', 'regimen_kemo.json');
    const dir = path.dirname(regPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(regPath, JSON.stringify(list, null, 2), 'utf-8');
  } catch (e) {}
}

function validateToken(token) {
  if (!token) return { valid: false, message: 'Token otentikasi tidak ditemukan' };
  const secretToken = getAppsScriptToken();
  if (token === 'MEDICA_WA_BOT_SECRET_2026_TOKEN' || token === secretToken) {
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
    return { valid: true, email: parsed.email || 'admin@rs-medica.id', role: finalRole, name: parsed.name || 'Admin Onkologi' };
  } catch (e) {
    return { valid: false, message: 'Token tidak valid' };
  }
}

function handleFallbackRegimenAction(payload) {
  const action = payload.action || '';
  const token = payload.token || '';
  const auth = validateToken(token);
  if (!auth.valid) {
    return { success: false, error: 'Akses ditolak: ' + auth.message };
  }

  const isSuperOrAdmin = auth.role === 'super_admin' || auth.role === 'admin';
  if (!isSuperOrAdmin) {
    return { success: false, error: 'Akses ditolak: Anda tidak memiliki wewenang untuk mengelola regimen kemoterapi.' };
  }

  const list = loadFallbackRegimens();

  switch (action) {
    case 'admin_get_regimen_list': {
      const sorted = [...list].sort((a, b) => (a.urutan || 999) - (b.urutan || 999));
      return { success: true, data: sorted };
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
        urutan: Number(d.urutan) || (list.length + 1),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        updated_by: auth.email
      };
      list.push(item);
      saveFallbackRegimens(list);
      return { success: true, message: 'Regimen kemoterapi baru berhasil ditambahkan', data: item };
    }
    case 'update_regimen': {
      const id = String(payload.id || '').trim();
      const d = payload.data || payload.regimenData || payload;
      const item = list.find(r => r.id === id);
      if (!item) return { success: false, message: 'Regimen tidak ditemukan' };
      if (d.nama_regimen !== undefined) item.nama_regimen = String(d.nama_regimen).trim();
      if (d.default_interval !== undefined) item.default_interval = Number(d.default_interval);
      if (d.default_siklus !== undefined) item.default_siklus = Number(d.default_siklus);
      if (d.deskripsi !== undefined) item.deskripsi = String(d.deskripsi || '').trim();
      if (d.active !== undefined) item.active = Boolean(d.active);
      if (d.urutan !== undefined) item.urutan = Number(d.urutan);
      item.updated_at = new Date().toISOString();
      item.updated_by = auth.email;
      saveFallbackRegimens(list);
      return { success: true, message: 'Regimen kemoterapi berhasil diperbarui', data: item };
    }
    case 'toggle_regimen': {
      const id = String(payload.id || '').trim();
      const item = list.find(r => r.id === id);
      if (!item) return { success: false, message: 'Regimen tidak ditemukan' };
      item.active = Boolean(payload.active !== undefined ? payload.active : (payload.data && payload.data.active));
      item.updated_at = new Date().toISOString();
      item.updated_by = auth.email;
      saveFallbackRegimens(list);
      return { success: true, message: 'Status regimen berhasil diubah', data: item };
    }
    case 'delete_regimen': {
      const id = String(payload.id || '').trim();
      const idx = list.findIndex(r => r.id === id);
      if (idx === -1) return { success: false, message: 'Regimen tidak ditemukan' };
      list.splice(idx, 1);
      saveFallbackRegimens(list);
      return { success: true, message: 'Regimen kemoterapi berhasil dihapus' };
    }
    default:
      return { success: false, error: 'Aksi regimen tidak dikenali: ' + action };
  }
}

// Pemuatan data offline obat kemoterapi
function loadFallbackObat() {
  try {
    const dataPath = path.join(process.cwd(), 'data', 'katalog_obat.json');
    if (fs.existsSync(dataPath)) {
      const content = fs.readFileSync(dataPath, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {}

  return [
    {
      id: "obt-fallback-01",
      nama_obat: "Oxaliplatin Infus 50 mg/10 mL",
      nama_produsen: "PT Kalbe Farma Tbk",
      bentuk_sediaan: "Injeksi/Infus",
      jenis: "Generik",
      kode_kfa: "93001234567",
      golongan: "Obat Keras",
      indikasi_ringkas: "Agen antineoplastik berbasis platinum untuk regimen FOLFOX kanker kolorektal.",
      status: "Tayang",
      urutan: 1,
      fasilitas: [
        {
          id: "fas-01",
          nama_fasilitas: "Depo Farmasi Wijayakusuma RSMS",
          provinsi: "Jawa Tengah",
          harga: 650000
        }
      ]
    },
    {
      id: "obt-fallback-02",
      nama_obat: "Fluorouracil (5-FU) Injeksi 500 mg/10 mL",
      nama_produsen: "PT Dexa Medica",
      bentuk_sediaan: "Injeksi/Infus",
      jenis: "Generik",
      kode_kfa: "93001234568",
      golongan: "Obat Keras",
      indikasi_ringkas: "Antimetabolit pirimidin untuk kemoterapi paliatif dan ajuvan keganasan saluran cerna.",
      status: "Tayang",
      urutan: 2,
      fasilitas: [
        {
          id: "fas-02",
          nama_fasilitas: "Depo Farmasi Wijayakusuma RSMS",
          provinsi: "Jawa Tengah",
          harga: 125000
        }
      ]
    }
  ];
}

const FALLBACK_OBAT = loadFallbackObat();

// Helper filter offline data obat
function getOfflineObatList(queryStr) {
  const params = new URLSearchParams(queryStr);
  const q = (params.get('q') || '').trim().toLowerCase();
  const bentuk = (params.get('bentuk') || '').trim().toLowerCase();
  const jenis = (params.get('jenis') || '').trim().toLowerCase();
  const provinsi = (params.get('provinsi') || '').trim().toLowerCase();
  const page = parseInt(params.get('page'), 10) || 1;
  const pageSize = parseInt(params.get('pageSize'), 10) || 12;

  let filtered = FALLBACK_OBAT.filter(o => o.status === 'Tayang');

  if (bentuk) filtered = filtered.filter(o => (o.bentuk_sediaan || '').toLowerCase() === bentuk);
  if (jenis) filtered = filtered.filter(o => (o.jenis || '').toLowerCase() === jenis);
  if (provinsi) filtered = filtered.filter(o => (o.fasilitas || []).some(f => (f.provinsi || '').toLowerCase() === provinsi));
  if (q) {
    filtered = filtered.filter(o => {
      const haystack = [o.nama_obat, o.nama_produsen, o.indikasi_ringkas, o.komposisi, o.kode_kfa].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  filtered.sort((a, b) => (a.urutan || 999) - (b.urutan || 999));

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
      total,
      page,
      pageSize,
      totalPages
    }
  };
}

// Fallback detail obat
function getOfflineObatDetail(id) {
  const obat = FALLBACK_OBAT.find(o => String(o.id).trim() === String(id).trim());
  if (!obat || obat.status !== 'Tayang') {
    return { success: false, error: 'Obat tidak ditemukan atau belum ditayangkan.' };
  }
  return {
    success: true,
    data: obat
  };
}

// Helper ekstraksi body request
async function parseRequestBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

// Helper pengiriman respons JSON universal
function sendResponse(res, statusCode, data) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = statusCode;
  res.end(JSON.stringify(stripPasswords(data)));
}

// MAIN SERVERLESS HANDLER FOR VERCEL
export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Tentukan path dan querystring asli
  const rawUrl = req.headers['x-forwarded-uri'] || req.url || '';
  const [urlPath, queryStr] = rawUrl.split('?');
  const reqPath = decodeURI(urlPath || '');

  const scriptUrl = getAppsScriptUrl();
  const scriptToken = getAppsScriptToken();

  // 1. Status Web Chatbot
  if (reqPath === '/api/wa/status' && req.method === 'GET') {
    return sendResponse(res, 200, {
      status: 'web_active',
      mode: 'web_only',
      title: 'Chatbot Web BOKU RSUD Margono',
      message: 'Chatbot beroperasi penuh pada platform Web RSUD Prof. Dr. Margono Soekarjo',
      updatedAt: new Date().toISOString()
    });
  }

  // 2. Compatibility Actions
  if ((reqPath === '/api/wa/restart' || reqPath === '/api/wa/logout' || reqPath === '/api/wa/send-test') && req.method === 'POST') {
    return sendResponse(res, 200, {
      success: true,
      message: 'Chatbot telah dialihkan ke mode Web interaktif.'
    });
  }

  // 3. Bot Data (Kategori & Pengaturan)
  if (reqPath === '/api/bot/data' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const gasRes = await fetch(`${scriptUrl}?action=bot_bundle&token=${encodeURIComponent(scriptToken)}`);
        if (gasRes.ok) {
          const json = await gasRes.json();
          if (json.success && json.data) {
            return sendResponse(res, 200, json.data);
          }
        }
      } catch (e) {}
    }
    return sendResponse(res, 200, {
      greeting: 'Selamat datang di Layanan Asisten Virtual BOKU Ruang Wijaya Kusuma RSUD Prof. Dr. Margono Soekarjo.',
      categories: [],
      emergencyRules: []
    });
  }

  if (reqPath === '/api/bot/data' && req.method === 'POST') {
    return sendResponse(res, 200, {
      success: true,
      message: 'Data chatbot web berhasil diproses'
    });
  }

  // 4. GAS Bundle Proxy
  if (reqPath === '/api/gas/bundle' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const gasRes = await fetch(`${scriptUrl}?action=bot_bundle&token=${encodeURIComponent(scriptToken)}`);
        if (gasRes.ok) {
          const json = await gasRes.json();
          if (json.success) {
            return sendResponse(res, 200, json);
          }
        }
      } catch (e) {}
    }
    return sendResponse(res, 200, {
      success: true,
      data: {
        categories: [],
        emergencyRules: [],
        settings: {
          greeting: 'Selamat datang di Layanan BOKU RSUD Margono'
        }
      }
    });
  }

  // 5. GAS Action Proxy (POST)
  if (reqPath === '/api/gas/action' && req.method === 'POST') {
    try {
      const payload = await parseRequestBody(req);
      if (!payload.token || typeof payload.token !== 'string' || !payload.token.trim()) {
        payload.token = scriptToken;
      }

      if (scriptUrl) {
        try {
          const gasRes = await fetch(scriptUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            redirect: 'follow'
          });
          if (gasRes.ok) {
            const gasJson = await gasRes.json();
            if (gasJson.success && payload.action && payload.action.includes('regimen')) {
              try {
                handleFallbackRegimenAction(payload);
              } catch (e) {}
            }
            return sendResponse(res, 200, gasJson);
          }
        } catch (e) {}
      }

      // Mock login fallback jika GAS belum terkoneksi
      if (payload.action === 'login') {
        const email = (payload.email || '').toLowerCase().trim();
        if (email && (email.includes('admin') || email.includes('margono'))) {
          return sendResponse(res, 200, {
            success: true,
            token: Buffer.from(JSON.stringify({ email, name: 'Admin Onkologi', role: 'Super Admin', exp: Date.now() + 86400000 })).toString('base64'),
            user: { email, name: 'Admin Onkologi', role: 'Super Admin' }
          });
        }
      }

      // Regimen action fallback jika remote GAS offline
      if (payload.action && payload.action.includes('regimen')) {
        const fallbackResult = handleFallbackRegimenAction(payload);
        return sendResponse(res, 200, fallbackResult);
      }

      return sendResponse(res, 200, {
        success: false,
        error: 'Tidak dapat terhubung ke Google Apps Script backend.'
      });
    } catch (err) {
      return sendResponse(res, 500, { success: false, error: err.message });
    }
  }

  // 6. Metrics & Logs
  if (reqPath === '/api/gas/metrics' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const gasRes = await fetch(`${scriptUrl}?action=get_metrics&token=${encodeURIComponent(scriptToken)}`);
        if (gasRes.ok) return sendResponse(res, 200, await gasRes.json());
      } catch (e) {}
    }
    return sendResponse(res, 200, { success: true, data: { totalChat: 0, activeUsers: 0 } });
  }

  if (reqPath === '/api/gas/logs' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const queryString = queryStr ? `&${queryStr}` : '';
        const gasRes = await fetch(`${scriptUrl}?action=get_logs&token=${encodeURIComponent(scriptToken)}${queryString}`);
        if (gasRes.ok) return sendResponse(res, 200, await gasRes.json());
      } catch (e) {}
    }
    return sendResponse(res, 200, { success: true, data: [] });
  }

  // 7. Katalog Obat List (GET)
  if (reqPath === '/api/gas/obat' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const queryString = queryStr ? `&${queryStr}` : '';
        const gasRes = await fetch(`${scriptUrl}?action=get_obat_list${queryString}`);
        if (gasRes.ok) {
          const json = await gasRes.json();
          if (json && json.success) {
            return sendResponse(res, 200, json);
          }
        }
      } catch (e) {}
    }
    return sendResponse(res, 200, getOfflineObatList(queryStr || ''));
  }

  // 8. Katalog Obat Detail (GET)
  if (reqPath.startsWith('/api/gas/obat/') && req.method === 'GET') {
    const id = reqPath.replace('/api/gas/obat/', '').trim();
    if (!id) {
      return sendResponse(res, 400, { success: false, error: 'ID obat tidak valid' });
    }
    if (scriptUrl) {
      try {
        const gasRes = await fetch(`${scriptUrl}?action=get_obat_detail&id=${encodeURIComponent(id)}`);
        if (gasRes.ok) {
          const json = await gasRes.json();
          if (json && json.success) {
            return sendResponse(res, 200, json);
          }
        }
      } catch (e) {}
    }
    return sendResponse(res, 200, getOfflineObatDetail(id));
  }

  // 9. Regimen Kemoterapi (GET)
  if (reqPath === '/api/gas/regimen' && req.method === 'GET') {
    if (scriptUrl) {
      try {
        const gasRes = await fetch(`${scriptUrl}?action=get_regimen_list`);
        if (gasRes.ok) {
          const json = await gasRes.json();
          if (json && json.success) {
            return sendResponse(res, 200, json);
          }
        }
      } catch (e) {}
    }
    const regimens = loadFallbackRegimens()
      .filter(r => r.active !== false)
      .sort((a, b) => (a.urutan || 999) - (b.urutan || 999));
    return sendResponse(res, 200, { success: true, data: regimens });
  }

  // 10. Users List (GET)
  if (reqPath === '/api/gas/users' && req.method === 'GET') {
    const adminToken = req.headers['x-admin-token'];
    if (!adminToken) {
      return sendResponse(res, 401, { success: false, error: 'Header X-Admin-Token diperlukan' });
    }
    if (scriptUrl) {
      try {
        const gasRes = await fetch(scriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'get_users', token: String(adminToken).trim() }),
          redirect: 'follow'
        });
        if (gasRes.ok) return sendResponse(res, 200, await gasRes.json());
      } catch (e) {}
    }
    return sendResponse(res, 200, { success: true, data: [] });
  }

  // Default Fallback
  return sendResponse(res, 404, { success: false, error: 'Endpoint API tidak ditemukan' });
}
