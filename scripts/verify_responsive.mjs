import fs from 'fs';

console.log('=== VERIFIKASI RESPONSIVE MOBILE ===\n');

// 1. Verify css/style.css
const styleCss = fs.readFileSync('css/style.css', 'utf8');

const tests = [
  {
    name: 'Hero buttons 1 column on <= 540px',
    pass: styleCss.includes('@media (max-width: 540px)') && styleCss.includes('grid-template-columns: 1fr'),
  },
  {
    name: 'Hero buttons in 480px query uses 1 column',
    pass: /@media \(max-width: 480px\)[\s\S]*?\.hero-buttons\s*\{\s*grid-template-columns:\s*1fr/.test(styleCss),
  },
  {
    name: 'Hero buttons in 360px query uses 1 column',
    pass: /@media \(max-width: 360px\)[\s\S]*?\.hero-buttons\s*\{\s*grid-template-columns:\s*1fr/.test(styleCss),
  },
  {
    name: 'Katalog search wrapper 100% width on mobile (no 320px flex overflow)',
    pass: /@media \(max-width: 768px\)[\s\S]*?\.katalog-search-wrapper\s*\{\s*flex:\s*1 1 100%/.test(styleCss),
  },
  {
    name: 'Kalkulator Schedule table card layout on <= 680px',
    pass: styleCss.includes('@media (max-width: 680px)') && 
          styleCss.includes('.calc-schedule-table tbody tr.cycle-row {') &&
          styleCss.includes('display: block;'),
  },
  {
    name: 'Summary actions bar full width on mobile',
    pass: /@media \(max-width: 680px\)[\s\S]*?\.summary-actions-bar\s*\{\s*width:\s*100%/.test(styleCss),
  }
];

// 2. Verify css/bot-modal.css
const botModalCss = fs.readFileSync('css/bot-modal.css', 'utf8');

tests.push(
  {
    name: 'Floating close button hidden on mobile (prevents overlap with reset button)',
    pass: /@media \(max-width: 768px\)[^\{]*\{[\s\S]*?\.wa-floating-close-btn\s*\{\s*display:\s*none !important;/.test(botModalCss),
  },
  {
    name: 'Quick replies smooth touch scrolling on mobile',
    pass: botModalCss.includes('-webkit-overflow-scrolling: touch;') && botModalCss.includes('.wa-quick-replies'),
  },
  {
    name: 'Prevent iOS auto-zoom with 16px font on inputs',
    pass: botModalCss.includes('font-size: 16px; /* Prevents iOS auto zoom */'),
  },
  {
    name: 'Chatbot.html full page mobile header alignment',
    pass: /@media \(max-width: 768px\)[\s\S]*?\.full-chatbot-header\s*\{\s*height:\s*56px;/.test(botModalCss),
  }
);

// 3. Verify css/admin.css
const adminCss = fs.readFileSync('css/admin.css', 'utf8');

tests.push(
  {
    name: 'Admin regimen modal mobile width fit',
    pass: adminCss.includes('#regimenModal .login-card') && adminCss.includes('width: calc(100vw - 24px)'),
  },
  {
    name: 'Admin sidebar mobile off-canvas toggle',
    pass: adminCss.includes('.admin-sidebar.mobile-open') && adminCss.includes('transform: translateX(0)'),
  }
);

let allPassed = true;
tests.forEach((t, i) => {
  const mark = t.pass ? '✅' : '❌';
  console.log(`${mark} [${i + 1}] ${t.name}`);
  if (!t.pass) allPassed = false;
});

console.log('\nHasil akhir:', allPassed ? 'SEMUA TES RESPONSIVE BERHASIL (PASSED)!' : 'ADA TES GAGAL!');
process.exit(allPassed ? 0 : 1);
