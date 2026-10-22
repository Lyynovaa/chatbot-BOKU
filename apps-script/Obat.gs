/**
 * OBAT.GS - MANAJEMEN KATALOG OBAT KEMOTERAPI & FASILITAS OBAT
 * Mengimplementasikan Katalog Obat Kemoterapi (terinspirasi Farmaplus Kemenkes)
 * Sesuai Aturan:
 * - Operasi tulis memvalidasi token sesi admin (peran Super Admin / Admin).
 * - Identitas pelaku diambil dari token (bukan body).
 * - Endpoint baca publik hanya menampilkan status "Tayang" tanpa field internal.
 * - LockService untuk mencegah kondisi balapan (race condition).
 * - CacheService (5 menit) dengan invalidasi instan saat operasi tulis.
 * - Pencatatan ke audit_logs.
 */

// ============================================================================
// 1. HELPER VALIDASI & CACHE
// ============================================================================

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

/**
 * Mendapatkan versi cache publik katalog obat saat ini.
 * Mengubah versi ini akan menginvalidasi seluruh cache baca publik secara instan.
 */
function getObatCacheVersion() {
  var cache = CacheService.getScriptCache();
  var ver = cache.get("OBAT_CACHE_VER");
  if (!ver) {
    ver = String(new Date().getTime());
    cache.put("OBAT_CACHE_VER", ver, 21600); // 6 jam
  }
  return ver;
}

/**
 * Menghapus/menginvalidasi seluruh cache baca publik katalog obat.
 */
function clearObatPublicCache() {
  try {
    var cache = CacheService.getScriptCache();
    cache.put("OBAT_CACHE_VER", String(new Date().getTime()), 21600);
  } catch (e) {
    Logger.log("[clearObatPublicCache Error] " + e.message);
  }
}

/**
 * Validasi data input obat baru / pembaruan
 */
function validateObatInput(data, isUpdate) {
  if (!data || typeof data !== "object") {
    return { valid: false, message: "Payload data obat tidak valid atau kosong." };
  }

  // 1. nama_obat (wajib)
  if (!isUpdate || data.nama_obat !== undefined) {
    var nama = String(data.nama_obat || "").trim();
    if (!nama) {
      return { valid: false, message: "Field 'nama_obat' wajib diisi." };
    }
    if (nama.length > 200) {
      return { valid: false, message: "Field 'nama_obat' melebihi batas maksimal 200 karakter." };
    }
  }

  // 2. bentuk_sediaan (wajib jika baru)
  var validBentuk = ["Tablet", "Injeksi", "Kapsul", "Sirup", "Infus", "Lainnya"];
  if (!isUpdate || data.bentuk_sediaan !== undefined) {
    var bentuk = String(data.bentuk_sediaan || "").trim();
    if (!bentuk || validBentuk.indexOf(bentuk) === -1) {
      return { 
        valid: false, 
        message: "Field 'bentuk_sediaan' tidak valid. Pilihan: " + validBentuk.join(", ") 
      };
    }
  }

  // 3. jenis (wajib jika baru)
  var validJenis = ["Generik", "Bermerek"];
  if (!isUpdate || data.jenis !== undefined) {
    var jenis = String(data.jenis || "").trim();
    if (!jenis || validJenis.indexOf(jenis) === -1) {
      return { 
        valid: false, 
        message: "Field 'jenis' tidak valid. Pilihan: " + validJenis.join(", ") 
      };
    }
  }

  // 4. golongan (wajib jika baru)
  var validGolongan = ["Obat Keras", "Obat Bebas", "Narkotika", "Lainnya"];
  if (!isUpdate || data.golongan !== undefined) {
    var gol = String(data.golongan || "").trim();
    if (!gol || validGolongan.indexOf(gol) === -1) {
      return { 
        valid: false, 
        message: "Field 'golongan' tidak valid. Pilihan: " + validGolongan.join(", ") 
      };
    }
  }

  // 5. kode_kfa (hanya angka jika diisi)
  if (data.kode_kfa !== undefined && data.kode_kfa !== null && String(data.kode_kfa).trim() !== "") {
    var kfa = String(data.kode_kfa).trim();
    if (!/^\d+$/.test(kfa)) {
      return { valid: false, message: "Field 'kode_kfa' hanya boleh berisi karakter angka numerik." };
    }
    if (kfa.length > 30) {
      return { valid: false, message: "Field 'kode_kfa' melebihi batas maksimal 30 karakter." };
    }
  }

  // 6. status (Tayang / Draft)
  if (data.status !== undefined) {
    var status = String(data.status || "").trim();
    if (status !== "Tayang" && status !== "Draft") {
      return { valid: false, message: "Field 'status' harus bernilai 'Tayang' atau 'Draft'." };
    }
  }

  // 7. Batas panjang teks maksimal (deskripsi, indikasi_umum, komposisi, peringatan, efek_samping: maks 5000 karakter)
  var textLimit5000 = ["deskripsi", "indikasi_umum", "komposisi", "peringatan", "efek_samping"];
  for (var i = 0; i < textLimit5000.length; i++) {
    var f = textLimit5000[i];
    if (data[f] !== undefined && data[f] !== null) {
      if (String(data[f]).length > 5000) {
        return { valid: false, message: "Field '" + f + "' melebihi batas maksimal 5000 karakter." };
      }
    }
  }

  // 8. indikasi_ringkas (maks 500 karakter)
  if (data.indikasi_ringkas !== undefined && data.indikasi_ringkas !== null) {
    if (String(data.indikasi_ringkas).length > 500) {
      return { valid: false, message: "Field 'indikasi_ringkas' melebihi batas maksimal 500 karakter." };
    }
  }

  // 9. urutan (numerik positif jika diisi)
  if (data.urutan !== undefined && data.urutan !== null) {
    var urut = Number(data.urutan);
    if (isNaN(urut) || urut < 0) {
      return { valid: false, message: "Field 'urutan' harus bernilai angka non-negatif." };
    }
  }

  return { valid: true };
}

