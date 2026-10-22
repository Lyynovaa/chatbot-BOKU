/**
 * DB.GS - MANAJEMEN DATABASE & GOOGLE SHEETS HELPER
 * Otomatis membuat tabel-tabel sheet jika belum ada saat Apps Script terhubung!
 */

/**
 * Mengambil instance Google Spreadsheet (aktif atau berdasarkan nama file SPREADSHEET_NAME)
 */
function getSpreadsheet() {
  // 1. Cek apakah script terpasang langsung pada spreadsheet aktif (Bound Script)
  try {
    var activeSs = SpreadsheetApp.getActiveSpreadsheet();
    if (activeSs) {
      return activeSs;
    }
  } catch (err) {}

  // 2. Cek apakah SPREADSHEET_ID disediakan secara spesifik
  if (CONFIG.SPREADSHEET_ID && CONFIG.SPREADSHEET_ID.trim() !== "") {
    try {
      return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID.trim());
    } catch (e) {
      Logger.log("[openById] " + e.message);
    }
  }

  // 3. Jika script terpisah, cari di Google Drive berdasarkan nama file SPREADSHEET_NAME
  if (CONFIG.SPREADSHEET_NAME && CONFIG.SPREADSHEET_NAME.trim() !== "") {
    try {
      var files = DriveApp.getFilesByName(CONFIG.SPREADSHEET_NAME.trim());
      while (files.hasNext()) {
        var file = files.next();
        if (file.getMimeType() === MimeType.GOOGLE_SHEETS) {
          return SpreadsheetApp.open(file);
        }
      }
    } catch (e) {
      Logger.log("[DriveApp] " + e.message);
    }
  }

  throw new Error("Spreadsheet \"" + (CONFIG.SPREADSHEET_NAME || "Chatbot-RS") + "\" tidak ditemukan di Google Drive.");
}

/**
 * Trigger Otomatis: Berjalan otomatis begitu spreadsheet dibuka!
 */
function onOpen(e) {
  ensureDatabaseExists();

  // Tambahkan menu khusus di bilah atas Google Sheets
  try {
    SpreadsheetApp.getUi()
      .createMenu("Bot RS Medica")
      .addItem("Cek & Buat Tabel Otomatis", "ensureDatabaseExists")
      .addItem("Reset & Inisialisasi Ulang Database", "initDatabase")
      .addToUi();
  } catch (err) {
    // Abaikan jika dijalankan di luar antarmuka UI
  }
}

/**
 * Trigger Otomatis saat Apps Script pertama kali diotorisasi
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * FUNGSI UTAMA: Otomatis mendeteksi dan membuat seluruh tabel yang belum ada
 * Dipanggil otomatis saat spreadsheet dibuka, atau saat Web App pertama kali diakses!
 */
