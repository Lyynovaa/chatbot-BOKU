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

  // 2. DOM Elements for Web Chatbot (Floating Modal & Embedded Section)
  const waModal = document.getElementById('waModal');
  const openWaBtns = document.querySelectorAll('.open-wa-btn, .open-chatbot-btn');
  const closeWaBtn = document.getElementById('closeWaBtn');
  const closeWaOutsideBtn = document.getElementById('btnCloseWaOutside');
  const waMessagesArea = document.getElementById('waMessagesArea');
  const waChatInput = document.getElementById('waChatInput');
  const waSendBtn = document.getElementById('waSendBtn');
  const waQuickChipsContainer = document.getElementById('waQuickChipsContainer');
  const btnResetSimulator = document.getElementById('btnResetSimulatorChat');
  const btnCallHotline = document.getElementById('btnCallHotlineSimulator');

  // Embedded Chatbot Section Elements (#chatbot)
  const embeddedSection = document.getElementById('chatbot');
  const embeddedChatbotFrame = document.getElementById('embeddedChatbotFrame');
  const embeddedMessagesArea = document.getElementById('embeddedMessagesArea');
  const embeddedChatInput = document.getElementById('embeddedChatInput');
  const embeddedSendBtn = document.getElementById('embeddedSendBtn');
  const embeddedQuickChipsContainer = document.getElementById('embeddedQuickChipsContainer');
  const btnResetEmbeddedChat = document.getElementById('btnResetEmbeddedChat');
  const btnHotlineEmbeddedChat = document.getElementById('btnHotlineEmbeddedChat');
  const starterChipBtns = document.querySelectorAll('.starter-chip-btn');
  const navChatbotLink = document.getElementById('navChatbotLink');
  const mobileNavChatbotLink = document.getElementById('mobileNavChatbotLink');

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
      : `<svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" stroke="#38bdf8" style="flex-shrink:0;"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> <div><strong>Notifikasi Perawat Jaga</strong><br><span style="font-size:0.78rem; color:#93c5fd;">Pasien meminta asistensi perawat via Chatbot Web.</span></div>`;

    toast.style.transform = 'translateY(0)';
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.transform = 'translateY(-20px)';
      toast.style.opacity = '0';
    }, 5000);
  }

  // Helper to escape HTML safely
  function escapeHtml(string) {
    return String(string)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // 4. Web Chatbot Messaging Engine (Dual Support: Embedded Frame & Floating Modal)
  function renderBotResponseToContainer(container, text, isEmergency = false, options = []) {
    if (!container) return;
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

    let optionsHtml = '';
    if (Array.isArray(options) && options.length > 0) {
      optionsHtml = `<div class="boku-option-list">`;
      options.forEach(opt => {
        const isEmg = Boolean(opt.isEmergency || opt.isEmergencyAction);
        const phoneAttr = opt.phone ? ` data-phone="${escapeHtml(opt.phone)}"` : '';
        optionsHtml += `
          <button type="button" class="boku-option-btn ${isEmg ? 'emergency-btn' : ''}" data-val="${escapeHtml(opt.value)}"${phoneAttr}>
            <span>${escapeHtml(opt.label)}</span>
            <span class="btn-arrow">→</span>
          </button>
        `;
      });
      optionsHtml += `</div>`;
    }

    bubble.innerHTML = `
      ${headerBadge}
      <div class="wa-bubble-text">${formatted}</div>
      ${optionsHtml}
      <div class="wa-bubble-meta">
        <span>${time}</span>
      </div>
    `;

    // Attach listeners to newly created option buttons
    bubble.querySelectorAll('.boku-option-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const phone = btn.getAttribute('data-phone');
        const val = btn.getAttribute('data-val');
        if (btn.classList.contains('emergency-btn') && phone) {
          window.location.href = `tel:${phone.replace(/[^0-9+]/g, '')}`;
          return;
        }
        if (val === 'open_katalog_link') {
          if (window.location.pathname.endsWith('chatbot.html')) {
            window.location.href = 'index.html#/obat';
          } else {
            window.location.hash = '#/obat';
            if (waModal?.classList.contains('active')) {
              closeWaModal();
            }
          }
          return;
        }
        if (val) {
          dispatchUserMessage(val, container === embeddedMessagesArea ? 'embedded' : 'modal');
        }
      });
    });

    container.appendChild(bubble);
    scrollContainerToBottom(container);
  }

  function renderUserBubbleToContainer(container, text) {
    if (!container) return;
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
    container.appendChild(bubble);
    scrollContainerToBottom(container);
  }

  function scrollContainerToBottom(container) {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // Update quick reply numbered chips
  function updateQuickChipsForContainer(chipsContainer, targetType) {
    if (!chipsContainer) return;
    const rawCategories = bot.data?.categories || [];
    const validCategories = rawCategories.filter(c => !c.isEmergency && !/panggilan darurat|layanan darurat/i.test(c.title));
    let totalOptions = validCategories.length;
    if (bot.state === 'CATEGORY' && bot.currentCategory?.faqs) {
      totalOptions = bot.currentCategory.faqs.length;
    }

    let chipsHtml = '';
    for (let i = 1; i <= Math.min(totalOptions, 8); i++) {
      chipsHtml += `<button type="button" class="wa-quick-chip" data-val="${i}">${i}</button>`;
    }
    chipsHtml += `<button type="button" class="wa-quick-chip" data-val="0">0 (Menu)</button>`;
    chipsHtml += `<button type="button" class="wa-quick-chip wa-quick-chip-katalog" data-val="open_katalog_obat">Katalog Obat</button>`;

    chipsContainer.innerHTML = chipsHtml;
  }

  function updateAllQuickChips() {
    if (waQuickChipsContainer) {
      updateQuickChipsForContainer(waQuickChipsContainer, 'modal');
    }
    if (embeddedQuickChipsContainer) {
      updateQuickChipsForContainer(embeddedQuickChipsContainer, 'embedded');
    }
  }

  // Delegated click listeners for quick chips so they ALWAYS respond to click without duplicate bindings
  embeddedQuickChipsContainer?.addEventListener('click', (e) => {
    const chip = e.target.closest('.wa-quick-chip');
    if (!chip) return;
    e.preventDefault();
    const val = chip.getAttribute('data-val');
    if (val) {
      dispatchUserMessage(val, 'embedded');
    }
  });

  waQuickChipsContainer?.addEventListener('click', (e) => {
    const chip = e.target.closest('.wa-quick-chip');
    if (!chip) return;
    e.preventDefault();
    const val = chip.getAttribute('data-val');
    if (val) {
      dispatchUserMessage(val, 'modal');
    }
  });

  let lastDispatched = { text: '', time: 0, target: '' };

  // Dispatch message to bot engine
  function dispatchUserMessage(rawText, target = 'modal') {
    const text = (rawText || '').trim();
    if (!text) return;

    // Cegah duplikasi pengiriman pesan yang sama secara instan (debounce / double-click protection)
    const now = Date.now();
    if (lastDispatched.text === text && lastDispatched.target === target && (now - lastDispatched.time) < 350) {
      return;
    }
    lastDispatched = { text, time: now, target };

    const targetContainer = (target === 'embedded') ? embeddedMessagesArea : waMessagesArea;
    const targetInput = (target === 'embedded') ? embeddedChatInput : waChatInput;

    if (targetInput) targetInput.value = '';

    renderUserBubbleToContainer(targetContainer, text);

    const typingIndicator = document.createElement('div');
    typingIndicator.className = 'wa-typing-indicator';
    typingIndicator.innerHTML = `
      <div class="wa-typing-dot"></div>
      <div class="wa-typing-dot"></div>
      <div class="wa-typing-dot"></div>
    `;
    targetContainer.appendChild(typingIndicator);
    scrollContainerToBottom(targetContainer);

    setTimeout(() => {
      typingIndicator.remove();
      const response = bot.processMessage(text);
      renderBotResponseToContainer(targetContainer, response.text, response.isEmergency, response.options);
      updateAllQuickChips();
      if (adminPortal && typeof adminPortal.renderStats === 'function') {
        adminPortal.renderStats();
      }
    }, 450);
  }

  function resetConversation(target = 'modal') {
    bot.resetToMain();
    const container = (target === 'embedded') ? embeddedMessagesArea : waMessagesArea;
    if (!container) return;

    container.innerHTML = `
      <div class="wa-chip-notice">
        <svg class="svg-icon svg-icon-xs" style="width:12px;height:12px;" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
        <span>Privasi Terlindungi • Standar Medis RSUD Prof. Dr. Margono Soekarjo</span>
      </div>
    `;

    const mainData = bot.getMainMenuData();
    renderBotResponseToContainer(container, mainData.text, false, mainData.options);
    updateAllQuickChips();
    scrollContainerToBottom(container);
  }

  function handleHotlineAction(target = 'modal') {
    const container = (target === 'embedded') ? embeddedMessagesArea : waMessagesArea;
    const res = bot.handleEmergencyEscalation('Klik Hotline Header Web Chat');
    renderBotResponseToContainer(container, res.text, true, res.options);
    updateAllQuickChips();
    scrollContainerToBottom(container);
  }

  // Open & Close floating Web Chat Modal
  function openWebChatModal(initialMessage = '') {
    if (!waModal) return;
    waModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    // Initial greeting if empty
    if (waMessagesArea && waMessagesArea.children.length <= 2) {
      const mainData = bot.getMainMenuData();
      renderBotResponseToContainer(waMessagesArea, mainData.text, false, mainData.options);
    }
    updateAllQuickChips();

    setTimeout(() => {
      if (initialMessage) {
        dispatchUserMessage(initialMessage, 'modal');
      } else {
        waChatInput?.focus();
      }
    }, 300);
  }

  function closeWebChatModal() {
    if (!waModal) return;
    waModal.classList.remove('active');
    if (!adminModal?.classList.contains('active')) {
      document.body.style.overflow = '';
    }
  }

  // Handle all public Tanya BOKU / Contact / Appointment buttons
  function handleTanyaBoku(customText = '') {
    const isChatbotPage = window.location.pathname.includes('chatbot');
    if (isChatbotPage) {
      if (customText) {
        dispatchUserMessage(customText, 'embedded');
      } else {
        embeddedChatInput?.focus();
      }
    } else {
      // Connect from index.html to dedicated chatbot.html page
      if (customText) {
        window.location.href = `chatbot.html?prompt=${encodeURIComponent(customText)}`;
      } else {
        window.location.href = 'chatbot.html';
      }
    }
  }

  const handleTanyaMedica = handleTanyaBoku;

  // Open Web Chat button click listeners
  openWaBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      let customText = 'Halo BOKU, saya ingin konsultasi dan info layanan RSUD Prof. Dr. Margono Soekarjo.';
      const btnText = (btn.textContent || '').trim().toLowerCase();
      if (btnText.includes('janji') || btnText.includes('appointment') || btnText.includes('poli')) {
        customText = 'Halo BOKU, saya ingin membuat janji temu dokter poliklinik di RSUD Margono Soekarjo.';
      } else if (btnText.includes('onkologi') || btnText.includes('kemo')) {
        customText = 'Halo BOKU, saya ingin konsultasi seputar perawatan kemoterapi di Pusat Onkologi RSUD Margono Soekarjo.';
      } else if (btnText.includes('abiyasa') || btnText.includes('geriatri')) {
        customText = 'Halo BOKU, saya ingin informasi layanan Paviliun Abiyasa & Pusat Geriatri RSUD Margono Soekarjo.';
      } else if (btnText.includes('operasi') || btnText.includes('tindakan')) {
        customText = 'Halo BOKU, saya ingin menanyakan jadwal dan persiapan tindakan di RSUD Margono Soekarjo.';
      } else if (btnText.includes('fisioterapi') || btnText.includes('rehabilitasi')) {
        customText = 'Halo BOKU, saya ingin informasi seputar rehabilitasi medik di RSUD Margono Soekarjo.';
      }
      handleTanyaBoku(customText);
    });
  });

  // Modal dialog controls
  const openSimulatorBtns = document.querySelectorAll('.open-simulator-btn');
  openSimulatorBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openWebChatModal();
    });
  });

  if (closeWaBtn) closeWaBtn.addEventListener('click', closeWebChatModal);
  if (closeWaOutsideBtn) closeWaOutsideBtn.addEventListener('click', closeWebChatModal);

  if (btnResetSimulator) {
    btnResetSimulator.addEventListener('click', (e) => {
      e.preventDefault();
      resetConversation('modal');
    });
  }

  if (btnCallHotline) {
    btnCallHotline.addEventListener('click', (e) => {
      e.preventDefault();
      handleHotlineAction('modal');
    });
  }

  // Embedded console header buttons
  if (btnResetEmbeddedChat) {
    btnResetEmbeddedChat.addEventListener('click', (e) => {
      e.preventDefault();
      resetConversation('embedded');
    });
  }

  if (btnHotlineEmbeddedChat) {
    btnHotlineEmbeddedChat.addEventListener('click', (e) => {
      e.preventDefault();
      handleHotlineAction('embedded');
    });
  }

  // Starter prompt chip buttons in #chatbot section & chatbot.html directory
  starterChipBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const href = btn.getAttribute('href');
      if (href && href.includes('chatbot.html')) {
        // Direct link to chatbot.html with prompt parameter
        return;
      }
      e.preventDefault();
      const prompt = btn.getAttribute('data-prompt');
      if (prompt) {
        embeddedChatbotFrame?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        dispatchUserMessage(prompt, 'embedded');
      }
    });
  });

  // Navbar and Mobile Drawer Chatbot Links
  if (navChatbotLink) {
    navChatbotLink.addEventListener('click', (e) => {
      const href = navChatbotLink.getAttribute('href');
      if (href && href.includes('chatbot.html')) {
        // Navigate naturally to dedicated chatbot.html landing page
        return;
      }
      e.preventDefault();
      const chatbotEl = document.getElementById('chatbot');
      chatbotEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => embeddedChatInput?.focus(), 600);
    });
  }

  if (mobileNavChatbotLink) {
    mobileNavChatbotLink.addEventListener('click', (e) => {
      const href = mobileNavChatbotLink.getAttribute('href');
      if (href && href.includes('chatbot.html')) {
        // Navigate naturally to dedicated chatbot.html landing page
        closeLandingMobileNav();
        return;
      }
      e.preventDefault();
      closeLandingMobileNav();
      const chatbotEl = document.getElementById('chatbot');
      chatbotEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => embeddedChatInput?.focus(), 600);
    });
  }

  // Escape key to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && waModal?.classList.contains('active')) {
      closeWebChatModal();
    }
  });

  // Close modal when clicking outside card
  waModal?.addEventListener('click', (e) => {
    if (e.target === waModal) {
      closeWebChatModal();
    }
  });

  // Initialize Embedded Chat on page load with initial greeting & menu options
  if (embeddedMessagesArea && embeddedMessagesArea.children.length <= 2) {
    const mainData = bot.getMainMenuData();
    renderBotResponseToContainer(embeddedMessagesArea, mainData.text, false, mainData.options);
  }
  updateAllQuickChips();

  // URL Query Parameters support (e.g. chatbot.html?prompt=Jadwal%20Poli or ?q=kemo)
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const initialQuery = urlParams.get('prompt') || urlParams.get('q') || urlParams.get('topic');
    if (initialQuery) {
      setTimeout(() => {
        dispatchUserMessage(initialQuery, embeddedMessagesArea ? 'embedded' : 'modal');
      }, 450);
    }
  } catch (err) {}

  // 5. Admin Portal & Login Modal Controls
  const adminLoginModal = document.getElementById('adminLoginModal');
  const closeLoginModalBtn = document.getElementById('closeLoginModalBtn');
  const adminLoginForm = document.getElementById('adminLoginForm');
  const loginErrorAlert = document.getElementById('loginErrorAlert');
  const loginErrorMessage = document.getElementById('loginErrorMessage');
  const btnLogoutAdmin = document.getElementById('btnLogoutAdmin');
  const btnCloseAdminModal = document.getElementById('btnCloseAdminModal');

  function openAdminDashboard(targetTab = null) {
    if (!adminModal) return;
    if (!adminPortal.currentUser) {
      adminPortal.currentUser = adminPortal.loadCurrentUser();
      adminPortal.updateNavbarUserInfo();
    }
    if (!adminPortal.isAuthenticated()) {
      openAdminLogin();
      return;
    }
    adminLoginModal?.classList.remove('active');
    adminModal.classList.add('active');
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
    if (!adminModal) return;
    adminModal.classList.remove('active');
    document.body.style.overflow = '';
    try {
      sessionStorage.removeItem('medica_portal_open');
      localStorage.removeItem('medica_portal_open');
      if (window.location.search.includes('open=admin') || window.location.search.includes('portal=admin') || window.location.hash === '#admin') {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {}
  }

  function openAdminLogin() {
    adminModal?.classList.remove('active');
    adminLoginModal?.classList.add('active');
    document.body.style.overflow = 'hidden';
    if (loginErrorAlert) loginErrorAlert.classList.remove('visible');
    setTimeout(() => {
      document.getElementById('loginEmail')?.focus();
    }, 120);
  }

  // Ekspor fungsi pengendali ke window agar dapat diakses oleh modul lain (misal: handleSessionExpired)
  window.openAdminLogin = openAdminLogin;
  window.openAdminDashboard = openAdminDashboard;
  window.closeAdminDashboard = closeAdminDashboard;

  // Tombol Tutup Dashboard pada Admin Top Bar
  if (btnCloseAdminModal) {
    btnCloseAdminModal.addEventListener('click', (e) => {
      e.preventDefault();
      closeAdminDashboard();
    });
  }

  // Handle klik tombol "Portal Admin RS" di seluruh navbar, drawer mobile, dan footer
  openAdminBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof closeLandingMobileNav === 'function') {
        closeLandingMobileNav();
      }
      // Selalu buka modal login admin sesuai instruksi pengguna
      openAdminLogin();
    });
  });

  // Delegasi event klik terpusat untuk memastikan selector tombol portal admin selalu tertangkap
  document.addEventListener('click', (e) => {
    const adminBtn = e.target.closest('.open-admin-btn, #openAdminNavBtn');
    if (adminBtn) {
      e.preventDefault();
      if (typeof closeLandingMobileNav === 'function') {
        closeLandingMobileNav();
      }
      openAdminLogin();
    }
  });

  // Auto-restore / buka portal admin atau modal login jika ada query ?open=login / ?open=admin / #admin
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const openParam = (urlParams.get('open') || urlParams.get('portal') || '').toLowerCase();
    const isLoginReq = openParam === 'login';
    const isAdminReq = openParam === 'admin' || window.location.hash === '#admin';
    const isSessionOpen = sessionStorage.getItem('medica_portal_open') === 'true';

    if (isLoginReq && adminLoginModal) {
      setTimeout(() => {
        openAdminLogin();
      }, 60);
    } else if ((isAdminReq || isSessionOpen) && adminModal) {
      setTimeout(() => {
        if (adminPortal && adminPortal.isAuthenticated()) {
          openAdminDashboard();
        } else {
          openAdminLogin();
        }
      }, 60);
    }
  } catch (e) {}

  if (closeLoginModalBtn) {
    closeLoginModalBtn.addEventListener('click', () => {
      adminLoginModal?.classList.remove('active');
      document.body.style.overflow = '';
      try {
        if (window.location.search.includes('open=') || window.location.search.includes('portal=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (e) {}
    });
  }

  // Klik area luar (backdrop) modal login untuk menutup
  if (adminLoginModal) {
    adminLoginModal.addEventListener('click', (e) => {
      if (e.target === adminLoginModal) {
        adminLoginModal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });
  }

  // Pembatasan percobaan login di sisi antarmuka pengguna (UX Rate-Limiting - Task 1.6)
  // CATATAN KEAMANAN: Mekanisme ini murni merupakan kontrol antarmuka (UX) di sisi klien untuk
  // mencegah klik spam atau percobaan brute-force kasual secara bertubi-tubi.
  // Ini BUKAN pengganti rate-limiting sebenarnya di sisi server/backend Google Apps Script.
  let consecutiveFailedLogins = 0;
  let loginLockoutTimer = null;
  let lockoutRemainingSeconds = 0;

  // Handle Admin Login Form
  adminLoginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (lockoutRemainingSeconds > 0) {
      if (loginErrorAlert && loginErrorMessage) {
        loginErrorMessage.textContent = `Terlalu banyak percobaan gagal. Silakan tunggu ${lockoutRemainingSeconds} detik sebelum mencoba kembali.`;
        loginErrorAlert.classList.add('visible');
      }
      return;
    }

    const email = document.getElementById('loginEmail')?.value.trim();
    const pass = document.getElementById('loginPassword')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitLogin');

    if (submitBtn) {
      adminPortal.setButtonLoading(submitBtn, true, 'Memverifikasi...');
    }

    try {
      const res = await adminPortal.login(email, pass);
      if (res.success) {
        consecutiveFailedLogins = 0;
        if (loginErrorAlert) loginErrorAlert.classList.remove('visible');
        adminLoginModal?.classList.remove('active');
        if (adminModal) {
          openAdminDashboard();
          adminPortal.showToast(`Selamat datang kembali, ${res.user.name}!`, 'success', 'Login Berhasil');
        } else {
          // Dari chatbot.html, arahkan langsung ke admin dashboard di index.html
          adminPortal.showToast(`Selamat datang, ${res.user.name}! Mengarahkan ke Dashboard...`, 'success', 'Login Berhasil');
          setTimeout(() => {
            window.location.href = 'index.html?open=admin';
          }, 350);
        }
      } else {
        consecutiveFailedLogins++;
        if (loginErrorAlert && loginErrorMessage) {
          loginErrorMessage.textContent = res.message;
          loginErrorAlert.classList.add('visible');
        }

        // Jika mencapai 5 kali kegagalan berturut-turut, kunci tombol selama 60 detik
        if (consecutiveFailedLogins >= 5 && submitBtn) {
          lockoutRemainingSeconds = 60;
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<span>Tunggu (${lockoutRemainingSeconds}s)</span>`;
          if (loginErrorMessage) {
            loginErrorMessage.textContent = `Terlalu banyak percobaan login gagal (5 kali berturut-turut). Tombol login dinonaktifkan selama 60 detik.`;
          }
          if (loginLockoutTimer) clearInterval(loginLockoutTimer);
          loginLockoutTimer = setInterval(() => {
            lockoutRemainingSeconds--;
            if (lockoutRemainingSeconds > 0) {
              submitBtn.innerHTML = `<span>Tunggu (${lockoutRemainingSeconds}s)</span>`;
            } else {
              clearInterval(loginLockoutTimer);
              loginLockoutTimer = null;
              consecutiveFailedLogins = 0;
              submitBtn.disabled = false;
              submitBtn.innerHTML = `<span>Masuk</span><svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>`;
              if (loginErrorAlert) loginErrorAlert.classList.remove('visible');
            }
          }, 1000);
        }
      }
    } finally {
      if (submitBtn && lockoutRemainingSeconds <= 0) {
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

  function triggerSearchToBot(query) {
    if (!query) return;
    if (waModal?.classList.contains('active')) {
      dispatchUserMessage(query, 'modal');
    } else {
      handleTanyaBoku(query);
    }
  }

  btnHeroSearch?.addEventListener('click', () => {
    const val = heroSearchInput?.value.trim();
    if (val) triggerSearchToBot(val);
  });

  heroSearchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const val = heroSearchInput?.value.trim();
      if (val) triggerSearchToBot(val);
    }
  });

  searchPillBtns.forEach(pill => {
    pill.addEventListener('click', () => {
      const q = pill.getAttribute('data-search');
      triggerSearchToBot(q);
    });
  });

  const heroTopicSelect = document.getElementById('heroTopicSelect');
  heroTopicSelect?.addEventListener('change', (e) => {
    const q = e.target.value;
    if (q) {
      triggerSearchToBot(q);
      e.target.value = '';
    }
  });

  // 7. Chat Inputs & Keyboard Listeners
  waSendBtn?.addEventListener('click', () => {
    const text = waChatInput?.value.trim();
    if (text) dispatchUserMessage(text, 'modal');
  });

  waChatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = waChatInput?.value.trim();
      if (text) dispatchUserMessage(text, 'modal');
    }
  });

  embeddedSendBtn?.addEventListener('click', () => {
    const text = embeddedChatInput?.value.trim();
    if (text) dispatchUserMessage(text, 'embedded');
  });

  embeddedChatInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = embeddedChatInput?.value.trim();
      if (text) dispatchUserMessage(text, 'embedded');
    }
  });

  // Global window functions for backward compatibility & debugging
  window.openSimulatorChat = openWebChatModal;
  window.openWebChatModal = openWebChatModal;
  window.closeWebChatModal = closeWebChatModal;
  window.openAdminLogin = openAdminLogin;
  window.dispatchUserMessage = dispatchUserMessage;
  window.renderBotResponse = (text, isEmergency) => renderBotResponseToContainer(waMessagesArea, text, isEmergency);
  window.scrollWaToBottom = () => scrollContainerToBottom(waMessagesArea);
  window.updateWaSimulatorQuickChips = updateAllQuickChips;

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
    if (e.key === 'Escape') {
      if (adminModal?.classList.contains('active')) {
        closeAdminDashboard();
      }
      if (mobileNavDrawer?.classList.contains('active')) {
        closeLandingMobileNav();
      }
    }
  });
});
