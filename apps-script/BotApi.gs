/**
 * BOTAPI.GS - JEMBATAN SINKRONISASI SERVER BAILEYS WHATSAPP
 * Mengimplementasikan PRD B-04 & Bagian 11 (Tech Stack & Cache)
 * 
 * Sesuai PRD: "Menu disimpan di cache server Baileys. Apps Script lambat dan berkuota,
 * jadi menu tidak dibaca ulang di setiap pesan."
 * Server Node.js mengambil paket menu lengkap (getBotBundle) dan menyimpannya di memori.
 */

/**
 * Validasi otentikasi token rahasia antar server (Baileys Node.js -> Google Apps Script)
 */
function verifyBotApiToken(requestToken) {
  if (!CONFIG.API_SECRET_TOKEN || CONFIG.API_SECRET_TOKEN === "") return true;
  return String(requestToken) === String(CONFIG.API_SECRET_TOKEN);
}

/**
 * Menyediakan seluruh bundel data bot WhatsApp dalam 1 panggilan cepat (Single Trip)
 * Struktur JSON dicocokkan langsung dengan format memori Baileys Node.js bot
 */
function getBotBundle(requestToken) {
  if (!verifyBotApiToken(requestToken)) {
    return { success: false, message: "Akses ditolak: Token API Baileys tidak valid." };
  }

  var catRows = getSheetRowsAsObjects(CONFIG.SHEETS.CATEGORIES);
  var faqRows = getSheetRowsAsObjects(CONFIG.SHEETS.FAQS);
  var settingsRes = getSettings();

  // Susun struktur kategori dengan array faqs di dalamnya
  var categoriesBundle = catRows
    .filter(function(c) {
      return c.active === true || String(c.active).toLowerCase() === "true";
    })
    .map(function(c) {
      var categoryFaqs = faqRows
        .filter(function(f) {
          return String(f.category_id) === String(c.id) &&
                 (f.active === true || String(f.active).toLowerCase() === "true");
        })
        .map(function(f) {
          return {
            id: String(f.id),
            menuTitle: String(f.menu_title),
            answer: String(f.answer),
            order: Number(f.order) || 1
          };
        });

      // Urutkan FAQ berdasarkan order
      categoryFaqs.sort(function(a, b) { return a.order - b.order; });

      var isEsc = c.is_escalation === true || String(c.is_escalation).toLowerCase() === "true";
      var isEmg = c.is_emergency === true || String(c.is_emergency).toLowerCase() === "true" || /darurat|igd/i.test(String(c.title));

      return {
        id: String(c.id),
        title: String(c.title),
        order: Number(c.order) || 1,
        isEscalation: isEsc,
        isEmergency: isEmg,
        faqs: categoryFaqs
      };
    });

  // Urutkan kategori berdasarkan order
  categoriesBundle.sort(function(a, b) { return a.order - b.order; });

  // Ambil daftar protokol darurat IGD terkini
  var emergencyRes = getEmergencyRules();

  return {
    success: true,
    data: {
      categories: categoriesBundle,
      settings: settingsRes.data,
      emergencyRules: (emergencyRes && emergencyRes.data) ? emergencyRes.data : []
    },
    syncedAt: new Date().toISOString()
  };
}

/**
 * Menerima webhook event dari server Baileys saat pasien berinteraksi di WhatsApp
 */
function handleBotEventWebhook(eventData, requestToken) {
  if (!verifyBotApiToken(requestToken)) {
    return { success: false, message: "Akses ditolak: Token API Baileys tidak valid." };
  }

  if (!eventData) {
    return { success: false, message: "Payload event kosong." };
  }

  var res = recordEventLog(
    eventData.phone,
    eventData.eventType,
    eventData.menuChosen,
    eventData.feedback,
    eventData.details
  );

  return res;
}
