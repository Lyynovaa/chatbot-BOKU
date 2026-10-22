import fs from 'fs';

console.log('=== VERIFIKASI TAMPILAN CLEAN & RAPI KATALOG OBAT KEMOTERAPI ===\n');

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

const indexHtml = fs.readFileSync('index.html', 'utf8');
const styleCss = fs.readFileSync('css/style.css', 'utf8');
const katalogJs = fs.readFileSync('js/katalog-obat.js', 'utf8');

// 1. Perhatian medis bawah dihapus
const bottomDisclaimerInHtml = indexHtml.includes('bottom-disclaimer');
assert(!bottomDisclaimerInHtml, 'Kotak perhatian medis bawah (bottom-disclaimer) telah dihapus dari index.html');

// 2. Perhatian medis atas tetap ada dengan teks standar klinis
const topDisclaimerInHtml = indexHtml.includes('obat-disclaimer-box') && 
                            indexHtml.includes('Jangan mengubah dosis tanpa arahan tenaga kesehatan');
assert(topDisclaimerInHtml, 'Disclaimer medis resmi atas tetap tersedia dan menggunakan teks klinis');

// 3. Icon disclaimer menggunakan SVG (bukan raw emoji)
const hasSvgDisclaimerIcon = indexHtml.includes('<aside class="obat-disclaimer-box"') &&
                             indexHtml.includes('<svg class="svg-icon');
assert(hasSvgDisclaimerIcon, 'Ikon disclaimer medis menggunakan SVG profesional (bukan raw emoji)');

// 4. CSS bottom-disclaimer telah dihapus
assert(!styleCss.includes('.obat-disclaimer-box.bottom-disclaimer'), 'Rule CSS .obat-disclaimer-box.bottom-disclaimer telah dihapus dari style.css');

// 5. Disclaimer medis diberi styling clean blue-accent clinical
const disclaimerCleanCss = styleCss.includes('.obat-disclaimer-box {') &&
                           styleCss.includes('border-left: 4px solid var(--primary);');
assert(disclaimerCleanCss, 'Disclaimer medis memiliki styling clean modern dengan aksen border-left klinis');

// 6. Toolbar & search wrapper diselaraskan
const toolbarAligned = styleCss.includes('.katalog-toolbar {') &&
                       styleCss.includes('flex-direction: column;') &&
                       styleCss.includes('.katalog-filters-group {') &&
                       styleCss.includes('grid-template-columns: 1fr 1fr 1fr auto;');
assert(toolbarAligned, 'Toolbar pencarian dan filter menggunakan CSS Grid terstruktur (1fr 1fr 1fr auto)');

// 7. Tinggi filter select dan tombol reset diselaraskan (44px)
const heightUniform = styleCss.includes('.katalog-search-input {') &&
                      styleCss.includes('height: 44px;') &&
                      styleCss.includes('.katalog-filter-select {') &&
                      styleCss.includes('height: 44px;') &&
                      styleCss.includes('.btn-reset-filter {') &&
                      styleCss.includes('height: 44px;');
assert(heightUniform, 'Ketinggian search input, dropdown filter, dan tombol reset diselaraskan (44px)');

// 8. Custom Chevron SVG untuk filter selects
const customChevron = styleCss.includes('.katalog-filter-select {') &&
                      styleCss.includes("background-image: url(\"data:image/svg+xml");
assert(customChevron, 'Dropdown filter menggunakan custom chevron SVG elegan dan appearance: none');

// 9. Tidak ada raw emoji di render js/katalog-obat.js
const noRawEmojisInKatalog = !/[🏥📖🎯🧪⚠️🩺📍📞💬]/.test(katalogJs);
assert(noRawEmojisInKatalog, 'Semua raw emoji pada render kartu & detail katalog telah digantikan oleh SVG');

// 10. Styling facility-icon dan sec-icon menggunakan badge SVG modern
const cleanBadgeCss = styleCss.includes('.facility-icon {') &&
                      styleCss.includes('background: #e0f2fe;') &&
                      styleCss.includes('.sec-icon {') &&
                      styleCss.includes('width: 28px;');
assert(cleanBadgeCss, 'Badge fasilitas dan header detail memiliki styling SVG klinis modern');

// 11. Responsive layout tablet (2 kolom) dan mobile (1 kolom)
const responsiveGridCss = styleCss.includes('@media (max-width: 992px)') &&
                          styleCss.includes('.katalog-filters-group {\n    grid-template-columns: repeat(2, 1fr);') &&
                          styleCss.includes('@media (max-width: 768px)') &&
                          styleCss.includes('.katalog-filters-group {\n    grid-template-columns: 1fr;');
assert(responsiveGridCss, 'Filter katalog responsif dengan 2 kolom di tablet dan 1 kolom di mobile');

console.log(`\nHasil: ${pass} lulus, ${fail} gagal.`);
if (fail > 0) {
  process.exit(1);
} else {
  console.log('SEMUA PENGUJIAN KATALOG OBAT CLEAN & RAPI BERHASIL (PASSED)!');
}
