import fs from 'fs';

console.log('=== VERIFIKASI RESPONSIVITAS CARD OBAT UNTUK LAYAR HP KECIL ===\n');

const styleCss = fs.readFileSync('css/style.css', 'utf8');

let pass = 0;
let fail = 0;

function assert(cond, name) {
  if (cond) {
    console.log(`✅ [${pass + fail + 1}] ${name}`);
    pass++;
  } else {
    console.error(`❌ [${pass + fail + 1}] ${name}`);
    fail++;
  }
}

// 1. Base obat-card memiliki proteksi overflow
assert(
  styleCss.includes('.obat-card {') &&
  styleCss.includes('min-width: 0;') &&
  styleCss.includes('overflow-wrap: break-word;'),
  'Base .obat-card memiliki min-width: 0 dan overflow-wrap: break-word'
);

// 2. Base obat-name memiliki word-break
assert(
  styleCss.includes('.obat-name {') &&
  styleCss.includes('word-break: break-word;'),
  'Base .obat-name memiliki word-break: break-word'
);

// 3. Media query 768px mengatur single-column grid dan spacing
assert(
  /@media \(max-width: 768px\)[\s\S]*?\.katalog-cards-grid\s*\{\s*grid-template-columns:\s*1fr/.test(styleCss),
  'Breakpoint 768px mengatur kartu menjadi 1 kolom penuh'
);

// 4. Media query 520px untuk HP kecil: Deskripsi ke bawah (line clamp leluasa)
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.obat-summary-desc\s*\{[\s\S]*?-webkit-line-clamp:\s*4/.test(styleCss),
  'Breakpoint <= 520px: Deskripsi kartu turun ke bawah secara leluasa (-webkit-line-clamp: 4)'
);

// 5. Media query 520px: Fasilitas & Harga turun ke bawah (flex-direction: column)
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.obat-facility-strip\s*\{[\s\S]*?flex-direction:\s*column/.test(styleCss),
  'Breakpoint <= 520px: Fasilitas dan harga bertumpuk ke bawah (flex-direction: column)'
);

// 6. Media query 520px: Nama fasilitas tidak terpotong (white-space: normal)
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.facility-name\s*\{[\s\S]*?white-space:\s*normal/.test(styleCss),
  'Breakpoint <= 520px: Nama fasilitas tidak terpotong (white-space: normal)'
);

// 7. Media query 520px: Harga menjadi dedicated full-width green banner
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.facility-price\s*\{[\s\S]*?width:\s*100%[\s\S]*?justify-content:\s*space-between/.test(styleCss),
  'Breakpoint <= 520px: Kotak harga menjadi bar penuh (width: 100%, justify-content: space-between)'
);

// 8. Media query 520px: Footer kartu bertumpuk vertikal
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.obat-card-footer\s*\{[\s\S]*?flex-direction:\s*column/.test(styleCss),
  'Breakpoint <= 520px: Footer kartu (tanggal & tombol aksi) bertumpuk vertikal'
);

// 9. Media query 520px: Tombol Lihat Detail menjadi tombol full-width yang mudah disentuh
assert(
  /@media \(max-width: 520px\)[\s\S]*?\.btn-detail-link\s*\{[\s\S]*?width:\s*100%[\s\S]*?justify-content:\s*center/.test(styleCss),
  'Breakpoint <= 520px: Tombol Lihat Detail menjadi tombol sentuh full-width ramah jempol'
);

// 10. Media query 360px untuk HP ekstra kecil (iPhone 5 / SE 1st gen)
assert(
  /@media \(max-width: 360px\)[\s\S]*?\.obat-card\s*\{[\s\S]*?padding:\s*14px 10px/.test(styleCss),
  'Breakpoint <= 360px: Padding kartu menyesuaikan ekstra kompak (14px 10px) tanpa clipping'
);

console.log(`\nHasil: ${pass} lulus, ${fail} gagal.`);
if (fail > 0) {
  process.exit(1);
} else {
  console.log('SEMUA PENGUJIAN RESPONSIVITAS CARD OBAT HP KECIL BERHASIL (PASSED)!');
}
