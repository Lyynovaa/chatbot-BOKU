/**
 * EMERGENCYRULES.GS - MANAJEMEN PROTOKOL PANGGILAN DARURAT IGD (CUSTOMIZABLE)
 * Mengimplementasikan PRD B-06, A-08, & Bagian 9 (Clinical Safety Triage)
 * Mendukung kustomisasi penuh nomor hotline, ambulans siaga, lokasi, kata kunci klinis, dan pesan arahan.
 */

/**
 * Mengambil daftar seluruh protokol panggilan darurat IGD aktif
 */
function getEmergencyRules() {
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.EMERGENCY_RULES);

  // Jika tabel belum ada atau kosong, inisialisasi ulang
  if (!rows || rows.length === 0) {
    ensureDatabaseExists();
    rows = getSheetRowsAsObjects(CONFIG.SHEETS.EMERGENCY_RULES);
  }

  var rules = rows.map(function(r) {
    var rawKw = r.keywords || "";
    var kwList = [];
    if (typeof rawKw === "string") {
      kwList = rawKw.split(",").map(function(k) { return k.trim().toLowerCase(); }).filter(Boolean);
    } else if (Array.isArray(rawKw)) {
      kwList = rawKw;
    }

    var isPrimary = r.is_primary === true || String(r.is_primary).toLowerCase() === "true";
    var isActive = r.active !== false && String(r.active).toLowerCase() !== "false";

    return {
      id: String(r.id),
      title: String(r.title || "Layanan Darurat IGD"),
      phone: String(r.phone || CONFIG.DEFAULT_SETTINGS.emergencyHotline),
      ambulance: String(r.ambulance || CONFIG.DEFAULT_SETTINGS.ambulance || "118 / 119"),
      location: String(r.location || CONFIG.DEFAULT_SETTINGS.hospitalAddress || ""),
      keywords: kwList,
      instructions: String(r.instructions || ""),
      order: Number(r.order) || 1,
      isPrimary: isPrimary,
      active: isActive,
      status: isActive ? "Tayang" : "Nonaktif",
      updatedAt: r.updated_at
    };
  });

  // Urutkan: Protokol Utama (isPrimary) paling atas, lalu berdasarkan order
  rules.sort(function(a, b) {
    if (a.isPrimary && !b.isPrimary) return -1;
    if (!a.isPrimary && b.isPrimary) return 1;
    return a.order - b.order;
  });

  return { success: true, data: rules };
}

/**
 * Menambahkan protokol darurat baru
 */
function createEmergencyRule(ruleData, userEmail) {
  if (!ruleData || !ruleData.title || !ruleData.phone) {
    return { success: false, message: "Nama protokol dan nomor hotline wajib diisi." };
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.EMERGENCY_RULES);
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.EMERGENCY_RULES);

  var newId = ruleData.id ? String(ruleData.id) : ("emg-rule-" + new Date().getTime());
  var cleanTitle = String(ruleData.title).trim();
  var cleanPhone = String(ruleData.phone).trim();
  var cleanAmb = String(ruleData.ambulance || "118 / 119").trim();
  var cleanLoc = String(ruleData.location || CONFIG.DEFAULT_SETTINGS.hospitalAddress || "").trim();
  var cleanInst = String(ruleData.instructions || "").trim();

  var kwStr = "";
  if (Array.isArray(ruleData.keywords)) {
    kwStr = ruleData.keywords.join(", ");
  } else if (typeof ruleData.keywords === "string") {
    kwStr = ruleData.keywords.trim();
  }

  var nextOrder = rows.length + 1;
  var isPrimary = Boolean(ruleData.isPrimary);

  // Jika rule baru dijadikan Utama, nonaktifkan is_primary pada protokol lain
  if (isPrimary) {
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      sheet.getRange(i + 1, 9).setValue(false);
    }
    // Sinkronkan hotline ke settings global
    try {
      updateSettings({
        emergencyHotline: cleanPhone,
        ambulance: cleanAmb,
        hospitalAddress: cleanLoc
      }, userEmail);
    } catch (e) {}
  }

  sheet.appendRow([
    newId,
    cleanTitle,
    cleanPhone,
    cleanAmb,
    cleanLoc,
    kwStr,
    cleanInst,
    nextOrder,
    isPrimary,
    true,
    new Date().toISOString()
  ]);

  recordAuditLog(userEmail || "Admin RS", "TAMBAH_PROTOKOL_DARURAT", "Menambahkan protokol darurat: \"" + cleanTitle + "\" (" + cleanPhone + ")");

  return {
    success: true,
    message: "Protokol darurat \"" + cleanTitle + "\" berhasil ditambahkan ke database Google Sheets!",
    data: { id: newId, title: cleanTitle, phone: cleanPhone }
  };
}

/**
 * Memperbarui protokol darurat yang sudah ada
 */