/**
 * Validasi data fasilitas obat
 */
function validateFasilitasInput(data, isUpdate) {
  if (!data || typeof data !== "object") {
    return { valid: false, message: "Payload data fasilitas obat tidak valid atau kosong." };
  }

  // obat_id wajib untuk pembuatan baru
  if (!isUpdate) {
    var obatId = String(data.obat_id || "").trim();
    if (!obatId) {
      return { valid: false, message: "Field 'obat_id' wajib diisi untuk menautkan fasilitas." };
    }
  }

  // nama_fasilitas
  if (!isUpdate || data.nama_fasilitas !== undefined) {
    var nama = String(data.nama_fasilitas || "").trim();
    if (!nama) {
      return { valid: false, message: "Field 'nama_fasilitas' wajib diisi." };
    }
    if (nama.length > 200) {
      return { valid: false, message: "Field 'nama_fasilitas' melebihi batas maksimal 200 karakter." };
    }
  }

  // provinsi
  if (!isUpdate || data.provinsi !== undefined) {
    var prov = String(data.provinsi || "").trim();
    if (!prov) {
      return { valid: false, message: "Field 'provinsi' wajib diisi." };
    }
    if (prov.length > 100) {
      return { valid: false, message: "Field 'provinsi' melebihi batas maksimal 100 karakter." };
    }
  }

  // harga (numerik non-negatif)
  if (!isUpdate || data.harga !== undefined) {
    var harga = Number(data.harga);
    if (isNaN(harga) || harga < 0) {
      return { valid: false, message: "Field 'harga' harus berupa angka numerik non-negatif (>= 0)." };
    }
  }

  // telepon & whatsapp (hanya boleh angka, +, spasi, -)
  var phoneFields = ["telepon", "whatsapp"];
  for (var i = 0; i < phoneFields.length; i++) {
    var pf = phoneFields[i];
    if (data[pf] !== undefined && data[pf] !== null && String(data[pf]).trim() !== "") {
      var val = String(data[pf]).trim();
      if (!/^[\d+\s-]+$/.test(val)) {
        return { valid: false, message: "Field '" + pf + "' hanya boleh berisi angka, tanda +, spasi, atau tanda strip (-)." };
      }
      if (val.length > 50) {
        return { valid: false, message: "Field '" + pf + "' melebihi batas maksimal 50 karakter." };
      }
    }
  }

  return { valid: true };
}

