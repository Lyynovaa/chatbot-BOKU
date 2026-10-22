# Panduan Integrasi Google Apps Script (Backend & Database)
**Bot WhatsApp Rumah Sakit (RS Medica)**  
*Sesuai Spesifikasi PRD Bagian 8, 10, & 11*

---

## 📁 Struktur Modul Google Apps Script (`.gs`)

Seluruh kode telah dipecah per fitur secara modular sehingga rapi dan mudah dirawat:

| File Script | Fitur / Tanggung Jawab |
| :--- | :--- |
| **`Config.gs`** | Konfigurasi nama spreadsheet (`Chatbot-RS`), API secret token Baileys, nama sheet (termasuk `regimen_kemo`, `obat`, `fasilitas_obat`), dan daftar akun default. |
| **`Db.gs`** | Helper database Google Sheets, auto-create tab tabel (`users`, `categories`, `faqs`, `regimen_kemo`, `obat`, dll.), dan auto-styling warna header. |
| **`Auth.gs`** | Fitur Login staf admin, Whitelist email per PRD A-01/A-02, verifikasi password & Google OAuth SSO, serta pembuatan token sesi. |
| **`Regimen.gs`** | Fitur CMS & API Regimen Kemoterapi (CRUD, toggle aktif/nonaktif, default interval hari, default siklus, deskripsi medis protokol). |
| **`Obat.gs`** | Fitur Katalog Obat Kemoterapi (CRUD obat onkologi, integrasi fasilitas & harga, impor massal CSV). |
| **`Categories.gs`** | Fitur Kelola Kategori Menu WhatsApp (Tambah, edit judul, atur urutan, dan hapus kategori dinamis). |
| **`Faqs.gs`** | Fitur Kelola Tanya Jawab (Instant publish, filter keamanan klinis bebas takaran dosis obat per PRD Bagian 9, batas karakter WA). |
| **`Settings.gs`** | Fitur Pengaturan Global Bot (Pesan sambutan, pesan fallback, jam operasional, alamat gedung, dan nomor kontak hotline). |
| **`Logs.gs`** | Fitur Log Audit staf & Log interaksi pasien (*UU PDP No. 27/2022: nomor telepon disamarkan, tanpa simpan isi chat, dan metrik dasbor*). |
| **`BotApi.gs`** | Jembatan sinkronisasi server Baileys Node.js (*Single-trip bundle fetch* untuk cache memori cepat & webhook interaksi). |
| **`Router.gs`** | Entry point `doGet(e)` dan `doPost(e)` untuk merutekan seluruh panggilan REST API dari web admin, publik, dan bot. |

---

## 🚀 Langkah Pemasangan ke Google Apps Script

