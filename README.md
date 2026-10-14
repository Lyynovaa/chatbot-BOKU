# chatbot-BOKU

Layanan Asisten Virtual WhatsApp dan Portal Web Terintegrasi untuk RSUD Prof. Dr. Margono Soekarjo Purwokerto (**BOKU**).

## Fitur Utama
- **WhatsApp Bot Pintar (Baileys)**: Respons otomatis 24 jam untuk informasi poliklinik, rawat inap, fasilitas, konsultasi pasca-kemo, dan tanggap darurat IGD.
- **Integrasi Google Apps Script & Sheets**: Database cloud fleksibel untuk sinkronisasi FAQ, kategori, kontak darurat, dan pengaturan global tanpa downtime server.
- **Portal Web & Admin RSMS**: Dashboard admin lengkap dengan autentikasi berbasis role (Super Admin & Petugas), QR code pairing, whitelist staf medis, serta kontrol bot real-time.
- **Landing Page Responsif**: Tampilan modern, bersih, dan ramah pengguna dengan branding resmi RSUD Prof. Dr. Margono Soekarjo Jawa Tengah.

## Panduan Menjalankan

1. **Instalasi Dependensi**
   ```bash
   npm install
   ```

2. **Konfigurasi Lingkungan (.env)**
   Salin `.env.example` menjadi `.env` lalu sesuaikan konfigurasi Web App URL Google Apps Script Anda:
   ```env
   PORT=3000
   GAS_WEBAPP_URL=https://script.google.com/macros/s/YOUR_GAS_DEPLOYMENT_ID/exec
   GAS_API_KEY=your_secure_api_key_here
   ```

3. **Menjalankan Server**
   ```bash
   npm start
   ```
   Buka `http://localhost:3000` pada peramban web Anda.

4. **Tautkan WhatsApp**
   Buka WhatsApp di ponsel > **Perangkat Tertaut** > Pindai QR Code yang tampil di terminal atau di Portal Admin Web.
