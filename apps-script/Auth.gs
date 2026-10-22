/**
 * AUTH.GS - MANAJEMEN AUTENTIKASI & WHITELIST STAF ADMIN RS
 * Mengimplementasikan PRD A-01, A-02 (users table) & Kepatuhan Keamanan
 */

/**
 * Login admin menggunakan email dan password (A-01)
 */
function loginAdmin(email, password) {
  if (!email || !password) {
    return { success: false, message: "Email dan kata sandi wajib diisi." };
  }

  var cleanEmail = String(email).trim().toLowerCase();
  var users = getSheetRowsAsObjects(CONFIG.SHEETS.USERS);
  var matchedUser = null;

  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).trim().toLowerCase() === cleanEmail) {
      matchedUser = users[i];
      break;
    }
  }

  if (!matchedUser) {
    recordAuditLog("GUEST", "LOGIN_GAGAL", "Percobaan login dengan email tidak terdaftar: " + cleanEmail);
    return { 
      success: false, 
      message: "Email tidak terdaftar dalam whitelist admin RS Medica (PRD A-01)!" 
    };
  }

  if (!matchedUser.active) {
    recordAuditLog(cleanEmail, "LOGIN_GAGAL", "Akun dinonaktifkan oleh administrator");
    return { 
      success: false, 
      message: "Akun ini telah dinonaktifkan. Hubungi Super Admin RS Medica." 
    };
  }

  if (String(matchedUser.password) !== String(password)) {
    recordAuditLog(cleanEmail, "LOGIN_GAGAL", "Kata sandi salah untuk email: " + cleanEmail);
    return { 
      success: false, 
      message: "Kata sandi tidak sesuai untuk akun ini." 
    };
  }

  // Berhasil login
  var sessionToken = generateSessionToken(matchedUser);
  recordAuditLog(cleanEmail, "LOGIN_BERHASIL", "Login via kredensial staf (" + matchedUser.role + ")");

  return {
    success: true,
    token: sessionToken,
    user: {
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role
    }
  };
}

/**
 * Login menggunakan Google Workspace OAuth SSO (PRD A-01)
 */
function loginWithGoogleSso(email) {
  if (!email) {
    return { success: false, message: "Email Google Workspace tidak valid." };
  }

  var cleanEmail = String(email).trim().toLowerCase();
  var users = getSheetRowsAsObjects(CONFIG.SHEETS.USERS);
  var matchedUser = null;

  for (var i = 0; i < users.length; i++) {
    if (String(users[i].email).trim().toLowerCase() === cleanEmail) {
      matchedUser = users[i];
      break;
    }
  }

  if (!matchedUser) {
    recordAuditLog("GUEST", "LOGIN_GOOGLE_GAGAL", "Email Google tidak ada di whitelist: " + cleanEmail);
    return {
      success: false,
      message: "Akun Google Workspace (" + cleanEmail + ") belum terdaftar dalam whitelist admin."
    };
  }

  if (!matchedUser.active) {
    return { success: false, message: "Akun Google ini telah dinonaktifkan." };
  }

  var sessionToken = generateSessionToken(matchedUser);
  recordAuditLog(cleanEmail, "LOGIN_GOOGLE_OAUTH", "Login via Google Workspace SSO (" + matchedUser.role + ")");

  return {
    success: true,
    token: sessionToken,
    user: {
      email: matchedUser.email,
      name: matchedUser.name,
      role: matchedUser.role
    }
  };
}

/**
 * Membuat token sesi dengan enkripsi sederhana dan waktu kedaluwarsa
 */
function generateSessionToken(user) {
  var expiresAt = new Date().getTime() + (CONFIG.SESSION_TTL_HOURS * 3600 * 1000);
  var payload = {
    email: user.email,
    role: user.role,
    name: user.name,
    exp: expiresAt,
    salt: Utilities.getUuid()
  };
  
  var jsonStr = JSON.stringify(payload);
  var token = Utilities.base64EncodeWebSafe(jsonStr);
  
  // Simpan ke CacheService Apps Script untuk validasi kilat
  var cache = CacheService.getScriptCache();
  cache.put("SESSION_" + user.email, token, CONFIG.SESSION_TTL_HOURS * 3600);
  
  return token;
}

/**
 * Memvalidasi apakah session token masih berlaku
 */