// ============================================================================
// 2. AKSI BACA PUBLIK (LANDING PAGE - HANYA STATUS "TAYANG")
// ============================================================================

/**
 * Mengambil daftar katalog obat berstatus "Tayang" (Publik)
 * Parameter: q, bentuk, jenis, provinsi, page, pageSize
 */
function getObatList(params) {
  params = params || {};
  var q = String(params.q || "").trim().toLowerCase();
  var bentuk = String(params.bentuk || "").trim().toLowerCase();
  var jenis = String(params.jenis || "").trim().toLowerCase();
  var provinsi = String(params.provinsi || "").trim().toLowerCase();
  var page = Math.max(1, parseInt(params.page, 10) || 1);
  var pageSize = Math.min(50, Math.max(1, parseInt(params.pageSize, 10) || 10));

  // Cek cache publik 5 menit
  var cacheVer = getObatCacheVersion();
  var cacheKey = "OBAT_V" + cacheVer + "_L_" + Utilities.base64EncodeWebSafe(
    JSON.stringify({ q: q, b: bentuk, j: jenis, prov: provinsi, p: page, ps: pageSize })
  ).slice(0, 80);

  var cache = CacheService.getScriptCache();
  var cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    try {
      return JSON.parse(cachedResult);
    } catch (e) {}
  }

  var obatRows = getSheetRowsAsObjects(CONFIG.SHEETS.OBAT);
  var fasRows = getSheetRowsAsObjects(CONFIG.SHEETS.FASILITAS_OBAT);

  // Buat index fasilitas per obat_id untuk agregasi harga termurah & filtering provinsi
  var fasByObat = {};
  for (var f = 0; f < fasRows.length; f++) {
    var item = fasRows[f];
    var oid = String(item.obat_id || "");
    if (!fasByObat[oid]) {
      fasByObat[oid] = { count: 0, minHarga: null, provinces: {}, cheapestFas: null };
    }
    fasByObat[oid].count++;
    var h = Number(item.harga);
    if (!isNaN(h) && (fasByObat[oid].minHarga === null || h < fasByObat[oid].minHarga)) {
      fasByObat[oid].minHarga = h;
      fasByObat[oid].cheapestFas = item;
    }
    if (item.provinsi) {
      fasByObat[oid].provinces[String(item.provinsi).trim().toLowerCase()] = true;
    }
  }

  // 1. Filter: HANYA STATUS "TAYANG"
  var filtered = [];
  for (var i = 0; i < obatRows.length; i++) {
    var r = obatRows[i];
    var status = String(r.status || "").trim();
    if (status !== "Tayang") {
      continue; // Lewati draf internal
    }

    // Filter Bentuk Sediaan
    if (bentuk && String(r.bentuk_sediaan || "").toLowerCase() !== bentuk) {
      continue;
    }

    // Filter Jenis (Generik / Bermerek)
    if (jenis && String(r.jenis || "").toLowerCase() !== jenis) {
      continue;
    }

    // Filter Provinsi Fasilitas
    if (provinsi) {
      var fasInfo = fasByObat[String(r.id)] || null;
      if (!fasInfo || !fasInfo.provinces[provinsi]) {
        continue;
      }
    }

    // Filter Pencarian Teks Bebas (q)
    if (q) {
      var haystack = [
        r.nama_obat,
        r.nama_produsen,
        r.indikasi_ringkas,
        r.komposisi,
        r.kode_kfa
      ].join(" ").toLowerCase();

      if (haystack.indexOf(q) === -1) {
        continue;
      }
    }

    // Sanitasi data publik (tanpa field internal seperti updated_by / status)
    var fasData = fasByObat[String(r.id)] || { count: 0, minHarga: null, cheapestFas: null };
    filtered.push({
      id: r.id,
      nama_obat: r.nama_obat,
      nama_produsen: r.nama_produsen || "",
      bentuk_sediaan: r.bentuk_sediaan || "",
      jenis: r.jenis || "",
      kode_kfa: r.kode_kfa || "",
      golongan: r.golongan || "",
      indikasi_ringkas: r.indikasi_ringkas || "",
      urutan: Number(r.urutan) || 999,
      jumlah_fasilitas: fasData.count,
      harga_termurah: fasData.minHarga !== null ? fasData.minHarga : 0,
      nama_fasilitas: fasData.cheapestFas ? fasData.cheapestFas.nama_fasilitas : "Ruang Wijaya Kusuma RSMS",
      provinsi: fasData.cheapestFas ? fasData.cheapestFas.provinsi : "Jawa Tengah",
      updated_at: r.updated_at || ""
    });
  }

  // 2. Pengurutan: urutan ascending, lalu nama_obat ascending
  filtered.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return String(a.nama_obat).localeCompare(String(b.nama_obat));
  });

  // 3. Paginasi
  var total = filtered.length;
  var totalPages = Math.ceil(total / pageSize) || 1;
  var startIndex = (page - 1) * pageSize;
  var items = filtered.slice(startIndex, startIndex + pageSize);

  var responseData = {
    success: true,
    data: {
      items: items,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: totalPages
    }
  };

  // Simpan ke CacheService selama 5 menit (300 detik)
  try {
    cache.put(cacheKey, JSON.stringify(responseData), 300);
  } catch (err) {}

  return responseData;
}

