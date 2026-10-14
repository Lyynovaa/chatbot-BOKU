# PRD Bot WhatsApp Rumah Sakit

Oct 12, 2026 · @NOVAL FADLI ROBBANI

## 1. Ringkasan

Produk ini adalah bot WhatsApp rumah sakit yang menjawab pertanyaan pasien lewat menu pilihan, dengan isi menu dan jawabannya diatur sendiri oleh admin rumah sakit dari sebuah web. Bot tidak menebak jawaban: setiap balasan adalah teks yang sudah ditulis dan disetujui oleh pihak RS.

**Masalah yang diselesaikan.** Pasien, misalnya yang baru selesai kemoterapi, sering menanyakan hal yang sama dan jawabannya sudah baku (mual, lemas, kapan harus ke IGD). Perawat menjawab satu per satu secara manual, jawabannya tidak seragam, dan pasien harus menunggu.

**Cara kerja singkat.** Pasien mengirim pesan ke nomor WhatsApp RS, bot menampilkan menu, pasien memilih nomor atau tombol, bot membalas dengan jawaban yang sudah disiapkan. Admin RS menambah, mengubah, dan mengurutkan menu serta jawaban lewat web tanpa bantuan programmer.

## 2. Tujuan dan Metrik Keberhasilan

Tujuan utama versi pertama adalah mengurangi pertanyaan berulang ke perawat dan memberi pasien jawaban yang konsisten dan aman setiap saat, termasuk di luar jam kerja.

| Tujuan | Metrik | Target awal (usulan) |
| --- | --- | --- |
| Pasien cepat mendapat jawaban | Waktu balasan bot (persentil 95) | di bawah 3 detik |
| Bot benar-benar menyelesaikan pertanyaan | Persentase sesi yang berakhir tanpa eskalasi ke staf | 70% atau lebih |
| Admin mandiri | Waktu admin menambah satu pertanyaan baru sampai tayang | di bawah 10 menit |
| Isi menu relevan | Persentase pesan yang tidak dikenali (jatuh ke fallback) | di bawah 15% |
| Keamanan pasien | Pesan berkata kunci darurat yang langsung dibalas arahan ke IGD | 100% |

Angka target adalah usulan awal dan perlu disepakati dengan pihak RS setelah masa uji coba.

## 3. Pengguna dan Skenario Utama

| Peran | Kebutuhan | Skenario contoh |
| --- | --- | --- |
| Pasien atau keluarga | Jawaban cepat, bahasa sederhana, tahu kapan harus ke RS | Setelah kemoterapi merasa mual, membuka WhatsApp, memilih menu keluhan, membaca anjuran |
| Admin RS (humas, unit onkologi, IT) | Mengubah isi menu tanpa programmer | Menambah pertanyaan baru tentang diare, mengatur urutan menu |
| Dokter atau penanggung jawab klinis | Memastikan isi jawaban aman | Meninjau isi jawaban secara berkala di luar sistem |
| Perawat atau staf | Menerima pasien yang perlu ditangani manusia | Menerima notifikasi saat pasien memilih "Hubungi perawat" |
| Super admin | Mengelola akun, peran, dan pengaturan bot | Menambah akun admin baru, melihat riwayat perubahan |

## 4. Analisis Pendekatan dan Rekomendasi

**Keputusan: bot berbasis menu dengan jawaban baku, dikirim lewat Baileys dari server Node.js sendiri, dengan Google Apps Script sebagai backend dan Google Sheets sebagai penyimpan data.** Admin punya akses penuh membuat dan mengubah pertanyaan tanpa persetujuan. Bot AI generatif tetap tidak dipakai untuk isi medis.

### 4.1 Cara menyambungkan ke WhatsApp

