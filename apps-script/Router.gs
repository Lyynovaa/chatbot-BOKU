/**
 * ROUTER.GS - WEB APP API DISPATCHER (doGet & doPost)
 * Menangani routing endpoint REST API untuk Web Admin Portal dan Server Baileys
 */

/**
 * Helper: Mengembalikan respons JSON standar Google Apps Script
 */
function createJsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

/**
 * Entry point HTTP GET
 */
function doGet(e) {
  try {
    ensureDatabaseExists(); // Otomatis buat tabel jika belum ada!
    var params = (e && e.parameter) ? e.parameter : {};
    var action = params.action || "";

    switch (action) {
      // 1. Inisialisasi Database (Setup Pertama Kali)
      case "init":
        return createJsonResponse(initDatabase());

      // 2. Mengambil Seluruh Kategori
      case "categories":
        return createJsonResponse(getCategories());

      // 3. Mengambil FAQ
      case "faqs":
        return createJsonResponse(getFaqs(params.categoryId));

      // 4. Mengambil Pengaturan Global
      case "settings":
        return createJsonResponse(getSettings());

      // 5. Mengambil Log Audit Staf
      case "audit_logs":
        return createJsonResponse(getAuditLogs(Number(params.limit) || 50));

      // 6. Mengambil Log Interaksi Pasien
      case "event_logs":
        return createJsonResponse(getEventLogs(Number(params.limit) || 50));

      // 7. Mengambil Metrik Analitik Dasbor
      case "metrics":
        return createJsonResponse(getDashboardMetrics());

      // 8. Sinkronisasi Data ke Server Baileys Node.js
      case "bot_bundle":
        return createJsonResponse(getBotBundle(params.token || CONFIG.API_SECRET_TOKEN));

      // 9. Mengambil Daftar Staf Pengguna Whitelist
      case "users":
        return createJsonResponse(getUsersList(params.token || CONFIG.API_SECRET_TOKEN));

      // 10. Mengambil Daftar Protokol Panggilan Darurat IGD
      case "emergency_rules":
        return createJsonResponse(getEmergencyRules());

      // Default: Status Info Web App
      default:
        return createJsonResponse({
          status: "online",
          service: "RS Medica WhatsApp Bot Apps Script Backend",
          timestamp: new Date().toISOString(),
          availableActions: [
            "init", "categories", "faqs", "settings", "emergency_rules", "audit_logs", "event_logs", "metrics", "bot_bundle", "users"
          ]
        });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}

/**
 * Entry point HTTP POST
 */
function doPost(e) {
  try {
    ensureDatabaseExists(); // Otomatis buat & migrasi tabel jika belum ada!
    var body = {};

    // Parse payload baik berupa raw JSON maupun FormData
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (err) {
        body = e.parameter || {};
      }
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    // Parse sub-objek jika masih berupa string JSON
    if (typeof body.ruleData === "string") {
      try { body.ruleData = JSON.parse(body.ruleData); } catch (err) {}
    }
    if (typeof body.faqData === "string") {
      try { body.faqData = JSON.parse(body.faqData); } catch (err) {}
    }
    if (typeof body.updateData === "string") {
      try { body.updateData = JSON.parse(body.updateData); } catch (err) {}
    }
    if (typeof body.settings === "string") {
      try { body.settings = JSON.parse(body.settings); } catch (err) {}
    }
    if (typeof body.userData === "string") {
      try { body.userData = JSON.parse(body.userData); } catch (err) {}
    }
    if (typeof body.eventData === "string") {
      try { body.eventData = JSON.parse(body.eventData); } catch (err) {}
    }

    var action = body.action || (e && e.parameter && e.parameter.action) || "";
    var token = body.token || (e && e.parameter && e.parameter.token) || CONFIG.API_SECRET_TOKEN;

    switch (action) {
      // ================= AUTENTIKASI ADMIN =================
      case "login":
        return createJsonResponse(loginAdmin(body.email, body.password));

      case "login_google":
        return createJsonResponse(loginWithGoogleSso(body.email));

      case "get_users":
        return createJsonResponse(getUsersList(token));

      case "add_user":
        return createJsonResponse(addAdminUser(body.userData, token));

      case "toggle_user":
        return createJsonResponse(toggleUserStatus(body.email, body.active, token));

      case "delete_user":
        return createJsonResponse(deleteAdminUser(body.email, token));

      // ================= KELOLA KATEGORI =================
      case "create_category":
      case "save_category":
        if (body.id) {
          return createJsonResponse(updateCategory(body.id, body.title, body.order, body.userEmail, body.isEscalation, body.isEmergency, body.active));
        }
        return createJsonResponse(createCategory(body.title || body, body.isEscalation, body.isEmergency, body.userEmail));

      case "update_category":
        return createJsonResponse(updateCategory(body.id, body.title, body.order, body.userEmail, body.isEscalation, body.isEmergency, body.active));

      case "delete_category":
        return createJsonResponse(deleteCategory(body.id, body.userEmail));

      // ================= KELOLA FAQ =================
      case "create_faq":
      case "save_faq":
        if (body.id && body.action === "save_faq") {
          return createJsonResponse(updateFaq(body.id, body.updateData || body.faqData || body, body.userEmail));
        }
        return createJsonResponse(createFaq(body.faqData || body, body.userEmail));

      case "update_faq":
        return createJsonResponse(updateFaq(body.id, body.updateData || body.faqData || body, body.userEmail));

      case "delete_faq":
        return createJsonResponse(deleteFaq(body.id, body.userEmail));

      // ================= PENGATURAN GLOBAL =================
      case "update_settings":
      case "save_settings":
        var targetSettings = body.settings || body.settingsData || body;
        return createJsonResponse(updateSettings(targetSettings, body.userEmail));

      // ================= KELOLA PANGGILAN DARURAT IGD =================
      case "get_emergency_rules":
        return createJsonResponse(getEmergencyRules());

      case "save_emergency_rule":
        return createJsonResponse(saveEmergencyRule(body.ruleData || body, body.userEmail));

      case "create_emergency_rule":
        return createJsonResponse(createEmergencyRule(body.ruleData || body, body.userEmail));

      case "update_emergency_rule":
        return createJsonResponse(updateEmergencyRule(body.id, body.ruleData || body, body.userEmail));

      case "delete_emergency_rule":
        return createJsonResponse(deleteEmergencyRule(body.id, body.userEmail));

      // ================= LOG & EVENT BAILEYS =================
      case "bot_event":
        return createJsonResponse(handleBotEventWebhook(body.eventData, token));

      // Default: Action tidak dikenali
      default:
        return createJsonResponse({ 
          success: false, 
          message: "Aksi POST \"" + action + "\" tidak dikenali dalam sistem." 
        });
    }
  } catch (err) {
    return createJsonResponse({ success: false, error: err.message });
  }
}