/**
 * Mengambil detail satu obat berstatus "Tayang" beserta daftar fasilitas (Publik)
 * Parameter: id
 */
function getObatDetail(id) {
  if (!id) {
    return { success: false, message: "Parameter 'id' obat wajib diberikan." };
  }

  var cleanId = String(id).trim();

  // Cek cache publik 5 menit
  var cacheVer = getObatCacheVersion();
  var cacheKey = "OBAT_V" + cacheVer + "_D_" + cleanId;
  var cache = CacheService.getScriptCache();
  var cachedResult = cache.get(cacheKey);
  if (cachedResult) {
    try {
      return JSON.parse(cachedResult);
    } catch (e) {}
  }

  var obatRows = getSheetRowsAsObjects(CONFIG.SHEETS.OBAT);
  var matchedObat = null;

  for (var i = 0; i < obatRows.length; i++) {
    if (String(obatRows[i].id).trim() === cleanId) {
      matchedObat = obatRows[i];
      break;
    }
  }

  if (!matchedObat) {
    return { success: false, message: "Obat dengan ID '" + cleanId + "' tidak ditemukan." };
  }

  // Verifikasi status tayang untuk pembacaan publik
  if (String(matchedObat.status || "").trim() !== "Tayang") {
    return { success: false, message: "Obat ini belum ditayangkan untuk publik." };
  }

  // Ambil daftar fasilitas terkait
  var fasRows = getSheetRowsAsObjects(CONFIG.SHEETS.FASILITAS_OBAT);
  var fasilitasList = [];
  for (var j = 0; j < fasRows.length; j++) {
    if (String(fasRows[j].obat_id).trim() === cleanId) {
      fasilitasList.push({
        id: fasRows[j].id,
        nama_fasilitas: fasRows[j].nama_fasilitas,
        provinsi: fasRows[j].provinsi || "",
        alamat: fasRows[j].alamat || "",
        telepon: fasRows[j].telepon || "",
        whatsapp: fasRows[j].whatsapp || "",
        harga: Number(fasRows[j].harga) || 0,
        tanggal_diperbarui: fasRows[j].tanggal_diperbarui || ""
      });
    }
  }

  // Urutkan fasilitas berdasarkan harga termurah
  fasilitasList.sort(function(a, b) {
    return a.harga - b.harga;
  });

  // Omit field internal sistem
  var responseData = {
    success: true,
    data: {
      id: matchedObat.id,
      nama_obat: matchedObat.nama_obat,
      nama_produsen: matchedObat.nama_produsen || "",
      bentuk_sediaan: matchedObat.bentuk_sediaan || "",
      jenis: matchedObat.jenis || "",
      kode_kfa: matchedObat.kode_kfa || "",
      golongan: matchedObat.golongan || "",
      indikasi_ringkas: matchedObat.indikasi_ringkas || "",
      deskripsi: matchedObat.deskripsi || "",
      indikasi_umum: matchedObat.indikasi_umum || "",
      komposisi: matchedObat.komposisi || "",
      peringatan: matchedObat.peringatan || "",
      efek_samping: matchedObat.efek_samping || "",
      urutan: Number(matchedObat.urutan) || 1,
      updated_at: matchedObat.updated_at || "",
      fasilitas: fasilitasList
    }
  };

  // Simpan ke CacheService selama 5 menit
  try {
    cache.put(cacheKey, JSON.stringify(responseData), 300);
  } catch (err) {}

  return responseData;
}

