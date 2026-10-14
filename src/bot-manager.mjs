/**
 * BAILEYS WHATSAPP BOT ENGINE FOR RS MEDICA
 * Uses @whiskeysockets/baileys with multi-file auth state.
 * Implements PRD WhatsApp Hospital Bot rules (B-01 through B-12).
 */

import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';

export class BaileysHospitalBot {
  constructor(options = {}) {
    if (!options.appsScriptUrl || !options.appsScriptToken) {
      throw new Error('appsScriptUrl dan appsScriptToken wajib disediakan pada opsi BaileysHospitalBot');
    }
    this.appsScriptUrl = options.appsScriptUrl;
    this.appsScriptToken = options.appsScriptToken;
    this.sessionDir = options.sessionDir || path.join(process.cwd(), 'auth_info_baileys');

    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'qr_ready' | 'connecting' | 'connected'
    this.qrString = null;
    this.qrDataUrl = null;
    this.connectedUser = null;
    this.connectedPhone = null;
    this.userSessions = new Map(); // JID -> { state, category, failCount, lastActive }
    this.processedMessageIds = new Set(); // deduplication cache
    this.botSentMessageIds = new Set(); // prevent self-chat reply loop
    this.reconnectAttempts = 0;
    this._hasLoggedTerminalQr = false;

    // Hotline and clinic data (diisi dari Google Apps Script)
    this.emergencyHotline = '';
    this.hospitalAddress = '';

    // Data kategori, FAQ, dan aturan darurat (diisi dari Google Apps Script)
    this.data = {
      greeting: '',
      categories: []
    };
    this.emergencyRules = [];
  }

  updateData(newData) {
    if (!newData) return;
    if (newData.categories && Array.isArray(newData.categories)) {
      this.data.categories = newData.categories;

      // Blok penambahan kategori Panggilan Darurat IGD secara otomatis HANYA jika belum ada di database GAS
      const hasEmergency = this.data.categories.some(c => c.isEmergency || /darurat|igd/i.test(c.title));
      if (!hasEmergency) {
        this.data.categories.push({
          id: 'cat-emergency-fallback',
          order: this.data.categories.length + 1,
          title: 'Panggilan darurat IGD 24 jam',
          isEmergency: true
        });
      }
    }

    if (newData.emergencyRules && Array.isArray(newData.emergencyRules)) {
      this.emergencyRules = newData.emergencyRules;
      const primary = this.emergencyRules.find(r => r.isPrimary) || this.emergencyRules[0];
      if (primary) {
        if (primary.phone) this.emergencyHotline = primary.phone;
        if (primary.location) this.hospitalAddress = primary.location;
      }
    }

    if (newData.settings) {
      this.data.settings = newData.settings;
      if (newData.settings.greeting) this.data.greeting = newData.settings.greeting;
      if (newData.settings.emergencyHotline) this.emergencyHotline = newData.settings.emergencyHotline;
      if (newData.settings.hospitalAddress) this.hospitalAddress = newData.settings.hospitalAddress;
    }

    console.log(`[Baileys Bot] Data memori diperbarui: ${this.data.categories?.length || 0} kategori aktif.`);
  }