| Opsi | Kelebihan | Kekurangan | Status |
| --- | --- | --- | --- |
| Baileys (tidak resmi) dari server sendiri | Gratis, tanpa verifikasi bisnis Meta, cepat dipasang | Nomor bisa diblokir kapan saja, tombol dan daftar interaktif tidak andal, butuh server yang selalu menyala, sesi bisa terputus | Dipilih |
| Cloud API resmi, langsung atau lewat BSP | Stabil, bebas risiko blokir, tombol dan daftar tersedia | Perlu verifikasi bisnis dan ada biaya per pesan | Jalur pindah bila nomor sering bermasalah |
| WhatsApp Business App biasa dengan balasan otomatis | Gratis dan mudah | Hanya satu pesan otomatis, tidak ada menu dinamis | Tidak memenuhi kebutuhan |

Dua hal perlu dipahami. Pertama, Apps Script tidak bisa menjaga koneksi WhatsApp yang terus terbuka, jadi Baileys tetap butuh satu server Node.js kecil yang memanggil Apps Script untuk membaca menu dan mencatat log. Kedua, risiko blokir mengikuti perilaku nomor: gunakan nomor khusus bot, hanya balas pasien yang mengirim pesan lebih dulu, dan hindari pesan massal.

### 4.2 Jenis bot

| Jenis | Cara kerja | Risiko | Keputusan |
| --- | --- | --- | --- |
| Menu bernomor dan tombol | Pasien memilih, bot membalas teks yang sudah disetujui | Pasien harus menemukan pilihan sendiri | Dipakai di versi 1 |
| Menu ditambah pencarian kata kunci | Pasien boleh mengetik "mual", bot mencocokkan ke jawaban yang ada | Salah cocok bila kata kunci kurang | Fase 2 |
| AI sebagai pencari jawaban | AI hanya memilih jawaban yang sudah disetujui, tidak menulis teks baru | Perlu evaluasi akurasi pemilihan | Fase 3, setelah ada data nyata |
| AI generatif bebas | AI menulis jawaban sendiri | Jawaban medis keliru, sulit diaudit | Tidak untuk isi klinis |

### 4.3 Keputusan desain yang penting

- **Menu dua tingkat (kategori lalu pertanyaan), berupa teks bernomor.** Tombol dan daftar interaktif tidak andal di Baileys, jadi pasien membalas dengan angka, sesuai kebiasaan yang Anda gambarkan.
- **Perubahan admin langsung tayang.** Karena tidak ada persetujuan, riwayat versi, tombol kembalikan ke versi lama, dan log audit menjadi pengaman utama.
- **Menu disimpan di cache server Baileys.** Apps Script lambat dan berkuota, jadi menu tidak dibaca ulang di setiap pesan.
- **Tidak menyimpan keluhan pasien di versi 1.** Sistem hanya mencatat menu yang dipilih, dengan nomor telepon disamarkan, supaya risiko data kesehatan kecil.
- **Selalu ada jalan keluar ke manusia.** Setiap menu punya pilihan "Hubungi perawat" dan jawaban darurat mengarahkan ke IGD.

## 5. Ruang Lingkup

Versi pertama fokus pada menu tanya-jawab yang bisa dikelola admin. Fitur lain ditunda agar bot cepat dipakai dan mudah diaudit.

| Masuk versi 1 | Belum masuk (fase berikutnya) |
| --- | --- |
| Menu kategori dan pertanyaan bertingkat | Pencarian teks bebas dengan kata kunci |
| Jawaban baku yang dikelola admin lewat web | Jawaban oleh AI generatif |
| Riwayat versi dan log audit perubahan | Pendaftaran atau penjadwalan pasien |
| Deteksi kata kunci darurat | Pengingat kontrol atau obat otomatis |
| Pilihan "Hubungi perawat" ke staf | Obrolan langsung dua arah dengan staf di web |
| Statistik penggunaan dasar | Integrasi ke SIMRS atau rekam medis |
| Bahasa Indonesia | Bahasa daerah atau Inggris |

## 6. Alur Percakapan Pasien

Alur utamanya lurus dari sapaan sampai jawaban, dengan tiga cabang: darurat, tidak dikenali, dan minta bantuan staf.

