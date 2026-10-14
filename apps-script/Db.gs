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
    catSheet.appendRow(["cat-4", "Panggilan darurat IGD 24 jam", 4, false, true, true, new Date().toISOString()]);
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
      createdSheets.push("Migrasi Kolom: is_emergency pada Categories");
    }

    // Pastikan kategori Panggilan Darurat IGD (cat-4) tersedia di sistem
    var reloadedCat = catSheet.getDataRange().getValues();
    var hasEmergencyCategory = false;
    for (var r = 1; r < reloadedCat.length; r++) {
      var rowId = String(reloadedCat[r][0] || "").trim();
      var rowTitle = String(reloadedCat[r][1] || "").trim();
      if (rowId === "cat-4" || /darurat|igd/i.test(rowTitle)) {
        hasEmergencyCategory = true;
        // Pastikan flag is_emergency bernilai true
        var curHeaders = reloadedCat[0];
        var emgIdx = curHeaders.indexOf("is_emergency");
        if (emgIdx !== -1) {
          catSheet.getRange(r + 1, emgIdx + 1).setValue(true);
        }
        break;
      }
    }

    if (!hasEmergencyCategory) {
      var nextOrder = reloadedCat.length;
      catSheet.appendRow(["cat-4", "Panggilan darurat IGD 24 jam", nextOrder, false, true, true, new Date().toISOString()]);
      createdSheets.push("Migrasi Menu: Tambah cat-4 Panggilan darurat IGD");
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

  // 5. Cek & Buat Tab Emergency Rules (Customizable IGD Protocols)
  var emgSheet = ss.getSheetByName(CONFIG.SHEETS.EMERGENCY_RULES);
  if (!emgSheet || emgSheet.getLastRow() === 0) {
    emgSheet = getOrCreateSheet(CONFIG.SHEETS.EMERGENCY_RULES);
    if (emgSheet.getLastRow() === 0) {
      emgSheet.appendRow(["id", "title", "phone", "ambulance", "location", "keywords", "instructions", "order", "is_primary", "active", "updated_at"]);
      formatHeaderRow(emgSheet, "#e11d48");
      CONFIG.DEFAULT_EMERGENCY_RULES.forEach(function(r) {
        emgSheet.appendRow([
          r.id,
          r.title,
          r.phone,
          r.ambulance,
          r.location,
          r.keywords,
          r.instructions,
          r.order,
          r.is_primary,
          r.active,
          new Date().toISOString()
        ]);
      });
      createdSheets.push(CONFIG.SHEETS.EMERGENCY_RULES);
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
