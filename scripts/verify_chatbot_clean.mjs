import fs from 'fs';

console.log('=== VERIFIKASI TAMPILAN CLEAN & BEBAS EMOTE LAMAN CHATBOT ===\n');

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

const chatbotHtml = fs.readFileSync('chatbot.html', 'utf8');
const botEngineJs = fs.readFileSync('js/bot-engine.js', 'utf8');
const appJs = fs.readFileSync('js/app.js', 'utf8');
const indexHtml = fs.readFileSync('index.html', 'utf8');

// Regex emoji komprehensif
const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{21A9}]/u;

// 1. Tidak ada emoji di chatbot.html
assert(!emojiRegex.test(chatbotHtml), 'Laman chatbot.html bersih dari raw emote/emoji');

// 2. Tombol admin internal tidak ada di header chatbot publik
assert(!chatbotHtml.includes('full-admin-btn') && !chatbotHtml.includes('Portal Admin RS'), 'Tombol admin internal dihapus dari header chatbot.html');

// 3. Modal login admin yang tidak terpakai dihapus dari chatbot.html
assert(!chatbotHtml.includes('admin-login-modal') && !chatbotHtml.includes('adminLoginForm'), 'Modal login admin redundan dihapus dari chatbot.html');

// 4. Caption panjang di bawah input bar dihapus dari chatbot.html
assert(!chatbotHtml.includes('full-bottom-caption'), 'Caption bawah yang memakan tempat dihapus dari chatbot.html');

// 5. Chip HARI INI yang redundan dihapus dari chatbot.html
assert(!chatbotHtml.includes('wa-date-chip'), 'Chip tanggal redundan (HARI INI) dihapus dari chatbot.html');

// 6. Tidak ada emoji di js/bot-engine.js
assert(!emojiRegex.test(botEngineJs), 'Engine pesan js/bot-engine.js bebas dari emote/emoji');

// 7. Label menu utama & hotline di bot-engine bersih tanpa emoji
assert(!botEngineJs.includes('📞') && !botEngineJs.includes('💊') && !botEngineJs.includes('↩️'), 'Label menu utama, hotline, dan kembali bebas emoji');

// 8. Opsi feedback dan perawat di bot-engine bersih tanpa emoji
assert(!botEngineJs.includes('👍') && !botEngineJs.includes('👎') && !botEngineJs.includes('👩‍⚕️'), 'Opsi feedback dan perawat jaga bebas emoji');

// 9. Quick chips di js/app.js bebas dari emoji
assert(!appJs.includes('💊 Obat') && appJs.includes('Katalog Obat'), 'Quick chips di js/app.js menggunakan teks bersih Katalog Obat (tanpa emoji obat)');

// 10. Starter prompts di index.html bebas emoji
const starterSection = indexHtml.substring(indexHtml.indexOf('starter-chips-wrap'), indexHtml.indexOf('starter-chips-wrap') + 600);
assert(!emojiRegex.test(starterSection), 'Starter prompt chips di index.html bebas dari raw emote/emoji');

console.log(`\nHasil: ${pass} lulus, ${fail} gagal.`);
if (fail > 0) {
  process.exit(1);
} else {
  console.log('SEMUA PENGUJIAN LAMAN CHATBOT CLEAN & BEBAS EMOTE BERHASIL (PASSED)!');
}
