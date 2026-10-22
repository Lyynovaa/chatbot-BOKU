/**
 * REGIMEN.GS - MANAJEMEN REGIMEN KEMOTERAPI (CUSTOM CHEMOTHERAPY CALCULATOR)
 * Modul konfigurasi CMS Admin & API Publik untuk Kalkulator Jadwal Siklus Pasien
 */

/**
 * Validasi input data regimen kemoterapi
 */
function validateRegimenInput(data, isUpdate) {
  if (!data || typeof data !== "object") {
    return { valid: false, message: "Payload data regimen tidak valid atau kosong." };
  }

  // 1. nama_regimen (wajib)
  if (!isUpdate || data.nama_regimen !== undefined) {
    var nama = String(data.nama_regimen || "").trim();
    if (!nama) {
      return { valid: false, message: "Nama regimen wajib diisi." };
    }
    if (nama.length > 200) {
      return { valid: false, message: "Nama regimen melebihi batas maksimal 200 karakter." };
    }
  }

  // 2. default_interval (dalam hari: 1 - 90 hari)
  if (!isUpdate || data.default_interval !== undefined) {
    var interval = Number(data.default_interval);
    if (isNaN(interval) || interval < 1 || interval > 90) {
      return { valid: false, message: "Default interval harus bernilai angka antara 1 hingga 90 hari." };
    }
  }

  // 3. default_siklus (jumlah siklus: 1 - 50 siklus)
  if (!isUpdate || data.default_siklus !== undefined) {
    var siklus = Number(data.default_siklus);
    if (isNaN(siklus) || siklus < 1 || siklus > 50) {
      return { valid: false, message: "Default jumlah siklus harus bernilai angka antara 1 hingga 50 siklus." };
    }
  }

  // 4. deskripsi (maksimal 2000 karakter)
  if (data.deskripsi !== undefined && data.deskripsi !== null) {
    if (String(data.deskripsi).length > 2000) {
      return { valid: false, message: "Deskripsi/catatan medis melebihi batas maksimal 2000 karakter." };
    }
  }

  // 5. urutan (angka non-negatif jika ada)
  if (data.urutan !== undefined && data.urutan !== null) {
    var urut = Number(data.urutan);
    if (isNaN(urut) || urut < 0) {
      return { valid: false, message: "Nomor urutan harus berupa angka non-negatif." };
    }
  }

  return { valid: true };
}

/**
 * Cache Versi Regimen untuk invalidasi kilat
 */
function getRegimenCacheVersion() {
  var cache = CacheService.getScriptCache();
  var ver = cache.get("REGIMEN_CACHE_VER");
  if (!ver) {
    ver = String(new Date().getTime());
    cache.put("REGIMEN_CACHE_VER", ver, 21600); // 6 jam
  }
  return ver;
}

function clearRegimenPublicCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.put("REGIMEN_CACHE_VER", String(new Date().getTime()), 21600);
  } catch (e) {
    Logger.log("[clearRegimenPublicCache Error] " + e.message);
  }
}

/**
 * Mengambil daftar regimen untuk publik (Hanya yang berstatus aktif)
 * Digunakan oleh Dropdown Kalkulator Jadwal User
 */
function getRegimenList(params) {
  var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
  var rows = getSheetRowsAsObjects(sheetName);

  var activeList = rows.filter(function(r) {
    return r.active === true || String(r.active).toLowerCase() === "true";
  }).map(function(r) {
    return {
      id: String(r.id),
      nama_regimen: String(r.nama_regimen),
      default_interval: Number(r.default_interval) || 21,
      default_siklus: Number(r.default_siklus) || 6,
      deskripsi: String(r.deskripsi || ""),
      active: true,
      urutan: Number(r.urutan) || 1
    };
  });

  activeList.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.nama_regimen.localeCompare(b.nama_regimen);
  });

  return { success: true, data: activeList };
}

/**
 * Mengambil seluruh regimen untuk Admin Portal (termasuk yang nonaktif)
 */
function adminGetRegimenList(token, params) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Membutuhkan peran Super Admin atau Admin." };
  }

  var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
  var rows = getSheetRowsAsObjects(sheetName);

  var list = rows.map(function(r) {
    return {
      id: String(r.id),
      nama_regimen: String(r.nama_regimen),
      default_interval: Number(r.default_interval) || 21,
      default_siklus: Number(r.default_siklus) || 6,
      deskripsi: String(r.deskripsi || ""),
      active: r.active === true || String(r.active).toLowerCase() === "true",
      urutan: Number(r.urutan) || 1,
      created_at: r.created_at || "",
      updated_at: r.updated_at || "",
      updated_by: r.updated_by || ""
    };
  });

  list.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return a.nama_regimen.localeCompare(b.nama_regimen);
  });

  return { success: true, data: list };
}

/**
 * Menambahkan regimen kemoterapi baru (Admin)
 */