function ensureDatabaseExists() {
  var ss = getSpreadsheet();
  var createdSheets = [];

  // 1. Cek & Buat Tab Users
  var userSheet = ss.getSheetByName(CONFIG.SHEETS.USERS);
  if (!userSheet || userSheet.getLastRow() === 0) {
    userSheet = getOrCreateSheet(CONFIG.SHEETS.USERS);
    if (userSheet.getLastRow() === 0) {
      userSheet.appendRow(["email", "password", "name", "role", "active", "created_at"]);
      formatHeaderRow(userSheet, "#0f172a");
      CONFIG.DEFAULT_ADMINS.forEach(function(u) {
        userSheet.appendRow([u.email, u.password, u.name, u.role, u.active, new Date().toISOString()]);
      });
      createdSheets.push(CONFIG.SHEETS.USERS);
    }
  }

  // 2. Cek & Buat / Migrasi Tab Categories
  var catSheet = getOrCreateSheet(CONFIG.SHEETS.CATEGORIES);
  if (catSheet.getLastRow() === 0) {
    catSheet.appendRow(["id", "title", "order", "is_escalation", "is_emergency", "active", "created_at"]);
    formatHeaderRow(catSheet, "#0284c7");
    catSheet.appendRow(["cat-1", "Keluhan setelah kemoterapi", 1, false, false, true, new Date().toISOString()]);
    catSheet.appendRow(["cat-2", "Jadwal dan layanan poli onkologi", 2, false, false, true, new Date().toISOString()]);
    catSheet.appendRow(["cat-3", "Hubungi Perawat Jaga", 3, true, false, true, new Date().toISOString()]);
    createdSheets.push(CONFIG.SHEETS.CATEGORIES);
  } else {
    // Migrasi Skema: Pastikan kolom is_emergency ada di header categories
    var catData = catSheet.getDataRange().getValues();
    var headers = catData[0];
    var isEmgColIndex = -1;
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).toLowerCase() === "is_emergency") {
        isEmgColIndex = c;
        break;
      }
    }

    if (isEmgColIndex === -1) {
      // Sisipkan kolom sebelum active atau di posisi ke-5
      var activeColIndex = headers.indexOf("active");
      if (activeColIndex !== -1) {
        catSheet.insertColumnBefore(activeColIndex + 1);
        catSheet.getRange(1, activeColIndex + 1).setValue("is_emergency");
        for (var r = 1; r < catData.length; r++) {
          catSheet.getRange(r + 1, activeColIndex + 1).setValue(false);
        }
      } else {
        var newCol = headers.length + 1;
        catSheet.getRange(1, newCol).setValue("is_emergency");
        for (var r = 1; r < catData.length; r++) {
          catSheet.getRange(r + 1, newCol).setValue(false);
        }
      }
      formatHeaderRow(catSheet, "#0284c7");
    }
  }

  // 3. Cek & Buat Tab FAQs (Tanpa riwayat versi & rollback)
  var faqSheet = ss.getSheetByName(CONFIG.SHEETS.FAQS);
  if (!faqSheet || faqSheet.getLastRow() === 0) {
    faqSheet = getOrCreateSheet(CONFIG.SHEETS.FAQS);
    if (faqSheet.getLastRow() === 0) {
      faqSheet.appendRow(["id", "category_id", "menu_title", "answer", "order", "active", "modified_by", "updated_at"]);
      formatHeaderRow(faqSheet, "#0284c7");
      faqSheet.appendRow([
        "faq-1",
        "cat-1",
        "Mual dan tidak bisa makan",
        "Mual adalah efek samping umum pasca kemoterapi. Anjuran: Makan porsi kecil tapi sering (4-6 kali/hari), hindari makanan berminyak atau beraroma tajam, dan minum air hangat sedikit-sedikit di antara waktu makan. Minum obat antimual yang telah diresepkan dokter. Tanda bahaya: Jika muntah terus-menerus lebih dari 24 jam dan tidak bisa minum sama sekali, segera hubungi IGD RS Medica.",
        1,
        true,
        "Dr. Maya (Unit Onkologi & Admin RS)",
        new Date().toISOString()
      ]);
      faqSheet.appendRow([
        "faq-2",
        "cat-1",
        "Badan terasa lemas",
        "Rasa lemas (fatigue) wajar terjadi saat tubuh memperbaiki sel. Anjuran: Perbanyak istirahat berkualitas, lakukan peregangan ringan, dan konsumsi makanan kaya protein serta cairan yang cukup. Tanda bahaya: Jika disertai demam > 38°C, menggigil, atau sesak napas, segera ke IGD RS Medica.",
        2,
        true,
        "Dr. Maya (Unit Onkologi & Admin RS)",
        new Date().toISOString()
      ]);
      faqSheet.appendRow([
        "faq-3",
        "cat-2",
        "Jam buka poli onkologi",
        "Poli Onkologi RS Medica melayani konsultasi setiap hari Senin sampai Sabtu pukul 08.00 - 15.00 WIB. Pendaftaran dapat dilakukan langsung di loket admisi atau via WhatsApp ini.",
        1,
        true,
        "Dr. Maya (Unit Onkologi & Admin RS)",
        new Date().toISOString()
      ]);
      createdSheets.push(CONFIG.SHEETS.FAQS);
    }
  }

  // 4. Cek & Buat / Migrasi Tab Settings
  var settingSheet = getOrCreateSheet(CONFIG.SHEETS.SETTINGS);
  if (settingSheet.getLastRow() === 0) {
    settingSheet.appendRow(["key", "value", "updated_at"]);
    formatHeaderRow(settingSheet, "#334155");
    settingSheet.appendRow(["greeting", CONFIG.DEFAULT_SETTINGS.greeting, new Date().toISOString()]);
    settingSheet.appendRow(["fallback", CONFIG.DEFAULT_SETTINGS.fallback, new Date().toISOString()]);
    settingSheet.appendRow(["operatingHours", CONFIG.DEFAULT_SETTINGS.operatingHours, new Date().toISOString()]);
    settingSheet.appendRow(["emergencyHotline", CONFIG.DEFAULT_SETTINGS.emergencyHotline, new Date().toISOString()]);
    settingSheet.appendRow(["ambulance", CONFIG.DEFAULT_SETTINGS.ambulance, new Date().toISOString()]);
    settingSheet.appendRow(["hospitalAddress", CONFIG.DEFAULT_SETTINGS.hospitalAddress, new Date().toISOString()]);
    createdSheets.push(CONFIG.SHEETS.SETTINGS);
  } else {
    // Migrasi parameter settings jika ada key baru yang belum tersimpan
    var setRows = settingSheet.getDataRange().getValues();
    var existingKeys = {};
    for (var s = 1; s < setRows.length; s++) {
      existingKeys[String(setRows[s][0])] = true;
    }

    if (!existingKeys["ambulance"]) {
      settingSheet.appendRow(["ambulance", CONFIG.DEFAULT_SETTINGS.ambulance || "118 / 119", new Date().toISOString()]);
      createdSheets.push("Migrasi Setting: ambulance");
    }
    if (!existingKeys["hospitalAddress"]) {
      settingSheet.appendRow(["hospitalAddress", CONFIG.DEFAULT_SETTINGS.hospitalAddress || "Jl. Kesehatan No. 88, Gedung Utama Lt. 1", new Date().toISOString()]);
      createdSheets.push("Migrasi Setting: hospitalAddress");
    }
    if (!existingKeys["emergencyHotline"]) {
      settingSheet.appendRow(["emergencyHotline", CONFIG.DEFAULT_SETTINGS.emergencyHotline || "(021) 555-0911", new Date().toISOString()]);
      createdSheets.push("Migrasi Setting: emergencyHotline");
    }
  }


  // 5. Cek & Buat Tab Event Logs (Kepatuhan UU PDP: Nomor disamarkan, tanpa isi chat)
  var eventSheet = ss.getSheetByName(CONFIG.SHEETS.EVENT_LOGS);
  if (!eventSheet || eventSheet.getLastRow() === 0) {
    eventSheet = getOrCreateSheet(CONFIG.SHEETS.EVENT_LOGS);
    if (eventSheet.getLastRow() === 0) {
      eventSheet.appendRow(["id", "timestamp", "anonymized_phone", "event_type", "menu_chosen", "feedback", "details"]);
      formatHeaderRow(eventSheet, "#059669");
      createdSheets.push(CONFIG.SHEETS.EVENT_LOGS);
    }
  }

  // 6. Cek & Buat Tab Audit Logs
  var auditSheet = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOGS);
  if (!auditSheet || auditSheet.getLastRow() === 0) {
    auditSheet = getOrCreateSheet(CONFIG.SHEETS.AUDIT_LOGS);
    if (auditSheet.getLastRow() === 0) {
      auditSheet.appendRow(["id", "timestamp", "user_email", "action", "details"]);
      formatHeaderRow(auditSheet, "#d97706");
      createdSheets.push(CONFIG.SHEETS.AUDIT_LOGS);
    }
  }

  // 7. Cek & Buat Tab Obat (Katalog Obat Kemoterapi)
  var obatSheet = ss.getSheetByName(CONFIG.SHEETS.OBAT);
  if (!obatSheet || obatSheet.getLastRow() === 0) {
    obatSheet = getOrCreateSheet(CONFIG.SHEETS.OBAT);
    if (obatSheet.getLastRow() === 0) {
      obatSheet.appendRow([
        "id", "nama_obat", "nama_produsen", "bentuk_sediaan", "jenis", 
        "kode_kfa", "golongan", "indikasi_ringkas", "deskripsi", 
        "indikasi_umum", "komposisi", "peringatan", "efek_samping", 
        "status", "urutan", "updated_at", "updated_by"
      ]);
      formatHeaderRow(obatSheet, "#0f766e");

      // 6 Data contoh fiktif untuk pengujian (bukan klaim medis sungguhan)
      var nowIso = new Date().toISOString();
      var defaultAdminEmail = (CONFIG.DEFAULT_ADMINS && CONFIG.DEFAULT_ADMINS[0] && CONFIG.DEFAULT_ADMINS[0].email) || "admin.onkologi@rs-medica.id";

      var sampleObat = [
        [
          "obat-fiktif-001",
          "[CONTOH FIKTIF] OnkoKemofit 500 mg",
          "PT Farmaka Sejahtera Nusantara [Fiktif]",
          "Injeksi",
          "Bermerek",
          "93001234567",
          "Obat Keras",
          "Terapi ajuvan suportif onkologi simulasi [Data Contoh Fiktif]",
          "Sediaan vial injeksi simulasi untuk pengujian katalog obat kemoterapi sistem Farmaplus RSMS. Bukan untuk penggunaan klinis nyata.",
          "Digunakan dalam simulasi protokol kemoterapi rawat inap Wijayakusuma [Data Fiktif].",
          "Zat Aktif Onkofitin 500 mg (Senyawa Uji Fiktif)",
          "Hanya digunakan di bawah pengawasan dokter spesialis onkologi. Simpan pada suhu 2-8°C terlindung dari cahaya.",
          "Mual ringan, rasa lelah sementara [Simulasi pengujian].",
          "Tayang",
          1,
          nowIso,
          defaultAdminEmail
        ],
        [
          "obat-fiktif-002",
          "[CONTOH FIKTIF] Sitotoksin Generik 100 mg",
          "Generik Farma Indonesia [Fiktif]",
          "Infus",
          "Generik",
          "93009876543",
          "Obat Keras",
          "Infus rekonstitusi clean room sitotoksik simulasi [Data Contoh Fiktif]",
          "Sediaan larutan konsentrat infus uji coba pengujian sistem farmasi onkologi clean room.",
          "Simulasi tatalaksana kemoterapi kombinasi ajuvan [Data Fiktif].",
          "Sitotoksin 100 mg per vial sediaan steril",
          "Rekonstitusi wajib dilakukan di Clean Room bertekanan negatif dengan alat Biological Safety Cabinet (BSC).",
          "Penurunan sel darah sementara, mual [Simulasi].",
          "Tayang",
          2,
          nowIso,
          defaultAdminEmail
        ],
        [
          "obat-fiktif-003",
          "[CONTOH FIKTIF] KemoVira Kapsul 50 mg",
          "PT Medika Farma Internasional [Fiktif]",
          "Kapsul",
          "Bermerek",
          "93005544332",
          "Obat Keras",
          "Kapsul kemoterapi oral pemeliharaan simulasi [Data Contoh Fiktif]",
          "Obat kemoterapi oral simulasi untuk terapi mandiri pasien di rumah dengan pemantauan via Bot BOKU.",
          "Simulasi terapi pemeliharaan pasca siklus kemoterapi rawat inap.",
          "Kemovirate 50 mg tiap kapsul pelepasan terkontrol",
          "Telan utuh dengan air putih, jangan dikunyah atau dibuka kapsulnya. Konsumsi setelah makan.",
          "Gangguan pencernaan ringan, nafsu makan berkurang sementara.",
          "Tayang",
          3,
          nowIso,
          defaultAdminEmail
        ],
        [
          "obat-fiktif-004",
          "[CONTOH FIKTIF] OnkoMitrat Tablet 25 mg",
          "BioKemo Farma [Fiktif]",
          "Tablet",
          "Generik",
          "93002233441",
          "Obat Keras",
          "Tablet terapi target hematologi simulasi [Data Contoh Fiktif]",
          "Sediaan tablet uji coba untuk terapi terarah kelainan darah simulasi di Poliklinik Onkologi.",
          "Simulasi terapi lini kedua hematologi-onkologi terpadu.",
          "Onkomitrat base 25 mg tablet salut selaput",
          "Pemeriksaan fungsi darah berkala (DPL) wajib dilakukan setiap 2 minggu.",
          "Pusing ringan, perubahan rasa kecap sementara.",
          "Tayang",
          4,
          nowIso,
          defaultAdminEmail
        ],
        [
          "obat-fiktif-005",
          "[CONTOH FIKTIF] LeukoKem Sirup 25 mg/5ml",
          "Pediatri Medika Sehat [Fiktif]",
          "Sirup",
          "Bermerek",
          "93007788990",
          "Obat Keras",
          "Sirup kemoterapi onkologi anak simulasi [Data Contoh Fiktif]",
          "Sediaan sirup cair pediatrik simulasi kemoterapi anak dengan rasa buah bebas gula.",
          "Simulasi kemoterapi rawat jalan anak di Ruang Wijaya Kusuma.",
          "Tiap 5 ml mengandung Leukokemina 25 mg",
          "Gunakan sendok takar khusus medis. Jauhkan dari jangkauan anak-anak.",
          "Kantuk ringan, perubahan warna urin sementara.",
          "Tayang",
          5,
          nowIso,
          defaultAdminEmail
        ],
        [
          "obat-fiktif-006",
          "[CONTOH FIKTIF] KemoFlavon Injeksi 10 mg/ml (DRAFT)",
          "Riset Kanker Nusantara [Fiktif]",
          "Injeksi",
          "Generik",
          "93006677881",
          "Obat Keras",
          "Obat kemoterapi eksperimental fase uji [Data Contoh Status Draft]",
          "Data draf internal uji coba, tidak boleh tayang di landing page publik katalog.",
          "Simulasi riset klinis onkologi.",
          "Flavonitrat 10 mg/ml ampul 5 ml",
          "Hanya untuk simulasi draf internal tim admin.",
          "Simulasi efek samping belum dipublikasikan.",
          "Draft",
          6,
          nowIso,
          defaultAdminEmail
        ]
      ];

      sampleObat.forEach(function(row) {
        obatSheet.appendRow(row);
      });
      createdSheets.push(CONFIG.SHEETS.OBAT);
    }
  }

  // 8. Cek & Buat Tab Fasilitas_Obat (Relasi Satu Obat ke Banyak Fasilitas)
  var fasSheet = ss.getSheetByName(CONFIG.SHEETS.FASILITAS_OBAT);
  if (!fasSheet || fasSheet.getLastRow() === 0) {
    fasSheet = getOrCreateSheet(CONFIG.SHEETS.FASILITAS_OBAT);
    if (fasSheet.getLastRow() === 0) {
      fasSheet.appendRow([
        "id", "obat_id", "nama_fasilitas", "provinsi", 
        "alamat", "telepon", "whatsapp", "harga", "tanggal_diperbarui"
      ]);
      formatHeaderRow(fasSheet, "#2563eb");

      var todayStr = new Date().toISOString().slice(0, 10);
      var sampleFasilitas = [
        [
          "fas-fiktif-101",
          "obat-fiktif-001",
          "Instalasi Farmasi RSUD Margono Soekarjo",
          "Jawa Tengah",
          "Jl. Dr. Gumbreg No. 1, Berkoh, Purwokerto",
          "0281-641992",
          "08112345678",
          850000,
          todayStr
        ],
        [
          "fas-fiktif-102",
          "obat-fiktif-001",
          "Apotek RS Jejaring Semarang",
          "Jawa Tengah",
          "Jl. Pahlawan No. 45, Semarang",
          "024-8412345",
          "08123456789",
          875000,
          todayStr
        ],
        [
          "fas-fiktif-201",
          "obat-fiktif-002",
          "Ruang Clean Room Farmasi Wijayakusuma",
          "Jawa Tengah",
          "Gedung Onkologi Wijayakusuma Lt. 2, Purwokerto",
          "0281-641992",
          "08112345678",
          420000,
          todayStr
        ],
        [
          "fas-fiktif-202",
          "obat-fiktif-002",
          "Depo Farmasi Kanker Jakarta Pusat",
          "DKI Jakarta",
          "Jl. Salemba Raya No. 10, Jakarta Pusat",
          "021-3145678",
          "08129876543",
          450000,
          todayStr
        ],
        [
          "fas-fiktif-301",
          "obat-fiktif-003",
          "Apotek Rawat Jalan Wijayakusuma",
          "Jawa Tengah",
          "Jl. Dr. Gumbreg No. 1, Purwokerto",
          "0281-641992",
          "08112345678",
          315000,
          todayStr
        ],
        [
          "fas-fiktif-401",
          "obat-fiktif-004",
          "Instalasi Farmasi RSUD Margono Soekarjo",
          "Jawa Tengah",
          "Jl. Dr. Gumbreg No. 1, Purwokerto",
          "0281-641992",
          "08112345678",
          160000,
          todayStr
        ],
        [
          "fas-fiktif-501",
          "obat-fiktif-005",
          "Apotek Pediatri & Kanker Wijayakusuma",
          "Jawa Tengah",
          "Jl. Dr. Gumbreg No. 1, Purwokerto",
          "0281-641992",
          "08112345678",
          185000,
          todayStr
        ],
        [
          "fas-fiktif-601",
          "obat-fiktif-006",
          "Gudang Karantina Uji Coba [Internal]",
          "Jawa Tengah",
          "Lab Simulasi Riset Internal RS",
          "0281-641992",
          "",
          500000,
          todayStr
        ]
      ];

      sampleFasilitas.forEach(function(row) {
        fasSheet.appendRow(row);
      });
      createdSheets.push(CONFIG.SHEETS.FASILITAS_OBAT);
    }
  }

  // 9. Cek & Buat Tab Regimen Kemoterapi (Custom Chemotherapy Calculator)
  var regSheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
  var regSheet = ss.getSheetByName(regSheetName);
  if (!regSheet || regSheet.getLastRow() === 0) {
    regSheet = getOrCreateSheet(regSheetName);
    if (regSheet.getLastRow() === 0) {
      regSheet.appendRow([
        "id", "nama_regimen", "default_interval", "default_siklus", 
        "deskripsi", "active", "urutan", "created_at", "updated_at", "updated_by"
      ]);
      formatHeaderRow(regSheet, "#4338ca");

      var nowIso = new Date().toISOString();
      var defaultAdminEmail = (CONFIG.DEFAULT_ADMINS && CONFIG.DEFAULT_ADMINS[0] && CONFIG.DEFAULT_ADMINS[0].email) || "admin.onkologi@rs-medica.id";
      var defaultRegimens = CONFIG.DEFAULT_REGIMENS || [];

      defaultRegimens.forEach(function(r) {
        regSheet.appendRow([
          r.id || ("reg-" + Utilities.getUuid().slice(0, 8)),
          r.nama_regimen,
          Number(r.default_interval) || 21,
          Number(r.default_siklus) || 6,
          r.deskripsi || "",
          r.active !== false,
          Number(r.urutan) || 1,
          nowIso,
          nowIso,
          defaultAdminEmail
        ]);
      });

      createdSheets.push(regSheetName);
    }
  }

  // Hapus "Sheet1" default bawaan Google Sheets jika masih kosong
  try {
    var defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet && defaultSheet.getLastRow() <= 1 && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }
  } catch (err) {}

  return {
    success: true,
    message: createdSheets.length > 0 
      ? "Tabel yang belum ada berhasil dibuat otomatis: " + createdSheets.join(", ")
      : "Seluruh tabel database sudah lengkap dan siap digunakan."
  };
}