1. Pasien mengirim pesan apa pun, misalnya "halo".
2. Bot membalas sapaan, satu kalimat bahwa layanan ini informasi umum dan bukan pengganti dokter, lalu menu kategori.
3. Pasien memilih kategori dengan mengetik angkanya.
4. Bot menampilkan daftar pertanyaan dalam kategori itu (bernomor, dipecah per halaman bila panjang, ditambah "Lainnya").
5. Pasien memilih pertanyaan, bot mengirim jawaban baku yang sedang tayang.
6. Bot menawarkan tiga pilihan bernomor: "Membantu", "Belum membantu", "Hubungi perawat".

**Aturan yang berlaku di setiap langkah**

- Kata kunci darurat (misalnya sesak napas, pingsan, perdarahan hebat) mengalahkan menu: bot langsung mengirim arahan ke IGD beserta nomor RS.
- Mengetik "menu" atau "0" kapan saja kembali ke menu utama.
- Pesan yang tidak dikenali dibalas pesan fallback: ulang menu, atau pilih "Hubungi perawat" setelah dua kali gagal.
- Sesi tanpa aktivitas 30 menit kembali ke menu utama.
- "Hubungi perawat" mengirim notifikasi ke staf, dan di luar jam operasional bot memberi tahu jam layanan.

**Contoh tampilan (isi diambil dari contoh Anda, nanti dikelola admin)**

```text
Pasien : halo
Bot    : Halo Bapak/Ibu 😊 Layanan ini memberi informasi umum
         dan tidak menggantikan dokter. Silakan pilih topik:
         1. Keluhan setelah kemoterapi
         2. Jadwal dan layanan
         3. Hubungi perawat
Pasien : 1
Bot    : Keluhan apa yang dirasakan?
         1. Mual dan tidak bisa makan
         2. Badan terasa lemas
         0. Kembali ke menu
Pasien : 1
Bot    : (jawaban baku tentang mual, diakhiri anjuran ke fasilitas
         kesehatan bila memburuk) 🙏
         1 Membantu  2 Belum membantu  3 Hubungi perawat
```

## 7. Kebutuhan Fungsional Bot WhatsApp

| Kode | Kebutuhan | Prioritas |
| --- | --- | --- |
| B-01 | Menerima pesan lewat event Baileys, meneruskannya ke Apps Script, mengabaikan pesan ganda, dan menyambung ulang otomatis bila sesi terputus | Wajib |
| B-02 | Menampilkan menu sebagai teks bernomor, tanpa tombol interaktif karena tidak andal di Baileys | Wajib |
| B-03 | Memahami balasan berupa angka atau kata "menu" dan "0" | Wajib |
| B-04 | Mengambil isi menu dan jawaban dari Google Sheets lewat Apps Script dengan cache, bukan tertulis di kode | Wajib |
| B-05 | Memecah menu panjang menjadi halaman dengan pilihan "Lainnya" | Wajib |
| B-06 | Mendeteksi kata kunci darurat dan membalas arahan IGD lebih dulu dari menu | Wajib |
| B-07 | Membalas pesan fallback bila input tidak dikenali, lalu menawarkan staf | Wajib |
| B-08 | Mengirim notifikasi ke staf (grup WhatsApp, email, atau halaman web) saat "Hubungi perawat" dipilih | Wajib |
| B-09 | Menyimpan posisi pasien dalam menu per sesi dan mengakhirinya setelah 30 menit tanpa aktivitas | Wajib |
| B-10 | Mengikuti jam operasional: pesan khusus di luar jam layanan untuk fitur "Hubungi perawat" | Penting |
| B-11 | Mencatat pilihan menu dan umpan balik "Membantu / Belum membantu" untuk statistik | Penting |
| B-12 | Menangani pesan gambar, suara, dan stiker dengan balasan sopan yang mengarahkan ke menu | Penting |
| B-13 | Pencarian kata kunci bebas yang dicocokkan ke jawaban tayang | Fase 2 |

## 8. Kebutuhan Fungsional Web Admin

Web admin adalah inti permintaan Anda: admin RS mengubah pertanyaan dan jawaban sendiri.

