/**
 * CONFIG.GS - KONFIGURASI GLOBAL SISTEM
 * Bot WhatsApp Rumah Sakit (RS Medica)
 * Berdasarkan PRD Bagian 8, 10, & 11
 */

var CONFIG = {
  // Nama file spreadsheet di Google Drive Anda (Contoh: "Chatbot-RS")
  SPREADSHEET_NAME: "Chatbot-RS", 

  // ID Spreadsheet Google Drive (Opsional jika Apps Script dibuat terpisah/Standalone Script)
  // Contoh dari URL spreadsheet: https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit
  SPREADSHEET_ID: "",

  // Token rahasia untuk otentikasi komunikasi server Baileys Node.js ke Apps Script (PRD Bagian 10)
  API_SECRET_TOKEN: "MEDICA_WA_BOT_SECRET_2026_TOKEN",

  // Durasi validitas token sesi admin (jam)
  SESSION_TTL_HOURS: 24,

  // Nama-nama sheet / tab database dalam Google Sheets
  SHEETS: {
    USERS: "users",
    CATEGORIES: "categories",
    FAQS: "faqs",
    SETTINGS: "settings",
    EVENT_LOGS: "event_logs",
    AUDIT_LOGS: "audit_logs",
    OBAT: "obat",
    FASILITAS_OBAT: "fasilitas_obat",
    REGIMEN: "regimen_kemo"
  },

  // Whitelist admin default untuk inisialisasi awal (PRD A-01 / A-02)
  // CATATAN KEAMANAN: Password tidak boleh di-hardcode. Harus diatur via environment atau setup awal.
  DEFAULT_ADMINS: [
    {
      email: "admin.onkologi@rs-medica.id",
      password: "",
      name: "Dr. Maya (Unit Onkologi & Admin RS)",
      role: "Super Admin",
      active: true
    },
    {
      email: "direksi@rs-medica.id",
      password: "",
      name: "Direksi RS Medica",
      role: "Super Admin",
      active: true
    },
    {
      email: "perawat.jaga@rs-medica.id",
      password: "",
      name: "Ns. Hendra, S.Kep",
      role: "Admin Perawat",
      active: true
    }
  ],

  // Pengaturan default bot awal
  DEFAULT_SETTINGS: {
    greeting: "Halo Bapak/Ibu. Layanan ini memberi informasi umum seputar perawatan kemoterapi dan tidak menggantikan konsultasi dokter.",
    fallback: "Maaf, pilihan tidak dikenali. Silakan ketik angka menu yang tersedia atau ketik 0 untuk kembali ke menu utama.",
    operatingHours: "Senin - Sabtu: 08.00 - 16.00 WIB",
    emergencyHotline: "(021) 555-0911",
    ambulance: "118 / 119",
    hospitalAddress: "Jl. Kesehatan No. 88, Gedung Utama Lt. 1"
  },

  // Daftar Regimen Kemoterapi default untuk inisialisasi awal
  DEFAULT_REGIMENS: [
    {
      id: "reg-folfox",
      nama_regimen: "FOLFOX (Fluorouracil + Leucovorin + Oxaliplatin)",
      default_interval: 14,
      default_siklus: 12,
      deskripsi: "Protokol standar lini pertama kanker kolorektal. Interval siklus setiap 14 hari (2 minggu).",
      active: true,
      urutan: 1
    },
    {
      id: "reg-gem-cis",
      nama_regimen: "Gemcitabine + Cisplatin",
      default_interval: 21,
      default_siklus: 6,
      deskripsi: "Protokol kombinasi kanker saluran kemih, kandung kemih, dan saluran empedu. Siklus tiap 21 hari (3 minggu).",
      active: true,
      urutan: 2
    },
    {
      id: "reg-ac-t",
      nama_regimen: "AC-T (Doxorubicin + Cyclophosphamide diikuti Paclitaxel)",
      default_interval: 21,
      default_siklus: 8,
      deskripsi: "Protokol ajuvan standar kanker payudara: 4 siklus fase AC dilanjutkan 4 siklus fase T, interval 21 hari.",
      active: true,
      urutan: 3
    },
    {
      id: "reg-pac-carb",
      nama_regimen: "Paclitaxel + Carboplatin",
      default_interval: 21,
      default_siklus: 6,
      deskripsi: "Kemoterapi lini pertama kanker ovarium dan kanker paru bukan sel kecil (NSCLC). Siklus per 21 hari.",
      active: true,
      urutan: 4
    },
    {
      id: "reg-chop",
      nama_regimen: "CHOP (Cyclophosphamide + Doxorubicin + Vincristine + Prednisone)",
      default_interval: 21,
      default_siklus: 6,
      deskripsi: "Protokol lini utama limfoma non-Hodgkin (NHL). Siklus diberikan setiap 21 hari.",
      active: true,
      urutan: 5
    },
    {
      id: "reg-cis-5fu",
      nama_regimen: "Cisplatin + 5-Fluorouracil (5-FU)",
      default_interval: 28,
      default_siklus: 6,
      deskripsi: "Protokol kemoterapi untuk karsinoma nasofaring dan kanker kepala-leher. Siklus tiap 28 hari (4 minggu).",
      active: true,
      urutan: 6
    }
  ]
};
