/**
 * WHATSAPP CHATBOT CONVERSATIONAL ENGINE
 * Implements PRD Bot WhatsApp Rumah Sakit (B-01 through B-12)
 * Designed with strict Clinical Safety rules & zero generative hallucinations.
 */

class HospitalWhatsAppBot {
  constructor() {
    this.emergencyHotline = '';
    this.hospitalAddress = '';
    this.sessionTimeoutMs = 30 * 60 * 1000; // 30 menit per PRD

    // Pembersihan versi storage sekali jalan untuk membersihkan cache legacy di browser pengguna
    this.checkStorageMigration();

    // Data kategori & FAQ (dimuat dari localStorage atau default kosong)
    this.data = this.loadDataFromStorage() || this.getDefaultData();

    // Aturan Darurat IGD (dimuat dari localStorage atau default kosong)
    this.emergencyRules = this.loadEmergencyRules();
    const primary = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);
    if (primary) {
      if (primary.phone) this.emergencyHotline = primary.phone;
      if (primary.location) this.hospitalAddress = primary.location;
    }

    // Session State: [state: 'MAIN' | 'CATEGORY' | 'ANSWER_FEEDBACK', currentCategory: null, currentFaq: null, failCount: 0]
    this.state = 'MAIN';
    this.currentCategory = null;
    this.currentFaq = null;
    this.failCount = 0;
    this.lastActiveTime = Date.now();

