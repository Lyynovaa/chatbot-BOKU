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
    EMERGENCY_RULES: "emergency_rules",
    EVENT_LOGS: "event_logs",
    AUDIT_LOGS: "audit_logs"
  },

  // Whitelist admin default untuk inisialisasi awal (PRD A-01 / A-02)
  DEFAULT_ADMINS: [
    {
      email: "admin.onkologi@rs-medica.id",
      password: "medica2026",
      name: "Dr. Maya (Unit Onkologi & Admin RS)",
      role: "Super Admin",
      active: true
    },
    {
      email: "superadmin@rs-medica.id",
      password: "admin2026",
      name: "Direksi RS Medica",
      role: "Super Admin",
      active: true
    },
    {
      email: "perawat.jaga@rs-medica.id",
      password: "perawat2026",
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

  // Protokol Panggilan Darurat IGD Default (PRD B-06 & Custom Emergency Management)
  DEFAULT_EMERGENCY_RULES: [
    {
      id: "emg-rule-1",
      title: "Hotline IGD & Triage 24 Jam",
      phone: "(021) 555-0911",
      ambulance: "118 / 119",
      location: "Gedung Utama Lt. 1, Jl. Kesehatan No. 88",
      keywords: "darurat, igd, sesak, nyeri dada, pingsan, perdarahan, kecelakaan, kejang, gawat",
      instructions: "Jika pasien mengalami keluhan akut seperti sesak napas berat, nyeri dada kiri, perdarahan hebat, atau penurunan kesadaran, SEGERA bawa ke IGD terdekat tanpa menunda. Jangan memberikan makanan/minuman pada pasien tidak sadar.",
      order: 1,
      is_primary: true,
      active: true
    },
    {
      id: "emg-rule-2",
      title: "Ambulans Siaga & Penjemputan Cito",
      phone: "(021) 555-0912",
      ambulance: "118 / 119 (Ext. 2)",
      location: "Posko Armada Ambulans Gedung B RS Medica",
      keywords: "ambulans, ambulance, penjemputan, antar pasien, jemput, evakuasi",
      instructions: "Armada ambulans RS Medica siaga 24 jam dengan tim medis emergency dan peralatan resusitasi lengkap. Hubungi nomor siaga untuk permintaan penjemputan cito segera ke lokasi Anda.",
      order: 2,
      is_primary: false,
      active: true
    },
    {
      id: "emg-rule-3",
      title: "Konsultasi Perawat Jaga Triase Krisis",
      phone: "(021) 555-0913",
      ambulance: "118 / 119",
      location: "Unit Triase Cepat Lt. 1 Sayap Barat",
      keywords: "triase, triage, perawat jaga darurat, krisis, darurat mental, kondisi kritis",
      instructions: "Layanan triase cepat untuk memandu keluarga pasien menentukan derajat kegawatan medis dan persiapan tindakan sebelum tiba di instalasi gawat darurat.",
      order: 3,
      is_primary: false,
      active: true
    }
  ]
};