| Kode | Kebutuhan | Prioritas |
| --- | --- | --- |
| A-01 | Login dengan akun Google, hanya email admin yang terdaftar boleh masuk | Wajib |
| A-02 | Peran: Super admin dan Admin, keduanya boleh membuat dan mengubah pertanyaan tanpa persetujuan | Wajib |
| A-03 | Kelola kategori: tambah, ubah, hapus, atur urutan dengan seret dan lepas | Wajib |
| A-04 | Kelola pertanyaan dan jawaban dalam kategori, dengan penghitung karakter sesuai batas WhatsApp | Wajib |
| A-05 | Pratinjau tampilan gelembung WhatsApp sebelum disimpan, termasuk format tebal dan miring | Wajib |
| A-06 | Status aktif dan nonaktif; perubahan langsung tayang | Wajib |
| A-07 | Riwayat versi tiap jawaban beserta siapa yang mengubah, serta tombol kembalikan ke versi lama | Wajib |
| A-08 | Pengaturan pesan sambutan, pesan fallback, pesan di luar jam, nomor IGD, dan jam operasional | Wajib |
| A-09 | Daftar kata kunci darurat beserta pesan arahannya | Wajib |
| A-10 | Penjadwalan masa berlaku jawaban (misalnya info musiman) | Penting |
| A-11 | Dasbor statistik: jumlah sesi, pertanyaan terpopuler, tingkat "Membantu", dan pesan tidak dikenali | Penting |
| A-12 | Impor dan ekspor daftar pertanyaan lewat CSV atau Excel | Penting |
| A-13 | Simulator chat di web untuk mencoba alur sebelum tayang | Penting |
| A-14 | Log audit semua perubahan dan login | Wajib |

## 9. Keamanan Klinis

Bot ini menjawab pasien yang sedang sakit, jadi isi jawaban dan cara bot menangani kondisi darurat harus diatur lebih ketat daripada bot layanan biasa.

- **Admin memegang tanggung jawab isi.** Karena perubahan langsung tayang, RS perlu menetapkan siapa yang diberi akun admin, dan sebaiknya dokter meninjau isi menu secara berkala di luar sistem. Setiap perubahan tercatat di riwayat versi.
- **Pola jawaban baku.** Struktur yang disarankan mengikuti contoh Anda: empati singkat, anjuran umum yang aman, lalu tanda bahaya yang harus segera ke fasilitas kesehatan. Admin diberi templat ini di editor.
- **Tanpa diagnosis dan tanpa dosis.** Bot tidak menyebut nama obat atau takaran baru; untuk obat hanya merujuk ke "obat yang diresepkan dokter". Editor memberi peringatan bila teks memuat angka dosis.
- **Kata kunci darurat.** Daftar awal dari dokter (misalnya sesak napas, pingsan, perdarahan, demam tinggi, nyeri dada, kejang) yang dicocokkan di setiap pesan masuk. Cocok berarti bot langsung membalas arahan ke IGD dan memberi tahu staf.
- **Penafian tampil di awal sesi**, bukan hanya di bawah jawaban.
- **Evaluasi berkala.** Setiap bulan, tim klinis meninjau pesan yang tidak dikenali dan jawaban dengan umpan balik "Belum membantu".

## 10. Kebutuhan Non-Fungsional

