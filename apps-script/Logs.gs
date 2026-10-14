/**
 * LOGS.GS - MANAJEMEN LOG AUDIT STAF & LOG INTERAKSI PASIEN
 * Mengimplementasikan PRD A-14 & Kepatuhan UU PDP No. 27 Tahun 2022
 * - Privasi Pasien: Nomor telepon disamarkan (anonymized)
 * - Tanpa penyimpanan isi chat keluhan medis pasien
 */

/**
 * Menyimpan log audit aktivitas staf admin rumah sakit (A-14)
 */
function recordAuditLog(userEmail, action, details) {
  try {
    var sheet = getOrCreateSheet(CONFIG.SHEETS.AUDIT_LOGS);
    var timestamp = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm 'WIB'");
    var logId = "aud-" + Utilities.getUuid().slice(0, 8);

    sheet.appendRow([
      logId,
      timestamp,
      userEmail || "SYSTEM",
      action || "UNKNOWN_ACTION",
      details || "-"
    ]);
  } catch (e) {
    Logger.log("[AuditLog Error] " + e.message);
  }
}

/**
 * Mengambil daftar log audit terbaru
 */
function getAuditLogs(limit) {
  var maxRows = limit || 50;
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.AUDIT_LOGS);
  
  // Ambil data terbaru dari urutan bawah
  var recent = rows.slice(-maxRows).reverse().map(function(r) {
    return {
      id: r.id,
      timestamp: r.timestamp,
      user: r.user_email,
      action: r.action,
      details: r.details
    };
  });

  return { success: true, data: recent };
}

/**
 * Helper: Menyamarkan nomor telepon pasien sesuai UU PDP
 * Contoh: 081234567890 -> 0812****7890
 */
function anonymizePhoneNumber(phone) {
  if (!phone) return "ANONYMOUS";
  var str = String(phone).replace(/\D/g, "");
  if (str.length <= 6) return "***" + str.slice(-2);
  return str.slice(0, 4) + "****" + str.slice(-4);
}

/**
 * Menyimpan log event interaksi pasien (B-11, PRD Bagian 10)
 * PENTING: Dilarang menyimpan isi percakapan bebas pasien demi perlindungan data medis!
 */
function recordEventLog(rawPhone, eventType, menuChosen, feedback, details) {
  try {
    var sheet = getOrCreateSheet(CONFIG.SHEETS.EVENT_LOGS);
    var timestamp = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd MMM yyyy, HH:mm 'WIB'");
    var logId = "evt-" + Utilities.getUuid().slice(0, 8);
    var anonymized = anonymizePhoneNumber(rawPhone);

    sheet.appendRow([
      logId,
      timestamp,
      anonymized,
      eventType || "INTERACTION",
      menuChosen || "-",
      feedback || "-",
      details || "-"
    ]);

    return { success: true, logId: logId };
  } catch (e) {
    Logger.log("[EventLog Error] " + e.message);
    return { success: false, message: e.message };
  }
}

/**
 * Mengambil daftar log event interaksi pasien terbaru
 */
function getEventLogs(limit) {
  var maxRows = limit || 50;
  var rows = getSheetRowsAsObjects(CONFIG.SHEETS.EVENT_LOGS);

  var recent = rows.slice(-maxRows).reverse().map(function(r) {
    return {
      id: r.id,
      timestamp: r.timestamp,
      anonymizedPhone: r.anonymized_phone,
      eventType: r.event_type,
      menuChosen: r.menu_chosen,
      feedback: r.feedback,
      details: r.details
    };
  });

  return { success: true, data: recent };
}

/**
 * Mengagregasi metrik analitik untuk Dasbor Admin (PRD A-11)
 */
function getDashboardMetrics() {
  var events = getSheetRowsAsObjects(CONFIG.SHEETS.EVENT_LOGS);
  var faqs = getSheetRowsAsObjects(CONFIG.SHEETS.FAQS);

  var totalInteractions = events.length;
  var helpfulCount = 0;
  var unhelpfulCount = 0;
  var escalationCount = 0;

  var questionFrequency = {};

  events.forEach(function(e) {
    if (e.feedback === "HELPFUL" || String(e.feedback).toLowerCase() === "membantu") {
      helpfulCount++;
    }
    if (e.feedback === "UNHELPFUL" || String(e.feedback).toLowerCase() === "belum membantu") {
      unhelpfulCount++;
    }
    if (e.event_type === "ESCALATION_NURSE" || e.event_type === "HUBUNGI_PERAWAT") {
      escalationCount++;
    }
    if (e.menu_chosen && e.menu_chosen !== "-") {
      questionFrequency[e.menu_chosen] = (questionFrequency[e.menu_chosen] || 0) + 1;
    }
  });

  // Hitung persentase kepuasan dan penyelesaian tanpa eskalasi
  var totalFeedback = helpfulCount + unhelpfulCount;
  var satisfactionRate = totalFeedback > 0 ? Math.round((helpfulCount / totalFeedback) * 100) : 100;
  var selfResolvedRate = totalInteractions > 0 
    ? Math.round(((totalInteractions - escalationCount) / totalInteractions) * 100) 
    : 100;

  return {
    success: true,
    data: {
      totalInteractions: totalInteractions,
      totalFaqs: faqs.length,
      satisfactionRate: satisfactionRate + "%",
      selfResolvedRate: selfResolvedRate + "%",
      escalationCount: escalationCount,
      popularQuestions: questionFrequency
    }
  };
}