/**
 * Mengambil daftar obat untuk portal admin (termasuk status Draft & field internal)
 * Memerlukan otentikasi token admin valid.
 */
function adminGetObatList(token, params) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Membutuhkan peran Super Admin atau Admin." };
  }

  params = params || {};
  var obatRows = getSheetRowsAsObjects(CONFIG.SHEETS.OBAT);
  var fasRows = getSheetRowsAsObjects(CONFIG.SHEETS.FASILITAS_OBAT);

  var fasCountByObat = {};
  for (var f = 0; f < fasRows.length; f++) {
    var oid = String(fasRows[f].obat_id || "");
    fasCountByObat[oid] = (fasCountByObat[oid] || 0) + 1;
  }

  var items = obatRows.map(function(r) {
    return {
      id: r.id,
      nama_obat: r.nama_obat,
      nama_produsen: r.nama_produsen || "",
      bentuk_sediaan: r.bentuk_sediaan || "",
      jenis: r.jenis || "",
      kode_kfa: r.kode_kfa || "",
      golongan: r.golongan || "",
      indikasi_ringkas: r.indikasi_ringkas || "",
      deskripsi: r.deskripsi || "",
      indikasi_umum: r.indikasi_umum || "",
      komposisi: r.komposisi || "",
      peringatan: r.peringatan || "",
      efek_samping: r.efek_samping || "",
      status: r.status || "Draft",
      urutan: Number(r.urutan) || 1,
      updated_at: r.updated_at || "",
      updated_by: r.updated_by || "",
      jumlah_fasilitas: fasCountByObat[String(r.id)] || 0
    };
  });

  items.sort(function(a, b) {
    if (a.urutan !== b.urutan) return a.urutan - b.urutan;
    return String(a.nama_obat).localeCompare(String(b.nama_obat));
  });

  return { success: true, data: items };
}

// ============================================================================
// 3. AKSI TULIS ADMIN (LOCKSERVICE + AUDIT LOG + TOKEN VALIDATION)
// ============================================================================

/**
 * Membuat data obat baru (Admin)
 */