| Aspek | Kebutuhan |
| --- | --- |
| Privasi | Data kesehatan termasuk data pribadi spesifik dalam UU Pelindungan Data Pribadi (UU No. 27 Tahun 2022). Versi 1 tidak menyimpan keluhan, hanya pilihan menu. Nomor telepon disimpan sebagai hash atau disamarkan di log |
| Persetujuan | Sambutan awal memuat pemberitahuan singkat tentang pencatatan penggunaan, dengan tautan kebijakan privasi RS |
| Keamanan | Web admin hanya bisa dibuka akun Google yang terdaftar, panggilan server Baileys ke Apps Script memakai token rahasia, file sesi Baileys disimpan di server dengan akses terbatas, semua lewat HTTPS |
| Kerahasiaan log | Isi pesan tidak masuk log; masa simpan log penggunaan 90 hari, dapat diatur |
| Ketersediaan | Target 99,5% per bulan. Bot mati berarti pasien tidak terjawab, jadi perlu pemantauan dan peringatan ke staf IT, termasuk saat sesi Baileys terputus |
| Kinerja | Balasan bot di bawah 3 detik (persentil 95) berkat cache menu. Apps Script punya kuota harian dan batas eksekusi serentak, jadi cocok untuk beban awal kecil sampai menengah; bila pemakaian tumbuh besar, pertimbangkan pindah backend |
| Keandalan | Pesan masuk diproses sekali saja (tanpa duplikat), dan pengiriman yang gagal diulang |
| Lokasi data | Data menu dan log di Google Sheets, sesi di VPS; pastikan sesuai kebijakan RS tentang lokasi data kesehatan |
| Aksesibilitas | Kalimat pendek, bahasa sederhana, emoji secukupnya, dan pilihan angka untuk pengguna lansia |
| Kepatuhan | Konsultasikan dengan bagian hukum dan komite etik RS, dan sampaikan ke manajemen bahwa Baileys bukan jalur resmi WhatsApp |

## 11. Arsitektur, Tech Stack, dan Model Data

Sistem terdiri dari satu server Baileys, satu backend Apps Script dengan Google Sheets, dan satu web admin; pemisahan ini yang membuat isi menu bisa diubah tanpa mengubah kode.

&#91;embedded content: arsitektur sistem · 7 komponen\]

Pesan pasien diterima server Baileys, yang meminta menu dan jawaban ke Apps Script (memakai cache) lalu membalas pasien. Web admin adalah halaman dari proyek Apps Script yang sama dan menulis ke Google Sheets. Staf diberi tahu bila pasien meminta perawat.

### 11.1 Tech stack usulan

| Lapisan | Pilihan | Alasan |
| --- | --- | --- |
| Koneksi WhatsApp | Baileys (Node.js) | Pilihan Anda; gratis dan cepat dipasang, tetapi tidak resmi (lihat bagian risiko) |
| Server Baileys | VPS kecil dengan Node.js, dijalankan lewat PM2 atau Docker agar menyala kembali sendiri | Baileys butuh proses yang selalu menyala, tidak bisa digantikan Apps Script |
| Backend | Google Apps Script sebagai web app | Pilihan Anda; tanpa server tambahan untuk data dan web admin |
| Penyimpanan | Google Sheets, satu tab per tabel | Admin dan dokter bisa melihat dan mengimpor data langsung |
| Web admin | HTML Service di Apps Script | Satu proyek dengan backend, login lewat akun Google |
| Cache | Salinan menu di memori server Baileys, diperbarui berkala atau saat admin menyimpan | Mengurangi panggilan ke Apps Script yang lambat dan berkuota |
| Batas yang dijaga | Kuota harian dan eksekusi serentak Apps Script (cek batas terbaru di dokumentasi Google), serta ukuran Sheets bila log membesar | Log ditulis berkelompok dan diarsipkan berkala |
| Pemantauan | Pemantau uptime dan pesan ke staf IT bila sesi terputus | Bot mati berarti pasien tidak terjawab |

### 11.2 Model data (tab Google Sheets)

| Tab Sheets | Isi utama |
| --- | --- |
| users | Email Google, peran (super admin atau admin), aktif |
| categories | Judul, induk, urutan, aktif |
| faqs | Kategori, judul menu (usulan maksimal 24 karakter), isi jawaban, urutan, aktif, diubah oleh, waktu ubah |
| faq\_history | Salinan isi jawaban pada tiap perubahan beserta pengubahnya, untuk tombol kembalikan versi |
| emergency\_rules | Kata kunci darurat, pesan arahan, aktif |
| settings | Sambutan, fallback, pesan di luar jam, jam operasional, nomor IGD |
| event\_logs | Waktu, jenis kejadian, menu dipilih, umpan balik, nomor pasien disamarkan, tanpa isi pesan |
| audit\_logs | Pengguna, aksi, objek, waktu |

