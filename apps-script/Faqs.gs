/**
 * FAQS.GS - MANAJEMEN TANYA JAWAB (FAQ) & FILTER KEAMANAN KLINIS
 * Mengimplementasikan PRD A-04, A-05, A-06 & Bagian 9 (Keamanan Klinis)
 * CATATAN: Fitur Riwayat Versi & Rollback ditiadakan sesuai instruksi.
 */

// Regex penyaring dosis medis (PRD Bagian 9: Tanpa diagnosis dan tanpa dosis obat spesifik)
// Menangkap takaran spesifik seperti 500mg, 10 ml, 2 tablet, 3x sehari, 2x1, dll.
var DOSAGE_REGEX = /\b(\d+\s*(mg|ml|gr|gram|mcg|tablet|kapsul|sendok))\b|\b(\d+\s*x\s*\d+)\b/i;

/**
 * Validasi keamanan klinis pada teks jawaban
 * Mencegah bot memberikan dosis obat baru tanpa resep dokter spesialis
 */
function validateClinicalSafety(text) {
  if (!text) return { safe: true };

  var match = text.match(DOSAGE_REGEX);
  if (match) {
    return {
      safe: false,
      flaggedTerm: match[0],
      message: "PERINGATAN KLINIS: Teks memuat indikasi takaran dosis obat (\"" + match[0] + "\"). Sesuai standar keselamatan pasien (PRD Bagian 9), bot dilarang menyebut takaran dosis bebas. Gunakan rujukan: \"Konsumsi obat sesuai resep dokter penanggung jawab Anda\"."
    };
  }

  return { safe: true };
}

/**
 * Mengambil daftar FAQ (semua atau per kategori)
 */
function getFaqs(categoryId) {
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.FAQS);

  var filtered = rows.filter(function(f) {
    if (categoryId && String(f.category_id) !== String(categoryId)) {
      return false;
    }
    return true;
  });

  var faqs = filtered.map(function(f) {
    return {
      id: String(f.id),
      categoryId: String(f.category_id),
      menuTitle: String(f.menu_title),
      answer: String(f.answer),
      order: Number(f.order) || 1,
      active: f.active === true || String(f.active).toLowerCase() === "true",
      modifiedBy: String(f.modified_by || "Admin"),
      updatedAt: f.updated_at
    };
  });

  faqs.sort(function(a, b) {
    return a.order - b.order;
  });

  return { success: true, data: faqs };
}

/**
 * Menambahkan FAQ baru (Langsung tayang / Instant Publish)
 */
function createFaq(faqData, userEmail) {
  if (!faqData) return { success: false, message: "Data FAQ kosong." };

  var catId = faqData.categoryId || faqData.catId;
  var title = faqData.menuTitle || faqData.title;
  var answer = faqData.answer;

  if (!catId || !title || !answer) {
    return { success: false, message: "Kategori, judul menu, dan isi jawaban wajib diisi." };
  }

  // Jika FAQ sudah memiliki ID, alihkan ke updateFaq
  if (faqData.id && String(faqData.id).trim() !== "" && String(faqData.id).trim() !== "new") {
    return updateFaq(faqData.id, faqData, userEmail);
  }

  // 1. Cek keamanan klinis dosis
  var safetyCheck = validateClinicalSafety(answer);
  if (!safetyCheck.safe) {
    return { success: false, message: safetyCheck.message };
  }

  var cleanTitle = String(title).trim();
  var cleanAnswer = String(answer).trim();

  var sheet = getOrCreateSheet(CONFIG.SHEETS.FAQS);
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.FAQS);

  var newId = "faq-" + new Date().getTime();
  var nextOrder = rows.filter(function(r) { return r.category_id === catId; }).length + 1;
  var modifier = userEmail || "Admin RS";

  sheet.appendRow([
    newId,
    catId,
    cleanTitle,
    cleanAnswer,
    nextOrder,
    true,
    modifier,
    new Date().toISOString()
  ]);

  recordAuditLog(modifier, "TAMBAH_FAQ", "Menambahkan pertanyaan baru: \"" + cleanTitle + "\"");

  return {
    success: true,
    message: "FAQ berhasil disimpan dan langsung aktif di bot WhatsApp!",
    faq: {
      id: newId,
      categoryId: catId,
      menuTitle: cleanTitle,
      answer: cleanAnswer
    }
  };
}

/**
 * Memperbarui FAQ yang sudah ada (Langsung tayang / Instant Publish)
 */
function updateFaq(faqId, updateData, userEmail) {
  if (!faqId) return { success: false, message: "ID FAQ wajib diisi." };
  if (!updateData) return { success: false, message: "Data pembaruan FAQ kosong." };

  var title = updateData.menuTitle || updateData.title;
  var catId = updateData.categoryId || updateData.catId;
  var answer = updateData.answer;

  // Cek keamanan klinis jika ada pembaruan teks jawaban
  if (answer) {
    var safetyCheck = validateClinicalSafety(answer);
    if (!safetyCheck.safe) {
      return { success: false, message: safetyCheck.message };
    }
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.FAQS);
  var data = sheet.getDataRange().getValues();
  var foundRowIndex = -1;
  var currentTitle = "";

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(faqId).trim()) {
      foundRowIndex = i + 1;
      currentTitle = data[i][2];
      break;
    }
  }

  if (foundRowIndex === -1) {
    return { success: false, message: "FAQ tidak ditemukan dalam database." };
  }

  var modifier = userEmail || "Admin RS";

  if (catId) sheet.getRange(foundRowIndex, 2).setValue(catId);
  if (title) sheet.getRange(foundRowIndex, 3).setValue(String(title).trim());
  if (answer) sheet.getRange(foundRowIndex, 4).setValue(String(answer).trim());
  if (typeof updateData.order !== "undefined") sheet.getRange(foundRowIndex, 5).setValue(Number(updateData.order));
  if (typeof updateData.active !== "undefined") sheet.getRange(foundRowIndex, 6).setValue(Boolean(updateData.active));
  
  sheet.getRange(foundRowIndex, 7).setValue(modifier);
  sheet.getRange(foundRowIndex, 8).setValue(new Date().toISOString());

  recordAuditLog(modifier, "UBAH_FAQ", "Memperbarui jawaban untuk pertanyaan: \"" + (updateData.menuTitle || currentTitle) + "\"");

  return { success: true, message: "Pembaruan FAQ berhasil disimpan dan tayang!" };
}

/**
 * Menghapus FAQ
 */
function deleteFaq(faqId, userEmail) {
  if (!faqId) return { success: false, message: "ID FAQ wajib diisi." };

  var sheet = getOrCreateSheet(CONFIG.SHEETS.FAQS);
  var data = sheet.getDataRange().getValues();

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(faqId).trim()) {
      var deletedTitle = data[i][2];
      sheet.deleteRow(i + 1);
      recordAuditLog(userEmail || "Admin RS", "HAPUS_FAQ", "Menghapus FAQ: \"" + deletedTitle + "\"");
      return { success: true, message: "FAQ berhasil dihapus." };
    }
  }

  return { success: false, message: "FAQ tidak ditemukan." };
}
