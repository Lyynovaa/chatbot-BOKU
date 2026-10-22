/**
 * WEB CHATBOT CONVERSATIONAL ENGINE - RSUD PROF. DR. MARGONO SOEKARJO
 * Implements clinical safety rules, keyword triage, zero generative hallucinations.
 * Provides interactive options, emergency overrides, and quick actions for Web Chat UI.
 */

class HospitalWebChatBot {
  constructor() {
    this.emergencyHotline = '';
    this.hospitalAddress = '';
    this.sessionTimeoutMs = 30 * 60 * 1000; // 30 menit sesi aktif

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
      const CURRENT_VERSION = 'v4_wijayakusuma';
      const storedVersion = localStorage.getItem('hospital_storage_version');
      if (storedVersion !== CURRENT_VERSION) {
        localStorage.removeItem('hospital_web_bot_data');
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
        greeting: 'Selamat datang di Layanan Asisten Virtual BOKU Ruang Wijaya Kusuma (Gedung Onkologi Terpadu & Hematologi) RSUD Prof. Dr. Margono Soekarjo Purwokerto. Kami siap memberikan informasi pelayanan onkologi, panduan kemoterapi, dan informasi medis 24 jam.',
        fallback: 'Pilihan tidak dikenali. Silakan pilih tombol opsi yang tersedia atau ketik nomor menu (ketik 0 untuk kembali ke menu utama).',
        afterHours: 'Layanan informasi BOKU aktif 24 jam. Tim medis dan perawat onkologi siaga penuh di rumah sakit.',
        operatingHours: '24 Jam Non-Stop',
        emergencyHotline: '(0281) 641992',
        ambulance: '118 / (0281) 641992',
        hospitalAddress: 'Gedung Onkologi Terpadu Wijayakusuma, Jl. Dr. Gumbreg No. 1, Berkoh, Purwokerto Selatan'
      },
      categories: [
        {
          id: 'cat-onkologi',
          title: 'Pelayanan Onkologi & Panduan Kemoterapi',
          order: 1,
          isEscalation: false,
          isEmergency: false,
          faqs: [
            {
              id: 'faq-onko-1',
              menuTitle: 'Panduan Kemoterapi & Efek Samping (Mual/Lemas)',
              keywords: ['kemoterapi', 'kemo', 'mual', 'lemas', 'efek samping kemo', 'panduan kemoterapi'],
              answer: 'Pasien pasca-kemoterapi disarankan makan dalam porsi kecil namun sering, hindari makanan berbau tajam/berlemak, dan cukupi asupan cairan minimal 2 liter/hari. Bila timbul mual atau lemas berlebih, minum obat anti-mual yang diresepkan dokter onkologi.',
              order: 1
            },
            {
              id: 'faq-onko-2',
              menuTitle: 'Jadwal Praktik Dokter Poli Onkologi & Bedah Tumor',
              keywords: ['jadwal dokter onkologi', 'poli onkologi', 'bedah onkologi', 'jadwal poli onkologi'],
              answer: 'Poliklinik Onkologi Terpadu Gedung Wijayakusuma buka Senin-Kamis 07.30-14.00 WIB dan Jumat 07.30-11.00 WIB. Dokter spesialis bedah onkologi, onko-ginekologi, hematologi, THT, dan mata onkologi siap melayani sesuai jadwal poli.',
              order: 2
            },
            {
              id: 'faq-onko-3',
              menuTitle: 'Alur Kemoterapi One Day Care & Rawat Inap',
              keywords: ['kemoterapi one day care', 'day care', 'rawat inap kemo', 'alur kemo', 'alur kemoterapi'],
              answer: '1. Pemeriksaan lab darah rutin (DPL, fungsi organ) sebelum kemo.\n2. Konsultasi dokter onkologi untuk konfirmasi kelayakan siklus kemoterapi.\n3. Rekonstitusi obat kemoterapi oleh farmasi sitotoksik clean room BSC.\n4. Pelaksanaan infus kemoterapi di ruang Day Care atau rawat inap Wijayakusuma dengan pemantauan perawat.',
              order: 3
            },
            {
              id: 'faq-onko-4',
              menuTitle: 'Pencampuran Obat Sitotoksik & Clean Room BSC',
              keywords: ['pencampuran obat sitotoksik', 'farmasi sitotoksik', 'clean room', 'bsc'],
              answer: 'Pencampuran obat kemoterapi di Ruang Wijaya Kusuma dilakukan di Clean Room khusus bertekanan negatif dengan alat Biological Safety Cabinet (BSC) bersertifikasi internasional oleh apoteker terlatih guna menjamin kesterilan sediaan obat dan keselamatan pasien.',
              order: 4
            }
          ]
        },
        {
          id: 'cat-1',
          title: 'Pendaftaran Online & Poliklinik Spesialis',
          order: 2,
          isEscalation: false,
          isEmergency: false,
          faqs: [
            {
              id: 'faq-1',
              menuTitle: 'Alur Pendaftaran Online Pasien BPJS & Umum',
              keywords: ['pendaftaran', 'daftar', 'online', 'mobile jkn'],
              answer: 'Pendaftaran poliklinik RSUD Margono dapat diakses melalui website resmi atau aplikasi Mobile JKN H-1 sebelum jadwal kunjungan. Bawa surat rujukan aktif FKTP dan KTP.',
              order: 1
            },
            {
              id: 'faq-2',
              menuTitle: 'Jadwal Praktik Dokter Poliklinik',
              keywords: ['jadwal dokter', 'jadwal praktik'],
              answer: 'Poliklinik buka Senin-Kamis 07.30-14.00 WIB dan Jumat 07.30-11.00 WIB. Dokter spesialis siaga sesuai jadwal masing-masing poliklinik.',
              order: 2
            }
          ]
        },
        {
          id: 'cat-2',
          title: 'Alur BPJS Kesehatan & Syarat Rujukan',
          order: 3,
          isEscalation: false,
          isEmergency: false,
          faqs: [
            {
              id: 'faq-3',
              menuTitle: 'Persyaratan Berobat dengan BPJS Kesehatan',
              keywords: ['bpjs', 'rujukan', 'fktp', 'kis'],
              answer: '1. Surat Rujukan FKTP yang masih aktif\n2. Kartu BPJS/KIS aktif\n3. KTP/identitas diri pasien.',
              order: 1
            }
          ]
        },
        {
          id: 'cat-3',
          title: 'Informasi Rawat Inap & Fasilitas Paviliun',
          order: 4,
          isEscalation: false,
          isEmergency: false,
          faqs: [
            {
              id: 'faq-4',
              menuTitle: 'Ketersediaan Kamar Rawat Inap',
              keywords: ['rawat inap', 'kamar', 'ruang', 'paviliun'],
              answer: 'Kamar rawat inap Ruang Wijaya Kusuma, Kelas 1, 2, 3, VIP, dan Paviliun Abiyasa Geriatri dapat dicek melalui loket admisi rawat inap atau SIRANAP Kemenkes.',
              order: 1
            }
          ]
        }
      ]
    };
  }

  loadDataFromStorage() {
    try {
      const saved = localStorage.getItem('hospital_web_bot_data') || localStorage.getItem('hospital_wa_bot_data');
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
      localStorage.setItem('hospital_web_bot_data', JSON.stringify(this.data));
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
    const phone = target?.phone || this.emergencyHotline || this.data?.settings?.emergencyHotline || '(0281) 641992';
    const ambulance = target?.ambulance || this.data?.settings?.ambulance || '118 / (0281) 641992';
    const location = target?.location || this.hospitalAddress || this.data?.settings?.hospitalAddress || 'Jl. Dr. Gumbreg No. 1, Purwokerto Selatan';
    const instructions = target?.instructions || 'Jika pasien mengalami keluhan akut seperti sesak napas berat, nyeri dada hebat, atau penurunan kesadaran, segera bawa ke IGD RSUD Margono terdekat.';

    let text = `*${title}*\nRSUD Prof. Dr. Margono Soekarjo siap melayani penanganan kegawatdaruratan medis 24 jam.\n\n`;
    if (phone) text += `• Hotline IGD: ${phone}\n`;
    if (ambulance) text += `• Ambulans Siaga: ${ambulance}\n`;
    if (location) text += `• Lokasi: ${location}\n`;
    if (phone || ambulance || location) text += `\n`;
    text += `${instructions}\n\nKetik *0* atau klik tombol di bawah untuk kembali ke menu utama.`;

    return {
      isEmergency: true,
      text: text,
      options: [
        { label: `Hotline IGD (${phone})`, value: 'hotline_call', isEmergencyAction: true, phone: phone },
        { label: '0. Menu Utama', value: '0' }
      ]
    };
  }

  // Menghasilkan teks Menu Utama & tombol pilihan
  getMainMenuData() {
    const greeting = this.data?.settings?.greeting || 'Selamat datang di Layanan Asisten Virtual BOKU RSUD Prof. Dr. Margono Soekarjo Purwokerto.';
    let msg = greeting ? `${greeting}\n\n` : '';
    msg += `Silakan pilih topik informasi yang Anda butuhkan:\n`;
    
    const rawCategories = this.data?.categories || [];
    const categories = rawCategories.filter(c => !c.isEmergency && !/panggilan darurat|layanan darurat/i.test(c.title));
    const options = [];

    if (categories.length === 0) {
      msg += `(Belum ada topik aktif yang terdaftar)\n`;
    } else {
      categories.forEach((cat, index) => {
        msg += `${index + 1}. ${cat.title}\n`;
        options.push({
          label: `${index + 1}. ${cat.title}`,
          value: String(index + 1),
          isEmergency: false
        });
      });
    }

    // Opsi Cepat Terpisah untuk Katalog Obat Kemoterapi (Tanpa merusak penomoran menu 1, 2, 3...)
    options.push({
      label: 'Katalog Obat Kemoterapi',
      value: 'open_katalog_obat',
      isAction: true
    });

    msg += `\n(Klik tombol di bawah atau ketik angka menu pilihan Anda)`;

    return {
      text: msg,
      options: options
    };
  }

  getMainMenuText() {
    return this.getMainMenuData().text;
  }

  // Menghasilkan teks Sub-Menu Kategori & tombol pertanyaan
  getCategoryMenuData(category) {
    let msg = `Topik: *${category.title}*\n`;
    const options = [];

    if (!category.faqs || category.faqs.length === 0) {
      msg += `\nBelum ada pertanyaan yang terdaftar pada topik ini.\n\n0. Kembali ke menu utama`;
    } else {
      msg += `Silakan pilih pertanyaan:\n\n`;
      category.faqs.forEach((faq, index) => {
        const title = faq.menuTitle || faq.title;
        msg += `${index + 1}. ${title}\n`;
        options.push({
          label: `${index + 1}. ${title}`,
          value: String(index + 1)
        });
      });
      msg += `\n0. Kembali ke menu utama`;
    }

    options.push({
      label: '0. Kembali ke Menu Utama',
      value: '0'
    });

    return {
      text: msg,
      options: options
    };
  }

  getCategoryMenuText(category) {
    return this.getCategoryMenuData(category).text;
  }

  // Pemrosesan pesan masuk pada Web Chatbot
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

    // Deteksi kata kunci gawat darurat umum jika aturan belum dimuat
    if (/\b(sesak|nyeri dada|jantung|pingsan|kejang|pendarahan|stroke|darurat|koma|keracunan|kritis|ambulans|ambulance|igd)\b/i.test(lower)) {
      return this.handleEmergencyEscalation('Deteksi Gejala Klinis Akut');
    }

    // 1. RESET GLOBAL ('menu' atau '0' atau 'kembali')
    if (lower === 'menu' || lower === '0' || lower === 'kembali' || lower === 'batal' || lower === 'reset') {
      this.resetToMain();
      const mainData = this.getMainMenuData();
      return {
        text: mainData.text,
        options: mainData.options
      };
    }

    // Sapaan awal
    if (/^(halo|hai|hi|hei|helo|assalamu|selamat|pagi|siang|sore|malam|bantuan|help|info|mulai|start|bot)\b/i.test(lower)) {
      this.resetToMain();
      const mainData = this.getMainMenuData();
      return {
        text: mainData.text,
        options: mainData.options
      };
    }

    // Deteksi aksi/kata kunci Katalog Obat Kemoterapi (Fase 2.6)
    if (lower === 'open_katalog_obat' || /\b(daftar obat|katalog obat|cari obat|ketersediaan obat|obat kemo|obat kemoterapi)\b/i.test(lower)) {
      this.logEvent('MENU_CLICKED', 'Katalog Obat Kemoterapi');
      return {
        text: '*Katalog Obat Kemoterapi & Onkologi*\n\nAnda dapat melihat ketersediaan obat kemoterapi, bentuk sediaan, produsen resmi, estimasi harga, dan fasilitas ketersediaan langsung di katalog web resmi RSUD Margono.\n\nSilakan klik tombol di bawah untuk membuka katalog obat:',
        options: [
          { label: 'Buka Katalog Obat Kemoterapi', value: 'open_katalog_link', isExternalLink: true, url: '#/obat' },
          { label: '0. Kembali ke Menu Utama', value: '0' }
        ]
      };
    }

    // 2. PENANGANAN STATUS PERCAKAPAN: MAIN
    if (this.state === 'MAIN') {
      const num = parseInt(input, 10);
      const rawCategories = this.data?.categories || [];
      const categories = rawCategories.filter(c => !c.isEmergency && !/panggilan darurat|layanan darurat/i.test(c.title));

      // Cari berdasarkan angka atau pencocokan teks judul kategori
      let selectedCat = null;
      if (!isNaN(num) && num >= 1 && num <= categories.length) {
        selectedCat = categories[num - 1];
      } else {
        selectedCat = categories.find(c => lower.includes(c.title.toLowerCase()) || c.title.toLowerCase().includes(lower));
      }

      if (selectedCat) {
        this.failCount = 0;

        // Menu Hubungi Perawat
        if (selectedCat.isEscalation || /perawat|staf/i.test(selectedCat.title)) {
          return this.handleNurseEscalation();
        }

        this.currentCategory = selectedCat;
        this.state = 'CATEGORY';
        this.logEvent('MENU_CLICKED', selectedCat.title);
        
        const catData = this.getCategoryMenuData(selectedCat);
        return {
          text: catData.text,
          options: catData.options
        };
      }

      // Pencarian langsung ke seluruh FAQ jika pengguna mengetik kata bebas (misal: "kemo", "jadwal dokter", "bpjs")
      const directFaqMatch = this.searchFaqAcrossCategories(lower);
      if (directFaqMatch) {
        return directFaqMatch;
      }

      return this.handleFallback();
    }

    // 3. PENANGANAN STATUS PERCAKAPAN: CATEGORY
    if (this.state === 'CATEGORY') {
      const num = parseInt(input, 10);
      const cat = this.currentCategory;

      let selectedFaq = null;
      if (cat && Array.isArray(cat.faqs)) {
        if (!isNaN(num) && num >= 1 && num <= cat.faqs.length) {
          selectedFaq = cat.faqs[num - 1];
        } else {
          selectedFaq = cat.faqs.find(f => {
            const title = (f.menuTitle || f.title || '').toLowerCase();
            return lower.includes(title) || title.includes(lower);
          });
        }
      }

      if (selectedFaq) {
        this.failCount = 0;
        this.currentFaq = selectedFaq;
        this.state = 'ANSWER_FEEDBACK';
        this.logEvent('FAQ_VIEWED', selectedFaq.menuTitle || selectedFaq.title);

        const answerText = `*${selectedFaq.menuTitle || selectedFaq.title}*\n\n${selectedFaq.answer}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Apakah informasi ini membantu Anda?\n` +
          `1. Membantu\n` +
          `2. Belum Membantu\n` +
          `3. Hubungi Perawat Jaga\n` +
          `0. Kembali ke Menu Utama`;

        return {
          text: answerText,
          options: [
            { label: '1. Membantu', value: '1' },
            { label: '2. Belum Membantu', value: '2' },
            { label: '3. Hubungi Perawat Jaga', value: '3' },
            { label: '0. Menu Utama', value: '0' }
          ]
        };
      }

      return this.handleFallback();
    }

    // 4. PENANGANAN STATUS PERCAKAPAN: ANSWER_FEEDBACK
    if (this.state === 'ANSWER_FEEDBACK') {
      if (input === '1' || lower.includes('membantu') || lower.includes('makasih') || lower.includes('terima kasih')) {
        this.logEvent('FEEDBACK', 'HELPFUL');
        this.resetToMain();
        return {
          text: `Terima kasih atas umpan balik Anda! Senang bisa mendampingi proses kesembuhan dan pelayanan Bapak/Ibu di RSUD Prof. Dr. Margono Soekarjo.\n\nKetik *0* atau klik tombol di bawah bila membutuhkan informasi layanan lainnya.`,
          options: [
            { label: '0. Kembali ke Menu Utama', value: '0' }
          ]
        };
      } else if (input === '2' || lower.includes('belum') || lower.includes('kurang') || lower.includes('tidak')) {
        this.logEvent('FEEDBACK', 'NOT_HELPFUL');
        return {
          text: `Mohon maaf bila penjelasan belum sepenuhnya menjawab kebutuhan Anda. Tim kami siap memberikan asistensi lebih lanjut.\n\nSilakan hubungi perawat jaga atau kembali ke menu utama:`,
          options: [
            { label: '3. Hubungi Perawat Jaga', value: '3' },
            { label: '0. Kembali ke Menu Utama', value: '0' }
          ]
        };
      } else if (input === '3' || lower.includes('perawat')) {
        return this.handleNurseEscalation();
      } else {
        return this.handleFallback();
      }
    }

    return this.handleFallback();
  }

  // Pencarian cerdas FAQ lintas kategori jika pengguna memasukkan kata kunci bebas
  searchFaqAcrossCategories(query) {
    const categories = this.data?.categories || [];
    for (const cat of categories) {
      if (!cat.faqs || !Array.isArray(cat.faqs)) continue;
      for (const faq of cat.faqs) {
        const title = (faq.menuTitle || faq.title || '').toLowerCase();
        const keywords = Array.isArray(faq.keywords) ? faq.keywords.join(' ').toLowerCase() : '';
        if (title.includes(query) || keywords.includes(query) || (query.length >= 4 && faq.answer?.toLowerCase().includes(query))) {
          this.currentCategory = cat;
          this.currentFaq = faq;
          this.state = 'ANSWER_FEEDBACK';
          this.logEvent('FAQ_SEARCH_MATCH', faq.menuTitle || faq.title);

          const answerText = `*${faq.menuTitle || faq.title}* (Kategori: ${cat.title})\n\n${faq.answer}\n\n` +
            `━━━━━━━━━━━━━━━━━━━━\n` +
            `Apakah informasi ini membantu Anda?\n` +
            `1. Membantu\n` +
            `2. Belum Membantu\n` +
            `3. Hubungi Perawat Jaga\n` +
            `0. Kembali ke Menu Utama`;

          return {
            text: answerText,
            options: [
              { label: '1. Membantu', value: '1' },
              { label: '2. Belum Membantu', value: '2' },
              { label: '3. Hubungi Perawat Jaga', value: '3' },
              { label: '0. Menu Utama', value: '0' }
            ]
          };
        }
      }
    }
    return null;
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

    const operatingHours = this.data?.settings?.operatingHours || '24 Jam';
    const igdPhone = this.emergencyHotline || this.data?.settings?.emergencyHotline || '(0281) 641992';

    let text = `*Permintaan Diteruskan ke Perawat Jaga*\n\n` +
      `Notifikasi telah dikirimkan ke tim perawat jaga RSUD Prof. Dr. Margono Soekarjo. Petugas perawat kami akan segera menindaklanjuti permintaan konsultasi Anda.\n\n`;

    if (operatingHours) {
      text += `Jam layanan aktif: ${operatingHours}\n`;
    }
    if (igdPhone) {
      text += `Bila terjadi kondisi darurat di luar jam layanan, segera hubungi Hotline IGD: ${igdPhone}.\n\n`;
    } else {
      text += `Bila terjadi kondisi darurat, segera datangi unit IGD terdekat.\n\n`;
    }
    text += `Ketik *0* atau klik tombol di bawah untuk kembali ke menu utama.`;

    return {
      isAlert: true,
      text: text,
      options: [
        { label: '0. Kembali ke Menu Utama', value: '0' }
      ]
    };
  }

  handleFallback() {
    this.failCount++;
    this.logEvent('FALLBACK', `Fail count: ${this.failCount}`);

    if (this.failCount >= 2) {
      return {
        text: `Kami mendeteksi kendala dalam pemilihan menu.\n\nSilakan pilih salah satu tombol bantuan cepat di bawah:`,
        options: [
          { label: '3. Hubungi Perawat Jaga', value: '3' },
          { label: '0. Menu Utama', value: '0' }
        ]
      };
    }

    const fallbackMsg = this.data?.settings?.fallback || 'Pilihan tidak dikenali. Silakan ketik angka menu yang tersedia atau klik salah satu opsi tombol di bawah:';
    const mainData = this.getMainMenuData();

    return {
      text: fallbackMsg,
      options: mainData.options.slice(0, 5).concat([{ label: '0. Menu Utama', value: '0' }])
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
        anonymizedPhone: 'WebUser-' + Math.floor(1000 + Math.random() * 9000)
      });
      if (logs.length > 100) logs.pop();
      localStorage.setItem('hospital_bot_logs', JSON.stringify(logs));
    } catch (e) {}
  }
}

// Ekspor ke window global untuk simulator dan web interface
window.HospitalWebChatBot = HospitalWebChatBot;
window.HospitalWhatsAppBot = HospitalWebChatBot; // Backward-compatibility
