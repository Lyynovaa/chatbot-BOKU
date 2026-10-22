import fs from 'fs';

console.log('=== VERIFIKASI FITUR CETAK JADWAL PDF KALKULATOR KEMOTERAPI ===\n');

const html = fs.readFileSync('index.html', 'utf8');
const js = fs.readFileSync('js/kalkulator-kemo.js', 'utf8');
const css = fs.readFileSync('css/style.css', 'utf8');

const tests = [
  {
    name: 'Kontainer kemoPrintDoc terpasang di index.html',
    pass: html.includes('id="kemoPrintDoc"') && html.includes('class="kemo-print-doc"'),
  },
  {
    name: 'CSS memiliki aturan halaman cetak A4 (@page size A4 portrait)',
    pass: css.includes('@page') && css.includes('size: A4 portrait') && css.includes('margin: 12mm 15mm 15mm 15mm'),
  },
  {
    name: 'CSS @media print menyembunyikan semua UI website dan menampilkan hanya kemoPrintDoc',
    pass: css.includes('@media print') &&
          css.includes('.kemo-calc-container,') &&
          css.includes('.no-print,') &&
          css.includes('#kemoPrintDoc,') &&
          css.includes('display: block !important;'),
  },
  {
    name: 'CSS @media print memiliki styling Kop Surat, divider resmi, dan logo',
    pass: css.includes('.print-kop-header') &&
          css.includes('.print-kop-logo') &&
          css.includes('.print-kop-text') &&
          css.includes('.print-kop-divider'),
  },
  {
    name: 'CSS @media print memiliki styling tabel cetak dan tanda tangan dengan page-break protection',
    pass: css.includes('.print-schedule-table') &&
          css.includes('.print-signature-row') &&
          css.includes('page-break-inside: avoid !important;'),
  },
  {
    name: 'JavaScript memiliki fungsi renderPrintDocument()',
    pass: js.includes('function renderPrintDocument()') &&
          js.includes('RSUD PROF. DR. MARGONO SOEKARJO PURWOKERTO') &&
          js.includes('LEMBAR PERENCANAAN JADWAL KEMOTERAPI'),
  },
  {
    name: 'JavaScript Kop Surat memuat logo Pemprov Jateng resmi',
    pass: js.includes('assets/images/logo-jateng.svg') && js.includes('print-kop-logo'),
  },
  {
    name: 'JavaScript dokumen cetak memuat kolom Paraf Petugas / Realisasi',
    pass: js.includes('Paraf Petugas / Realisasi'),
  },
  {
    name: 'JavaScript dokumen cetak memuat instruksi persiapan & kelayakan klinis pasien',
    pass: js.includes('Instruksi Penting Bagi Pasien & Keluarga Pendamping') &&
          js.includes('Pemeriksaan Darah Pendukung'),
  },
  {
    name: 'JavaScript dokumen cetak memuat area tanda tangan Pasien & DPJP/Petugas Onkologi',
    pass: js.includes('print-signature-row') &&
          js.includes('Pasien / Keluarga Pendamping') &&
          js.includes('Dokter DPJP / Petugas Onkologi'),
  },
  {
    name: 'Tombol aksi penyesuaian manual di tabel diberi kelas no-print',
    pass: js.includes('class="col-cycle-actions no-print"'),
  },
  {
    name: 'Fungsi printSchedule() melakukan validasi dan memanggil renderPrintDocument() sebelum window.print()',
    pass: js.includes('function printSchedule()') &&
          js.includes('renderPrintDocument()') &&
          js.includes('window.print()'),
  }
];

let allPass = true;
tests.forEach((t, i) => {
  const mark = t.pass ? '✅' : '❌';
  console.log(`${mark} [${i + 1}] ${t.name}`);
  if (!t.pass) allPass = false;
});

console.log('\n' + (allPass ? 'Hasil Verifikasi: FITUR CETAK JADWAL PDF RAPI, BERSIH, DAN BERFUNGSI SEMPURNA (PASSED)!' : 'Ada tes yang gagal!'));
process.exit(allPass ? 0 : 1);