function updateEmergencyRule(id, ruleData, userEmail) {
  if (!id) return { success: false, message: "ID protokol wajib diisi." };

  var sheet = getOrCreateSheet(CONFIG.SHEETS.EMERGENCY_RULES);
  var data = sheet.getDataRange().getValues();
  var foundRowIndex = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      foundRowIndex = i + 1;
      break;
    }
  }

  if (foundRowIndex === -1) {
    return { success: false, message: "Protokol darurat dengan ID \"" + id + "\" tidak ditemukan." };
  }

  var isPrimary = typeof ruleData.isPrimary !== "undefined" ? Boolean(ruleData.isPrimary) : null;

  // Jika diubah menjadi Utama, nonaktifkan is_primary pada baris lain
  if (isPrimary === true) {
    for (var j = 1; j < data.length; j++) {
      sheet.getRange(j + 1, 9).setValue(false);
    }
  }

  if (ruleData.title) sheet.getRange(foundRowIndex, 2).setValue(String(ruleData.title).trim());
  if (ruleData.phone) sheet.getRange(foundRowIndex, 3).setValue(String(ruleData.phone).trim());
  if (typeof ruleData.ambulance !== "undefined") sheet.getRange(foundRowIndex, 4).setValue(String(ruleData.ambulance).trim());
  if (typeof ruleData.location !== "undefined") sheet.getRange(foundRowIndex, 5).setValue(String(ruleData.location).trim());

  if (typeof ruleData.keywords !== "undefined") {
    var kwStr = Array.isArray(ruleData.keywords) ? ruleData.keywords.join(", ") : String(ruleData.keywords).trim();
    sheet.getRange(foundRowIndex, 6).setValue(kwStr);
  }

  if (typeof ruleData.instructions !== "undefined") {
    sheet.getRange(foundRowIndex, 7).setValue(String(ruleData.instructions).trim());
  }

  if (typeof ruleData.order !== "undefined") {
    sheet.getRange(foundRowIndex, 8).setValue(Number(ruleData.order) || 1);
  }

  if (isPrimary !== null) {
    sheet.getRange(foundRowIndex, 9).setValue(isPrimary);
  }

  if (typeof ruleData.active !== "undefined") {
    sheet.getRange(foundRowIndex, 10).setValue(Boolean(ruleData.active));
  }

  sheet.getRange(foundRowIndex, 11).setValue(new Date().toISOString());

  // Jika protokol ini Utama, sinkronkan nilai kontak ke settings
  var effectiveIsPrimary = isPrimary === true || (isPrimary === null && Boolean(data[foundRowIndex - 1][8]));
  if (effectiveIsPrimary) {
    try {
      var syncSettings = {};
      if (ruleData.phone) syncSettings.emergencyHotline = String(ruleData.phone).trim();
      if (typeof ruleData.ambulance !== "undefined") syncSettings.ambulance = String(ruleData.ambulance).trim();
      if (typeof ruleData.location !== "undefined") syncSettings.hospitalAddress = String(ruleData.location).trim();
      if (Object.keys(syncSettings).length > 0) {
        updateSettings(syncSettings, userEmail);
      }
    } catch (e) {}
  }

  var title = ruleData.title || data[foundRowIndex - 1][1];
  recordAuditLog(userEmail || "Admin RS", "UPDATE_PROTOKOL_DARURAT", "Memperbarui protokol darurat: \"" + title + "\"");

  return { success: true, message: "Protokol darurat \"" + title + "\" berhasil diperbarui di Google Sheets!" };
}

/**
 * Menyimpan protokol darurat (Otomatis deteksi Tambah baru atau Update)
 */
function saveEmergencyRule(ruleData, userEmail) {
  if (!ruleData) return { success: false, message: "Data protokol kosong." };

  var ruleId = ruleData.id;
  if (ruleId && String(ruleId).trim() !== "" && String(ruleId).trim() !== "new") {
    var sheet = getOrCreateSheet(CONFIG.SHEETS.EMERGENCY_RULES);
    var data = sheet.getDataRange().getValues();
    var exists = false;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim() === String(ruleId).trim()) {
        exists = true;
        break;
      }
    }
    if (exists) {
      return updateEmergencyRule(ruleId, ruleData, userEmail);
    }
  }

  return createEmergencyRule(ruleData, userEmail);
}

/**
 * Menghapus protokol darurat
 */
function deleteEmergencyRule(id, userEmail) {
  if (!id) return { success: false, message: "ID protokol wajib diisi." };

  var sheet = getOrCreateSheet(CONFIG.SHEETS.EMERGENCY_RULES);
  var data = sheet.getDataRange().getValues();

  // Pastikan minimal ada 1 protokol tersisa di sistem
  if (data.length <= 2) {
    return { success: false, message: "Minimal harus ada 1 protokol panggilan darurat aktif di sistem RS Medica." };
  }

  var foundIndex = -1;
  var deletedTitle = "";
  var wasPrimary = false;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      foundIndex = i + 1;
      deletedTitle = data[i][1];
      wasPrimary = Boolean(data[i][8]);
      break;
    }
  }

  if (foundIndex === -1) {
    return { success: false, message: "Protokol darurat tidak ditemukan dalam database." };
  }

  sheet.deleteRow(foundIndex);

  // Jika yang dihapus adalah protokol utama, jadikan baris pertama yang tersisa sebagai Utama
  if (wasPrimary) {
    var remainingData = sheet.getDataRange().getValues();
    if (remainingData.length > 1) {
      sheet.getRange(2, 9).setValue(true);
      var newPrimaryPhone = remainingData[1][2];
      if (newPrimaryPhone) {
        try {
          updateSettings({ emergencyHotline: String(newPrimaryPhone) }, userEmail);
        } catch (e) {}
      }
    }
  }

  recordAuditLog(userEmail || "Admin RS", "HAPUS_PROTOKOL_DARURAT", "Menghapus protokol darurat: \"" + deletedTitle + "\"");

  return { success: true, message: "Protokol darurat \"" + deletedTitle + "\" berhasil dihapus dari Google Sheets." };
}
