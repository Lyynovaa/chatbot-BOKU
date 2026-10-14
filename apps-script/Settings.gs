/**
 * SETTINGS.GS - MANAJEMEN PENGATURAN GLOBAL BOT WHATSAPP
 * Mengimplementasikan PRD A-08 (Pesan sambutan, fallback, jam operasional, hotline IGD)
 */

/**
 * Mengambil konfigurasi global bot WhatsApp
 */
function getSettings() {
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.SETTINGS);
  var settings = {
    greeting: CONFIG.DEFAULT_SETTINGS.greeting,
    fallback: CONFIG.DEFAULT_SETTINGS.fallback,
    operatingHours: CONFIG.DEFAULT_SETTINGS.operatingHours,
    emergencyHotline: CONFIG.DEFAULT_SETTINGS.emergencyHotline,
    ambulance: CONFIG.DEFAULT_SETTINGS.ambulance || "118 / 119",
    hospitalAddress: CONFIG.DEFAULT_SETTINGS.hospitalAddress || "Jl. Kesehatan No. 88, Gedung Utama Lt. 1"
  };

  rows.forEach(function(r) {
    if (r.key && typeof r.value !== "undefined") {
      settings[r.key] = r.value;
    }
  });

  return { success: true, data: settings };
}

/**
 * Menyimpan pembaruan konfigurasi global bot
 */
function updateSettings(newSettings, userEmail) {
  if (!newSettings || typeof newSettings !== "object") {
    return { success: false, message: "Data pengaturan tidak valid." };
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.SETTINGS);
  var data = sheet.getDataRange().getValues();
  var updatedKeys = [];

  var ALLOWED_SETTING_KEYS = [
    "greeting",
    "fallback",
    "operatingHours",
    "emergencyHotline",
    "ambulance",
    "hospitalAddress"
  ];

  var keysToUpdate = Object.keys(newSettings);

  keysToUpdate.forEach(function(key) {
    if (ALLOWED_SETTING_KEYS.indexOf(key) === -1) return; // Abaikan parameter request sistem
    if (typeof newSettings[key] !== "undefined" && newSettings[key] !== null) {
      var found = false;
      var val = String(newSettings[key]).trim();

      for (var i = 1; i < data.length; i++) {
        if (String(data[i][0]) === key) {
          sheet.getRange(i + 1, 2).setValue(val);
          sheet.getRange(i + 1, 3).setValue(new Date().toISOString());
          found = true;
          break;
        }
      }

      if (!found) {
        sheet.appendRow([key, val, new Date().toISOString()]);
      }
      updatedKeys.push(key);
    }
  });

  recordAuditLog(
    userEmail || "Admin RS", 
    "UPDATE_SETTINGS", 
    "Memperbarui parameter konfigurasi bot: " + updatedKeys.join(", ")
  );

  return { success: true, message: "Pengaturan global bot berhasil disimpan!" };
}

/**
 * FUNGSI SETUP / PEMBUATAN TABEL OTOMATIS:
 * Jalankan fungsi ini langsung dari Editor Google Apps Script
 * (Pilih "setupSettingsTable" di dropdown atas lalu klik tombol "Jalankan / Run")
 */
function setupSettingsTable() {
  var ss = getSpreadsheet();
  var sheetName = (CONFIG && CONFIG.SHEETS && CONFIG.SHEETS.SETTINGS) ? CONFIG.SHEETS.SETTINGS : "settings";
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // 1. Siapkan Header Tabel
  var headers = ["key", "value", "updated_at"];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    // Pastikan baris 1 adalah header yang benar
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  // Format Header: Background Slate #334155, teks putih tebal, freeze baris 1
  try {
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#334155");
    headerRange.setFontColor("#ffffff");
    headerRange.setFontWeight("bold");
    sheet.setFrozenRows(1);
  } catch (err) {}

  // 2. Daftar Pengaturan Default
  var defaultSettings = (CONFIG && CONFIG.DEFAULT_SETTINGS) ? CONFIG.DEFAULT_SETTINGS : {
    greeting: "Halo Bapak/Ibu. Layanan ini memberi informasi umum seputar perawatan kemoterapi dan tidak menggantikan konsultasi dokter.",
    fallback: "Maaf, pilihan tidak dikenali. Silakan ketik angka menu yang tersedia atau ketik 0 untuk kembali ke menu utama.",
    operatingHours: "Senin - Sabtu: 08.00 - 16.00 WIB",
    emergencyHotline: "(021) 555-0911",
    ambulance: "118 / 119",
    hospitalAddress: "Jl. Kesehatan No. 88, Gedung Utama Lt. 1"
  };

  var defaultRows = [
    { key: "greeting", value: defaultSettings.greeting },
    { key: "fallback", value: defaultSettings.fallback },
    { key: "operatingHours", value: defaultSettings.operatingHours },
    { key: "emergencyHotline", value: defaultSettings.emergencyHotline },
    { key: "ambulance", value: defaultSettings.ambulance || "118 / 119" },
    { key: "hospitalAddress", value: defaultSettings.hospitalAddress || "Jl. Kesehatan No. 88, Gedung Utama Lt. 1" }
  ];

  // 3. Cek data yang sudah ada di tabel
  var existingData = sheet.getDataRange().getValues();
  var existingMap = {};
  for (var i = 1; i < existingData.length; i++) {
    var k = String(existingData[i][0]).trim();
    if (k) existingMap[k] = true;
  }

  // 4. Tambahkan baris konfigurasi yang belum ada
  var now = new Date().toISOString();
  var addedCount = 0;
  defaultRows.forEach(function(item) {
    if (!existingMap[item.key]) {
      sheet.appendRow([item.key, item.value, now]);
      addedCount++;
    }
  });

  // 5. Rapi-kan lebar kolom
  try {
    sheet.autoResizeColumns(1, 3);
  } catch (e) {}

  Logger.log("Setup tabel 'settings' selesai! Menambahkan " + addedCount + " baris konfigurasi baru.");
  return {
    success: true,
    message: "Tabel '" + sheetName + "' berhasil disiapkan dengan " + defaultRows.length + " parameter konfigurasi global."
  };
}