/**
 * Alias fungsi manual untuk inisialisasi / reset database
 */
function initDatabase() {
  return ensureDatabaseExists();
}

/**
 * Mengambil sheet berdasarkan nama, buat baru jika belum ada
 */
function getOrCreateSheet(sheetName) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  return sheet;
}

/**
 * Format styling header tabel spreadsheet
 */
function formatHeaderRow(sheet, bgColor) {
  var range = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  range.setBackground(bgColor);
  range.setFontColor("#ffffff");
  range.setFontWeight("bold");
  sheet.setFrozenRows(1);
}

/**
 * Helper: Membaca seluruh data sheet menjadi array of object
 */
function getSheetRowsAsObjects(sheetName) {
  ensureDatabaseExists(); // Pastikan tabel sudah ada sebelum membaca
  var sheet = getOrCreateSheet(sheetName);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var rowObj = { _rowIndex: i + 1 };
    for (var j = 0; j < headers.length; j++) {
      rowObj[headers[j]] = data[i][j];
    }
    rows.push(rowObj);
  }
  return rows;
}

/**
 * Helper: Menyimpan array of string ke baris baru
 */
function insertSheetRow(sheetName, valuesArray) {
  ensureDatabaseExists(); // Pastikan tabel sudah ada sebelum insert
  var sheet = getOrCreateSheet(sheetName);
  sheet.appendRow(valuesArray);
  return sheet.getLastRow();
}

/**
 * Helper: Mencari indeks header kolom (case-insensitive & trim)
 */
function findHeaderIndex(headers, colName) {
  if (!headers || !headers.length) return -1;
  var target = String(colName).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === target) {
      return i;
    }
  }
  return -1;
}