  async recordEventWebhook(phone, eventType, menuChosen = '-', feedback = '-', details = '-') {
    if (!this.appsScriptUrl) return;
    try {
      await fetch(this.appsScriptUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bot_event',
          token: this.appsScriptToken,
          eventData: { phone, eventType, menuChosen, feedback, details }
        }),
        redirect: 'follow'
      });
    } catch (e) {
      // Non-blocking error
    }
  }

  async start() {
    console.log('[Baileys] Memulai sesi koneksi WhatsApp...');
    this.status = 'connecting';

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.sessionDir);
      const { version } = await fetchLatestBaileysVersion();

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['BOKU RSUD Margono', 'Chrome', '1.0.0'],
        syncFullHistory: false
      });

      // Simpan kredensial saat diperbarui
      this.sock.ev.on('creds.update', saveCreds);

      // Tangani status koneksi (QR barcode & status tersambung)
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrString = qr;
          this.status = 'qr_ready';
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { margin: 2, scale: 7 });
            if (!this._hasLoggedTerminalQr) {
              this._hasLoggedTerminalQr = true;
              console.log('\n==================================================');
              console.log(' [BAILEYS] SCAN QR CODE BERIKUT DENGAN WHATSAPP HP:');
              console.log(' Buka WhatsApp > Perangkat Tertaut > Tautkan Perangkat');
              console.log(' (Juga tersedia secara visual di Portal Admin RSMS)');
              console.log('==================================================');
              const terminalQR = await QRCode.toString(qr, { type: 'terminal', small: true });
              console.log(terminalQR);
              console.log('==================================================\n');
            }
          } catch (err) {
            console.error('[Baileys] Gagal generate QR visual:', err.message);
          }
        }

        if (connection === 'close') {
          this._hasLoggedTerminalQr = false;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
          this.status = 'disconnected';
          this.qrString = null;
          this.qrDataUrl = null;
          this.connectedUser = null;
          this.connectedPhone = null;

          console.log(`[Baileys] Koneksi terputus (status: ${statusCode}). Mencoba reconnect: ${shouldReconnect}`);

          if (shouldReconnect) {
            this.reconnectAttempts++;
            const delay = Math.min(this.reconnectAttempts * 3000, 15000);
            setTimeout(() => this.start(), delay);
          } else {
            console.log('[Baileys] Sesi telah logout. Hapus data auth dan buat QR baru.');
            this.cleanupSession();
          }
        } else if (connection === 'open') {
          this._hasLoggedTerminalQr = false;
          this.status = 'connected';
          this.qrString = null;
          this.qrDataUrl = null;
          this.reconnectAttempts = 0;

          const jid = this.sock.user?.id || '';
          this.connectedPhone = jid.split(':')[0] || jid.split('@')[0];
          this.connectedUser = this.sock.user?.name || 'BOKU (RSUD Margono)';

          console.log('==================================================');
          console.log(`[BAILEYS] BERHASIL TERHUBUNG KE WHATSAPP!`);
          console.log(`- Nomor Terdaftar : +${this.connectedPhone}`);
          console.log(`- Nama Profil     : ${this.connectedUser}`);
          console.log('==================================================');
        }
      });

      // Tangani Pesan Masuk
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
          if (!msg.message) continue;

          const messageId = msg.key.id;
          if (this.processedMessageIds.has(messageId)) continue;
          this.processedMessageIds.add(messageId);
          if (this.processedMessageIds.size > 2000) {
            this.processedMessageIds.clear();
          }

          // Abaikan jika pesan ini berasal dari pengiriman bot kita sendiri
          if (this.botSentMessageIds.has(messageId)) continue;

          const jid = msg.key.remoteJid;
          if (!jid || jid.endsWith('@g.us')) continue; // Obrolan privat saja per PRD

          const senderPhone = jid.split(':')[0].split('@')[0];
          const isSelfChat = Boolean(this.connectedPhone && (senderPhone === this.connectedPhone || jid.includes(this.connectedPhone)));

          // Jika pesan dari nomor bot sendiri (fromMe):
          // Hanya izinkan jika chat ke nomor sendiri (self-chat testing).
          if (msg.key.fromMe && !isSelfChat) {
            continue;
          }

          // Ambil isi teks pesan
          const text = msg.message.conversation ||
                       msg.message.extendedTextMessage?.text ||
                       msg.message.imageMessage?.caption ||
                       '';

          if (!text || !text.trim()) continue;

          console.log(`[WA Pesan Masuk] Dari: +${senderPhone}${isSelfChat ? ' (Self-Test)' : ''} | Teks: "${text.trim()}"`);

          // Proses dan kirim balasan
          await this.handleIncomingMessage(jid, text);
        }
      });

    } catch (err) {
      console.error('[Baileys] Error inisialisasi socket:', err.message);
      this.status = 'disconnected';
    }
  }

  async handleIncomingMessage(jid, rawText) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();

    // Inisialisasi atau pembaruan sesi pengguna (timeout 30 menit)
    let session = this.userSessions.get(jid);
    const now = Date.now();
    if (!session || (now - session.lastActive > 30 * 60 * 1000)) {
      session = { state: 'MAIN', category: null, failCount: 0, lastActive: now };
    }
    session.lastActive = now;

    // 1. DETEKSI KATA KUNCI DARURAT (PRD B-06)
    const activeRules = this.emergencyRules || [];
    let matchedRule = null;
    let matchedKw = '';
    for (const rule of activeRules) {
      if (Array.isArray(rule.keywords)) {
        for (const kw of rule.keywords) {
          if (kw && lower.includes(kw.toLowerCase().trim())) {
            matchedRule = rule;
            matchedKw = kw;
            break;
          }
        }
      }
      if (matchedRule) break;
    }

    if (matchedRule) {
      session.state = 'MAIN';
      this.userSessions.set(jid, session);
      this.recordEventWebhook(jid.split('@')[0], 'EMERGENCY_OVERRIDE', `Kata Kunci: ${matchedKw}`, '-', text);
      await this.sendMessage(jid, this.formatEmergencyResponse(matchedRule));
      return;
    }

    // 2. SAPAAN & RESET GLOBAL KE MENU UTAMA (PRD B-01 & B-02)
    const isGreeting = /^(halo|hai|hi|hei|helo|assalamu|selamat|pagi|siang|sore|malam|bantuan|help|info|tes|test|p|mulai|start|bot|menu|0|kembali)\b/i.test(lower);

    if (isGreeting || lower === 'menu' || lower === '0' || lower === 'kembali') {
      session.state = 'MAIN';
      session.category = null;
      session.failCount = 0;
      this.userSessions.set(jid, session);
      this.recordEventWebhook(jid.split('@')[0], 'GREETING_TRIGGERED', 'Menu Utama', '-', text);
      await this.sendMessage(jid, this.getMainMenuText());
      return;
    }

    // 3. MESIN STATUS PERCAKAPAN (CONVERSATIONAL STATE MACHINE)
    if (session.state === 'MAIN') {
      const choice = parseInt(text, 10);
      const categories = this.data.categories || [];
      if (!isNaN(choice) && choice >= 1 && choice <= categories.length) {
        session.failCount = 0;
        const selectedCat = categories[choice - 1];

        if (selectedCat.isEmergency) {
          session.state = 'MAIN';
          this.userSessions.set(jid, session);
          const primaryRule = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]) || null;
          this.recordEventWebhook(jid.split('@')[0], 'EMERGENCY_MENU', selectedCat.title, '-', 'Akses menu IGD');
          await this.sendMessage(jid, this.formatEmergencyResponse(primaryRule));
          return;
        }

        if (selectedCat.isEscalation) {
          session.state = 'MAIN';
          this.userSessions.set(jid, session);
          await this.sendMessage(jid, this.formatNurseEscalationResponse());
          return;
        }

        session.state = 'CATEGORY';
        session.category = selectedCat;
        this.userSessions.set(jid, session);

        let subMenuText = `Topik: *${selectedCat.title}*\n`;
        if (!selectedCat.faqs || selectedCat.faqs.length === 0) {
          subMenuText += `\nBelum ada pertanyaan yang terdaftar pada topik ini.\n\n0. Kembali ke menu utama`;
        } else {
          subMenuText += `Silakan pilih pertanyaan:\n\n`;
          selectedCat.faqs.forEach((f, i) => {
            subMenuText += `${i + 1}. ${f.menuTitle || f.title}\n`;
          });
          subMenuText += `\n0. Kembali ke menu utama`;
        }

        this.recordEventWebhook(jid.split('@')[0], 'CATEGORY_CHOSEN', selectedCat.title, '-', '-');
        await this.sendMessage(jid, subMenuText);
        return;
      } else {
        session.failCount = (session.failCount || 0) + 1;
        this.userSessions.set(jid, session);
        await this.sendMessage(jid, this.getMainMenuText());
        return;
      }
    }

    if (session.state === 'CATEGORY') {
      const choice = parseInt(text, 10);
      const cat = session.category;
      if (!isNaN(choice) && cat && cat.faqs && choice >= 1 && choice <= cat.faqs.length) {
        session.failCount = 0;
        const selectedFaq = cat.faqs[choice - 1];
        session.state = 'ANSWER_FEEDBACK';
        session.lastFaqTitle = selectedFaq.menuTitle || selectedFaq.title;
        this.userSessions.set(jid, session);

        const answerText =
          `*${selectedFaq.menuTitle || selectedFaq.title}*\n\n` +
          `${selectedFaq.answer}\n\n` +
          `━━━━━━━━━━━━━━━━━━━━\n` +
          `Apakah informasi ini membantu?\n` +
          `1. Membantu\n` +
          `2. Belum Membantu\n` +
          `3. Hubungi Perawat Jaga\n` +
          `0. Kembali ke menu`;

        this.recordEventWebhook(jid.split('@')[0], 'FAQ_VIEWED', session.lastFaqTitle, '-', '-');
        await this.sendMessage(jid, answerText);
        return;
      } else {
        await this.handleFallback(jid, session);
        return;
      }
    }

    if (session.state === 'ANSWER_FEEDBACK') {
      if (text === '1') {
        const lastTitle = session.lastFaqTitle || 'FAQ';
        session.state = 'MAIN';
        this.userSessions.set(jid, session);
        this.recordEventWebhook(jid.split('@')[0], 'FEEDBACK', lastTitle, 'HELPFUL', 'Pasien merasa terbantu');
        await this.sendMessage(jid, `Terima kasih atas umpan balik Anda! Senang bisa mendampingi proses pemulihan Bapak/Ibu.\n\nKetik *0* untuk kembali ke menu utama.`);
        return;
      } else if (text === '2') {
        const lastTitle = session.lastFaqTitle || 'FAQ';
        this.recordEventWebhook(jid.split('@')[0], 'FEEDBACK', lastTitle, 'UNHELPFUL', 'Pasien belum merasa terbantu');
        await this.sendMessage(jid, `Mohon maaf bila jawaban belum memuaskan. Anda dapat terhubung langsung dengan perawat jaga:\n\nKetik *3* untuk Hubungi Perawat\nKetik *0* untuk Kembali ke Menu`);
        return;
      } else if (text === '3') {
        session.state = 'MAIN';
        this.userSessions.set(jid, session);
        this.recordEventWebhook(jid.split('@')[0], 'ESCALATION_NURSE', 'Hubungi Perawat', '-', 'Eskalasi ke perawat jaga RSUD Margono');
        await this.sendMessage(jid, `*Notifikasi Dikirim ke Perawat Jaga*\n\nNotifikasi telah kami sampaikan ke perawat jaga RSUD Prof. Dr. Margono Soekarjo. Perawat akan segera menindaklanjuti.\n\nKetik *0* untuk kembali ke menu.`);
        return;
      } else {
        await this.handleFallback(jid, session);
        return;
      }
    }

    await this.handleFallback(jid, session);
  }

  formatEmergencyResponse(rule = null) {
    const title = (rule?.title || 'Layanan Darurat IGD 24 Jam').toUpperCase();
    const phone = rule?.phone || this.emergencyHotline || this.data?.settings?.emergencyHotline;
    const ambulance = rule?.ambulance || this.data?.settings?.ambulance;
    const location = rule?.location || this.hospitalAddress || this.data?.settings?.hospitalAddress;
    const instructions = rule?.instructions || 'Jika pasien mengalami keluhan akut atau penurunan kesadaran, segera bawa ke IGD terdekat tanpa menunda.';

    let reply = `*${title}*\nRSUD Prof. Dr. Margono Soekarjo siap melayani penanganan kegawatdaruratan medis 24 jam.\n\n`;
    if (phone) reply += `• Hotline IGD: ${phone}\n`;
    if (ambulance) reply += `• Ambulans Siaga: ${ambulance}\n`;
    if (location) reply += `• Lokasi: ${location}\n`;
    if (phone || ambulance || location) reply += `\n`;
    reply += `${instructions}\n\nKetik *0* untuk kembali ke menu utama.`;
    return reply;
  }

  formatNurseEscalationResponse() {
    const hours = this.data?.settings?.operatingHours;
    const igdPhone = this.emergencyHotline || this.data?.settings?.emergencyHotline;

    let reply = `*Permintaan Diteruskan ke Perawat Jaga*\n\n` +
      `Notifikasi telah dikirimkan ke tim perawat jaga RSUD Prof. Dr. Margono Soekarjo. Perawat kami akan segera menghubungi nomor Anda.\n\n`;
    if (hours) {
      reply += `Jam layanan aktif: ${hours}\n`;
    }
    if (igdPhone) {
      reply += `Jika mendesak di luar jam layanan, segera hubungi IGD: ${igdPhone}.\n\n`;
    } else {
      reply += `Jika terjadi kondisi gawat darurat, segera datangi unit IGD terdekat.\n\n`;
    }
    reply += `Ketik *0* untuk kembali ke menu utama.`;
    return reply;
  }

  async handleFallback(jid, session) {
    session.failCount = (session.failCount || 0) + 1;
    this.userSessions.set(jid, session);

    if (session.failCount >= 2) {
      await this.sendMessage(jid,
        `Kami mendeteksi kendala dalam pemilihan menu.\n\n` +
        `Ketik *3* untuk Hubungi Perawat\n` +
        `Ketik *4* untuk Panggilan Darurat IGD\n` +
        `Ketik *0* untuk Kembali ke Menu Utama`
      );
    } else {
      const fallbackMsg = this.data?.settings?.fallback || 'Pilihan tidak dikenali. Silakan ketik angka menu yang tersedia, atau ketik *0* untuk kembali ke menu utama.';
      await this.sendMessage(jid, fallbackMsg);
    }
  }

  getMainMenuText() {
    const greeting = this.data?.settings?.greeting || this.data?.greeting || '';
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

  async sendMessage(jid, text) {
    if (!this.sock) {
      console.error('[Baileys] Socket belum aktif.');
      return;
    }
    try {
      const sent = await this.sock.sendMessage(jid, { text });
      if (sent?.key?.id) {
        this.botSentMessageIds.add(sent.key.id);
        if (this.botSentMessageIds.size > 2000) {
          this.botSentMessageIds.clear();
        }
      }
      console.log(`[WA Pesan Terkirim] Ke: +${jid.split('@')[0]}`);
      return sent;
    } catch (err) {
      console.error('[Baileys] Gagal kirim pesan ke', jid, err.message);
    }
  }

  getStatus() {
    return {
      status: this.status,
      qrDataUrl: this.qrDataUrl,
      qrString: this.qrString,
      connectedUser: this.connectedUser,
      connectedPhone: this.connectedPhone,
      sessionActiveCount: this.userSessions.size,
      updatedAt: new Date().toISOString()
    };
  }

  cleanupSession() {
    try {
      if (fs.existsSync(this.sessionDir)) {
        fs.rmSync(this.sessionDir, { recursive: true, force: true });
        console.log('[Baileys] Berkas sesi auth berhasil dibersihkan.');
      }
    } catch (e) {
      console.error('[Baileys] Error cleanup session:', e.message);
    }
  }

  async restart() {
    if (this.sock) {
      try {
        await this.sock.end(new Error('Manual restart'));
      } catch (e) {}
    }
    await this.start();
  }

  async logout() {
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {}
    }
    this.cleanupSession();
    this.status = 'disconnected';
    this.qrDataUrl = null;
    this.qrString = null;
    this.connectedUser = null;
    this.connectedPhone = null;
    await this.start();
  }
}