function createRegimen(data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  var val = validateRegimenInput(data, false);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan antrian operasi tulis." };
    }

    var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
    var sheet = getOrCreateSheet(sheetName);
    var newId = "reg-" + Utilities.getUuid().slice(0, 8);
    var nowIso = new Date().toISOString();
    var rows = getSheetRowsAsObjects(sheetName);
    var nextUrutan = (data.urutan !== undefined && data.urutan !== null) ? Number(data.urutan) : (rows.length + 1);

    var rowData = [
      newId,
      String(data.nama_regimen).trim(),
      Number(data.default_interval) || 21,
      Number(data.default_siklus) || 6,
      String(data.deskripsi || "").trim(),
      data.active !== false,
      nextUrutan,
      nowIso,
      nowIso,
      session.email
    ];

    sheet.appendRow(rowData);
    clearRegimenPublicCache();
    recordAuditLog(session.email, "CREATE_REGIMEN", "Menambahkan regimen: " + data.nama_regimen + " (ID: " + newId + ")");

    return {
      success: true,
      message: "Regimen kemoterapi baru berhasil ditambahkan.",
      data: { id: newId }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memperbarui data regimen kemoterapi (Admin)
 */
function updateRegimen(id, data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || (data && data.id) || "").trim();
  if (!id) {
    return { success: false, message: "ID regimen wajib diisi untuk pembaruan." };
  }

  var val = validateRegimenInput(data, true);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan antrian operasi tulis." };
    }

    var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
    var sheet = getOrCreateSheet(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data regimen tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    if (idColIdx === -1) {
      return { success: false, message: "Kolom 'id' tidak ditemukan pada sheet regimen." };
    }

    var targetRowIdx = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Regimen dengan ID '" + id + "' tidak ditemukan." };
    }

    var rowValues = values[targetRowIdx - 1].slice();

    function setField(colName, value) {
      var colIdx = findHeaderIndex(headers, colName);
      if (colIdx !== -1) {
        rowValues[colIdx] = value;
      }
    }

    if (data.nama_regimen !== undefined) setField("nama_regimen", String(data.nama_regimen).trim());
    if (data.default_interval !== undefined) setField("default_interval", Number(data.default_interval));
    if (data.default_siklus !== undefined) setField("default_siklus", Number(data.default_siklus));
    if (data.deskripsi !== undefined) setField("deskripsi", String(data.deskripsi || "").trim());
    if (data.active !== undefined) setField("active", Boolean(data.active));
    if (data.urutan !== undefined) setField("urutan", Number(data.urutan));

    setField("updated_at", new Date().toISOString());
    setField("updated_by", session.email);

    sheet.getRange(targetRowIdx, 1, 1, headers.length).setValues([rowValues]);

    clearRegimenPublicCache();
    recordAuditLog(session.email, "UPDATE_REGIMEN", "Memperbarui regimen ID: " + id);

    return {
      success: true,
      message: "Data regimen kemoterapi berhasil diperbarui."
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Mengubah status aktif / nonaktif regimen kemoterapi (Admin)
 */
function toggleRegimenStatus(id, active, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || "").trim();
  if (!id) {
    return { success: false, message: "ID regimen wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan antrian operasi tulis." };
    }

    var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
    var sheet = getOrCreateSheet(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data regimen tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    var activeColIdx = findHeaderIndex(headers, "active");
    var targetRowIdx = -1;
    var namaRegimen = "";

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        var nameColIdx = findHeaderIndex(headers, "nama_regimen");
        namaRegimen = nameColIdx !== -1 ? values[r][nameColIdx] : id;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Regimen tidak ditemukan." };
    }

    var newStatus = Boolean(active);
    sheet.getRange(targetRowIdx, activeColIdx + 1).setValue(newStatus);
    var updatedIdx = findHeaderIndex(headers, "updated_at");
    if (updatedIdx !== -1) sheet.getRange(targetRowIdx, updatedIdx + 1).setValue(new Date().toISOString());
    var updatedByIdx = findHeaderIndex(headers, "updated_by");
    if (updatedByIdx !== -1) sheet.getRange(targetRowIdx, updatedByIdx + 1).setValue(session.email);

    clearRegimenPublicCache();
    recordAuditLog(session.email, "TOGGLE_REGIMEN", "Mengubah status " + namaRegimen + " menjadi: " + (newStatus ? "Aktif" : "Nonaktif"));

    return {
      success: true,
      message: "Status regimen berhasil diubah menjadi: " + (newStatus ? "Aktif" : "Nonaktif") + "."
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Menghapus regimen kemoterapi (Admin)
 */
function deleteRegimen(id, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || "").trim();
  if (!id) {
    return { success: false, message: "ID regimen wajib diisi." };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan antrian operasi tulis." };
    }

    var sheetName = (CONFIG.SHEETS && CONFIG.SHEETS.REGIMEN) ? CONFIG.SHEETS.REGIMEN : "regimen_kemo";
    var sheet = getOrCreateSheet(sheetName);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data regimen tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    var targetRowIdx = -1;
    var namaRegimen = "";

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        var nameColIdx = findHeaderIndex(headers, "nama_regimen");
        namaRegimen = nameColIdx !== -1 ? values[r][nameColIdx] : id;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Regimen tidak ditemukan." };
    }

    sheet.deleteRow(targetRowIdx);
    clearRegimenPublicCache();
    recordAuditLog(session.email, "DELETE_REGIMEN", "Menghapus regimen: " + namaRegimen + " (ID: " + id + ")");

    return {
      success: true,
      message: "Regimen kemoterapi berhasil dihapus."
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}