    // Event listener callbacks
    this.onNurseAlert = null;
  }

  checkStorageMigration() {
    try {
      const CURRENT_VERSION = 'v2_real';
      const storedVersion = localStorage.getItem('hospital_storage_version');
      if (storedVersion !== CURRENT_VERSION) {
        localStorage.removeItem('hospital_wa_bot_data');
        localStorage.removeItem('hospital_emergency_rules');
        localStorage.setItem('hospital_storage_version', CURRENT_VERSION);
      }
    } catch (e) {
      // Storage access safety
    }
  }

  getDefaultData() {
    return {
      settings: {
        greeting: '',
        fallback: '',
        afterHours: '',
        operatingHours: '',
        emergencyHotline: '',
        ambulance: '',
        hospitalAddress: ''
      },
      categories: []
    };
  }

  loadDataFromStorage() {
    try {
      const saved = localStorage.getItem('hospital_wa_bot_data');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  saveDataToStorage(newData) {
    this.data = newData || this.getDefaultData();
    try {
      localStorage.setItem('hospital_wa_bot_data', JSON.stringify(this.data));
    } catch (e) {}
  }

  // Cek timeout ketidakaktifan 30 menit
  checkSessionTimeout() {
    const now = Date.now();
    if (now - this.lastActiveTime > this.sessionTimeoutMs) {
      this.resetToMain();
    }
    this.lastActiveTime = now;
  }

  resetToMain() {
    this.state = 'MAIN';
    this.currentCategory = null;
    this.currentFaq = null;
    this.failCount = 0;
  }

  loadEmergencyRules() {
    try {
      const stored = localStorage.getItem('hospital_emergency_rules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {}
    return [];
  }

  // Tangani eskalasi darurat dengan pesan aman tanpa crash jika aturan kosong
  handleEmergencyEscalation(reason = 'Panggilan Darurat IGD', rule = null) {
    this.logEvent('EMERGENCY_TRIGGERED', reason);
    if (this.onNurseAlert) {
      this.onNurseAlert({
        type: 'EMERGENCY_OVERRIDE',
        time: new Date().toLocaleTimeString('id-ID'),
        status: 'Prioritas Darurat IGD'
      });
    }

    const rules = this.emergencyRules || [];
    const primary = rules.find(r => r.isPrimary) || rules[0] || null;
    const target = rule || primary;

    const title = (target?.title || 'Layanan Darurat IGD 24 Jam').toUpperCase();
    const phone = target?.phone || this.emergencyHotline || this.data?.settings?.emergencyHotline;
    const ambulance = target?.ambulance || this.data?.settings?.ambulance;
    const location = target?.location || this.hospitalAddress || this.data?.settings?.hospitalAddress;
    const instructions = target?.instructions || 'Jika pasien mengalami keluhan akut atau penurunan kesadaran, segera bawa ke instalasi gawat darurat terdekat tanpa menunda.';

    let text = `*${title}*\nRSUD Prof. Dr. Margono Soekarjo siap melayani penanganan kegawatdaruratan medis 24 jam.\n\n`;
    if (phone) text += `• Hotline IGD: ${phone}\n`;
    if (ambulance) text += `• Ambulans Siaga: ${ambulance}\n`;
    if (location) text += `• Lokasi: ${location}\n`;
    if (phone || ambulance || location) text += `\n`;
    text += `${instructions}\n\nKetik *0* untuk kembali ke menu utama.`;

    return {
      isEmergency: true,
      text: text
    };
  }

  // Menghasilkan teks Menu Utama
  getMainMenuText() {
    const greeting = this.data?.settings?.greeting || '';
    let msg = greeting ? `${greeting}\n\n` : '';
    msg += `Silakan pilih topik:\n`;
    const categories = this.data?.categories || [];
    if (categories.length === 0) {
      msg += `(Belum ada topik yang aktif)\n`;
    } else {
      categories.forEach((cat, index) => {
        msg += `${index + 1}. ${cat.title}\n`;
      });
    }
    msg += `\n(Ketik angka pilihan Anda, atau ketik 0 kapan saja untuk kembali)`;
    return msg;
  }

  // Menghasilkan teks Sub-Menu Kategori
  getCategoryMenuText(category) {
    let msg = `Topik: *${category.title}*\n`;
    if (!category.faqs || category.faqs.length === 0) {
      msg += `\nBelum ada pertanyaan yang terdaftar pada topik ini.\n\n0. Kembali ke menu utama`;
    } else {
      msg += `Silakan pilih pertanyaan:\n\n`;
      category.faqs.forEach((faq, index) => {
        msg += `${index + 1}. ${faq.menuTitle || faq.title}\n`;
      });
      msg += `\n0. Kembali ke menu utama`;
    }
    return msg;
  }

  // Pemrosesan pesan masuk simulator
  processMessage(rawInput) {
    this.checkSessionTimeout();
    const input = (rawInput || '').trim();
    const lower = input.toLowerCase();

    // 0. DETEKSI KATA KUNCI DARURAT (PRD B-06)
    const rules = this.emergencyRules || [];
    for (const r of rules) {
      if (Array.isArray(r.keywords)) {
        for (const kw of r.keywords) {
          if (kw && lower.includes(kw.toLowerCase().trim())) {
            return this.handleEmergencyEscalation(`Deteksi Kata Kunci: ${kw}`, r);
          }
        }
      }
    }

    // 1. RESET GLOBAL ('menu' atau '0' atau 'kembali')
    if (lower === 'menu' || lower === '0' || lower === 'kembali') {
      this.resetToMain();
      return {
        text: this.getMainMenuText()
      };
    }

    // 2. PENANGANAN STATUS PERCAKAPAN
    if (this.state === 'MAIN') {
      const num = parseInt(input, 10);
      const categories = this.data?.categories || [];
      if (!isNaN(num) && num >= 1 && num <= categories.length) {
        this.failCount = 0;
        const selectedCat = categories[num - 1];

        // Menu Darurat IGD
        if (selectedCat.isEmergency) {
          const primaryRule = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]) || null;
          return this.handleEmergencyEscalation('Pilihan Menu IGD', primaryRule);
        }

        // Menu Hubungi Perawat
        if (selectedCat.isEscalation) {
          return this.handleNurseEscalation();
        }

        this.currentCategory = selectedCat;
        this.state = 'CATEGORY';
        this.logEvent('MENU_CLICKED', selectedCat.title);
        return {
          text: this.getCategoryMenuText(selectedCat)
        };
      } else {
        return this.handleFallback();
      }
    }

    if (this.state === 'CATEGORY') {
      const num = parseInt(input, 10);
      if (!isNaN(num) && this.currentCategory && Array.isArray(this.currentCategory.faqs)) {
        if (num >= 1 && num <= this.currentCategory.faqs.length) {
          this.failCount = 0;
          const selectedFaq = this.currentCategory.faqs[num - 1];
          this.currentFaq = selectedFaq;
          this.state = 'ANSWER_FEEDBACK';
          this.logEvent('FAQ_VIEWED', selectedFaq.menuTitle || selectedFaq.title);

          const answerText = `*${selectedFaq.menuTitle || selectedFaq.title}*\n\n${selectedFaq.answer}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Apakah jawaban ini membantu?\n` +
            `1. Membantu\n` +
            `2. Belum Membantu\n` +
            `3. Hubungi Perawat Jaga\n` +
            `0. Kembali ke menu`;

          return {
            text: answerText
          };
        }
      }
      return this.handleFallback();
    }

    if (this.state === 'ANSWER_FEEDBACK') {
      if (input === '1') {
        this.logEvent('FEEDBACK', 'HELPFUL');
        this.resetToMain();
        return {
          text: `Terima kasih atas umpan balik Anda! Senang bisa mendampingi pemulihan Bapak/Ibu.\n\nKetik *0* atau *menu* bila membutuhkan informasi lainnya.`
        };
      } else if (input === '2') {
        this.logEvent('FEEDBACK', 'NOT_HELPFUL');
        return {
          text: `Mohon maaf jika informasi belum memadai. Apakah Anda ingin tersambung dengan perawat jaga?\n\nKetik *3* untuk Hubungi Perawat, atau *0* untuk kembali ke menu utama.`
        };
      } else if (input === '3') {
        return this.handleNurseEscalation();
      } else {
        return this.handleFallback();
      }
    }

    return this.handleFallback();
  }

  handleNurseEscalation() {
    this.logEvent('ESCALATE_NURSE', 'REQUESTED');
    if (this.onNurseAlert) {
      this.onNurseAlert({
        type: 'NURSE_ESCALATION',
        time: new Date().toLocaleTimeString('id-ID'),
        status: 'Staf Terberitahu'
      });
    }

    const operatingHours = this.data?.settings?.operatingHours;
    const igdPhone = this.emergencyHotline || this.data?.settings?.emergencyHotline;

    let text = `*Permintaan Diteruskan ke Perawat Jaga*\n\n` +
      `Notifikasi telah dikirimkan ke tim perawat jaga RSUD Prof. Dr. Margono Soekarjo. Perawat kami akan segera membalas atau menghubungi WhatsApp Anda.\n\n`;

    if (operatingHours) {
      text += `Jam layanan aktif: ${operatingHours}\n`;
    }
    if (igdPhone) {
      text += `Bila mendesak di luar jam layanan, segera hubungi IGD: ${igdPhone}.\n\n`;
    } else {
      text += `Bila terjadi kondisi darurat, segera datangi unit IGD terdekat.\n\n`;
    }
    text += `Ketik *0* untuk kembali ke menu.`;

    return {
      isAlert: true,
      text: text
    };
  }

  handleFallback() {
    this.failCount++;
    this.logEvent('FALLBACK', `Fail count: ${this.failCount}`);

    if (this.failCount >= 2) {
      return {
        text: `Kami mendeteksi kesulitan dalam memilih menu.\n\nKetik *3* untuk Hubungi Perawat\nKetik *4* untuk Panggilan Darurat IGD\nKetik *0* untuk Kembali ke Menu Utama`
      };
    }

    const fallbackMsg = this.data?.settings?.fallback || 'Pilihan tidak dikenali. Silakan ketik angka menu yang tersedia atau ketik 0 untuk kembali ke menu utama.';
    return {
      text: fallbackMsg
    };
  }

  // Telemetri log lokal sesuai kaidah UU PDP (tanpa data pribadi atau nomor telepon utuh)
  logEvent(type, details) {
    try {
      const logs = JSON.parse(localStorage.getItem('hospital_bot_logs') || '[]');
      logs.unshift({
        timestamp: new Date().toISOString(),
        timeFormatted: new Date().toLocaleTimeString('id-ID'),
        type: type,
        details: details,
        anonymizedPhone: '+62812****' + Math.floor(1000 + Math.random() * 9000)
      });
      if (logs.length > 100) logs.pop();
      localStorage.setItem('hospital_bot_logs', JSON.stringify(logs));
    } catch (e) {}
  }
}

// Ekspor ke window global untuk simulator browser
window.HospitalWhatsAppBot = HospitalWhatsAppBot;