function createObat(data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  var val = validateObatInput(data, false);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    var sheet = getOrCreateSheet(CONFIG.SHEETS.OBAT);
    var newId = "obat-" + Utilities.getUuid().slice(0, 12);
    var nowIso = new Date().toISOString();
    var userEmail = session.email; // Identitas dari token!

    var rowData = [
      newId,
      String(data.nama_obat).trim(),
      String(data.nama_produsen || "").trim(),
      String(data.bentuk_sediaan).trim(),
      String(data.jenis).trim(),
      String(data.kode_kfa || "").trim(),
      String(data.golongan).trim(),
      String(data.indikasi_ringkas || "").trim(),
      String(data.deskripsi || "").trim(),
      String(data.indikasi_umum || "").trim(),
      String(data.komposisi || "").trim(),
      String(data.peringatan || "").trim(),
      String(data.efek_samping || "").trim(),
      String(data.status || "Draft").trim(),
      Number(data.urutan) || 1,
      nowIso,
      userEmail
    ];

    sheet.appendRow(rowData);
    clearObatPublicCache();
    recordAuditLog(userEmail, "CREATE_OBAT", "Menambahkan obat baru: " + data.nama_obat + " (ID: " + newId + ")");

    return {
      success: true,
      message: "Data obat berhasil ditambahkan.",
      data: { id: newId }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memperbarui data obat yang ada (Admin)
 */
function updateObat(id, data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || (data && data.id) || "").trim();
  if (!id) {
    return { success: false, message: "Parameter 'id' obat wajib diberikan untuk pembaruan." };
  }

  var val = validateObatInput(data, true);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    var sheet = getOrCreateSheet(CONFIG.SHEETS.OBAT);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data obat tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    if (idColIdx === -1) {
      return { success: false, message: "Kolom 'id' tidak ditemukan pada sheet obat." };
    }

    var targetRowIdx = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1; // 1-indexed baris sheet
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Obat dengan ID '" + id + "' tidak ditemukan." };
    }

    var nowIso = new Date().toISOString();
    var userEmail = session.email; // Identitas dari token!

    var updatableFields = [
      "nama_obat", "nama_produsen", "bentuk_sediaan", "jenis", 
      "kode_kfa", "golongan", "indikasi_ringkas", "deskripsi", 
      "indikasi_umum", "komposisi", "peringatan", "efek_samping", 
      "status", "urutan"
    ];

    // Salin baris saat ini untuk pembaruan massal 1x
    var rowValues = values[targetRowIdx - 1].slice();

    for (var f = 0; f < updatableFields.length; f++) {
      var fieldName = updatableFields[f];
      if (data[fieldName] !== undefined) {
        var colIdx = findHeaderIndex(headers, fieldName);
        if (colIdx !== -1) {
          var cellVal = data[fieldName];
          if (fieldName === "urutan") cellVal = Number(cellVal) || 1;
          rowValues[colIdx] = cellVal;
        }
      }
    }

    // Perbarui metadata updated_at dan updated_by
    var updatedAtIdx = findHeaderIndex(headers, "updated_at");
    if (updatedAtIdx !== -1) rowValues[updatedAtIdx] = nowIso;

    var updatedByIdx = findHeaderIndex(headers, "updated_by");
    if (updatedByIdx !== -1) rowValues[updatedByIdx] = userEmail;

    // Tulis satu baris penuh sekaligus secara atomic
    sheet.getRange(targetRowIdx, 1, 1, headers.length).setValues([rowValues]);

    clearObatPublicCache();
    recordAuditLog(userEmail, "UPDATE_OBAT", "Memperbarui obat: " + (data.nama_obat || id) + " (ID: " + id + ")");

    return {
      success: true,
      message: "Data obat berhasil diperbarui.",
      data: { id: id }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Menghapus data obat dan seluruh fasilitas terkait (Admin)
 */
function deleteObat(id, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || "").trim();
  if (!id) {
    return { success: false, message: "Parameter 'id' obat wajib diberikan untuk penghapusan." };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    var sheet = getOrCreateSheet(CONFIG.SHEETS.OBAT);
    var values = sheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data obat tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    if (idColIdx === -1) {
      return { success: false, message: "Kolom 'id' tidak ditemukan pada sheet obat." };
    }

    var targetRowIdx = -1;
    var namaObat = "";

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        var nameColIdx = findHeaderIndex(headers, "nama_obat");
        if (nameColIdx !== -1) namaObat = values[r][nameColIdx];
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Obat dengan ID '" + id + "' tidak ditemukan." };
    }

    sheet.deleteRow(targetRowIdx);

    // Hapus juga fasilitas terkait secara kaskade
    var fasSheet = getOrCreateSheet(CONFIG.SHEETS.FASILITAS_OBAT);
    var fasValues = fasSheet.getDataRange().getValues();
    if (fasValues.length > 1) {
      var fasOidIdx = findHeaderIndex(fasValues[0], "obat_id");
      if (fasOidIdx !== -1) {
        // Hapus dari baris paling bawah ke atas agar indeks tidak bergeser
        for (var fr = fasValues.length - 1; fr >= 1; fr--) {
          if (String(fasValues[fr][fasOidIdx]).trim() === id) {
            fasSheet.deleteRow(fr + 1);
          }
        }
      }
    }

    clearObatPublicCache();
    recordAuditLog(session.email, "DELETE_OBAT", "Menghapus obat: " + (namaObat || id) + " (ID: " + id + ")");

    return {
      success: true,
      message: "Data obat beserta fasilitas terkait berhasil dihapus."
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Menambahkan fasilitas dan harga untuk obat tertentu (Admin)
 */
function createFasilitasObat(data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  var val = validateFasilitasInput(data, false);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    // Pastikan obat_id merujuk pada obat yang ada
    var obatRows = getSheetRowsAsObjects(CONFIG.SHEETS.OBAT);
    var exists = false;
    for (var i = 0; i < obatRows.length; i++) {
      if (String(obatRows[i].id).trim() === String(data.obat_id).trim()) {
        exists = true;
        break;
      }
    }
    if (!exists) {
      return { success: false, message: "Obat dengan ID '" + data.obat_id + "' tidak ditemukan dalam database." };
    }

    var fasSheet = getOrCreateSheet(CONFIG.SHEETS.FASILITAS_OBAT);
    var newId = "fas-" + Utilities.getUuid().slice(0, 12);
    var todayStr = new Date().toISOString().slice(0, 10);

    var rowData = [
      newId,
      String(data.obat_id).trim(),
      String(data.nama_fasilitas).trim(),
      String(data.provinsi).trim(),
      String(data.alamat || "").trim(),
      String(data.telepon || "").trim(),
      String(data.whatsapp || "").trim(),
      Number(data.harga) || 0,
      todayStr
    ];

    fasSheet.appendRow(rowData);
    clearObatPublicCache();
    recordAuditLog(session.email, "CREATE_FASILITAS_OBAT", "Menambahkan fasilitas: " + data.nama_fasilitas + " untuk obat " + data.obat_id);

    return {
      success: true,
      message: "Data fasilitas obat berhasil ditambahkan.",
      data: { id: newId }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memperbarui data fasilitas obat (Admin)
 */
function updateFasilitasObat(id, data, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || (data && data.id) || "").trim();
  if (!id) {
    return { success: false, message: "Parameter 'id' fasilitas wajib diberikan untuk pembaruan." };
  }

  var val = validateFasilitasInput(data, true);
  if (!val.valid) {
    return { success: false, message: val.message };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    var fasSheet = getOrCreateSheet(CONFIG.SHEETS.FASILITAS_OBAT);
    var values = fasSheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data fasilitas tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    if (idColIdx === -1) {
      return { success: false, message: "Kolom 'id' tidak ditemukan pada sheet fasilitas." };
    }

    var targetRowIdx = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Fasilitas dengan ID '" + id + "' tidak ditemukan." };
    }

    var todayStr = new Date().toISOString().slice(0, 10);
    var updatableFields = ["nama_fasilitas", "provinsi", "alamat", "telepon", "whatsapp", "harga"];
    var rowValues = values[targetRowIdx - 1].slice();

    for (var f = 0; f < updatableFields.length; f++) {
      var fieldName = updatableFields[f];
      if (data[fieldName] !== undefined) {
        var colIdx = findHeaderIndex(headers, fieldName);
        if (colIdx !== -1) {
          var cellVal = data[fieldName];
          if (fieldName === "harga") cellVal = Number(cellVal) || 0;
          rowValues[colIdx] = cellVal;
        }
      }
    }

    var tglIdx = findHeaderIndex(headers, "tanggal_diperbarui");
    if (tglIdx !== -1) rowValues[tglIdx] = todayStr;

    fasSheet.getRange(targetRowIdx, 1, 1, headers.length).setValues([rowValues]);

    clearObatPublicCache();
    recordAuditLog(session.email, "UPDATE_FASILITAS_OBAT", "Memperbarui fasilitas obat ID: " + id);

    return {
      success: true,
      message: "Data fasilitas obat berhasil diperbarui.",
      data: { id: id }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Menghapus data fasilitas obat (Admin)
 */
function deleteFasilitasObat(id, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  id = String(id || "").trim();
  if (!id) {
    return { success: false, message: "Parameter 'id' fasilitas wajib diberikan untuk penghapusan." };
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(15000);
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis." };
    }

    var fasSheet = getOrCreateSheet(CONFIG.SHEETS.FASILITAS_OBAT);
    var values = fasSheet.getDataRange().getValues();
    if (values.length <= 1) {
      return { success: false, message: "Data fasilitas tidak ditemukan." };
    }

    var headers = values[0];
    var idColIdx = findHeaderIndex(headers, "id");
    if (idColIdx === -1) {
      return { success: false, message: "Kolom 'id' tidak ditemukan pada sheet fasilitas." };
    }

    var targetRowIdx = -1;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][idColIdx]).trim() === id) {
        targetRowIdx = r + 1;
        break;
      }
    }

    if (targetRowIdx === -1) {
      return { success: false, message: "Fasilitas dengan ID '" + id + "' tidak ditemukan." };
    }

    fasSheet.deleteRow(targetRowIdx);
    clearObatPublicCache();
    recordAuditLog(session.email, "DELETE_FASILITAS_OBAT", "Menghapus fasilitas obat ID: " + id);

    return {
      success: true,
      message: "Data fasilitas obat berhasil dihapus."
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Impor obat massal (Bulk Import) maksimal 200 baris per panggilan
 */
function importObatBulk(items, token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Token tidak valid atau peran tidak mencukupi." };
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return { success: false, message: "Payload 'items' harus berupa array data obat dan tidak boleh kosong." };
  }

  if (items.length > 200) {
    return { 
      success: false, 
      message: "Jumlah data impor melebihi batas maksimal 200 baris per panggilan (diterima: " + items.length + " baris)." 
    };
  }

  // Validasi seluruh baris sebelum melakukan penulisan database (Atomic check)
  for (var i = 0; i < items.length; i++) {
    var rowVal = validateObatInput(items[i], false);
    if (!rowVal.valid) {
      return { 
        success: false, 
        message: "Validasi gagal pada baris ke-" + (i + 1) + ": " + rowVal.message 
      };
    }
  }

  var lock = LockService.getScriptLock();
  try {
    var hasLock = lock.tryLock(30000); // 30 detik untuk operasi massal
    if (!hasLock) {
      return { success: false, message: "Server sibuk. Gagal mendapatkan lock antrian operasi tulis massal." };
    }

    var sheet = getOrCreateSheet(CONFIG.SHEETS.OBAT);
    var nowIso = new Date().toISOString();
    var userEmail = session.email;
    var rowsToInsert = [];
    var importedIds = [];

    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      var newId = item.id ? String(item.id).trim() : ("obat-" + Utilities.getUuid().slice(0, 12));
      importedIds.push(newId);

      rowsToInsert.push([
        newId,
        String(item.nama_obat).trim(),
        String(item.nama_produsen || "").trim(),
        String(item.bentuk_sediaan).trim(),
        String(item.jenis).trim(),
        String(item.kode_kfa || "").trim(),
        String(item.golongan).trim(),
        String(item.indikasi_ringkas || "").trim(),
        String(item.deskripsi || "").trim(),
        String(item.indikasi_umum || "").trim(),
        String(item.komposisi || "").trim(),
        String(item.peringatan || "").trim(),
        String(item.efek_samping || "").trim(),
        String(item.status || "Draft").trim(),
        Number(item.urutan) || (j + 1),
        nowIso,
        userEmail
      ]);
    }

    // Insert massal
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rowsToInsert.length, rowsToInsert[0].length).setValues(rowsToInsert);

    clearObatPublicCache();
    recordAuditLog(userEmail, "IMPORT_OBAT_BULK", "Mengimpor " + rowsToInsert.length + " data obat secara massal.");

    return {
      success: true,
      message: "Berhasil mengimpor " + rowsToInsert.length + " data obat.",
      data: {
        totalImported: rowsToInsert.length,
        ids: importedIds
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    lock.releaseLock();
  }
}