Posisi pasien dalam menu (sesi) tidak disimpan di Sheets karena terlalu lambat; sesi disimpan di memori atau file lokal server Baileys.

## 12. Roadmap Bertahap

Peluncuran dibagi empat fase, dan setiap fase hanya lanjut bila gerbang keluarnya terpenuhi. Durasi adalah usulan awal dan perlu disesuaikan dengan ukuran tim.

| Fase | Durasi (usulan) | Isi | Gerbang keluar |
| --- | --- | --- | --- |
| 0. Persiapan | 1 sampai 2 minggu | Siapkan nomor WhatsApp khusus bot dan VPS kecil untuk Baileys, kumpulkan 20 sampai 30 pertanyaan awal dari tim klinis | Nomor dan server siap, daftar pertanyaan awal ditinjau dokter |
| 1. MVP | 4 sampai 6 minggu | Bot menu, web admin dengan akses penuh untuk admin, kata kunci darurat, notifikasi staf, log dasar | Uji internal oleh perawat lulus tanpa jawaban yang salah |
| 2. Uji terbatas | 2 sampai 4 minggu | Pilot di satu unit (misalnya onkologi), dasbor statistik, perbaikan menu dari pesan yang tidak dikenali | Target di bagian 2 tercapai |
| 3. Pengembangan | Menyusul | Pencarian kata kunci, pengingat kontrol, integrasi SIMRS, AI sebagai pencari jawaban, kajian pindah ke Cloud API resmi | Evaluasi hasil pilot oleh RS |

## 13. Risiko dan Pertanyaan Terbuka

| Risiko | Dampak | Penanganan |
| --- | --- | --- |
| Nomor diblokir WhatsApp karena Baileys tidak resmi | Layanan berhenti dan nomor bisa hilang | Nomor khusus bot (bukan nomor utama RS), hanya membalas pesan masuk, tanpa pesan massal, siapkan nomor cadangan dan rencana pindah ke Cloud API resmi |
| Jawaban medis keliru atau usang | Pasien salah bertindak | Riwayat versi, akun admin dibatasi, peninjauan berkala oleh dokter di luar sistem |
| Admin keliru mengubah isi menu | Isi tidak aman langsung tayang | Tombol kembalikan ke versi lama, semua perubahan masuk log audit |
| Pasien menulis keluhan darurat dan bot tidak mengenalinya | Penanganan terlambat | Kata kunci darurat, penafian di awal, jalan keluar "Hubungi perawat" di setiap menu |
| Pasien mengirim data pribadi atau hasil lab ke bot | Data sensitif menumpuk | Isi pesan tidak disimpan, balasan mengingatkan agar tidak mengirim data pribadi |
| Sesi Baileys terputus atau server mati | Pasien tidak terjawab | Sambung ulang otomatis, peringatan ke staf IT, pesan cadangan lewat nomor kontak RS |
| Kuota atau kecepatan Apps Script tidak cukup | Balasan terlambat | Cache menu di server Baileys, log ditulis berkelompok, pantau kuota harian |
| Pasien tidak memakai bot | Manfaat kecil | Sosialisasi lewat kartu atau kode QR di poli, dan pantau tingkat pemakaian |

**Pertanyaan yang perlu dijawab sebelum desain final**

- Siapa saja yang diberi akun admin, dan dokter mana yang meninjau isi menu secara berkala?
- Satu rumah sakit saja, atau beberapa cabang dengan isi menu berbeda? Ini mengubah desain data.
- Apakah memakai nomor WhatsApp baru khusus bot? Ini disarankan karena risiko blokir pada Baileys.
- Siapa yang menyediakan dan membayar VPS untuk server Baileys?
- Staf perlu diberi tahu lewat grup WhatsApp, email, atau halaman web?
- Perkiraan jumlah pasien yang akan memakai bot per bulan?
- Apakah perlu bahasa daerah atau Inggris di fase berikutnya?
