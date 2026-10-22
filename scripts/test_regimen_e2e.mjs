import assert from 'assert';

const BASE_URL = 'http://localhost:3000';

async function testRegimenWorkflow() {
  console.log('--- TEST REGIMEN WORKFLOW ---');

  // 1. Get initial regimen list
  console.log('1. Mengambil daftar regimen awal...');
  const resGet1 = await fetch(`${BASE_URL}/api/gas/regimen`);
  assert.strictEqual(resGet1.status, 200, 'GET /api/gas/regimen harus 200 OK');
  const jsonGet1 = await resGet1.json();
  assert.strictEqual(jsonGet1.success, true, 'GET response harus success: true');
  console.log(`   Ditemukan ${jsonGet1.data.length} regimen aktif.`);

  // 2. Buat token admin valid
  const adminToken = Buffer.from(JSON.stringify({
    email: 'admin.onkologi@rs-medica.id',
    name: 'Administrator Onkologi Wijayakusuma',
    role: 'Super Admin',
    exp: Date.now() + 86400000
  })).toString('base64');

  // 3. Tambah Regimen Baru
  const testRegimenName = 'TEST REGIMEN CAPECITABINE + OXALIPLATIN (CAPOX) - ' + Date.now();
  console.log(`2. Membuat regimen baru: "${testRegimenName}"...`);

  const payloadData = {
    nama_regimen: testRegimenName,
    default_interval: 21,
    default_siklus: 8,
    deskripsi: 'Protokol kemoterapi kombinasi ajuvan CAPOX untuk pengujian otomatis.',
    active: true
  };

  const resCreate = await fetch(`${BASE_URL}/api/gas/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_regimen',
      token: adminToken,
      data: payloadData,
      regimenData: payloadData,
      ...payloadData
    })
  });

  assert.strictEqual(resCreate.status, 200, 'POST create_regimen status harus 200');
  const jsonCreate = await resCreate.json();
  console.log('   Hasil create_regimen:', jsonCreate);
  assert.strictEqual(jsonCreate.success, true, 'create_regimen harus berhasil');
  const createdId = jsonCreate.data?.id;
  console.log(`   ID Regimen Baru: ${createdId}`);

  // 4. Verifikasi muncul di GET /api/gas/regimen
  console.log('3. Memverifikasi regimen baru tampil di /api/gas/regimen...');
  const resGet2 = await fetch(`${BASE_URL}/api/gas/regimen`);
  const jsonGet2 = await resGet2.json();
  const found = jsonGet2.data.find(r => r.nama_regimen === testRegimenName || r.id === createdId);
  console.log('   Regimen ditemukan di daftar publik kalkulator:', !!found);
  assert.ok(found, 'Regimen baru harus ditemukan di GET /api/gas/regimen');

  // 5. Update Regimen
  console.log('4. Menguji update_regimen...');
  const updatedDesc = 'Deskripsi diperbarui untuk pengujian verifikasi.';
  const resUpdate = await fetch(`${BASE_URL}/api/gas/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_regimen',
      token: adminToken,
      id: createdId,
      data: {
        nama_regimen: testRegimenName,
        default_interval: 28,
        default_siklus: 6,
        deskripsi: updatedDesc,
        active: true
      },
      regimenData: {
        nama_regimen: testRegimenName,
        default_interval: 28,
        default_siklus: 6,
        deskripsi: updatedDesc,
        active: true
      }
    })
  });
  const jsonUpdate = await resUpdate.json();
  console.log('   Hasil update_regimen:', jsonUpdate);
  assert.strictEqual(jsonUpdate.success, true, 'update_regimen harus berhasil');

  // 6. Toggle Regimen (nonaktifkan)
  console.log('5. Menguji toggle_regimen (menonaktifkan)...');
  const resToggle = await fetch(`${BASE_URL}/api/gas/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'toggle_regimen',
      token: adminToken,
      id: createdId,
      active: false,
      data: { active: false },
      regimenData: { active: false }
    })
  });
  const jsonToggle = await resToggle.json();
  console.log('   Hasil toggle_regimen:', jsonToggle);
  assert.strictEqual(jsonToggle.success, true, 'toggle_regimen harus berhasil');

  // Verifikasi tidak muncul di daftar publik setelah dinonaktifkan
  const resGet3 = await fetch(`${BASE_URL}/api/gas/regimen`);
  const jsonGet3 = await resGet3.json();
  const foundInactive = jsonGet3.data.find(r => r.id === createdId);
  console.log('   Regimen nonaktif tersembunyi dari publik kalkulator:', !foundInactive);
  assert.strictEqual(!foundInactive, true, 'Regimen nonaktif tidak boleh muncul di publik');

  // 7. Hapus Regimen pengujian
  console.log('6. Menghapus regimen pengujian...');
  const resDelete = await fetch(`${BASE_URL}/api/gas/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'delete_regimen',
      token: adminToken,
      id: createdId
    })
  });
  const jsonDelete = await resDelete.json();
  console.log('   Hasil delete_regimen:', jsonDelete);
  assert.strictEqual(jsonDelete.success, true, 'delete_regimen harus berhasil');

  console.log('\n✅ SEMUA PENGUJIAN REGIMEN WORKFLOW BERHASIL 100%!');
}

testRegimenWorkflow().catch(err => {
  console.error('❌ PENGUJIAN GAGAL:', err);
  process.exit(1);
});
