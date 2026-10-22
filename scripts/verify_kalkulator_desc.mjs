import fs from 'fs';

console.log('=== VERIFIKASI TAMPILAN CLEAN & MINIMAL KALKULATOR KEMOTERAPI ===\n');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('js/kalkulator-kemo.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

const tests = [
  // 1. Header Bersih & Tanpa Elemen Tidak Penting
  {
    name: 'Header kalkulator bersih dan ringkas (tidak ada .calc-guide-grid)',
    pass: !html.includes('class="calc-guide-grid"') && html.includes('Kalkulator Perkiraan Jadwal Kemoterapi'),
  },
  {
    name: 'Catatan disclaimer header yang redundan telah dihapus',
    pass: !html.includes('calc-header-disclaimer-note'),
  },
  {
    name: 'Form input bebas dari petunjuk hint berulang (.form-hint dihapus dari input utama)',
    pass: !html.includes('Tanggal dimulainya pemberian obat siklus ke-1') && 
          !html.includes('Total siklus terapi yang direncanakan'),
  },

  // 2. Regimen Description Bersih & To-The-Point
  {
    name: 'Regimen Info Card memiliki indikasi protokol bersih (.regimen-tag)',
    pass: js.includes('regimen-tag') && js.includes('Indikasi Regimen'),
  },
  {
    name: 'Regimen Info Card bebas dari tips pengisian berulang (.regimen-note-tip dihapus)',
    pass: !js.includes('class="regimen-note-tip"'),
  },

  // 3. Results Rangkuman & Empty State Bersih
  {
    name: 'Empty state bersih tanpa kotak petunjuk berulang (.empty-steps-hint dihapus)',
    pass: !js.includes('class="empty-steps-hint"') && js.includes('class="empty-icon-box"'),
  },
  {
    name: 'Weekend Notice Alert ringkas dan jelas',
    pass: js.includes('Deteksi Hari Akhir Pekan') && js.includes('alert-icon-box'),
  },
  {
    name: 'Medical Disclaimer ringkas, proporsional, dan tetap sesuai standar klinis',
    pass: js.includes('class="calc-medical-disclaimer"') && 
          !js.includes('PEMBERITAHUAN MEDIS RESMI (CLINICAL DISCLAIMER)') &&
          js.includes('Catatan Medis:'),
  },
  {
    name: 'Timeline Header tabel siklus bersih tanpa deskripsi panjang berulang',
    pass: js.includes('Rincian Jadwal Per Siklus') && !js.includes('class="timeline-sub"'),
  },

  // 4. Fitur Fungsional Tetap Utuh
  {
    name: 'Fungsi ekspor PDF dan Kalender (.ics) tetap tersedia utuh',
    pass: js.includes('exportToIcs()') && js.includes('btn-print-schedule'),
  },
  {
    name: 'Fitur penyesuaian manual (+7 Hari dan Override Date) tetap lengkap',
    pass: js.includes('cascade-cycle-delay') && js.includes('override-cycle-date'),
  }
];

let allPass = true;
tests.forEach((t, i) => {
  const mark = t.pass ? '✅' : '❌';
  console.log(`${mark} [${i + 1}] ${t.name}`);
  if (!t.pass) allPass = false;
});

console.log('\n' + (allPass ? 'Hasil Verifikasi: KALKULATOR TAMPIL BERSIH, CLEAN, DAN PROPORSIONAL (PASSED)!' : 'Ada tes yang gagal!'));
process.exit(allPass ? 0 : 1);