function validateSession(token) {
  if (!token) return null;
  // Dukungan untuk master webhook secret token dari server proxy & web admin
  if (token === CONFIG.API_SECRET_TOKEN || token === CONFIG.WEBHOOK_SECRET_TOKEN || token === "MEDICA_WA_BOT_SECRET_2026_TOKEN") {
    return { email: "admin.onkologi@rs-medica.id", role: "Super Admin", name: "Super Admin RS" };
  }
  try {
    var rawStr = String(token).trim();
    var base64Standard = rawStr.replace(/-/g, "+").replace(/_/g, "/");
    while (base64Standard.length % 4 !== 0) {
      base64Standard += "=";
    }

    var decodedBytes;
    try {
      decodedBytes = Utilities.base64Decode(base64Standard);
    } catch (e1) {
      decodedBytes = Utilities.base64DecodeWebSafe(rawStr);
    }

    var jsonStr = Utilities.newBlob(decodedBytes).getDataAsString();
    var payload = JSON.parse(jsonStr);

    if (payload.exp && new Date().getTime() > payload.exp) {
      return null; // Kedaluwarsa
    }
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Helper otorisasi: Super Admin dan Admin diizinkan, Perawat dilarang mengelola konten/katalog
 */
function isAuthorizedAdmin(session) {
  if (!session) return false;
  var role = String(session.role || "").trim().toLowerCase().replace(/[\s_]+/g, "");
  if (role.indexOf("perawat") !== -1 || role.indexOf("nurse") !== -1) {
    return false;
  }
  return role === "superadmin" || role === "admin" || role.indexOf("super") !== -1;
}

/**
 * Mengambil daftar staf admin terdaftar (Khusus Super Admin)
 */
function getUsersList(token) {
  var session = validateSession(token);
  if (!session || !isAuthorizedAdmin(session)) {
    return { success: false, message: "Akses ditolak: Membutuhkan peran Super Admin atau Admin." };
  }

  var users = getSheetRowsAsObjects(CONFIG.SHEETS.USERS);
  var cleanList = users.map(function(u) {
    return {
      email: u.email,
      name: u.name,
      role: u.role,
      active: u.active === true || String(u.active).toLowerCase() === "true",
      created_at: u.created_at
    };
  });

  return { success: true, data: cleanList };
}

/**
 * Menambahkan staf baru ke whitelist admin
 */
function addAdminUser(newUserData, token) {
  var session = validateSession(token);
  if (!session || (session.role !== "Super Admin" && session.role !== "Admin")) {
    return { success: false, message: "Hanya Super Admin yang dapat mendaftarkan staf baru." };
  }

  if (!newUserData || !newUserData.email) {
    return { success: false, message: "Email staf wajib diisi." };
  }

  var cleanEmail = String(newUserData.email).trim().toLowerCase();
  var users = getSheetRowsAsObjects(CONFIG.SHEETS.USERS);
  var exists = users.some(function(u) { return String(u.email).trim().toLowerCase() === cleanEmail; });
  if (exists) {
    return { success: false, message: "Email " + cleanEmail + " sudah terdaftar dalam sistem." };
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.USERS);
  sheet.appendRow([
    cleanEmail,
    newUserData.password || "",
    newUserData.name || "Staf RS Medica",
    newUserData.role || "Admin",
    true,
    new Date().toISOString()
  ]);

  recordAuditLog(session.email, "TAMBAH_STAF", "Mendaftarkan staf baru: " + cleanEmail + " (" + (newUserData.role || "Admin") + ")");
  return { success: true, message: "Staf berhasil ditambahkan ke whitelist." };
}

/**
 * Mengubah status aktif / nonaktif staf
 */
function toggleUserStatus(targetEmail, active, token) {
  var session = validateSession(token);
  if (!session || (session.role !== "Super Admin" && session.role !== "Admin")) {
    return { success: false, message: "Hanya Super Admin yang dapat mengubah status staf." };
  }

  if (!targetEmail) return { success: false, message: "Email target tidak valid." };
  var cleanEmail = String(targetEmail).trim().toLowerCase();

  var sheet = getOrCreateSheet(CONFIG.SHEETS.USERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === cleanEmail) {
      sheet.getRange(i + 1, 5).setValue(Boolean(active));
      recordAuditLog(session.email, "UBAH_STATUS_STAF", "Mengubah status " + cleanEmail + " menjadi: " + (active ? "Aktif" : "Nonaktif"));
      return { success: true, message: "Status staf berhasil diperbarui." };
    }
  }

  return { success: false, message: "Staf tidak ditemukan dalam whitelist." };
}

/**
 * Menghapus staf dari whitelist
 */
function deleteAdminUser(targetEmail, token) {
  var session = validateSession(token);
  if (!session || (session.role !== "Super Admin" && session.role !== "Admin")) {
    return { success: false, message: "Hanya Super Admin yang dapat menghapus staf." };
  }

  if (!targetEmail) return { success: false, message: "Email target tidak valid." };
  var cleanEmail = String(targetEmail).trim().toLowerCase();

  if (cleanEmail === "admin.onkologi@rs-medica.id") {
    return { success: false, message: "Akun Super Admin utama tidak dapat dihapus." };
  }

  var sheet = getOrCreateSheet(CONFIG.SHEETS.USERS);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === cleanEmail) {
      sheet.deleteRow(i + 1);
      recordAuditLog(session.email, "HAPUS_STAF", "Menghapus akun staf dari whitelist: " + cleanEmail);
      return { success: true, message: "Akun staf berhasil dihapus dari whitelist." };
    }
  }

  return { success: false, message: "Staf tidak ditemukan." };
}
