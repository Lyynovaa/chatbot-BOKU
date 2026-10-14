/**
 * MAIN APP CONTROLLER
 * Coordinates UI interactions, WhatsApp bot modal, and Web Admin portal.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize Bot Engine & Web Admin Portal
  const bot = new window.HospitalWhatsAppBot();
  const adminPortal = new window.WebAdminPortal(bot);
  window.botInstance = bot;
  window.adminPortal = adminPortal;

  // 2. DOM Elements for WhatsApp Modal
  const waModal = document.getElementById('waModal');
  const openWaBtns = document.querySelectorAll('.open-wa-btn');
  const closeWaBtn = document.getElementById('closeWaBtn');
  const waMessagesArea = document.getElementById('waMessagesArea');
  const waChatInput = document.getElementById('waChatInput');
  const waSendBtn = document.getElementById('waSendBtn');

  // DOM Elements for Admin Portal Modal
  const adminModal = document.getElementById('adminModal');
  const openAdminBtns = document.querySelectorAll('.open-admin-btn');

  // 3. Nurse Notification Toast
  bot.onNurseAlert = (alertData) => {
    showToastNotification(alertData);
  };

  function showToastNotification(data) {
    let toast = document.getElementById('hospitalToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'hospitalToast';
      toast.style.cssText = `
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999;
        background: #0f172a;
        color: #ffffff;
        padding: 14px 20px;
        border-radius: 14px;
        box-shadow: 0 10px 25px rgba(0,0,0,0.3);
        border-left: 4px solid #ef4444;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: inherit;
        font-size: 0.88rem;
        transition: all 0.3s ease;
        transform: translateY(-20px);
        opacity: 0;
      `;
      document.body.appendChild(toast);
    }

    const isEmergency = data.type === 'EMERGENCY' || data.type === 'EMERGENCY_OVERRIDE';
    toast.style.borderLeftColor = isEmergency ? '#ef4444' : '#0284c7';
    toast.innerHTML = isEmergency
      ? `<svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" stroke="#ef4444" style="flex-shrink:0;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <div><strong>Peringatan Pasien</strong><br><span style="font-size:0.78rem; color:#fca5a5;">Asistensi medis dibutuhkan segera.</span></div>`
      : `<svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" stroke="#38bdf8" style="flex-shrink:0;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> <div><strong>Notifikasi Perawat Jaga</strong><br><span style="font-size:0.78rem; color:#93c5fd;">Pasien meminta asistensi via WhatsApp.</span></div>`;

    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
    }, 5000);
  }

  // 4. Tanya BOKU WhatsApp Redirection & Portal Simulator Controls
  async function handleTanyaBoku(customText = '') {
    try {
      const res = await fetch('/api/wa/status');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'connected' && data.connectedPhone) {
          let phone = String(data.connectedPhone).replace(/[^0-9]/g, '');
          if (phone.startsWith('0')) {
            phone = '62' + phone.slice(1);
          }
          const defaultMsg = customText || 'Halo BOKU, saya ingin berkonsultasi dan mendapatkan informasi layanan RSUD Prof. Dr. Margono Soekarjo Purwokerto.';
          const text = encodeURIComponent(defaultMsg);
          window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
          return;
        }
      }
    } catch (err) {
      console.warn('[BOKU] Gagal memeriksa status WhatsApp:', err.message);
    }

    showBelumTersediaModal();
  }

  // Alias for backward compatibility
  const handleTanyaMedica = handleTanyaBoku;

  function showBelumTersediaModal() {
    if (adminPortal && typeof adminPortal.showConfirmDialog === 'function') {
      adminPortal.showConfirmDialog({
        title: 'Mohon Maaf, Layanan Belum Tersedia',
        message: 'Layanan WhatsApp Bot BOKU saat ini belum terhubung dengan nomor resmi rumah sakit. Silakan hubungi Call Center RSUD Prof. Dr. Margono Soekarjo di (0281) 632708 atau coba beberapa saat lagi.',
        type: 'warning',
        confirmText: 'Tutup',
        cancelText: null
      });
    } else {
      alert('Mohon maaf, layanan WhatsApp Bot BOKU belum tersedia saat ini. Silakan hubungi (0281) 632708.');
    }
  }

  // Handle all public Tanya BOKU / Contact buttons
  openWaBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      let customText = 'Halo BOKU, saya ingin berkonsultasi dan informasi layanan RSUD Prof. Dr. Margono Soekarjo.';
      const btnText = (btn.textContent || '').trim().toLowerCase();
      if (btnText.includes('janji') || btnText.includes('appointment') || btnText.includes('poli')) {
        customText = 'Halo BOKU, saya ingin membuat janji temu dengan dokter / poliklinik di RSUD Margono Soekarjo.';
      } else if (btnText.includes('onkologi') || btnText.includes('kemo')) {
        customText = 'Halo BOKU, saya ingin konsultasi seputar perawatan pasca-kemoterapi di Pusat Onkologi RSUD Margono Soekarjo.';
      } else if (btnText.includes('abiyasa') || btnText.includes('geriatri')) {
        customText = 'Halo BOKU, saya ingin informasi layanan Paviliun Abiyasa & Pusat Geriatri RSUD Margono Soekarjo.';
      } else if (btnText.includes('operasi') || btnText.includes('tindakan')) {
        customText = 'Halo BOKU, saya ingin menanyakan jadwal dan persiapan tindakan di RSUD Margono Soekarjo.';
      } else if (btnText.includes('fisioterapi') || btnText.includes('rehabilitasi')) {
        customText = 'Halo BOKU, saya ingin informasi seputar rehabilitasi medik dan fisioterapi di RSUD Margono Soekarjo.';
      }
      handleTanyaBoku(customText);
    });
  });

  // Simulator Mockup Controls (Exclusively accessed via MEDICA PORTAL bubble & dashboard button)
  function openSimulatorChat() {
    if (!waModal) return;
    waModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Send initial greeting if empty
    if (waMessagesArea && waMessagesArea.children.length <= 2) {
      renderBotResponse(bot.getMainMenuText());
    }
    updateWaSimulatorQuickChips();
    setTimeout(() => waChatInput?.focus(), 300);
  }

  function closeSimulatorChat() {
    if (!waModal) return;
    waModal.classList.remove('active');
    if (!adminModal?.classList.contains('active')) {
      document.body.style.overflow = '';
    }
  }

  const openSimulatorBtns = document.querySelectorAll('.open-simulator-btn');
  openSimulatorBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSimulatorChat();
    });
  });

  if (closeWaBtn) {
    closeWaBtn.addEventListener('click', closeSimulatorChat);
  }

  const closeWaOutsideBtn = document.getElementById('btnCloseWaOutside');
  if (closeWaOutsideBtn) {
    closeWaOutsideBtn.addEventListener('click', closeSimulatorChat);
  }

  // Reset conversation button inside simulator header
  const btnResetSimulator = document.getElementById('btnResetSimulatorChat');
  if (btnResetSimulator) {
    btnResetSimulator.addEventListener('click', (e) => {
      e.preventDefault();
      bot.resetToMain();
      if (waMessagesArea) {
        waMessagesArea.innerHTML = `
          <div class="wa-chip-notice">
            <svg class="svg-icon svg-icon-xs" style="width:12px;height:12px;" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            <span>Pesan terenkripsi end-to-end • Privasi UU No. 27/2022</span>
          </div>
          <div class="wa-date-chip">HARI INI</div>
        `;
        renderBotResponse(bot.getMainMenuText());
        updateWaSimulatorQuickChips();
        scrollWaToBottom();
      }
    });
  }

  // Hotline button inside simulator header
  const btnCallHotline = document.getElementById('btnCallHotlineSimulator');
  if (btnCallHotline) {
    btnCallHotline.addEventListener('click', (e) => {
      e.preventDefault();
      const res = bot.handleEmergencyEscalation('Klik Hotline Header Simulator');
      renderBotResponse(res.text, true);
      scrollWaToBottom();
    });
  }

  // Escape key to close simulator
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && waModal?.classList.contains('active')) {
      closeSimulatorChat();
    }
  });

  // Close simulator modal when clicking outside mockup
  waModal?.addEventListener('click', (e) => {
    if (e.target === waModal) {
      closeSimulatorChat();
    }
  });

  // 5. Admin Portal & Login Modal Controls
  const adminLoginModal = document.getElementById('adminLoginModal');
  const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const loginErrorAlert = document.getElementById('loginErrorAlert');
  const loginErrorMessage = document.getElementById('loginErrorMessage');
  const btnLogoutAdmin = document.getElementById('btnLogoutAdmin');

  function openAdminDashboard(targetTab = null) {
    adminLoginModal?.classList.remove('active');
    adminModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
    try {
      sessionStorage.setItem('medica_portal_open', 'true');
      localStorage.setItem('medica_portal_open', 'true');
    } catch (e) {}
    adminPortal.renderAll();
    if (targetTab) {
      adminPortal.switchTab(targetTab);
    } else {
      adminPortal.restoreActiveTab();
    }
  }

  function closeAdminDashboard() {
    adminModal?.classList.remove('active');
    document.body.style.overflow = '';
    try {
      sessionStorage.removeItem('medica_portal_open');
      localStorage.removeItem('medica_portal_open');
    } catch (e) {}
  }

  function openAdminLogin() {
    adminModal?.classList.remove('active');
    adminLoginModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (loginErrorAlert) loginErrorAlert.classList.remove('visible');
  }

  // Auto-restore portal jika sudah login sebelumnya dan token valid tersedia
  if (adminPortal.isAuthenticated()) {
    openAdminDashboard();
  } else {
    try {
      sessionStorage.removeItem('medica_portal_open');
      localStorage.removeItem('medica_portal_open');
    } catch (e) {}
  }

  openAdminBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (adminPortal.isAuthenticated()) {
        openAdminDashboard();
      } else {
        openAdminLogin();
      }
    });
  });

  if (closeLoginModalBtn) {
    closeLoginModalBtn.addEventListener('click', () => {
      adminLoginModal.classList.remove('active');
      document.body.style.overflow = '';
    });
  }

  // Handle Admin Login Form
  adminLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail')?.value.trim();
    const pass = document.getElementById('loginPassword')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitLogin');

    if (submitBtn) {
      adminPortal.setButtonLoading(submitBtn, true, 'Memverifikasi...');
    }

    try {
      const res = await adminPortal.login(email, pass);
      if (res.success) {
        if (loginErrorAlert) loginErrorAlert.classList.remove('visible');
        openAdminDashboard();
        adminPortal.showToast(`Selamat datang kembali, ${res.user.name}!`, 'success', 'Login Berhasil');
      } else {
        if (loginErrorAlert && loginErrorMessage) {
          loginErrorMessage.textContent = res.message;
          loginErrorAlert.classList.add('visible');
        }
      }
    } finally {
      if (submitBtn) {
        adminPortal.setButtonLoading(submitBtn, false);
        submitBtn.innerHTML = `<span>Masuk</span><svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
      }
    }
  });

  // Password Visibility Toggle
  const btnTogglePassword = document.getElementById('btnTogglePassword');
  const loginPasswordInput = document.getElementById('loginPassword');
  const eyeIconSvg = document.getElementById('eyeIconSvg');

  if (btnTogglePassword && loginPasswordInput) {
    btnTogglePassword.addEventListener('click', () => {
      const isPassword = loginPasswordInput.type === 'password';
      loginPasswordInput.type = isPassword ? 'text' : 'password';
      if (eyeIconSvg) {
        eyeIconSvg.innerHTML = isPassword
          ? `<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>`
          : `<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>`;
      }
    });
  }

  // Admin FAQ Table Realtime Search Filter
  const faqTableSearchInput = document.getElementById('faqTableSearchInput');
  faqTableSearchInput?.addEventListener('input', (e) => {
    adminPortal.renderFaqTable(e.target.value);
  });

  // Handle Admin Logout
  btnLogoutAdmin?.addEventListener('click', async () => {
    const confirmed = await adminPortal.showConfirmDialog({
      title: 'Keluar dari Portal Admin',
      message: 'Apakah Anda yakin ingin mengakhiri sesi dan keluar dari portal manajemen admin RS Medica?',
      type: 'info',
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal'
    });
    if (!confirmed) return;
    adminPortal.showCrudLoading('Mengakhiri Sesi Admin', 'Membersihkan sesi login dan mengamankan portal...');
    setTimeout(() => {
      adminPortal.logout();
      closeAdminDashboard();
      adminPortal.hideCrudLoading();
      adminPortal.showToast('Anda telah berhasil keluar dari akun admin.', 'info', 'Logout Berhasil');
    }, 450);
  });

  // 6. Hero Interactive Search Controls
  const heroSearchInput = document.getElementById('heroSearchInput');
  const btnHeroSearch = document.getElementById('btnHeroSearch');
  const searchPillBtns = document.querySelectorAll('.search-pill-btn');

  function triggerSearchToWa(query) {
    if (!query) return;
    if (adminModal?.classList.contains('active')) {
      openSimulatorChat();
      setTimeout(() => {
        if (waChatInput) {
          waChatInput.value = query;
          handleSendMessage();
        }
      }, 400);
    } else {
      handleTanyaBoku(`Halo BOKU, saya mencari info jadwal / poli di RSUD Margono: ${query}`);
    }
  }

  btnHeroSearch?.addEventListener('click', () => {
    const val = heroSearchInput?.value.trim();
    if (val) triggerSearchToWa(val);
  });

  heroSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = heroSearchInput?.value.trim();
      if (val) triggerSearchToWa(val);
    }
  });

  searchPillBtns.forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.getAttribute('data-search');
      triggerSearchToWa(q);
    });
  });

  const heroTopicSelect = document.getElementById('heroTopicSelect');
  heroTopicSelect?.addEventListener('change', (e) => {
    const q = e.target.value;
    if (q) {
      triggerSearchToWa(q);
      e.target.value = '';
    }
  });

  // 7. WhatsApp Bot Message Sending Logic
  function handleSendMessage() {
    const text = waChatInput.value.trim();
    if (!text) return;

    renderUserBubble(text);
    waChatInput.value = '';

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'wa-typing-indicator';
    typingIndicator.innerHTML = `
      <div class="wa-typing-dot"></div>
      <div class="wa-typing-dot"></div>
      <div class="wa-typing-dot"></div>
    `;
    waMessagesArea.appendChild(typingIndicator);
    scrollWaToBottom();

    setTimeout(() => {
      typingIndicator.remove();
      const response = bot.processMessage(text);
      renderBotResponse(response.text, response.isEmergency);
      scrollWaToBottom();
      adminPortal.renderStats();
      updateWaSimulatorQuickChips();
    }, 550);
  }

  function renderUserBubble(text) {
    const bubble = document.createElement('div');
    bubble.className = 'wa-bubble wa-bubble-user';
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    bubble.innerHTML = `
      <div class="wa-bubble-text">${escapeHtml(text)}</div>
      <div class="wa-bubble-meta">
        <span>${time}</span>
        <span class="wa-double-check">
          <svg class="svg-icon svg-icon-xs" style="width:13px; height:13px; vertical-align:middle; stroke:currentColor; display:inline-block;" viewBox="0 0 24 24"><path d="M18 6 7 17l-5-5"/><path d="m22 10-7.5 7.5L13 16"/></svg>
        </span>
      </div>
    `;
    waMessagesArea.appendChild(bubble);
    scrollWaToBottom();
  }

  function renderBotResponse(text, isEmergency = false) {
    const bubble = document.createElement('div');
    bubble.className = `wa-bubble wa-bubble-bot ${isEmergency ? 'wa-bubble-emergency' : ''}`;
    const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

    let formatted = escapeHtml(text)
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');

    let headerBadge = '';
    if (isEmergency) {
      headerBadge = `
        <div style="display:flex; align-items:center; gap:6px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #fee2e2; color:#b91c1c; font-size:0.75rem; font-weight:700;">
          <svg class="svg-icon svg-icon-xs" style="width:14px; height:14px; stroke:#dc2626;" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
          <span>LAYANAN DARURAT IGD 24 JAM</span>
        </div>
      `;
    }

    bubble.innerHTML = `
      ${headerBadge}
      <div class="wa-bubble-text">${formatted}</div>
      <div class="wa-bubble-meta">
        <span>${time}</span>
      </div>
    `;
    waMessagesArea.appendChild(bubble);
    scrollWaToBottom();
  }

  function scrollWaToBottom() {
    if (waMessagesArea) {
      waMessagesArea.scrollTop = waMessagesArea.scrollHeight;
    }
  }

  window.openSimulatorChat = openSimulatorChat;
  window.renderBotResponse = renderBotResponse;
  window.scrollWaToBottom = scrollWaToBottom;

  function escapeHtml(string) {
    return String(string)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Event Listeners for Chat
  waSendBtn?.addEventListener('click', handleSendMessage);
  waChatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
  });

  // Dynamic WhatsApp Simulator Quick Chips
  function updateWaSimulatorQuickChips() {
    const container = document.getElementById('waQuickChipsContainer');
    if (!container) return;

    let totalOptions = (bot.data?.categories || []).length;
    if (bot.state === 'CATEGORY' && bot.currentCategory?.faqs) {
      totalOptions = bot.currentCategory.faqs.length;
    }

    let chipsHtml = '';
    for (let i = 1; i <= totalOptions; i++) {
      chipsHtml += `<button class="wa-quick-chip" data-val="${i}">${i}</button>`;
    }
    chipsHtml += `<button class="wa-quick-chip" data-val="0">0</button>`;

    container.innerHTML = chipsHtml;

    container.querySelectorAll('.wa-quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const val = chip.getAttribute('data-val');
        if (val) {
          waChatInput.value = val;
          handleSendMessage();
        }
      });
    });
  }
  window.updateWaSimulatorQuickChips = updateWaSimulatorQuickChips;
  updateWaSimulatorQuickChips();

  // 8. Category Modal Controls (Dynamic Menus)
  const btnOpenAddCategoryModal = document.getElementById('btnOpenAddCategoryModal');
  const btnQuickAddCat = document.getElementById('btnQuickAddCat');
  const closeCategoryModalBtn = document.getElementById('closeCategoryModalBtn');
  const btnCancelCategoryModal = document.getElementById('btnCancelCategoryModal');
  const categoryForm = document.getElementById('categoryForm');
  const categoryModal = document.getElementById('categoryModal');

  btnOpenAddCategoryModal?.addEventListener('click', () => {
    adminPortal.openAddCategoryModal();
  });

  btnQuickAddCat?.addEventListener('click', () => {
    adminPortal.openAddCategoryModal();
  });

  closeCategoryModalBtn?.addEventListener('click', () => {
    categoryModal?.classList.remove('active');
  });

  btnCancelCategoryModal?.addEventListener('click', () => {
    categoryModal?.classList.remove('active');
  });

  categoryForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = document.getElementById('categoryTitleInput')?.value;
    const id = document.getElementById('editCategoryIdInput')?.value;
    adminPortal.saveCategory(title, id || null);
  });

  // 9. User Modal & Management Controls (PRD A-01, A-02)
  const btnOpenAddUserModal = document.getElementById('btnOpenAddUserModal');
  const closeUserModalBtn = document.getElementById('closeUserModalBtn');
  const btnCancelUserModal = document.getElementById('btnCancelUserModal');
  const userModal = document.getElementById('userModal');
  const userForm = document.getElementById('userForm');

  btnOpenAddUserModal?.addEventListener('click', () => {
    adminPortal.openAddUserModal();
  });

  closeUserModalBtn?.addEventListener('click', () => {
    userModal?.classList.remove('active');
  });

  btnCancelUserModal?.addEventListener('click', () => {
    userModal?.classList.remove('active');
  });

  userForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    adminPortal.handleSaveUser();
  });

  document.getElementById('userSearchInput')?.addEventListener('input', () => {
    adminPortal.renderUsers();
  });

  document.getElementById('userRoleFilter')?.addEventListener('change', () => {
    adminPortal.renderUsers();
  });

  // 10. Doctor Carousel / Slider Arrows
  const sliderPrev = document.getElementById('sliderPrev');
  const sliderNext = document.getElementById('sliderNext');
  const doctorsGrid = document.querySelector('.doctors-grid');

  if (sliderPrev && sliderNext && doctorsGrid) {
    sliderNext.addEventListener('click', () => {
      doctorsGrid.scrollBy({ left: 300, behavior: 'smooth' });
    });
    sliderPrev.addEventListener('click', () => {
      doctorsGrid.scrollBy({ left: -300, behavior: 'smooth' });
    });
  }

  // 11. Video Card Play Simulation
  const videoPlayBtn = document.getElementById('videoPlayBtn');
  if (videoPlayBtn) {
    videoPlayBtn.addEventListener('click', () => {
      alert('Memutar kisah inspiratif pemulihan pasien RS Medica.');
    });
  }

  // 12. Landing Page Mobile Navigation Drawer Controls
  const mobileMenuToggle = document.getElementById('mobileMenuToggle');
  const mobileNavDrawer = document.getElementById('mobileNavDrawer');
  const mobileNavOverlay = document.getElementById('mobileNavOverlay');
  const mobileNavClose = document.getElementById('mobileNavClose');
  const mobileNavItems = document.querySelectorAll('.mobile-nav-item');

  function openLandingMobileNav() {
    mobileNavDrawer?.classList.add('active');
    mobileNavOverlay?.classList.add('active');
    mobileMenuToggle?.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeLandingMobileNav() {
    mobileNavDrawer?.classList.remove('active');
    mobileNavOverlay?.classList.remove('active');
    mobileMenuToggle?.classList.remove('active');
    if (!adminModal?.classList.contains('active') && !waModal?.classList.contains('active')) {
      document.body.style.overflow = '';
    }
  }

  mobileMenuToggle?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (mobileNavDrawer?.classList.contains('active')) {
      closeLandingMobileNav();
    } else {
      openLandingMobileNav();
    }
  });

  mobileNavClose?.addEventListener('click', (e) => {
    e.preventDefault();
    closeLandingMobileNav();
  });

  mobileNavOverlay?.addEventListener('click', () => {
    closeLandingMobileNav();
  });

  mobileNavItems.forEach(item => {
    item.addEventListener('click', () => {
      mobileNavItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      closeLandingMobileNav();
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobileNavDrawer?.classList.contains('active')) {
      closeLandingMobileNav();
    }
  });
});