### Langkah 1: Buat Spreadsheet & Buka Editor Apps Script
1. Buka [Google Sheets](https://sheets.new) di browser Anda.
2. Beri nama spreadsheet Anda, misalnya: `Database Bot WA RS Medica`.
3. Pada menu atas, klik **Extensions (Ekstensi)** > **Apps Script**.

### Langkah 2: Salin File-File `.gs` ke Editor
1. Di editor Apps Script, Anda akan melihat satu file default bernama `Code.gs`.
2. Klik ikon titik tiga di sebelah `Code.gs` > **Rename**, ubah namanya menjadi **`Config.gs`**, lalu tempelkan isi dari file `apps-script/Config.gs`.
3. Klik tombol **`+` (Add a file)** > pilih **Script**, lalu buat file-file berikut satu per satu dan tempelkan kodenya masing-masing:
   - `Db.gs`
   - `Auth.gs`
   - `Regimen.gs` *(Baru: Modul Custom Chemotherapy Calculator)*
   - `Obat.gs` *(Modul Katalog Obat Farmaplus)*
   - `Categories.gs`
   - `Faqs.gs`
   - `Settings.gs`
   - `Logs.gs`
   - `BotApi.gs`
   - `Router.gs`
4. Klik tombol **Save Project** (ikon disket) atau tekan `Ctrl + S`.

### Langkah 3: Inisialisasi Database Google Sheets
1. Pada dropdown fungsi di bagian atas editor Apps Script, pilih fungsi **`initDatabase`**.
2. Klik tombol **Run (Jalankan)**.
3. Google akan meminta izin (*Authorization Required*). Klik **Review permissions** > pilih akun Google Anda > klik **Advanced** > klik **Go to Untitled project (unsafe)** > klik **Allow**.
4. Setelah selesai dieksekusi, buka kembali Google Spreadsheet Anda: Seluruh tab tabel (`users`, `categories`, `faqs`, `settings`, `event_logs`, `audit_logs`, `regimen_kemo`, `obat`, `fasilitas_obat`) akan otomatis terbuat lengkap dengan warna header dan data benih awal!

### Langkah 4: Deploy Menjadi Web App
Agar web admin dan server proxy Node.js dapat berkomunikasi dengan Apps Script:

#### A. Jika Deploy Pertama Kali:
1. Klik tombol biru **Deploy** di pojok kanan atas > pilih **New deployment**.
2. Klik ikon gerigi (Select type) > pilih **Web app**.
3. Isi konfigurasi sebagai berikut:
   - **Description**: `Bot WA RS Medica & Kalkulator Kemo API`
   - **Execute as**: **Me (email Anda)**
   - **Who has access**: **Anyone (Siapa saja)** *(Diperlukan agar server Node.js dan Web Admin bisa memanggil API)*
4. Klik **Deploy**.
5. Salin **Web App URL** yang dihasilkan (contoh format: `https://script.google.com/macros/s/AKfycbx.../exec`).

#### B. Jika Memperbarui Script yang Sudah Ada (PENTING):
Setiap kali ada penyesuaian kode pada file `.gs`:
1. Klik tombol **Deploy** di pojok kanan atas > pilih **Manage deployments**.
2. Pilih deployment aktif Anda, lalu klik ikon **Pensil (Edit)** di pojok kanan atas modal.
3. Pada dropdown **Version**, pilih **New version**.
4. Beri deskripsi (misal: `Update Modul Custom Chemotherapy Calculator`).
5. Klik **Deploy**.
> **PENTING**: Jika Anda tidak memilih *New version*, Web App URL akan tetap menjalankan versi kode lama yang tersimpan di cache Google!

---

## 🔗 Endpoint API yang Tersedia

### 1. HTTP GET (`doGet`)
Panggil URL Web App dengan parameter query:
- `?action=get_regimen_list` : Mengambil daftar regimen aktif publik untuk dropdown kalkulator
- `?action=admin_get_regimen_list&token=...` : Mengambil seluruh regimen untuk portal admin
- `?action=get_obat_list` : Mengambil katalog obat publik
- `?action=categories` : Mengambil daftar seluruh kategori menu
- `?action=faqs` : Mengambil seluruh pertanyaan & jawaban
- `?action=settings` : Mengambil pengaturan pesan bot & kontak rumah sakit
- `?action=audit_logs` : Mengambil riwayat log audit staf
- `?action=event_logs` : Mengambil riwayat interaksi pasien (UU PDP aman)
- `?action=metrics` : Mengambil metrik dasbor (persentase selesai mandiri, kepuasan)
- `?action=bot_bundle&token=MEDICA_WA_BOT_SECRET_2026_TOKEN` : Mengambil seluruh paket menu untuk server Baileys

### 2. HTTP POST (`doPost`)
Kirimkan body JSON dengan field `action`:
- `{"action": "create_regimen", "token": "...", "data": {"nama_regimen": "...", "default_interval": 14, "default_siklus": 12, "deskripsi": "...", "active": true}}` : Tambah regimen baru
- `{"action": "update_regimen", "token": "...", "id": "reg-...", "data": {...}}` : Perbarui data regimen
- `{"action": "toggle_regimen", "token": "...", "id": "reg-...", "active": true/false}` : Aktif/Nonaktifkan regimen
- `{"action": "delete_regimen", "token": "...", "id": "reg-..."}` : Hapus regimen
- `{"action": "login", "email": "...", "password": "..."}` : Login staf admin
- `{"action": "create_category", "title": "...", "isEscalation": false, "isEmergency": false}` : Tambah kategori menu
- `{"action": "create_faq", "faqData": {"categoryId": "...", "menuTitle": "...", "answer": "..."}, "userEmail": "..."}` : Tambah FAQ
- `{"action": "update_settings", "settings": {"greeting": "..."}, "userEmail": "..."}` : Ubah pengaturan
- `{"action": "bot_event", "token": "...", "eventData": {"phone": "...", "eventType": "MENU_CHOSEN"}}` : Webhook dari Baileys
