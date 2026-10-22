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

      // 10. Katalog Obat Kemoterapi (Publik: hanya status Tayang)
      case "get_obat_list":
      case "obat":
        return createJsonResponse(getObatList(params));

      // 11. Detail Obat Kemoterapi beserta Fasilitas (Publik)
      case "get_obat_detail":
      case "obat_detail":
        return createJsonResponse(getObatDetail(params.id));

      // 12. Daftar Obat Admin (termasuk Draft)
      case "admin_get_obat_list":
        return createJsonResponse(adminGetObatList(params.token || "", params));

      // 13. Daftar Regimen Kemoterapi (Publik: hanya status aktif)
      case "get_regimen_list":
      case "regimen":
        return createJsonResponse(getRegimenList(params));

      // 14. Daftar Regimen Admin (Semua, termasuk nonaktif)
      case "admin_get_regimen_list":
        return createJsonResponse(adminGetRegimenList(params.token || "", params));

      // Default: Status Info Web App
      default:
        return createJsonResponse({
          status: "online",
          service: "RS Medica WhatsApp Bot Apps Script Backend",
          timestamp: new Date().toISOString(),
          availableActions: [
            "init", "categories", "faqs", "settings", "audit_logs", "event_logs", 
            "metrics", "bot_bundle", "users", "get_obat_list", "get_obat_detail", "admin_get_obat_list",
            "get_regimen_list", "admin_get_regimen_list"
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
    if (typeof body.obatData === "string") {
      try { body.obatData = JSON.parse(body.obatData); } catch (err) {}
    }
    if (typeof body.fasilitasData === "string") {
      try { body.fasilitasData = JSON.parse(body.fasilitasData); } catch (err) {}
    }
    if (typeof body.regimenData === "string") {
      try { body.regimenData = JSON.parse(body.regimenData); } catch (err) {}
    }
    if (typeof body.data === "string") {
      try { body.data = JSON.parse(body.data); } catch (err) {}
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


      // ================= LOG & EVENT BAILEYS =================
      case "bot_event":
        return createJsonResponse(handleBotEventWebhook(body.eventData, token));

      // ================= KATALOG OBAT KEMOTERAPI =================
      case "get_obat_list":
        return createJsonResponse(getObatList(body));

      case "get_obat_detail": {
        var detailId = body.id || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(getObatDetail(detailId));
      }

      case "admin_get_obat_list":
        return createJsonResponse(adminGetObatList(token, body));

      case "create_obat":
        return createJsonResponse(createObat(body.obatData || body, token));

      case "update_obat": {
        var updateId = body.id || (body.obatData && body.obatData.id) || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(updateObat(updateId, body.obatData || body, token));
      }

      case "delete_obat": {
        var delId = body.id || (body.obatData && body.obatData.id) || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(deleteObat(delId, token));
      }

      case "create_fasilitas_obat":
        return createJsonResponse(createFasilitasObat(body.fasilitasData || body, token));

      case "update_fasilitas_obat": {
        var fasUpdateId = body.id || (body.fasilitasData && body.fasilitasData.id) || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(updateFasilitasObat(fasUpdateId, body.fasilitasData || body, token));
      }

      case "delete_fasilitas_obat": {
        var fasDelId = body.id || (body.fasilitasData && body.fasilitasData.id) || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(deleteFasilitasObat(fasDelId, token));
      }

      case "import_obat_bulk":
        return createJsonResponse(importObatBulk(body.items || body.obatList || [], token));

      // ================= KALKULATOR REGIMEN KEMOTERAPI =================
      case "get_regimen_list":
        return createJsonResponse(getRegimenList(body));

      case "admin_get_regimen_list":
        return createJsonResponse(adminGetRegimenList(token, body));

      case "create_regimen": {
        var regCreateData = body.regimenData || body.data || body;
        return createJsonResponse(createRegimen(regCreateData, token));
      }

      case "update_regimen": {
        var regUpdateId = body.id || (body.regimenData && body.regimenData.id) || (body.data && body.data.id) || (e && e.parameter && e.parameter.id) || "";
        var regUpdateData = body.regimenData || body.data || body;
        return createJsonResponse(updateRegimen(regUpdateId, regUpdateData, token));
      }

      case "delete_regimen": {
        var regDelId = body.id || (body.regimenData && body.regimenData.id) || (body.data && body.data.id) || (e && e.parameter && e.parameter.id) || "";
        return createJsonResponse(deleteRegimen(regDelId, token));
      }

      case "toggle_regimen": {
        var regToggleId = body.id || (body.regimenData && body.regimenData.id) || (body.data && body.data.id) || (e && e.parameter && e.parameter.id) || "";
        var regToggleActive = (body.active !== undefined) ? body.active : ((body.data && body.data.active !== undefined) ? body.data.active : (body.regimenData && body.regimenData.active));
        return createJsonResponse(toggleRegimenStatus(regToggleId, regToggleActive, token));
      }

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
