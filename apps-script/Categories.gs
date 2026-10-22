/**
 * CATEGORIES.GS - MANAJEMEN KATEGORI MENU DINAMIS WHATSAPP
 * Mengimplementasikan PRD A-03 (Kelola Kategori: tambah, ubah, hapus, atur urutan)
 */

/**
 * Mengambil daftar semua kategori beserta jumlah FAQ di dalamnya
 */
function getCategories() {
  var catRows = getSheetRowsAsObjects(CONFIG.SHEETS.CATEGORIES);
  var faqRows = getSheetRowsAsObjects(CONFIG.SHEETS.FAQS);

  var categories = catRows.map(function(cat) {
    var count = faqRows.filter(function(f) {
      return f.category_id === cat.id && (f.active === true || String(f.active).toLowerCase() === "true");
    }).length;

    var isEsc = cat.is_escalation === true || String(cat.is_escalation).toLowerCase() === "true";
    var isEmg = cat.is_emergency === true || String(cat.is_emergency).toLowerCase() === "true" || /darurat|igd/i.test(String(cat.title));

    return {
      id: String(cat.id),
      title: String(cat.title),
      order: Number(cat.order) || 1,
      isEscalation: isEsc,
      isEmergency: isEmg,
      active: cat.active === true || String(cat.active).toLowerCase() === "true",
      faqCount: count,
      createdAt: cat.created_at
    };
  });

  // Urutkan berdasarkan kolom order ASC
  categories.sort(function(a, b) {
    return a.order - b.order;
  });

  return { success: true, data: categories };
}

/**
 * Menambahkan kategori menu baru (Dinamis, tidak stagnan)
 */
function createCategory(titleOrData, isEscalation, isEmergency, userEmail) {
  var title = titleOrData;
  var esc = isEscalation;
  var emg = isEmergency;
  var email = userEmail;

  if (typeof titleOrData === "object" && titleOrData !== null) {
    title = titleOrData.title;
    esc = titleOrData.isEscalation;
    emg = titleOrData.isEmergency;
    email = titleOrData.userEmail || userEmail;
  }

  if (!title || String(title).trim() === "") {
    return { success: false, message: "Judul kategori tidak boleh kosong." };
  }

  var cleanTitle = String(title).trim();
  var sheet = getOrCreateSheet(CONFIG.SHEETS.CATEGORIES);
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.CATEGORIES);

  // Tentukan nomor urut berikutnya
  var nextOrder = rows.length + 1;
  var newId = "cat-" + new Date().getTime();

  sheet.appendRow([
    newId,
    cleanTitle,
    nextOrder,
    Boolean(esc),
    Boolean(emg),
    true,
    new Date().toISOString()
  ]);

  recordAuditLog(email || "ADMIN", "TAMBAH_KATEGORI", "Menambahkan kategori baru: \"" + cleanTitle + "\"");

  return { 
    success: true, 
    message: "Kategori baru berhasil ditambahkan!", 
    category: { id: newId, title: cleanTitle, order: nextOrder, isEscalation: Boolean(esc), isEmergency: Boolean(emg) } 
  };
}

/**
 * Memperbarui nama, urutan, atau status kategori
 */
function updateCategory(id, newTitleOrData, newOrder, userEmail, isEscalation, isEmergency, active) {
  if (!id) return { success: false, message: "ID kategori wajib diisi." };

  var newTitle = newTitleOrData;
  var order = newOrder;
  var email = userEmail;
  var esc = isEscalation;
  var emg = isEmergency;
  var act = active;

  if (typeof newTitleOrData === "object" && newTitleOrData !== null) {
    newTitle = newTitleOrData.title || newTitleOrData.newTitle;
    order = typeof newTitleOrData.order !== "undefined" ? newTitleOrData.order : newTitleOrData.newOrder;
    email = newTitleOrData.userEmail || userEmail;
    esc = newTitleOrData.isEscalation;
    emg = newTitleOrData.isEmergency;
    act = newTitleOrData.active;
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.CATEGORIES);
  var data = sheet.getDataRange().getValues();
  var foundRowIndex = -1;
  var oldTitle = "";

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      foundRowIndex = i + 1;
      oldTitle = data[i][1];
      break;
    }
  }

  if (foundRowIndex === -1) {
    return { success: false, message: "Kategori tidak ditemukan dalam database." };
  }

  if (newTitle) {
    sheet.getRange(foundRowIndex, 2).setValue(String(newTitle).trim());
  }
  if (typeof order !== "undefined" && order !== null) {
    sheet.getRange(foundRowIndex, 3).setValue(Number(order));
  }
  if (typeof esc !== "undefined") {
    sheet.getRange(foundRowIndex, 4).setValue(Boolean(esc));
  }
  if (typeof emg !== "undefined") {
    sheet.getRange(foundRowIndex, 5).setValue(Boolean(emg));
  }
  if (typeof act !== "undefined") {
    sheet.getRange(foundRowIndex, 6).setValue(Boolean(act));
  }

  recordAuditLog(email || "ADMIN", "UBAH_KATEGORI", "Mengubah kategori dari \"" + oldTitle + "\" menjadi \"" + (newTitle || oldTitle) + "\"");

  return { success: true, message: "Kategori berhasil diperbarui!" };
}

/**
 * Menghapus kategori menu
 */
function deleteCategory(id, userEmail) {
  if (!id) return { success: false, message: "ID kategori wajib diisi." };

  // Cek apakah kategori merupakan menu eskalasi atau darurat default sistem
  var catRows = getSheetRowsAsObjects(CONFIG.SHEETS.CATEGORIES);
  var target = catRows.find(function(c) { return String(c.id).trim() === String(id).trim(); });
  if (target) {
    var isEsc = target.is_escalation === true || String(target.is_escalation).toLowerCase() === "true";
    if (isEsc) {
      return { success: false, message: "Menu sistem Hubungi Perawat Jaga adalah menu default sistem dan tidak boleh dihapus." };
    }
  }

  // Hapus semua FAQ dalam kategori ini terlebih dahulu
  var faqSheet = getOrCreateSheet(CONFIG.SHEETS.FAQS);
  var faqData = faqSheet.getDataRange().getValues();
  for (var j = faqData.length - 1; j >= 1; j--) {
    if (String(faqData[j][1]).trim() === String(id).trim()) {
      faqSheet.deleteRow(j + 1);
    }
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.CATEGORIES);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(id).trim()) {
      var deletedTitle = data[i][1];
      sheet.deleteRow(i + 1);
      recordAuditLog(userEmail || "ADMIN", "HAPUS_KATEGORI", "Menghapus kategori: \"" + deletedTitle + "\"");
      return { success: true, message: "Kategori dan seluruh FAQ di dalamnya berhasil dihapus." };
    }
  }

  return { success: false, message: "Kategori tidak ditemukan." };
}
