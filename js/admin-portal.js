/**
 * WEB ADMIN PORTAL CONTROLLER
 * Implements PRD Section 8
 * - Category & FAQ management with character count and instant publish
 * - Realtime Clinical Dosage Safety Filter (Prevent medical liability)
 * - WhatsApp Bubble Live Previewer
 * - PDP Law Compliant Audit & Event Logs
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class WebAdminPortal {
  constructor(botInstance) {
    this.bot = botInstance;
    
    // Admin Whitelist per PRD A-01 / A-02 (dimuat dari Google Apps Script database Sheets)
    this.whitelistUsers = [];

    this.currentUser = this.loadCurrentUser();

    // Clinical dosage regex pattern (Section 9: Tanpa diagnosis dan tanpa dosis)
    this.dosageRegex = /\b(\d+\s*(mg|ml|gr|gram|mcg|tablet|kapsul|x\s*\d|sendok))\b/i;

    this.editingFaqId = null;
    this.isLoggingOutWa = false;

    // State Katalog Obat Kemoterapi (Fase 3)
    this.obatList = [];
    this.activeObatFasilitasId = null;
    this.editingObatId = null;
    this.editingFasilitasId = null;
    this.obatCurrentPage = 1;
    this.obatPageSize = 10;
    this.obatFilterSearch = '';
    this.obatFilterStatus = '';
    this.obatFilterBentuk = '';
    this.parsedValidCsvRows = [];

    // State Regimen Kemoterapi (Custom Chemotherapy Calculator)
    this.regimenList = [];
    this.editingRegimenId = null;
    this.regimenFilterSearch = '';
    this.regimenFilterStatus = '';

    this.bindEvents();
    this.updateNavbarUserInfo();
    this.fetchDataFromGoogleAppsScript();
    this.fetchLiveLogs();
    this.fetchLiveMetrics();
    this.fetchUsersFromGoogleAppsScript();
    this.renderAll();
    this.restoreActiveTab();
  }

  getAdminToken() {
    try {
      return sessionStorage.getItem('medica_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  loadCurrentUser() {
    try {
      const stored = sessionStorage.getItem('medica_admin_auth');
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    const token = this.getAdminToken();
    return !!(token && this.currentUser && this.currentUser.email);
  }

  // Persistent Tab Management: switch tab and store selection across page refresh
  switchTab(targetPanelId) {
    if (!targetPanelId) targetPanelId = 'panelDashboard';
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    const panels = document.querySelectorAll('.admin-panel');

    let targetBtn = document.querySelector(`.admin-tab-btn[data-tab="${targetPanelId}"]`);
    let targetPanel = document.getElementById(targetPanelId);

    if (!targetBtn || !targetPanel) {
      targetPanelId = 'panelDashboard';
      targetBtn = document.querySelector(`.admin-tab-btn[data-tab="panelDashboard"]`);
      targetPanel = document.getElementById('panelDashboard');
    }

    if (!targetBtn || !targetPanel) return;

    tabBtns.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    targetBtn.classList.add('active');
    targetPanel.classList.add('active');

    // Auto-tutup drawer sidebar mobile saat tab dipilih
    this.closeMobileSidebar();

    try {
      sessionStorage.setItem('medica_active_tab', targetPanelId);
      localStorage.setItem('medica_active_tab', targetPanelId);
    } catch (e) {}

    // Panel-specific triggers & access control
    if (targetPanelId === 'panelObat') {
      const role = (this.currentUser?.role || '').toLowerCase();
      const isAllowed = role.includes('super') || role === 'admin';
      if (!isAllowed) {
        this.showToast('Akses ditolak: Pengguna peran Perawat tidak memiliki wewenang mengelola daftar obat.', 'danger', 'Akses Ditolak');
        this.switchTab('panelDashboard');
        return;
      }
      this.fetchAdminObatList();
    } else if (targetPanelId === 'panelRegimen') {
      const role = (this.currentUser?.role || '').toLowerCase();
      const isAllowed = role.includes('super') || role === 'admin';
      if (!isAllowed) {
        this.showToast('Akses ditolak: Pengguna peran Perawat tidak memiliki wewenang mengelola regimen kemoterapi.', 'danger', 'Akses Ditolak');
        this.switchTab('panelDashboard');
        return;
      }
      this.fetchAdminRegimenList();
    } else if (targetPanelId === 'panelLogs') {
      this.fetchLiveLogs();
    } else if (targetPanelId === 'panelDashboard') {
      this.fetchLiveMetrics();
    } else if (targetPanelId === 'panelUsers') {
      this.fetchUsersFromGoogleAppsScript();
    } else if (targetPanelId === 'panelFaqs') {
      this.renderFaqTable();
    } else if (targetPanelId === 'panelSettings') {
      this.renderSettingsForm();
    }
  }

  // Mobile Off-Canvas Sidebar Drawer Controls (Garis 3)
  openMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    sidebar?.classList.add('mobile-open');
    overlay?.classList.add('active');
  }

  closeMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('adminSidebarOverlay');
    sidebar?.classList.remove('mobile-open');
    overlay?.classList.remove('active');
  }

  toggleMobileSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    if (sidebar?.classList.contains('mobile-open')) {
      this.closeMobileSidebar();
    } else {
      this.openMobileSidebar();
    }
  }

  restoreActiveTab() {
    let savedTab = null;
    try {
      savedTab = sessionStorage.getItem('medica_active_tab') || localStorage.getItem('medica_active_tab');
    } catch (e) {}

    if (savedTab && document.getElementById(savedTab)) {
      this.switchTab(savedTab);
    } else {
      this.switchTab('panelDashboard');
    }
  }

  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPass = (password || '').trim();

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: cleanEmail, password: cleanPass })
      });
      const data = await res.json();
      if (data.success && data.token && data.user) {
        this.currentUser = {
          email: data.user.email,
          name: data.user.name,
          role: data.user.role
        };
        sessionStorage.setItem('medica_admin_auth', JSON.stringify(this.currentUser));
        sessionStorage.setItem('medica_admin_token', data.token);
        sessionStorage.setItem('medica_portal_open', 'true');
        localStorage.setItem('medica_portal_open', 'true');
        this.updateNavbarUserInfo();
        this.recordAuditLog('LOGIN_BERHASIL', `Login via kredensial staf (${data.user.role})`);
        this.fetchUsersFromGoogleAppsScript();
        return { success: true, user: this.currentUser };
      }
      return {
        success: false,
        message: data.message || data.error || 'Email atau kata sandi tidak valid.'
      };
    } catch (e) {
      console.warn('Gagal terhubung ke endpoint autentikasi:', e);
      return {
        success: false,
        message: 'Server tidak dapat dihubungi, coba lagi'
      };
    }
  }

  logout() {
    if (this.currentUser) {
      this.recordAuditLog('LOGOUT_ADMIN', 'Keluar dari portal admin');
    }
    this.currentUser = null;
    try {
      sessionStorage.removeItem('medica_admin_auth');
      localStorage.removeItem('medica_admin_auth');
      sessionStorage.removeItem('medica_admin_token');
      localStorage.removeItem('medica_admin_token');
      sessionStorage.removeItem('medica_portal_open');
      localStorage.removeItem('medica_portal_open');
      sessionStorage.removeItem('medica_active_tab');
      localStorage.removeItem('medica_active_tab');
    } catch (e) {}
    this.updateNavbarUserInfo();
  }

  // Evaluasi apakah respons server menandakan sesi/token kedaluwarsa atau tidak valid
  isTokenInvalidResponse(data) {
    if (!data) return false;
    const msg = String(data.error || data.message || '').toLowerCase();
    return msg.includes('token tidak valid') ||
           msg.includes('token invalid') ||
           msg.includes('token expired') ||
           msg.includes('token kedaluwarsa') ||
           msg.includes('sesi berakhir') ||
           msg.includes('akses ditolak') ||
           msg.includes('unauthorized');
  }

  // Penanganan terpusat saat sesi staf admin berakhir / kedaluwarsa (PRD A-01 / Task 1.5)
  handleSessionExpired() {
    this.logout();
    this.showToast('Sesi berakhir, silakan login kembali', 'warning', 'Sesi Berakhir');
    if (typeof window.openAdminLogin === 'function') {
      window.openAdminLogin();
    } else {
      const adminModal = document.getElementById('adminModal');
      const adminLoginModal = document.getElementById('adminLoginModal');
      adminModal?.classList.remove('active');
      adminLoginModal?.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  updateNavbarUserInfo() {
    const emailEl = document.getElementById('adminNavbarUserEmail');
    const roleEl = document.getElementById('adminNavbarRolePill');
    const tabUsersBtn = document.getElementById('tabUsersNavBtn');
    const tabObatBtn = document.getElementById('tabObatNavBtn');
    const tabRegimenBtn = document.getElementById('tabRegimenNavBtn');

    if (this.currentUser) {
      if (emailEl) emailEl.textContent = this.currentUser.email;
      if (roleEl) roleEl.textContent = this.currentUser.role.toUpperCase();

      const role = (this.currentUser.role || '').toLowerCase();
      const isSuper = role.includes('super');
      const isAdmin = isSuper || role === 'admin';

      if (tabUsersBtn) {
        tabUsersBtn.style.display = isSuper ? '' : 'none';
      }
      if (tabObatBtn) {
        tabObatBtn.style.display = isAdmin ? '' : 'none';
      }
      if (tabRegimenBtn) {
        tabRegimenBtn.style.display = isAdmin ? '' : 'none';
      }
    } else {
      if (emailEl) emailEl.textContent = 'Belum Masuk';
      if (roleEl) roleEl.textContent = 'TAMU';
      if (tabUsersBtn) tabUsersBtn.style.display = 'none';
      if (tabObatBtn) tabObatBtn.style.display = 'none';
      if (tabRegimenBtn) tabRegimenBtn.style.display = 'none';
    }
  }

  showCrudLoading(title = 'Menyinkronkan ke Google Sheets', desc = 'Menghubungkan ke database Google Apps Script...', iconSvg = null, theme = 'primary') {
    const overlay = document.getElementById('crudLoadingOverlay');
    const titleEl = document.getElementById('crudLoadingTitle');
    const descEl = document.getElementById('crudLoadingDesc');
    const iconEl = document.getElementById('crudSpinnerIcon');
    if (titleEl) titleEl.textContent = title;
    if (descEl) descEl.textContent = desc;
    if (iconEl && iconSvg) {
      if (!iconEl.dataset.defaultSvg) iconEl.dataset.defaultSvg = iconEl.innerHTML;
      iconEl.innerHTML = iconSvg;
    }
    if (overlay) {
      overlay.classList.remove('theme-danger', 'theme-warning', 'theme-success');
      if (theme && theme !== 'primary') {
        overlay.classList.add(`theme-${theme}`);
      }
      overlay.classList.add('active');
    }
  }

  hideCrudLoading() {
    const overlay = document.getElementById('crudLoadingOverlay');
    const iconEl = document.getElementById('crudSpinnerIcon');
    if (iconEl && iconEl.dataset.defaultSvg) {
      iconEl.innerHTML = iconEl.dataset.defaultSvg;
      delete iconEl.dataset.defaultSvg;
    }
    if (overlay) {
      overlay.classList.remove('active');
      overlay.classList.remove('theme-danger', 'theme-warning', 'theme-success');
    }
  }

  setButtonLoading(btn, isLoading, loadingText = 'Memproses...', originalHtml = null) {
    if (!btn) return;
    if (isLoading) {
      if (!btn.dataset.originalHtml) {
        btn.dataset.originalHtml = btn.innerHTML;
      }
      btn.disabled = true;
      btn.classList.add('btn-is-loading');
      btn.innerHTML = `<span class="btn-inline-spinner"></span>${escapeHtml(loadingText)}`;
    } else {
      btn.disabled = false;
      btn.classList.remove('btn-is-loading');
      if (originalHtml) {
        btn.innerHTML = originalHtml;
      } else if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
        delete btn.dataset.originalHtml;
      }
    }
  }

  showToast(message, type = 'info', title = null, duration = 4000) {
    const container = document.getElementById('adminToastContainer');
    if (!container) {
      console.log(`[Toast ${type}] ${message}`);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `admin-toast ${type}`;

    let iconSvg = '';
    let defaultTitle = 'Pemberitahuan';
    if (type === 'success') {
      defaultTitle = 'Berhasil';
      iconSvg = '<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
    } else if (type === 'error') {
      defaultTitle = 'Gagal';
      iconSvg = '<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
    } else if (type === 'warning') {
      defaultTitle = 'Peringatan';
      iconSvg = '<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
    } else {
      defaultTitle = 'Info';
      iconSvg = '<svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
    }

    toast.innerHTML = `
      <div class="admin-toast-badge">
        ${iconSvg}
      </div>
      <div class="admin-toast-content">
        <h5 class="admin-toast-title">${escapeHtml(title || defaultTitle)}</h5>
        <p class="admin-toast-msg">${escapeHtml(message)}</p>
      </div>
      <button type="button" class="admin-toast-close" title="Tutup">
        <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
      <div class="admin-toast-progress">
        <div class="admin-toast-progress-bar" style="width: 100%;"></div>
      </div>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('show');
      const pBar = toast.querySelector('.admin-toast-progress-bar');
      if (pBar) {
        pBar.style.transition = `width ${duration}ms linear`;
        pBar.style.width = '0%';
      }
    });

    const closeBtn = toast.querySelector('.admin-toast-close');
    let timer = null;
    const removeToast = () => {
      if (timer) clearTimeout(timer);
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 350);
    };

    if (closeBtn) {
      closeBtn.addEventListener('click', removeToast);
    }

    timer = setTimeout(removeToast, duration);
    toast.addEventListener('mouseenter', () => {
      if (timer) clearTimeout(timer);
      const pBar = toast.querySelector('.admin-toast-progress-bar');
      if (pBar) pBar.style.transition = 'none';
    });
    toast.addEventListener('mouseleave', () => {
      timer = setTimeout(removeToast, 2000);
    });
  }

  showConfirmDialog({
    title = 'Konfirmasi Tindakan',
    message = 'Apakah Anda yakin ingin melanjutkan tindakan ini?',
    type = 'danger',
    confirmText = 'Ya, Lanjutkan',
    cancelText = 'Batal',
    requireConfirmationText = null
  } = {}) {
    return new Promise((resolve) => {
      const modal = document.getElementById('adminConfirmModal');
      const titleEl = document.getElementById('confirmModalTitle');
      const descEl = document.getElementById('confirmModalDesc');
      const badgeEl = document.getElementById('confirmModalBadge');
      const iconSvgEl = document.getElementById('confirmModalIconSvg');
      const proceedBtn = document.getElementById('btnConfirmProceed');
      const proceedTextEl = document.getElementById('btnConfirmProceedText');
      const cancelBtn = document.getElementById('btnConfirmCancel');
      const closeBtn = document.getElementById('btnConfirmClose');
      const inputContainer = document.getElementById('confirmModalInputContainer');
      const inputLabel = document.getElementById('confirmModalInputLabel');
      const textInput = document.getElementById('confirmModalTextInput');
      const inputError = document.getElementById('confirmModalInputError');

      if (!modal) {
        resolve(window.confirm(message));
        return;
      }

      if (titleEl) titleEl.textContent = title;
      if (descEl) descEl.textContent = message;
      if (proceedTextEl) proceedTextEl.textContent = confirmText;
      if (cancelBtn) {
        if (!cancelText) {
          cancelBtn.style.display = 'none';
        } else {
          cancelBtn.style.display = '';
          cancelBtn.textContent = cancelText;
        }
      }

      if (badgeEl) {
        badgeEl.className = `confirm-icon-badge ${type}`;
      }

      if (iconSvgEl) {
        if (type === 'danger') {
          iconSvgEl.innerHTML = `
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>
          `;
        } else if (type === 'warning') {
          iconSvgEl.innerHTML = `
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          `;
        } else {
          iconSvgEl.innerHTML = `
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
          `;
        }
      }

      if (proceedBtn) {
        proceedBtn.className = `btn btn-${type === 'warning' ? 'warning' : (type === 'info' ? 'primary' : 'danger')}`;
      }

      // Handler syarat ketik kata kunci konfirmasi khusus (mis. "SETUJU")
      let onTextInputChange = null;
      if (requireConfirmationText && inputContainer && textInput) {
        inputContainer.style.display = 'block';
        if (inputLabel) inputLabel.textContent = `Ketik "${requireConfirmationText}" untuk mengonfirmasi:`;
        textInput.value = '';
        textInput.placeholder = `Ketik ${requireConfirmationText} di sini`;
        if (inputError) inputError.style.display = 'none';
        if (proceedBtn) proceedBtn.disabled = true;

        onTextInputChange = () => {
          const val = textInput.value.trim().toUpperCase();
          if (val === String(requireConfirmationText).trim().toUpperCase()) {
            if (proceedBtn) proceedBtn.disabled = false;
            if (inputError) inputError.style.display = 'none';
          } else {
            if (proceedBtn) proceedBtn.disabled = true;
          }
        };
        textInput.addEventListener('input', onTextInputChange);
        setTimeout(() => textInput.focus(), 80);
      } else {
        if (inputContainer) inputContainer.style.display = 'none';
        if (proceedBtn) proceedBtn.disabled = false;
      }

      modal.classList.add('active');

      const cleanup = (result) => {
        modal.classList.remove('active');
        if (inputContainer) inputContainer.style.display = 'none';
        if (textInput) {
          textInput.value = '';
          if (onTextInputChange) textInput.removeEventListener('input', onTextInputChange);
        }
        if (proceedBtn) proceedBtn.disabled = false;
        if (cancelBtn) cancelBtn.style.display = '';
        if (proceedBtn) proceedBtn.removeEventListener('click', onProceed);
        if (cancelBtn) cancelBtn.removeEventListener('click', onCancel);
        if (closeBtn) closeBtn.removeEventListener('click', onCancel);
        document.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      const onProceed = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onKeyDown = (e) => {
        if (e.key === 'Escape') onCancel();
      };

      if (proceedBtn) proceedBtn.addEventListener('click', onProceed, { once: true });
      if (cancelBtn) cancelBtn.addEventListener('click', onCancel, { once: true });
      if (closeBtn) closeBtn.addEventListener('click', onCancel, { once: true });
      document.addEventListener('keydown', onKeyDown);
    });
  }

  initBaileysPoller() {
    // Baileys dinonaktifkan: Digantikan dengan Web Chatbot Engine
  }

  async fetchBaileysStatus() {
    // Mode Web Chatbot aktif
  }

  updateBaileysUI(data) {
    // Mode Web Chatbot aktif
  }

  bindEvents() {
    // Mobile Sidebar Drawer Toggle (Garis 3)
    const btnToggleSidebar = document.getElementById('btnToggleAdminSidebar');
    const btnCloseSidebar = document.getElementById('btnCloseAdminSidebar');
    const sidebarOverlay = document.getElementById('adminSidebarOverlay');

    btnToggleSidebar?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleMobileSidebar();
    });

    btnCloseSidebar?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.closeMobileSidebar();
    });

    sidebarOverlay?.addEventListener('click', () => {
      this.closeMobileSidebar();
    });

    // Tutup mobile drawer saat tombol Escape ditekan
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeMobileSidebar();
      }
    });

    // Admin navigation tabs (Persistent across refresh)
    const tabBtns = document.querySelectorAll('.admin-tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const targetPanelId = btn.getAttribute('data-tab');
        this.switchTab(targetPanelId);
      });
    });

    // Realtime FAQ Editor Preview & Dosage Safety Check
    const faqTitleInput = document.getElementById('faqMenuTitleInput');
    const faqAnswerInput = document.getElementById('faqAnswerInput');

    if (faqTitleInput && faqAnswerInput) {
      faqTitleInput.addEventListener('input', () => this.updateLivePreview());
      faqAnswerInput.addEventListener('input', () => {
        this.updateLivePreview();
        this.checkDosageSafety(faqAnswerInput.value);
      });
    }

    // Save FAQ Button
    const saveFaqBtn = document.getElementById('saveFaqBtn');
    if (saveFaqBtn) {
      saveFaqBtn.addEventListener('click', () => this.saveFaq());
    }

    // Save Settings Button
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
      saveSettingsBtn.addEventListener('click', () => this.saveSettings());
    }

    // Inisialisasi event listener panel Kelola Daftar Obat (Fase 3)
    this.bindObatEvents();

    // Inisialisasi event listener panel Kelola Regimen Kemoterapi
    this.bindRegimenEvents();

    // Web Chatbot Mode: Baileys event listeners removed
  }

  // Clinical Dosage Safety Warning (PRD Section 9)
  checkDosageSafety(text) {
    const alertBox = document.getElementById('clinicalDosageAlert');
    if (!alertBox) return;

    if (this.dosageRegex.test(text)) {
      alertBox.classList.add('visible');
    } else {
      alertBox.classList.remove('visible');
    }
  }

  // Realtime WhatsApp Bubble Preview (PRD A-05)
  updateLivePreview() {
    const titleInput = document.getElementById('faqMenuTitleInput');
    const answerInput = document.getElementById('faqAnswerInput');
    const previewBubble = document.getElementById('previewBubbleText');
    const titleCharCount = document.getElementById('titleCharCount');
    const answerCharCount = document.getElementById('answerCharCount');

    if (!previewBubble) return;

    const title = titleInput?.value.trim() || 'Judul Pertanyaan';
    const answer = answerInput?.value.trim() || 'Isi jawaban baku yang disetujui tim medis akan tampil di sini...';

    if (titleCharCount) {
      const len = titleInput.value.length;
      titleCharCount.textContent = `${len}/24 karakter (usulan batas)`;
      titleCharCount.classList.toggle('warning', len > 24);
    }
    if (answerCharCount) {
      answerCharCount.textContent = `${answerInput.value.length} karakter`;
    }

    let formatted = `*${title}*\n\n${answer}`;
    formatted = formatted
      .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
      .replace(/_(.*?)_/g, '<em>$1</em>');

    previewBubble.innerHTML = formatted;
  }

  // Simpan / Perbarui FAQ (Instant Publish per PRD A-06)
  async saveFaq() {
    const titleInput = document.getElementById('faqMenuTitleInput');
    const answerInput = document.getElementById('faqAnswerInput');
    const categorySelect = document.getElementById('faqCategorySelect');
    const saveBtn = document.getElementById('saveFaqBtn');

    const title = titleInput ? titleInput.value.trim() : '';
    const answer = answerInput ? answerInput.value.trim() : '';
    const catId = categorySelect ? categorySelect.value : '';

    if (!title || !answer) {
      this.showToast('Harap isi judul pertanyaan dan isi jawaban!', 'warning', 'Form Belum Lengkap');
      return;
    }

    // Peringatan Keamanan Takaran / Dosis
    if (this.dosageRegex.test(answer)) {
      const proceed = await this.showConfirmDialog({
        title: 'Peringatan Keamanan Medis (PRD Bagian 9)',
        message: 'Terdeteksi indikasi penyebutan dosis/takaran obat pada jawaban. Bot dilarang menyebut dosis baru secara mandiri demi keamanan pasien. Apakah Anda yakin ingin tetap menyimpan dan menerbitkan?',
        type: 'warning',
        confirmText: 'Tetap Terbitkan',
        cancelText: 'Periksa Kembali'
      });
      if (!proceed) return;
    }

    const data = this.bot.data;
    const cat = (data.categories || []).find(c => c.id === catId);
    if (!cat) return;

    if (!cat.faqs) cat.faqs = [];

    const isEdit = !!this.editingFaqId;
    let targetFaqId = this.editingFaqId;

    this.setButtonLoading(saveBtn, true, isEdit ? 'Menyimpan...' : 'Menerbitkan...');
    this.showCrudLoading(
      isEdit ? 'Memperbarui Jawaban FAQ' : 'Menerbitkan FAQ Baru',
      `Menyinkronkan "${title}" ke Google Sheets & Baileys...`
    );

    try {
      if (isEdit) {
        let foundFaq = null;
        data.categories.forEach(c => {
          if (c.faqs) {
            const idx = c.faqs.findIndex(f => f.id === targetFaqId);
            if (idx !== -1) {
              foundFaq = c.faqs[idx];
              if (c.id !== catId) {
                c.faqs.splice(idx, 1);
                cat.faqs.push(foundFaq);
              }
            }
          }
        });

        if (foundFaq) {
          foundFaq.menuTitle = title;
          foundFaq.answer = answer;
        }
        this.recordAuditLog('UBAH_FAQ', `Memperbarui jawaban untuk "${title}"`);
      } else {
        targetFaqId = 'faq-' + Date.now();
        const newFaq = {
          id: targetFaqId,
          code: String(cat.faqs.length + 1),
          menuTitle: title,
          answer: answer
        };
        cat.faqs.push(newFaq);
        this.recordAuditLog('TAMBAH_FAQ', `Menambahkan FAQ "${title}" ke kategori "${cat.title}"`);
      }

      this.bot.saveDataToStorage(data);
      this.syncDataToBackend(data);

      const payload = isEdit
        ? {
            action: 'update_faq',
            id: targetFaqId,
            updateData: {
              categoryId: catId,
              menuTitle: title,
              answer: answer
            },
            userEmail: this.currentUser?.email
          }
        : {
            action: 'create_faq',
            faqData: {
              categoryId: catId,
              menuTitle: title,
              answer: answer
            },
            userEmail: this.currentUser?.email
          };

      const gasRes = await this.postToAppsScript(payload);
      await this.fetchDataFromGoogleAppsScript();

      this.editingFaqId = null;
      if (saveBtn) {
        this.setButtonLoading(saveBtn, false);
        saveBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Simpan & Terbitkan Langsung (Live)
        `;
      }

      titleInput.value = '';
      answerInput.value = '';
      this.updateLivePreview();
      this.checkDosageSafety('');
      this.renderAll();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(
          isEdit 
            ? 'Perubahan FAQ berhasil disimpan dan LANGSUNG TAYANG di bot WhatsApp & Google Sheets!'
            : 'FAQ berhasil disimpan dan LANGSUNG TAYANG di bot WhatsApp & tersinkron ke Google Sheets!',
          'success',
          'FAQ Berhasil Disimpan'
        );
      }
    } catch (err) {
      console.error('Error in saveFaq:', err);
      this.showToast('Gagal menyimpan FAQ: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
      if (saveBtn) this.setButtonLoading(saveBtn, false);
    }
  }

  recordAuditLog(action, details) {
    try {
      const audit = JSON.parse(localStorage.getItem('hospital_audit_logs') || '[]');
      audit.unshift({
        timestamp: new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }),
        user: this.currentUser?.email || 'admin@rs-medica.id',
        action: action,
        details: details
      });
      localStorage.setItem('hospital_audit_logs', JSON.stringify(audit.slice(0, 50)));
    } catch (e) {}
  }

  async saveSettings() {
    const saveBtn = document.getElementById('saveSettingsBtn');
    const greeting = document.getElementById('settingGreeting')?.value.trim() || '';
    const fallback = document.getElementById('settingFallback')?.value.trim() || '';
    const igdPhone = document.getElementById('settingIgdPhone')?.value.trim() || '';
    const operatingHours = document.getElementById('settingHours')?.value.trim() || '';

    this.setButtonLoading(saveBtn, true, 'Menyimpan Pengaturan...');
    this.showCrudLoading('Menyimpan Pengaturan Bot', 'Menyinkronkan konfigurasi ke Google Sheets & Baileys...');

    try {
      const data = this.bot.data;
      if (!data.settings) data.settings = {};
      data.settings.greeting = greeting;
      data.settings.fallback = fallback;
      data.settings.operatingHours = operatingHours;
      if (igdPhone) {
        data.settings.emergencyHotline = igdPhone;
        this.bot.emergencyHotline = igdPhone;
      }

      this.bot.saveDataToStorage(data);
      this.syncDataToBackend(data);

      const settingsPayload = {
        greeting,
        fallback,
        operatingHours,
        emergencyHotline: igdPhone
      };

      const gasRes = await this.postToAppsScript({
        action: 'update_settings',
        settings: settingsPayload,
        settingsData: settingsPayload,
        ...settingsPayload,
        userEmail: this.currentUser?.email
      });

      await this.fetchDataFromGoogleAppsScript();
      this.recordAuditLog('UPDATE_SETTINGS', 'Memperbarui konfigurasi pesan sambutan, fallback, dan jam operasional');
      this.renderAll();
      this.renderSettingsForm();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast('Pengaturan bot berhasil disimpan ke Google Sheets & WhatsApp!', 'success', 'Pengaturan Tersimpan');
      }
    } catch (err) {
      console.error('Error saving settings:', err);
      this.showToast('Gagal menyimpan pengaturan: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
      if (saveBtn) this.setButtonLoading(saveBtn, false);
    }
  }

  // Mengisi form Pengaturan Global dengan data dari Google Apps Script / bot settings
  renderSettingsForm() {
    const greetingEl = document.getElementById('settingGreeting');
    const fallbackEl = document.getElementById('settingFallback');
    const igdPhoneEl = document.getElementById('settingIgdPhone');
    const hoursEl = document.getElementById('settingHours');

    const s = this.bot?.data?.settings || {};

    if (greetingEl) greetingEl.value = s.greeting || '';
    if (fallbackEl) fallbackEl.value = s.fallback || '';
    if (hoursEl) hoursEl.value = s.operatingHours || '';
    if (igdPhoneEl) igdPhoneEl.value = s.emergencyHotline || this.bot?.emergencyHotline || '';
  }

  // Kirim aksi perubahan ke Google Apps Script Web App
  async postToAppsScript(payload) {
    try {
      const token = this.getAdminToken();
      const bodyPayload = {
        ...payload,
        token: payload.token || token
      };
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });
      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return null;
      }
      const data = await res.json();
      if (this.isTokenInvalidResponse(data)) {
        this.handleSessionExpired();
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[GAS Action] Gagal mengirim aksi ke Google Sheets:', e.message);
      return null;
    }
  }

  // Tarik data bundel menu terbaru dari Google Apps Script
  async fetchDataFromGoogleAppsScript() {
    try {
      const res = await fetch('/api/gas/bundle');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          if (json.data.categories && Array.isArray(json.data.categories)) {
            this.bot.data.categories = json.data.categories;
          }

          if (json.data.settings) {
            if (!this.bot.data.settings) this.bot.data.settings = {};
            if (json.data.settings.greeting !== undefined) this.bot.data.settings.greeting = json.data.settings.greeting;
            if (json.data.settings.fallback !== undefined) this.bot.data.settings.fallback = json.data.settings.fallback;
            if (json.data.settings.operatingHours !== undefined) this.bot.data.settings.operatingHours = json.data.settings.operatingHours;
            if (json.data.settings.emergencyHotline !== undefined) this.bot.emergencyHotline = json.data.settings.emergencyHotline;
          }
          this.bot.saveDataToStorage(this.bot.data);
          this.renderAll();
          if (typeof window.updateWaSimulatorQuickChips === 'function') {
            window.updateWaSimulatorQuickChips();
          }
          this.updateSyncStatusPill(true);
          console.log('[GAS Web Admin] Data berhasil disinkronkan dari Google Sheets!');
        }
      }
    } catch (e) {
      this.updateSyncStatusPill(false);
    }
  }

  // Tarik log audit dan log interaksi terbaru dari Google Sheets
  async fetchLiveLogs() {
    try {
      const [resAudit, resEvent] = await Promise.all([
        fetch('/api/gas/logs?type=audit').then(r => r.json()).catch(() => null),
        fetch('/api/gas/logs?type=event').then(r => r.json()).catch(() => null)
      ]);
      if (resAudit && resAudit.success && resAudit.data && Array.isArray(resAudit.data)) {
        localStorage.setItem('hospital_audit_logs', JSON.stringify(resAudit.data));
        this.renderAuditLogs();
      }
      if (resEvent && resEvent.success && resEvent.data && Array.isArray(resEvent.data)) {
        localStorage.setItem('hospital_bot_logs', JSON.stringify(resEvent.data));
        this.renderEventLogs();
      }
    } catch (e) {}
  }

  updateSyncStatusPill(isConnected) {
    const el = document.getElementById('adminSyncStatusText');
    if (el) {
      el.innerHTML = isConnected 
        ? 'Google Sheets & Web Bot: <strong>Live</strong>'
        : 'Web Bot Cache: <strong>Live</strong>';
    }
  }

  // Sync data to backend Baileys socket server
  async syncDataToBackend(data) {
    try {
      await fetch('/api/bot/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
    } catch (e) {
      console.warn('[Sync] Gagal sync ke server backend:', e.message);
    }
  }

  renderAll() {
    this.renderStats();
    this.renderCategoryList();
    this.renderFaqTable();
    this.renderCategoryOptions();
    this.renderAuditLogs();
    this.renderEventLogs();
    this.renderUsers();
    this.renderSettingsForm();
  }

  // Render Category Table in Admin Portal
  renderCategoryList() {
    const tbody = document.getElementById('categoryTableBody');
    if (!tbody) return;

    let html = '';
    (this.bot.data.categories || []).forEach((cat, index) => {
      const isEscalation = !!cat.isEscalation;
      const isEmergency = !!cat.isEmergency;
      const isSystem = isEscalation || isEmergency;
      const faqCount = cat.faqs ? cat.faqs.length : 0;

      let badgeBg = '#e0f2fe';
      let badgeColor = '#0284c7';
      let typeLabel = '<span class="status-badge active">Pilihan FAQ</span>';

      if (isEmergency) {
        badgeBg = '#fee2e2';
        badgeColor = '#b91c1c';
        typeLabel = '<span class="status-badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">Layanan Darurat IGD</span>';
      } else if (isEscalation) {
        badgeBg = '#fef3c7';
        badgeColor = '#b45309';
        typeLabel = '<span class="status-badge" style="background:#fef3c7; color:#b45309;">Eskalasi Perawat</span>';
      }

      html += `
        <tr>
          <td>
            <span class="status-badge" style="background:${badgeBg}; color:${badgeColor}; font-weight:800; font-size:0.85rem;">
              Menu ${index + 1}
            </span>
          </td>
          <td>
            <strong>${escapeHtml(cat.title)}</strong>
          </td>
          <td>
            ${isSystem ? '<span style="color:#94a3b8;">-</span>' : `<strong>${faqCount}</strong> Pertanyaan`}
          </td>
          <td>
            ${typeLabel}
          </td>
          <td><span class="status-badge active">Tayang di WA</span></td>
          <td>
            ${isSystem 
              ? '<span style="font-size:0.75rem; color:#94a3b8;">Sistem Default</span>'
              : `
                <div class="action-btns">
                  <button class="btn-icon-sm" title="Edit Judul Kategori" onclick="adminPortal.editCategory('${cat.id}')">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button class="btn-icon-sm danger" title="Hapus Kategori" onclick="adminPortal.deleteCategory('${cat.id}')">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              `}
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  }

  // Open Category Modal for Adding
  openAddCategoryModal() {
    const modal = document.getElementById('categoryModal');
    const idInput = document.getElementById('editCategoryIdInput');
    const titleInput = document.getElementById('categoryTitleInput');
    const modalTitle = document.getElementById('categoryModalTitle');

    if (idInput) idInput.value = '';
    if (titleInput) {
      titleInput.value = '';
      setTimeout(() => titleInput.focus(), 200);
    }
    if (modalTitle) modalTitle.textContent = 'Tambah Kategori Menu Baru';

    if (modal) modal.classList.add('active');
  }

  // Edit existing category
  editCategory(catId) {
    const cat = (this.bot.data.categories || []).find(c => c.id === catId);
    if (!cat) return;

    const modal = document.getElementById('categoryModal');
    const idInput = document.getElementById('editCategoryIdInput');
    const titleInput = document.getElementById('categoryTitleInput');
    const modalTitle = document.getElementById('categoryModalTitle');

    if (idInput) idInput.value = cat.id;
    if (titleInput) {
      titleInput.value = cat.title;
      setTimeout(() => titleInput.focus(), 200);
    }
    if (modalTitle) modalTitle.textContent = 'Edit Judul Kategori Menu';

    if (modal) modal.classList.add('active');
  }

  // Save or update category
  async saveCategory(title, catId = null) {
    if (!title || !title.trim()) {
      this.showToast('Judul kategori tidak boleh kosong!', 'warning', 'Validasi Form');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitCategory');
    const cleanTitle = title.trim();
    const data = this.bot.data;
    let gasPayload = {};

    this.setButtonLoading(submitBtn, true, 'Menyimpan Kategori...');
    this.showCrudLoading(
      catId ? 'Memperbarui Kategori Menu' : 'Menambahkan Kategori Menu',
      `Menyinkronkan kategori "${cleanTitle}" ke Google Sheets & Baileys...`
    );

    try {
      if (catId) {
        const cat = (data.categories || []).find(c => c.id === catId);
        if (cat) {
          const oldTitle = cat.title;
          cat.title = cleanTitle;
          this.recordAuditLog('EDIT_KATEGORI', `Mengubah judul kategori dari "${oldTitle}" menjadi "${cleanTitle}"`);
          gasPayload = {
            action: 'update_category',
            id: catId,
            title: cleanTitle,
            userEmail: this.currentUser?.email
          };
        }
      } else {
        const newCategory = {
          id: 'cat-' + Date.now(),
          code: String((data.categories || []).length),
          title: cleanTitle,
          faqs: []
        };

        const escalationIndex = (data.categories || []).findIndex(c => c.isEscalation);
        if (escalationIndex !== -1) {
          data.categories.splice(escalationIndex, 0, newCategory);
        } else {
          data.categories.push(newCategory);
        }

        data.categories.forEach((c, idx) => {
          c.code = String(idx + 1);
        });

        this.recordAuditLog('TAMBAH_KATEGORI', `Menambahkan kategori menu baru: "${cleanTitle}"`);
        gasPayload = {
          action: 'create_category',
          title: cleanTitle,
          isEscalation: false,
          userEmail: this.currentUser?.email
        };
      }

      this.bot.saveDataToStorage(data);
      this.syncDataToBackend(data);

      const modal = document.getElementById('categoryModal');
      if (modal) modal.classList.remove('active');

      this.renderAll();

      if (typeof window.updateWaSimulatorQuickChips === 'function') {
        window.updateWaSimulatorQuickChips();
      }

      const gasRes = await this.postToAppsScript(gasPayload);
      await this.fetchDataFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Kategori "${cleanTitle}" berhasil disimpan dan langsung aktif di bot WhatsApp!`, 'success', 'Kategori Tersimpan');
      }
    } catch (err) {
      console.error('Error in saveCategory:', err);
      this.showToast('Gagal menyimpan kategori: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
      if (submitBtn) this.setButtonLoading(submitBtn, false);
    }
  }

  // Delete category
  async deleteCategory(catId) {
    const data = this.bot.data;
    const cat = (data.categories || []).find(c => c.id === catId);
    if (!cat) return;

    if (cat.isEscalation) {
      this.showToast('Kategori eskalasi sistem perawat jaga tidak dapat dihapus.', 'warning', 'Tidak Diizinkan');
      return;
    }

    const faqCount = cat.faqs ? cat.faqs.length : 0;
    const confirmDelete = await this.showConfirmDialog({
      title: 'Hapus Kategori Menu',
      message: `Hapus kategori "${cat.title}" beserta ${faqCount} pertanyaan di dalamnya? Seluruh pertanyaan di kategori ini juga akan terhapus dari menu WhatsApp pasien dan database Google Sheets.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Kategori',
      cancelText: 'Batal'
    });
    if (!confirmDelete) return;

    this.showCrudLoading('Menghapus Kategori Menu', `Menghapus "${cat.title}" dari Google Sheets & WhatsApp...`);

    try {
      data.categories = data.categories.filter(c => c.id !== catId);

      data.categories.forEach((c, idx) => {
        c.code = String(idx + 1);
      });

      this.bot.saveDataToStorage(data);
      this.syncDataToBackend(data);
      this.recordAuditLog('HAPUS_KATEGORI', `Menghapus kategori "${cat.title}" (${faqCount} pertanyaan)`);

      this.renderAll();

      if (typeof window.updateWaSimulatorQuickChips === 'function') {
        window.updateWaSimulatorQuickChips();
      }

      const gasRes = await this.postToAppsScript({
        action: 'delete_category',
        id: catId,
        userEmail: this.currentUser?.email
      });

      await this.fetchDataFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Kategori "${cat.title}" telah berhasil dihapus dari menu WhatsApp.`, 'success', 'Kategori Terhapus');
      }
    } catch (err) {
      console.error('Error in deleteCategory:', err);
      this.showToast('Gagal menghapus kategori: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
    }
  }

  renderStats() {
    const logs = JSON.parse(localStorage.getItem('hospital_bot_logs') || '[]');
    const totalSessions = logs.length;
    const helpfulCount = logs.filter(l => l.feedback === 'HELPFUL' || l.details === 'HELPFUL').length;
    const unhelpfulCount = logs.filter(l => l.feedback === 'UNHELPFUL' || l.details === 'UNHELPFUL').length;
    const totalFeedback = helpfulCount + unhelpfulCount;
    const helpfulRate = totalFeedback > 0 ? `${Math.round((helpfulCount / totalFeedback) * 100)}%` : '-';
    const fallbackCount = logs.filter(l => (l.type || l.eventType) === 'FALLBACK').length;
    const fallbackRate = totalSessions > 0 ? `${((fallbackCount / totalSessions) * 100).toFixed(1)}%` : '0%';

    const statSessions = document.getElementById('statTotalSessions');
    const statCsat = document.getElementById('statCsat');
    const statFallback = document.getElementById('statFallbackRate');

    if (statSessions) statSessions.textContent = totalSessions;
    if (statCsat) statCsat.textContent = helpfulRate;
    if (statFallback) statFallback.textContent = fallbackRate;
  }

  // Tarik metrik analitik langsung dari Google Apps Script (Google Sheets)
  async fetchLiveMetrics() {
    try {
      const res = await fetch('/api/gas/metrics');
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const m = json.data;
          const statSessions = document.getElementById('statTotalSessions');
          const statCsat = document.getElementById('statCsat');
          const statFallback = document.getElementById('statFallbackRate');

          if (statSessions && typeof m.totalInteractions !== 'undefined') {
            statSessions.textContent = m.totalInteractions;
          }
          if (statCsat && m.satisfactionRate) {
            statCsat.textContent = (m.totalInteractions > 0) ? m.satisfactionRate : '-';
          }
          if (statFallback) {
            const selfResolved = parseInt(m.selfResolvedRate) || 100;
            const fallbackPct = Math.max(0, 100 - selfResolved);
            statFallback.textContent = (m.totalInteractions > 0) ? `${fallbackPct.toFixed(1)}%` : '0%';
          }

          this.renderPopularQuestions(m.popularQuestions || {});
        }
      }
    } catch (e) {
      console.warn('[Metrics] Gagal mengambil live metrics dari Apps Script:', e.message);
    }
  }

  renderPopularQuestions(popularMap) {
    const tbody = document.getElementById('topQuestionsTableBody');
    if (!tbody) return;

    if (!popularMap || Object.keys(popularMap).length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align:center; padding:32px; color:#94a3b8;">
            Belum ada interaksi pertanyaan pasien tercatat di database Google Sheets. Data akan terisi otomatis saat pasien berinteraksi via WhatsApp.
          </td>
        </tr>
      `;
      return;
    }

    const entries = Object.entries(popularMap);
    entries.sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, curr) => acc + curr[1], 0) || 1;

    tbody.innerHTML = entries.slice(0, 5).map(([questionTitle, count]) => {
      const pct = Math.round((count / total) * 100);
      return `
        <tr>
          <td><span class="status-badge active">FAQ Pasien</span></td>
          <td><strong>${escapeHtml(questionTitle)}</strong></td>
          <td>${count} sesi</td>
          <td><span style="color:#10b981; font-weight:700;">${pct}%</span></td>
          <td><span class="status-badge active">Tayang</span></td>
        </tr>
      `;
    }).join('');
  }

  renderFaqTable(searchQuery = '') {
    const tbody = document.getElementById('faqTableBody');
    if (!tbody) return;

    let html = '';
    const q = (searchQuery || '').toLowerCase().trim();

    (this.bot.data.categories || []).forEach(cat => {
      if (cat.faqs) {
        cat.faqs.forEach(faq => {
          if (q) {
            const matchTitle = (faq.menuTitle || faq.title || '').toLowerCase().includes(q);
            const matchAnswer = (faq.answer || '').toLowerCase().includes(q);
            const matchCat = (cat.title || '').toLowerCase().includes(q);
            if (!matchTitle && !matchAnswer && !matchCat) return;
          }

          html += `
            <tr>
              <td><span class="status-badge active">${escapeHtml(cat.title)}</span></td>
              <td><strong>${escapeHtml(faq.menuTitle || faq.title)}</strong></td>
              <td style="max-width: 320px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(faq.answer)}</td>
              <td><span class="status-badge active">Tayang</span></td>
              <td>
                <div class="action-btns">
                  <button class="btn-icon-sm" title="Edit Jawaban" onclick="adminPortal.editFaq('${faq.id}')">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
                  </button>
                  <button class="btn-icon-sm danger" title="Hapus Jawaban" onclick="adminPortal.deleteFaq('${faq.id}')">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                </div>
              </td>
            </tr>
          `;
        });
      }
    });

    if (!html) {
      html = `<tr><td colspan="5" style="text-align:center; padding: 28px; color: #94a3b8;">${q ? `Tidak ada pertanyaan yang sesuai dengan pencarian "${escapeHtml(q)}"` : 'Belum ada pertanyaan FAQ terdaftar.'}</td></tr>`;
    }

    tbody.innerHTML = html;
  }

  renderCategoryOptions() {
    const select = document.getElementById('faqCategorySelect');
    if (!select) return;

    select.innerHTML = (this.bot.data.categories || [])
      .filter(c => !c.isEscalation && !c.isEmergency)
      .map(c => `<option value="${c.id}">${escapeHtml(c.title)}</option>`)
      .join('');
  }

  renderAuditLogs() {
    const tbody = document.getElementById('auditLogTableBody');
    if (!tbody) return;

    const audits = JSON.parse(localStorage.getItem('hospital_audit_logs') || '[]');
    if (audits.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada log audit tercatat.</td></tr>';
      return;
    }

    tbody.innerHTML = audits.map(a => `
      <tr>
        <td>${escapeHtml(a.timestamp)}</td>
        <td><code>${escapeHtml(a.user)}</code></td>
        <td><span class="status-badge active">${escapeHtml(a.action)}</span></td>
        <td>${escapeHtml(a.details)}</td>
      </tr>
    `).join('');
  }

  renderEventLogs() {
    const tbody = document.getElementById('eventLogTableBody');
    if (!tbody) return;

    const logs = JSON.parse(localStorage.getItem('hospital_bot_logs') || '[]');
    if (logs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">Belum ada interaksi pasien tercatat.</td></tr>';
      return;
    }

    // According to UU PDP: no private text recorded, only event type & anonymized phone
    tbody.innerHTML = logs.slice(0, 15).map(l => {
      const type = l.type || l.eventType || 'INTERAKSI';
      const time = l.timeFormatted || l.timestamp || '-';
      const phone = l.anonymizedPhone || '-';
      const detail = l.details || l.menuChosen || '-';
      const isEmergency = String(type).includes('EMERGENCY') || String(type).includes('ESKALASI');

      return `
        <tr>
          <td>${escapeHtml(time)}</td>
          <td><code>${escapeHtml(phone)}</code></td>
          <td><span class="status-badge ${isEmergency ? 'danger' : 'active'}">${escapeHtml(type)}</span></td>
          <td>${escapeHtml(detail)}</td>
        </tr>
      `;
    }).join('');
  }

  async deleteFaq(faqId) {
    const data = this.bot.data;
    let deletedTitle = '';

    (data.categories || []).forEach(cat => {
      if (cat.faqs) {
        const found = cat.faqs.find(f => f.id === faqId);
        if (found) deletedTitle = found.menuTitle || found.title;
      }
    });

    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Pertanyaan FAQ',
      message: `Apakah Anda yakin ingin menghapus pertanyaan "${deletedTitle || 'ini'}"? Pertanyaan ini akan langsung terhapus dari bot WhatsApp dan database Google Sheets.`,
      type: 'danger',
      confirmText: 'Ya, Hapus FAQ',
      cancelText: 'Batal'
    });
    if (!confirmed) return;

    this.showCrudLoading('Menghapus Pertanyaan FAQ', `Menghapus "${deletedTitle}" dari Google Sheets & WhatsApp...`);

    try {
      (data.categories || []).forEach(cat => {
        if (cat.faqs) {
          const idx = cat.faqs.findIndex(f => f.id === faqId);
          if (idx !== -1) {
            cat.faqs.splice(idx, 1);
          }
        }
      });

      this.bot.saveDataToStorage(data);
      this.syncDataToBackend(data);
      this.recordAuditLog('HAPUS_FAQ', `Menghapus FAQ "${deletedTitle}"`);
      this.renderAll();

      const gasRes = await this.postToAppsScript({
        action: 'delete_faq',
        id: faqId,
        userEmail: this.currentUser?.email
      });

      await this.fetchDataFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Pertanyaan "${deletedTitle}" berhasil dihapus dari Google Sheets dan bot WhatsApp!`, 'success', 'FAQ Terhapus');
      }

      this.renderAll();
    } catch (err) {
      console.error('Error in deleteFaq:', err);
      this.showToast('Gagal menghapus FAQ: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
    }
  }

  editFaq(faqId) {
    const data = this.bot.data;
    let target = null;
    let targetCatId = null;

    (data.categories || []).forEach(cat => {
      if (cat.faqs) {
        const found = cat.faqs.find(f => f.id === faqId);
        if (found) {
          target = found;
          targetCatId = cat.id;
        }
      }
    });

    if (target) {
      this.editingFaqId = faqId;
      document.getElementById('faqMenuTitleInput').value = target.menuTitle || target.title;
      document.getElementById('faqAnswerInput').value = target.answer;
      document.getElementById('faqCategorySelect').value = targetCatId;

      const saveBtn = document.getElementById('saveFaqBtn');
      if (saveBtn) {
        saveBtn.innerHTML = `
          <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
          Perbarui & Simpan Perubahan FAQ
        `;
      }

      this.updateLivePreview();
      this.checkDosageSafety(target.answer);
      document.querySelector('[data-tab="panelFaqs"]')?.click();
      document.getElementById('faqMenuTitleInput')?.focus();
    }
  }

  // Tarik daftar staf pengguna dari Google Apps Script / Sheet Users
  async fetchUsersFromGoogleAppsScript() {
    try {
      const token = this.getAdminToken();
      if (!token) return;

      const res = await fetch('/api/gas/users', {
        headers: {
          'X-Admin-Token': token
        }
      });
      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }
      const json = await res.json();
      if (this.isTokenInvalidResponse(json)) {
        this.handleSessionExpired();
        return;
      }
      if (res.ok && json.success && Array.isArray(json.data)) {
        this.whitelistUsers = json.data;
        this.renderUsers();
      }
    } catch (e) {
      console.warn('[Users] Gagal mengambil daftar pengguna dari server:', e.message);
    }
  }

  // Render Tabel Pengguna & Metrik KPI Pengguna
  renderUsers() {
    const tbody = document.getElementById('userTableBody');
    if (!tbody) return;

    const searchTerm = (document.getElementById('userSearchInput')?.value || '').toLowerCase().trim();
    const roleFilter = document.getElementById('userRoleFilter')?.value || '';

    const users = (this.whitelistUsers || []).filter(u => {
      const matchSearch = !searchTerm || 
        (u.name && u.name.toLowerCase().includes(searchTerm)) || 
        (u.email && u.email.toLowerCase().includes(searchTerm));
      const matchRole = !roleFilter || u.role === roleFilter;
      return matchSearch && matchRole;
    });

    const totalUsersEl = document.getElementById('statTotalUsers');
    const leadAdminEl = document.getElementById('statLeadAdminCount');
    const nurseEl = document.getElementById('statNurseCount');
    const activePercentEl = document.getElementById('statActiveUsersPercent');

    if (totalUsersEl) totalUsersEl.textContent = this.whitelistUsers.length;
    if (leadAdminEl) {
      leadAdminEl.textContent = this.whitelistUsers.filter(u => u.role === 'Super Admin').length;
    }
    if (nurseEl) {
      nurseEl.textContent = this.whitelistUsers.filter(u => (u.role || '').includes('Perawat')).length;
    }
    if (activePercentEl) {
      const activeCount = this.whitelistUsers.filter(u => u.active !== false).length;
      const pct = this.whitelistUsers.length > 0 ? Math.round((activeCount / this.whitelistUsers.length) * 100) : 100;
      activePercentEl.textContent = `${pct}%`;
    }

    if (users.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:32px; color:#94a3b8;">
            Tidak ada data staf yang sesuai dengan filter pencarian.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = users.map((u, idx) => {
      const isActive = u.active !== false;
      const isSuper = u.role === 'Super Admin';
      const isNurse = (u.role || '').includes('Perawat');
      const roleClass = isSuper ? 'super-admin' : (isNurse ? 'nurse' : 'admin');
      const initials = (u.name || u.email || 'US')
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();

      const isSelf = Boolean(this.currentUser?.email && u.email.toLowerCase() === this.currentUser.email.toLowerCase());
      const canDelete = !isSelf && !isSuper;

      return `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <div class="user-cell">
              <div class="user-avatar-circle ${roleClass}">
                ${initials}
              </div>
              <div>
                <div class="user-meta-name">${escapeHtml(u.name || 'Staf RS')}</div>
                <div class="user-meta-email">${escapeHtml(u.email)}</div>
              </div>
            </div>
          </td>
          <td>
            <span style="font-family:monospace; font-size:0.82rem; font-weight:600; color:var(--text-main);">${escapeHtml(u.email)}</span>
          </td>
          <td>
            <span class="role-badge ${roleClass}">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>
              ${escapeHtml(u.role)}
            </span>
          </td>
          <td>
            <span class="status-badge ${isActive ? 'active' : 'inactive'}">
              ${isActive ? 'Aktif' : 'Nonaktif'}
            </span>
          </td>
          <td style="text-align: center;">
            <div style="display:inline-flex; gap:6px; align-items:center;">
              <button 
                class="btn-toggle-status ${isActive ? 'inactive-state' : 'active-state'}" 
                title="${isSelf ? 'Akun Anda yang sedang aktif' : (isActive ? 'Nonaktifkan Akun' : 'Aktifkan Akun')}"
                ${isSelf ? 'disabled style="opacity:0.6; cursor:not-allowed;"' : ''}
                onclick="adminPortal.toggleUserStatus('${escapeHtml(u.email)}')">
                ${isActive ? 'Nonaktifkan' : 'Aktifkan'}
              </button>
              ${canDelete ? `
                <button 
                  class="btn-icon-sm danger" 
                  title="Hapus dari Whitelist" 
                  onclick="adminPortal.deleteUser('${escapeHtml(u.email)}')">
                  <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  openAddUserModal() {
    const modal = document.getElementById('userModal');
    if (!modal) return;
    document.getElementById('userNameInput').value = '';
    document.getElementById('userEmailInput').value = '';
    document.getElementById('userPasswordInput').value = '';
    modal.classList.add('active');
    document.getElementById('userNameInput')?.focus();
  }

  async handleSaveUser() {
    const name = document.getElementById('userNameInput')?.value.trim();
    const email = document.getElementById('userEmailInput')?.value.trim().toLowerCase();
    const role = document.getElementById('userRoleSelect')?.value;
    const password = document.getElementById('userPasswordInput')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitUser');

    if (!name || !email || !password) {
      this.showToast('Nama lengkap, email, dan kata sandi awal wajib diisi!', 'warning', 'Validasi Form');
      return;
    }

    if (this.whitelistUsers.some(u => u.email.toLowerCase() === email)) {
      this.showToast('Email ini sudah terdaftar dalam whitelist admin!', 'warning', 'Email Sudah Ada');
      return;
    }

    this.setButtonLoading(submitBtn, true, 'Mendaftarkan Staf...');
    this.showCrudLoading('Mendaftarkan Staf Whitelist', `Menyimpan data "${name}" ke Google Sheets...`);

    try {
      const newUser = {
        name,
        email,
        role,
        password,
        active: true,
        created_at: new Date().toISOString()
      };

      this.whitelistUsers.unshift(newUser);
      this.recordAuditLog('TAMBAH_STAF', `Mendaftarkan staf baru "${name}" (${email}) sebagai ${role}`);
      this.renderUsers();

      document.getElementById('userModal')?.classList.remove('active');

      const gasRes = await this.postToAppsScript({
        action: 'add_user',
        userData: {
          name,
          email,
          role,
          password
        },
        token: this.getAdminToken(),
        userEmail: this.currentUser?.email
      });

      await this.fetchUsersFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Staf "${name}" (${email}) berhasil ditambahkan ke whitelist dan Google Sheets!`, 'success', 'Staf Terdaftar');
      }
    } catch (err) {
      console.error('Error adding user:', err);
      this.showToast('Gagal mendaftarkan staf: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
      if (submitBtn) this.setButtonLoading(submitBtn, false);
    }
  }

  async toggleUserStatus(targetEmail) {
    const user = this.whitelistUsers.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!user) return;

    if (this.currentUser && targetEmail.toLowerCase() === this.currentUser.email?.toLowerCase()) {
      this.showToast('Anda tidak dapat mengubah status akun Anda sendiri saat sedang aktif digunakan.', 'warning', 'Tidak Diizinkan');
      return;
    }

    const newStatus = !(user.active !== false);
    if (!newStatus) {
      const confirmed = await this.showConfirmDialog({
        title: 'Nonaktifkan Akun Staf',
        message: `Apakah Anda yakin ingin menonaktifkan akun staf "${user.name}" (${user.email})? Staf ini tidak akan dapat login ke portal admin hingga diaktifkan kembali.`,
        type: 'warning',
        confirmText: 'Ya, Nonaktifkan',
        cancelText: 'Batal'
      });
      if (!confirmed) return;
    }

    this.showCrudLoading(
      newStatus ? 'Mengaktifkan Akun Staf' : 'Menonaktifkan Akun Staf',
      `Menyinkronkan status "${user.name}" ke Google Sheets...`
    );

    try {
      user.active = newStatus;
      this.recordAuditLog('UBAH_STATUS_STAF', `Mengubah status staf "${user.name}" menjadi ${newStatus ? 'Aktif' : 'Nonaktif'}`);
      this.renderUsers();

      const gasRes = await this.postToAppsScript({
        action: 'toggle_user',
        email: targetEmail,
        active: newStatus,
        token: this.getAdminToken(),
        userEmail: this.currentUser?.email
      });

      await this.fetchUsersFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Status staf "${user.name}" berhasil diubah menjadi ${newStatus ? 'Aktif' : 'Nonaktif'}.`, 'success', 'Status Berubah');
      }
    } catch (err) {
      console.error('Error toggling user status:', err);
      this.showToast('Gagal mengubah status staf: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
    }
  }

  async deleteUser(targetEmail) {
    const user = this.whitelistUsers.find(u => u.email.toLowerCase() === targetEmail.toLowerCase());
    if (!user) return;

    if (this.currentUser && targetEmail.toLowerCase() === this.currentUser.email?.toLowerCase()) {
      this.showToast('Anda tidak dapat menghapus akun Anda sendiri saat sedang aktif.', 'warning', 'Tidak Diizinkan');
      return;
    }

    if (user.role === 'Super Admin') {
      this.showToast('Akun dengan peran Super Admin tidak dapat dihapus.', 'warning', 'Tidak Diizinkan');
      return;
    }

    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Akses Staf Whitelist',
      message: `Hapus akun staf "${user.name}" (${user.email}) dari whitelist admin RS Medica? Akun ini akan dihapus permanen dari Google Sheets.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Akun',
      cancelText: 'Batal'
    });
    if (!confirmed) return;

    this.showCrudLoading('Menghapus Akun Staf', `Menghapus "${user.name}" dari whitelist Google Sheets...`);

    try {
      this.whitelistUsers = this.whitelistUsers.filter(u => u.email.toLowerCase() !== targetEmail.toLowerCase());
      this.recordAuditLog('HAPUS_STAF', `Menghapus akun staf "${user.name}" (${user.email}) dari whitelist`);
      this.renderUsers();

      const gasRes = await this.postToAppsScript({
        action: 'delete_user',
        email: targetEmail,
        token: this.getAdminToken(),
        userEmail: this.currentUser?.email
      });

      await this.fetchUsersFromGoogleAppsScript();

      if (gasRes && gasRes.error) {
        this.showToast(gasRes.error, 'warning', 'Peringatan Google Apps Script', 6000);
      } else {
        this.showToast(`Akun "${user.name}" berhasil dihapus dari whitelist!`, 'success', 'Akun Terhapus');
      }
    } catch (err) {
      console.error('Error deleting user:', err);
      this.showToast('Gagal menghapus akun: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
    }
  }

  // ==========================================================================
  // FASE 3: MANAJEMEN KATALOG OBAT KEMOTERAPI (PANEL OBAT)
  // ==========================================================================

  bindObatEvents() {
    // Tombol Buka Modal Tambah Obat
    const btnOpenAdd = document.getElementById('btnOpenAddObatModal');
    btnOpenAdd?.addEventListener('click', () => this.openAddObatModal());

    // Tombol Tutup & Batal Modal Obat
    const btnCloseObat = document.getElementById('closeObatModalBtn');
    const btnCancelObat = document.getElementById('btnCancelObatModal');
    const obatModal = document.getElementById('obatModal');
    const closeObatHandler = () => obatModal?.classList.remove('active');
    btnCloseObat?.addEventListener('click', closeObatHandler);
    btnCancelObat?.addEventListener('click', closeObatHandler);

    // Form Submit Obat (Tambah / Edit)
    const obatForm = document.getElementById('obatForm');
    obatForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveObat();
    });

    // Realtime Live Preview & Counter Listener untuk Form Obat
    const obatInputs = [
      'obatNamaInput', 'obatProdusenInput', 'obatKfaInput', 'obatBentukSelect',
      'obatJenisSelect', 'obatGolonganSelect', 'obatStatusSelect', 'obatUrutanInput',
      'obatIndikasiRingkasInput', 'obatDeskripsiInput', 'obatIndikasiUmumInput',
      'obatKomposisiInput', 'obatPeringatanInput', 'obatEfekSampingInput'
    ];
    obatInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          this.updateObatCharCounters();
          this.updateLiveObatPreview();
        });
        el.addEventListener('change', () => {
          this.updateObatCharCounters();
          this.updateLiveObatPreview();
        });
      }
    });

    // Tab Switcher Pratinjau Form Obat (Kartu vs Halaman Detail)
    const tabCardBtn = document.getElementById('btnPreviewTabCard');
    const tabDetailBtn = document.getElementById('btnPreviewTabDetail');
    const paneCard = document.getElementById('panePreviewCard');
    const paneDetail = document.getElementById('panePreviewDetail');

    tabCardBtn?.addEventListener('click', () => {
      tabCardBtn.classList.add('active');
      tabDetailBtn?.classList.remove('active');
      paneCard?.classList.add('active');
      paneDetail?.classList.remove('active');
    });

    tabDetailBtn?.addEventListener('click', () => {
      tabDetailBtn.classList.add('active');
      tabCardBtn?.classList.remove('active');
      paneDetail?.classList.add('active');
      paneCard?.classList.remove('active');
    });

    // Filter Toolbar Pencarian Realtime & Status & Bentuk
    const searchInput = document.getElementById('obatSearchInput');
    let searchDebounce = null;
    searchInput?.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        this.obatFilterSearch = (searchInput.value || '').trim().toLowerCase();
        this.obatCurrentPage = 1;
        this.renderObatTable();
      }, 250);
    });

    const statusFilter = document.getElementById('obatStatusFilter');
    statusFilter?.addEventListener('change', () => {
      this.obatFilterStatus = statusFilter.value;
      this.obatCurrentPage = 1;
      this.renderObatTable();
    });

    const bentukFilter = document.getElementById('obatBentukFilter');
    bentukFilter?.addEventListener('change', () => {
      this.obatFilterBentuk = bentukFilter.value;
      this.obatCurrentPage = 1;
      this.renderObatTable();
    });

    const resetFilterBtn = document.getElementById('btnResetObatFilter');
    resetFilterBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      if (bentukFilter) bentukFilter.value = '';
      this.obatFilterSearch = '';
      this.obatFilterStatus = '';
      this.obatFilterBentuk = '';
      this.obatCurrentPage = 1;
      this.renderObatTable();
    });

    // Pagination Tombol Prev & Next
    const prevPageBtn = document.getElementById('btnObatPrevPage');
    const nextPageBtn = document.getElementById('btnObatNextPage');
    prevPageBtn?.addEventListener('click', () => {
      if (this.obatCurrentPage > 1) {
        this.obatCurrentPage--;
        this.renderObatTable();
      }
    });
    nextPageBtn?.addEventListener('click', () => {
      this.obatCurrentPage++;
      this.renderObatTable();
    });

    // Event Delegation untuk Aksi Baris Tabel Obat (Edit, Fasilitas, Hapus, Urutan)
    const obatTbody = document.getElementById('obatTableBody');
    obatTbody?.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const id = actionBtn.dataset.id;
      if (!id) return;

      if (action === 'edit-obat') {
        this.openEditObatModal(id);
      } else if (action === 'manage-fasilitas') {
        this.openFasilitasModal(id);
      } else if (action === 'delete-obat') {
        this.deleteObat(id);
      }
    });

    obatTbody?.addEventListener('change', (e) => {
      const urutInput = e.target.closest('[data-action="change-urutan"]');
      if (urutInput && urutInput.dataset.id) {
        this.updateObatUrutan(urutInput.dataset.id, urutInput.value);
      }
    });

    // Modal Fasilitas Obat Events
    const btnCloseFas = document.getElementById('closeFasilitasModalBtn');
    const fasModal = document.getElementById('fasilitasObatModal');
    btnCloseFas?.addEventListener('click', () => fasModal?.classList.remove('active'));

    const fasForm = document.getElementById('fasilitasForm');
    fasForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveFasilitasObat();
    });

    const btnCancelFasEdit = document.getElementById('btnCancelFasilitasEdit');
    btnCancelFasEdit?.addEventListener('click', () => this.resetFasilitasForm());

    const fasTbody = document.getElementById('fasilitasListTableBody');
    fasTbody?.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (!actionBtn) return;
      const action = actionBtn.dataset.action;
      const id = actionBtn.dataset.id;
      if (!id) return;

      if (action === 'edit-fasilitas') {
        this.startEditFasilitas(id);
      } else if (action === 'delete-fasilitas') {
        this.deleteFasilitasObat(id);
      }
    });

    // Modal Impor CSV & Ekspor CSV Events
    const btnOpenImport = document.getElementById('btnOpenImportObatModal');
    btnOpenImport?.addEventListener('click', () => this.openImportObatModal());

    const btnCloseImport = document.getElementById('closeImportModalBtn');
    const btnCancelImport = document.getElementById('btnCancelImportModal');
    const importModal = document.getElementById('importObatModal');
    const closeImportHandler = () => importModal?.classList.remove('active');
    btnCloseImport?.addEventListener('click', closeImportHandler);
    btnCancelImport?.addEventListener('click', closeImportHandler);

    const btnDownloadTemplate = document.getElementById('btnDownloadObatCsvTemplate');
    btnDownloadTemplate?.addEventListener('click', () => this.downloadObatCsvTemplate());

    const csvFileInput = document.getElementById('obatCsvFileInput');
    csvFileInput?.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this.handleObatCsvFile(e.target.files[0]);
      }
    });

    const btnSubmitImport = document.getElementById('btnSubmitImportCsv');
    btnSubmitImport?.addEventListener('click', () => this.submitImportObatBulk());

    const btnExport = document.getElementById('btnExportObatCsv');
    btnExport?.addEventListener('click', () => this.exportObatCsv());
  }

  // Tarik data obat admin dari server (termasuk status Draft dan jumlah fasilitas)
  async fetchAdminObatList() {
    const token = this.getAdminToken();
    if (!token) return;

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'admin_get_obat_list',
          token: token
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (this.isTokenInvalidResponse(json)) {
        this.handleSessionExpired();
        return;
      }

      if (json.success && (Array.isArray(json.data) || (json.data && Array.isArray(json.data.items)))) {
        this.obatList = Array.isArray(json.data) ? json.data : json.data.items;
        this.renderObatTable();
      } else {
        this.showToast(json.error || json.message || 'Gagal memuat daftar obat.', 'warning', 'Peringatan Server');
      }
    } catch (e) {
      console.warn('[Admin Obat] Gagal memuat data obat:', e.message);
    }
  }

  // Render Tabel Daftar Obat dengan Filter & Pagination
  renderObatTable() {
    const tbody = document.getElementById('obatTableBody');
    if (!tbody) return;

    const searchTerm = (this.obatFilterSearch || '').toLowerCase().trim();
    const statusFilter = this.obatFilterStatus;
    const bentukFilter = this.obatFilterBentuk;

    const filtered = (this.obatList || []).filter(item => {
      const matchSearch = !searchTerm ||
        (item.nama_obat && item.nama_obat.toLowerCase().includes(searchTerm)) ||
        (item.nama_produsen && item.nama_produsen.toLowerCase().includes(searchTerm)) ||
        (item.kode_kfa && item.kode_kfa.toLowerCase().includes(searchTerm));
      const matchStatus = !statusFilter || item.status === statusFilter;
      const matchBentuk = !bentukFilter || item.bentuk_sediaan === bentukFilter;
      return matchSearch && matchStatus && matchBentuk;
    });

    // Urutkan berdasarkan urutan prioritas, lalu alfabet nama obat
    filtered.sort((a, b) => {
      const urutA = Number(a.urutan) || 1;
      const urutB = Number(b.urutan) || 1;
      if (urutA !== urutB) return urutA - urutB;
      return String(a.nama_obat || '').localeCompare(String(b.nama_obat || ''));
    });

    const totalItems = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / this.obatPageSize));
    this.obatCurrentPage = Math.min(Math.max(1, this.obatCurrentPage), totalPages);

    const startIndex = (this.obatCurrentPage - 1) * this.obatPageSize;
    const paginatedItems = filtered.slice(startIndex, startIndex + this.obatPageSize);

    // Update Pagination UI
    const paginationInfo = document.getElementById('obatPaginationInfo');
    const pageNumbersEl = document.getElementById('obatPageNumbers');
    const prevBtn = document.getElementById('btnObatPrevPage');
    const nextBtn = document.getElementById('btnObatNextPage');

    if (paginationInfo) {
      if (totalItems === 0) {
        paginationInfo.textContent = 'Menampilkan 0 obat';
      } else {
        const endItem = Math.min(startIndex + this.obatPageSize, totalItems);
        paginationInfo.textContent = `Menampilkan ${startIndex + 1} - ${endItem} dari ${totalItems} obat`;
      }
    }
    if (pageNumbersEl) {
      pageNumbersEl.textContent = `Hal ${this.obatCurrentPage} / ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = this.obatCurrentPage <= 1;
    if (nextBtn) nextBtn.disabled = this.obatCurrentPage >= totalPages;

    if (paginatedItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 36px 16px; color: #94a3b8;">
            Tidak ada obat kemoterapi yang sesuai dengan filter atau kata kunci pencarian.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = paginatedItems.map(item => {
      const isTayang = item.status === 'Tayang';
      const isKeras = item.golongan === 'Obat Keras';
      const fasCount = Number(item.jumlah_fasilitas) || (item.fasilitas ? item.fasilitas.length : 0);

      // Hitung harga terendah jika fasilitas tersedia
      let hargaTermurahStr = '-';
      if (Array.isArray(item.fasilitas) && item.fasilitas.length > 0) {
        const validHargas = item.fasilitas.map(f => Number(f.harga) || 0).filter(h => h > 0);
        if (validHargas.length > 0) {
          const minH = Math.min(...validHargas);
          hargaTermurahStr = `Mulai ${this.formatRupiah(minH)}`;
        }
      }

      return `
        <tr>
          <td style="text-align: center;">
            <input type="number" 
                   class="input-urutan-obat" 
                   data-action="change-urutan" 
                   data-id="${escapeHtml(item.id)}" 
                   value="${escapeHtml(item.urutan || 1)}" 
                   min="1" 
                   title="Ubah urutan tampil (langsung tersimpan)">
          </td>
          <td>
            <div style="font-weight: 600; color: #0f172a; font-size: 0.9rem;">
              ${escapeHtml(item.nama_obat)}
            </div>
            ${item.indikasi_ringkas ? `
              <div style="font-size: 0.74rem; color: #64748b; margin-top: 3px; max-width: 280px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(item.indikasi_ringkas)}">
                ${escapeHtml(item.indikasi_ringkas)}
              </div>
            ` : ''}
            ${item.kode_kfa ? `
              <div style="font-size: 0.72rem; color: #0284c7; margin-top: 3px; font-weight: 600;">
                # KFA: ${escapeHtml(item.kode_kfa)}
              </div>
            ` : ''}
          </td>
          <td style="color: #475569; font-size: 0.84rem;">
            ${escapeHtml(item.nama_produsen || '-')}
          </td>
          <td>
            <div style="display: flex; gap: 4px; flex-wrap: wrap;">
              <span class="katalog-tag-chip" style="font-size: 0.72rem; padding: 2px 7px;">${escapeHtml(item.bentuk_sediaan || '-')}</span>
              <span class="katalog-tag-chip" style="font-size: 0.72rem; padding: 2px 7px;">${escapeHtml(item.jenis || '-')}</span>
            </div>
          </td>
          <td>
            ${isKeras ? `
              <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.75rem; font-weight: 700; color: #dc2626;">
                <svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align: middle;">
                  <circle cx="12" cy="12" r="10" fill="#dc2626"/>
                  <circle cx="12" cy="12" r="8" fill="#ffffff"/>
                  <text x="12" y="16.5" font-size="12" font-weight="900" text-anchor="middle" fill="#dc2626" font-family="Arial, sans-serif">K</text>
                </svg>
                Obat Keras
              </span>
            ` : `
              <span style="font-size: 0.76rem; color: #475569; font-weight: 600;">${escapeHtml(item.golongan || '-')}</span>
            `}
          </td>
          <td>
            <div style="font-size: 0.82rem; font-weight: 600; color: #334155;">
              ${fasCount} Fasilitas
            </div>
            ${hargaTermurahStr !== '-' ? `
              <div style="font-size: 0.74rem; color: #16a34a; font-weight: 600; margin-top: 2px;">
                ${hargaTermurahStr}
              </div>
            ` : ''}
          </td>
          <td style="text-align: center;">
            <span class="badge-status-pill ${isTayang ? 'tayang' : 'draft'}">
              ${isTayang ? 'Tayang' : 'Draft'}
            </span>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
              <button type="button" 
                      class="btn-icon-sm" 
                      data-action="edit-obat" 
                      data-id="${escapeHtml(item.id)}" 
                      title="Edit Obat">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" 
                      class="btn-icon-sm" 
                      data-action="manage-fasilitas" 
                      data-id="${escapeHtml(item.id)}" 
                      title="Kelola Fasilitas & Harga (${fasCount})">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 4v14"/></svg>
              </button>
              <button type="button" 
                      class="btn-icon-sm danger" 
                      data-action="delete-obat" 
                      data-id="${escapeHtml(item.id)}" 
                      title="Hapus Obat">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // Format Angka ke Rupiah
  formatRupiah(num) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(num);
  }

  // Buka Modal Tambah Obat Baru
  openAddObatModal() {
    this.editingObatId = null;
    const modal = document.getElementById('obatModal');
    const form = document.getElementById('obatForm');
    if (!modal || !form) return;

    form.reset();
    document.getElementById('editObatIdInput').value = '';
    document.getElementById('obatModalTitle').textContent = 'Tambah Obat Kemoterapi Baru';
    document.getElementById('obatBentukSelect').value = 'Injeksi';
    document.getElementById('obatJenisSelect').value = 'Generik';
    document.getElementById('obatGolonganSelect').value = 'Obat Keras';
    document.getElementById('obatStatusSelect').value = 'Draft';
    document.getElementById('obatUrutanInput').value = (this.obatList.length + 1);

    this.updateObatCharCounters();
    this.updateLiveObatPreview();

    modal.classList.add('active');
    setTimeout(() => document.getElementById('obatNamaInput')?.focus(), 80);
  }

  // Buka Modal Edit Obat
  openEditObatModal(obatId) {
    const item = (this.obatList || []).find(o => String(o.id) === String(obatId));
    if (!item) return;

    this.editingObatId = obatId;
    const modal = document.getElementById('obatModal');
    if (!modal) return;

    document.getElementById('editObatIdInput').value = item.id;
    document.getElementById('obatModalTitle').textContent = `Edit Obat: ${item.nama_obat}`;

    document.getElementById('obatNamaInput').value = item.nama_obat || '';
    document.getElementById('obatProdusenInput').value = item.nama_produsen || '';
    document.getElementById('obatKfaInput').value = item.kode_kfa || '';
    document.getElementById('obatBentukSelect').value = item.bentuk_sediaan || 'Injeksi';
    document.getElementById('obatJenisSelect').value = item.jenis || 'Generik';
    document.getElementById('obatGolonganSelect').value = item.golongan || 'Obat Keras';
    document.getElementById('obatStatusSelect').value = item.status || 'Draft';
    document.getElementById('obatUrutanInput').value = item.urutan || 1;

    document.getElementById('obatIndikasiRingkasInput').value = item.indikasi_ringkas || '';
    document.getElementById('obatDeskripsiInput').value = item.deskripsi || '';
    document.getElementById('obatIndikasiUmumInput').value = item.indikasi_umum || '';
    document.getElementById('obatKomposisiInput').value = item.komposisi || '';
    document.getElementById('obatPeringatanInput').value = item.peringatan || '';
    document.getElementById('obatEfekSampingInput').value = item.efek_samping || '';

    this.updateObatCharCounters();
    this.updateLiveObatPreview();

    modal.classList.add('active');
    setTimeout(() => document.getElementById('obatNamaInput')?.focus(), 80);
  }

  // Perbarui Penghitung Karakter Semua Field
  updateObatCharCounters() {
    const fields = [
      { id: 'obatNamaInput', countId: 'charCountNamaObat', max: 200 },
      { id: 'obatProdusenInput', countId: 'charCountProdusen', max: 200 },
      { id: 'obatKfaInput', countId: 'charCountKfa', max: 30 },
      { id: 'obatIndikasiRingkasInput', countId: 'charCountIndikasi', max: 500 },
      { id: 'obatDeskripsiInput', countId: 'charCountDeskripsi', max: 5000 },
      { id: 'obatIndikasiUmumInput', countId: 'charCountIndikasiUmum', max: 5000 },
      { id: 'obatKomposisiInput', countId: 'charCountKomposisi', max: 5000 },
      { id: 'obatPeringatanInput', countId: 'charCountPeringatan', max: 5000 },
      { id: 'obatEfekSampingInput', countId: 'charCountEfekSamping', max: 5000 }
    ];

    fields.forEach(f => {
      const el = document.getElementById(f.id);
      const countEl = document.getElementById(f.countId);
      if (el && countEl) {
        const len = (el.value || '').length;
        countEl.textContent = `${len}/${f.max}`;
        countEl.classList.toggle('limit-near', len > f.max * 0.85 && len <= f.max);
        countEl.classList.toggle('limit-exceeded', len > f.max);
      }
    });
  }

  // Pratinjau Langsung Kartu & Modal Detail (Live Preview dengan Sanitasi escapeHtml)
  updateLiveObatPreview() {
    const nama = document.getElementById('obatNamaInput')?.value.trim() || 'Nama Obat & Sediaan';
    const produsen = document.getElementById('obatProdusenInput')?.value.trim() || 'PRODUSEN FARMASI';
    const kfa = document.getElementById('obatKfaInput')?.value.trim();
    const bentuk = document.getElementById('obatBentukSelect')?.value || 'Injeksi';
    const jenis = document.getElementById('obatJenisSelect')?.value || 'Generik';
    const golongan = document.getElementById('obatGolonganSelect')?.value || 'Obat Keras';
    const indikasiRingkas = document.getElementById('obatIndikasiRingkasInput')?.value.trim() || 'Ringkasan indikasi klinis akan tampil di sini...';
    const deskripsi = document.getElementById('obatDeskripsiInput')?.value.trim() || 'Deskripsi lengkap sediaan belum diisi.';
    const indikasiUmum = document.getElementById('obatIndikasiUmumInput')?.value.trim() || 'Indikasi umum klinis belum diisi.';
    const komposisi = document.getElementById('obatKomposisiInput')?.value.trim() || 'Komposisi belum diisi.';
    const peringatan = document.getElementById('obatPeringatanInput')?.value.trim() || 'Tidak ada peringatan khusus yang dicantumkan.';
    const efekSamping = document.getElementById('obatEfekSampingInput')?.value.trim() || 'Tidak ada efek samping yang dicantumkan.';

    const isKeras = golongan === 'Obat Keras';

    // 1. Render Live Card Preview
    const cardContainer = document.getElementById('liveCardPreviewContainer');
    if (cardContainer) {
      cardContainer.innerHTML = `
        <div class="katalog-card" style="box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; background: #ffffff;">
          <div class="katalog-card-header">
            <div>
              <div class="katalog-card-producer">${escapeHtml(produsen.toUpperCase())}</div>
              <h3 class="katalog-card-title">${escapeHtml(nama)}</h3>
            </div>
            ${isKeras ? `
              <div class="katalog-badge-k" title="Obat Keras">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <circle cx="12" cy="12" r="11" fill="#dc2626"/>
                  <circle cx="12" cy="12" r="9" fill="#ffffff"/>
                  <text x="12" y="17" font-size="13" font-weight="900" text-anchor="middle" fill="#dc2626" font-family="Arial, sans-serif">K</text>
                </svg>
              </div>
            ` : ''}
          </div>

          <div class="katalog-card-tags">
            <span class="katalog-tag-chip">${escapeHtml(bentuk)}</span>
            <span class="katalog-tag-chip">${escapeHtml(jenis)}</span>
            ${kfa ? `<span class="katalog-tag-chip" style="color: #0284c7; background: #e0f2fe;"># KFA: ${escapeHtml(kfa)}</span>` : ''}
          </div>

          <div class="katalog-card-desc" style="font-size: 0.82rem; color: #475569; margin-bottom: 12px;">
            ${escapeHtml(indikasiRingkas)}
          </div>

          <div class="katalog-card-footer" style="border-top: 1px solid #f1f5f9; padding-top: 10px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="font-size: 0.72rem; color: #64748b;">Fasilitas & Harga</div>
              <div style="font-size: 0.82rem; font-weight: 700; color: #16a34a;">Sesuai Ketersediaan</div>
            </div>
            <span style="font-size: 0.75rem; color: #0284c7; font-weight: 600;">Lihat Rincian &rarr;</span>
          </div>
        </div>
      `;
    }

    // 2. Render Live Detail Preview
    const detailContainer = document.getElementById('liveDetailPreviewContainer');
    if (detailContainer) {
      detailContainer.innerHTML = `
        <div>
          <div style="font-size: 0.75rem; color: #64748b; font-weight: 700; text-transform: uppercase;">${escapeHtml(produsen)}</div>
          <h4 style="font-size: 1.15rem; color: #0f172a; margin: 4px 0 10px 0;">${escapeHtml(nama)}</h4>
          <div style="display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap;">
            <span class="katalog-tag-chip">${escapeHtml(bentuk)}</span>
            <span class="katalog-tag-chip">${escapeHtml(jenis)}</span>
            <span class="katalog-tag-chip">${escapeHtml(golongan)}</span>
            ${kfa ? `<span class="katalog-tag-chip" style="color: #0284c7; background: #e0f2fe;"># KFA: ${escapeHtml(kfa)}</span>` : ''}
          </div>

          <div style="margin-bottom: 12px;">
            <h5 style="font-size: 0.82rem; font-weight: 700; color: #1e293b; margin-bottom: 4px;">Komposisi Zat Aktif</h5>
            <div style="font-size: 0.82rem; color: #475569; line-height: 1.5; background: #f8fafc; padding: 8px 10px; border-radius: 6px;">
              ${escapeHtml(komposisi)}
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <h5 style="font-size: 0.82rem; font-weight: 700; color: #1e293b; margin-bottom: 4px;">Indikasi Umum</h5>
            <div style="font-size: 0.82rem; color: #475569; line-height: 1.5;">
              ${escapeHtml(indikasiUmum)}
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <h5 style="font-size: 0.82rem; font-weight: 700; color: #1e293b; margin-bottom: 4px;">Deskripsi Lengkap</h5>
            <div style="font-size: 0.82rem; color: #475569; line-height: 1.5;">
              ${escapeHtml(deskripsi)}
            </div>
          </div>

          <div style="margin-bottom: 12px; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 8px 10px; border-radius: 4px;">
            <h5 style="font-size: 0.82rem; font-weight: 700; color: #b45309; margin-bottom: 4px;">Peringatan & Perhatian</h5>
            <div style="font-size: 0.8rem; color: #78350f; line-height: 1.45;">
              ${escapeHtml(peringatan)}
            </div>
          </div>

          <div style="margin-bottom: 10px; background: #fef2f2; border-left: 3px solid #ef4444; padding: 8px 10px; border-radius: 4px;">
            <h5 style="font-size: 0.82rem; font-weight: 700; color: #b91c1c; margin-bottom: 4px;">Efek Samping</h5>
            <div style="font-size: 0.8rem; color: #7f1d1d; line-height: 1.45;">
              ${escapeHtml(efekSamping)}
            </div>
          </div>
        </div>
      `;
    }
  }

  // Simpan Obat (Create / Update) dengan Pola Mutasi Aman (Snapshot + Rollback)
  async saveObat() {
    const editId = document.getElementById('editObatIdInput')?.value.trim();
    const namaObat = document.getElementById('obatNamaInput')?.value.trim();
    const produsen = document.getElementById('obatProdusenInput')?.value.trim();
    const kfa = document.getElementById('obatKfaInput')?.value.trim();
    const bentuk = document.getElementById('obatBentukSelect')?.value;
    const jenis = document.getElementById('obatJenisSelect')?.value;
    const golongan = document.getElementById('obatGolonganSelect')?.value;
    const status = document.getElementById('obatStatusSelect')?.value || 'Draft';
    const urutan = Number(document.getElementById('obatUrutanInput')?.value) || 1;

    const indikasiRingkas = document.getElementById('obatIndikasiRingkasInput')?.value.trim();
    const deskripsi = document.getElementById('obatDeskripsiInput')?.value.trim();
    const indikasiUmum = document.getElementById('obatIndikasiUmumInput')?.value.trim();
    const komposisi = document.getElementById('obatKomposisiInput')?.value.trim();
    const peringatan = document.getElementById('obatPeringatanInput')?.value.trim();
    const efekSamping = document.getElementById('obatEfekSampingInput')?.value.trim();

    // Validasi Sisi Klien
    if (!namaObat) {
      this.showToast('Nama obat dan kekuatan sediaan wajib diisi!', 'warning', 'Validasi Form');
      return;
    }
    if (namaObat.length > 200) {
      this.showToast('Nama obat melebihi batas maksimal 200 karakter!', 'warning', 'Validasi Form');
      return;
    }
    if (kfa && !/^\d+$/.test(kfa)) {
      this.showToast('Kode KFA hanya boleh memuat karakter angka!', 'warning', 'Validasi Form');
      return;
    }

    // Peringatan Dosis Klinis (3.3): Periksa HANYA pada deskripsi, peringatan, efek_samping (Bukan nama_obat)
    const hasDosageInDesc = this.dosageRegex.test(deskripsi || '');
    const hasDosageInWarning = this.dosageRegex.test(peringatan || '');
    const hasDosageInSideEffects = this.dosageRegex.test(efekSamping || '');

    if (hasDosageInDesc || hasDosageInWarning || hasDosageInSideEffects) {
      const confirmed = await this.showConfirmDialog({
        title: 'Peringatan Dosis Klinis Terdeteksi',
        message: 'Teks pada field deskripsi, peringatan, atau efek samping terindikasi memuat petunjuk takaran dosis (mis. mg, ml, tablet). Pastikan ini informasi medis resmi dan bukan anjuran konsumsi mandiri. Ketik "SETUJU" untuk mengonfirmasi.',
        type: 'warning',
        confirmText: 'Lanjutkan Simpan',
        requireConfirmationText: 'SETUJU'
      });

      if (!confirmed) {
        this.showToast('Penyimpanan dibatalkan oleh pengguna.', 'info', 'Dibatalkan');
        return;
      }
      this.recordAuditLog('PERINGATAN_DOSIS_DISETUJUI', `Admin menyetujui penyimpanan sediaan obat "${namaObat}" yang memuat takaran dosis klinis.`);
    }

    const payloadData = {
      nama_obat: namaObat,
      nama_produsen: produsen,
      bentuk_sediaan: bentuk,
      jenis: jenis,
      kode_kfa: kfa,
      golongan: golongan,
      status: status,
      urutan: urutan,
      indikasi_ringkas: indikasiRingkas,
      deskripsi: deskripsi,
      indikasi_umum: indikasiUmum,
      komposisi: komposisi,
      peringatan: peringatan,
      efek_samping: efekSamping
    };

    // Ambil Snapshot State Lokal Sebelum Mutasi (3.6)
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));
    const submitBtn = document.getElementById('btnSubmitObat');
    this.setButtonLoading(submitBtn, true, 'Menyimpan Obat...');
    this.showCrudLoading('Menyimpan Data Obat', 'Menyinkronkan data sediaan obat ke Google Sheets...');

    try {
      const actionName = editId ? 'update_obat' : 'create_obat';
      const body = {
        action: actionName,
        token: this.getAdminToken(),
        obatData: payloadData
      };
      if (editId) body.id = editId;

      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (this.isTokenInvalidResponse(json)) {
        this.handleSessionExpired();
        return;
      }

      if (!res.ok || !json.success) {
        // Rollback state lokal dan tampilkan pesan error dari server
        this.obatList = stateSnapshot;
        this.renderObatTable();
        this.showToast(json.error || json.message || 'Gagal menyimpan data obat.', 'danger', 'Gagal Menyimpan');
        return;
      }

      // Berhasil
      document.getElementById('obatModal')?.classList.remove('active');
      this.showToast(`Data obat "${namaObat}" berhasil disimpan (${status}).`, 'success', 'Berhasil Menyimpan');
      this.recordAuditLog(editId ? 'UPDATE_OBAT' : 'CREATE_OBAT', `Menyimpan obat "${namaObat}" (Status: ${status})`);

      await this.fetchAdminObatList();
    } catch (err) {
      // Jaringan Mati / Error Fatal: Rollback state lokal (3.6)
      this.obatList = stateSnapshot;
      this.renderObatTable();
      console.error('[Admin Obat] Gagal menyimpan saat request:', err);
      this.showToast('Gagal terhubung ke server (jaringan terputus). Data dikembalikan ke kondisi semula.', 'danger', 'Koneksi Terputus');
    } finally {
      this.hideCrudLoading();
      this.setButtonLoading(submitBtn, false);
    }
  }

  // Hapus Obat dengan Snapshot & Rollback
  async deleteObat(obatId) {
    const item = (this.obatList || []).find(o => String(o.id) === String(obatId));
    if (!item) return;

    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Sediaan Obat',
      message: `Apakah Anda yakin ingin menghapus "${item.nama_obat}" beserta seluruh data fasilitas dan harganya? Tindakan ini tidak dapat dibatalkan.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Obat',
      cancelText: 'Batal'
    });
    if (!confirmed) return;

    // Snapshot state lokal
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));
    this.showCrudLoading('Menghapus Obat', `Menghapus "${item.nama_obat}" dari Google Sheets...`);

    try {
      // Optimistic delete di lokal
      this.obatList = this.obatList.filter(o => String(o.id) !== String(obatId));
      this.renderObatTable();

      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_obat',
          id: obatId,
          token: this.getAdminToken()
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (this.isTokenInvalidResponse(json)) {
        this.handleSessionExpired();
        return;
      }

      if (!res.ok || !json.success) {
        // Rollback state lokal
        this.obatList = stateSnapshot;
        this.renderObatTable();
        this.showToast(json.error || json.message || 'Gagal menghapus obat dari database.', 'danger', 'Gagal Menghapus');
        return;
      }

      this.showToast(`Obat "${item.nama_obat}" berhasil dihapus.`, 'success', 'Obat Dihapus');
      this.recordAuditLog('DELETE_OBAT', `Menghapus obat "${item.nama_obat}" (ID: ${obatId})`);
    } catch (err) {
      // Rollback jika jaringan mati
      this.obatList = stateSnapshot;
      this.renderObatTable();
      this.showToast('Gagal menghapus: Jaringan terputus. Data dikembalikan ke semula.', 'danger', 'Koneksi Terputus');
    } finally {
      this.hideCrudLoading();
    }
  }

  // Update Urutan Tampil Langsung dari Tabel
  async updateObatUrutan(obatId, newUrutanVal) {
    const newUrutan = Number(newUrutanVal);
    if (isNaN(newUrutan) || newUrutan < 1) return;

    const item = (this.obatList || []).find(o => String(o.id) === String(obatId));
    if (!item || item.urutan === newUrutan) return;

    // Snapshot state
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));
    item.urutan = newUrutan;

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_obat',
          id: obatId,
          obatData: { urutan: newUrutan },
          token: this.getAdminToken()
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        this.obatList = stateSnapshot;
        this.renderObatTable();
        this.showToast(json.error || json.message || 'Gagal memperbarui urutan.', 'warning', 'Peringatan');
        return;
      }

      this.showToast(`Urutan obat "${item.nama_obat}" diubah menjadi ${newUrutan}.`, 'success', 'Urutan Diperbarui', 2500);
      this.renderObatTable();
    } catch (err) {
      this.obatList = stateSnapshot;
      this.renderObatTable();
      this.showToast('Koneksi terputus: Gagal mengubah urutan.', 'danger', 'Koneksi Terputus');
    }
  }

  // ==========================================================================
  // SUB-PANEL KELOLA FASILITAS & HARGA PER OBAT (3.4)
  // ==========================================================================

  openFasilitasModal(obatId) {
    const item = (this.obatList || []).find(o => String(o.id) === String(obatId));
    if (!item) return;

    this.activeObatFasilitasId = obatId;
    this.resetFasilitasForm();

    const subtitleEl = document.getElementById('fasilitasModalSubtitle');
    if (subtitleEl) {
      subtitleEl.textContent = `Nama Obat: ${item.nama_obat}`;
    }

    this.renderFasilitasTable(obatId);
    document.getElementById('fasilitasObatModal')?.classList.add('active');
  }

  resetFasilitasForm() {
    this.editingFasilitasId = null;
    const form = document.getElementById('fasilitasForm');
    if (form) form.reset();
    document.getElementById('editFasilitasIdInput').value = '';
    document.getElementById('fasilitasObatIdInput').value = this.activeObatFasilitasId || '';
    document.getElementById('fasilitasProvinsiInput').value = 'Jawa Tengah';
    document.getElementById('fasilitasFormTitle').textContent = 'Tambah Fasilitas Baru';
    document.getElementById('btnSubmitFasilitas').textContent = 'Simpan Fasilitas';
    document.getElementById('btnCancelFasilitasEdit').style.display = 'none';
  }

  startEditFasilitas(fasId) {
    const item = (this.obatList || []).find(o => String(o.id) === String(this.activeObatFasilitasId));
    if (!item || !Array.isArray(item.fasilitas)) return;

    const fas = item.fasilitas.find(f => String(f.id) === String(fasId));
    if (!fas) return;

    this.editingFasilitasId = fasId;
    document.getElementById('editFasilitasIdInput').value = fas.id;
    document.getElementById('fasilitasNamaInput').value = fas.nama_fasilitas || '';
    document.getElementById('fasilitasProvinsiInput').value = fas.provinsi || 'Jawa Tengah';
    document.getElementById('fasilitasAlamatInput').value = fas.alamat || '';
    document.getElementById('fasilitasTeleponInput').value = fas.telepon || '';
    document.getElementById('fasilitasWaInput').value = fas.whatsapp || '';
    document.getElementById('fasilitasHargaInput').value = fas.harga || 0;

    document.getElementById('fasilitasFormTitle').textContent = `Edit Fasilitas: ${fas.nama_fasilitas}`;
    document.getElementById('btnSubmitFasilitas').textContent = 'Perbarui Fasilitas';
    document.getElementById('btnCancelFasilitasEdit').style.display = 'inline-block';
    document.getElementById('fasilitasNamaInput')?.focus();
  }

  renderFasilitasTable(obatId) {
    const tbody = document.getElementById('fasilitasListTableBody');
    if (!tbody) return;

    const item = (this.obatList || []).find(o => String(o.id) === String(obatId));
    const fasList = (item && Array.isArray(item.fasilitas)) ? item.fasilitas : [];

    if (fasList.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 22px; color: #94a3b8;">
            Belum ada data fasilitas dan harga untuk obat ini. Silakan tambahkan pada form di bawah.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = fasList.map(f => {
      const formattedPrice = this.formatRupiah(Number(f.harga) || 0);
      return `
        <tr>
          <td style="font-weight: 600; color: #0f172a;">${escapeHtml(f.nama_fasilitas)}</td>
          <td>${escapeHtml(f.provinsi || '-')}</td>
          <td>
            <div style="font-size: 0.76rem; color: #475569;">${escapeHtml(f.alamat || '-')}</div>
            ${(f.telepon || f.whatsapp) ? `
              <div style="font-size: 0.72rem; color: #0284c7; margin-top: 2px;">
                Telp: ${escapeHtml(f.telepon || '-')} | WA: ${escapeHtml(f.whatsapp || '-')}
              </div>
            ` : ''}
          </td>
          <td style="font-weight: 700; color: #16a34a;">${formattedPrice}</td>
          <td style="font-size: 0.76rem; color: #64748b;">${escapeHtml(f.tanggal_diperbarui || '-')}</td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 4px; justify-content: center;">
              <button type="button" class="btn-icon-sm" data-action="edit-fasilitas" data-id="${escapeHtml(f.id)}" title="Edit Fasilitas">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" class="btn-icon-sm danger" data-action="delete-fasilitas" data-id="${escapeHtml(f.id)}" title="Hapus Fasilitas">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async saveFasilitasObat() {
    const editFasId = document.getElementById('editFasilitasIdInput')?.value.trim();
    const obatId = this.activeObatFasilitasId;
    const nama = document.getElementById('fasilitasNamaInput')?.value.trim();
    const provinsi = document.getElementById('fasilitasProvinsiInput')?.value.trim();
    const alamat = document.getElementById('fasilitasAlamatInput')?.value.trim();
    const telepon = document.getElementById('fasilitasTeleponInput')?.value.trim();
    const whatsapp = document.getElementById('fasilitasWaInput')?.value.trim();
    const harga = Number(document.getElementById('fasilitasHargaInput')?.value);

    if (!nama || !provinsi) {
      this.showToast('Nama fasilitas dan provinsi wajib diisi!', 'warning', 'Validasi Form');
      return;
    }
    if (isNaN(harga) || harga < 0) {
      this.showToast('Harga sediaan harus berupa angka non-negatif!', 'warning', 'Validasi Form');
      return;
    }
    const phoneRegex = /^[\d+\s-]+$/;
    if (telepon && !phoneRegex.test(telepon)) {
      this.showToast('Nomor telepon hanya boleh memuat angka, spasi, +, atau -', 'warning', 'Validasi Form');
      return;
    }
    if (whatsapp && !phoneRegex.test(whatsapp)) {
      this.showToast('Nomor WhatsApp hanya boleh memuat angka, spasi, +, atau -', 'warning', 'Validasi Form');
      return;
    }

    const payload = {
      obat_id: obatId,
      nama_fasilitas: nama,
      provinsi: provinsi,
      alamat: alamat,
      telepon: telepon,
      whatsapp: whatsapp,
      harga: harga
    };

    // Snapshot state
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));
    const submitBtn = document.getElementById('btnSubmitFasilitas');
    this.setButtonLoading(submitBtn, true, 'Menyimpan Fasilitas...');
    this.showCrudLoading('Menyimpan Fasilitas', 'Menyinkronkan data fasilitas ke Google Sheets...');

    try {
      const actionName = editFasId ? 'update_fasilitas_obat' : 'create_fasilitas_obat';
      const body = {
        action: actionName,
        token: this.getAdminToken(),
        fasilitasData: payload
      };
      if (editFasId) body.id = editFasId;

      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        this.obatList = stateSnapshot;
        this.renderFasilitasTable(obatId);
        this.showToast(json.error || json.message || 'Gagal menyimpan fasilitas obat.', 'danger', 'Gagal');
        return;
      }

      this.showToast(`Fasilitas "${nama}" berhasil disimpan.`, 'success', 'Fasilitas Tersimpan');
      this.recordAuditLog(editFasId ? 'UPDATE_FASILITAS_OBAT' : 'CREATE_FASILITAS_OBAT', `Menyimpan fasilitas "${nama}" untuk obat ID: ${obatId}`);

      this.resetFasilitasForm();
      await this.fetchAdminObatList();
      this.renderFasilitasTable(obatId);
    } catch (err) {
      this.obatList = stateSnapshot;
      this.renderFasilitasTable(obatId);
      this.showToast('Koneksi terputus: Gagal menyimpan data fasilitas.', 'danger', 'Koneksi Terputus');
    } finally {
      this.hideCrudLoading();
      this.setButtonLoading(submitBtn, false);
    }
  }

  async deleteFasilitasObat(fasId) {
    const obatId = this.activeObatFasilitasId;
    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Fasilitas',
      message: 'Apakah Anda yakin ingin menghapus fasilitas ini dari daftar sediaan obat?',
      type: 'danger',
      confirmText: 'Ya, Hapus Fasilitas',
      cancelText: 'Batal'
    });
    if (!confirmed) return;

    // Snapshot state
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));
    this.showCrudLoading('Menghapus Fasilitas', 'Menghapus data fasilitas dari Google Sheets...');

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_fasilitas_obat',
          id: fasId,
          token: this.getAdminToken()
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (!res.ok || !json.success) {
        this.obatList = stateSnapshot;
        this.renderFasilitasTable(obatId);
        this.showToast(json.error || json.message || 'Gagal menghapus fasilitas.', 'danger', 'Gagal Menghapus');
        return;
      }

      this.showToast('Fasilitas berhasil dihapus.', 'success', 'Fasilitas Terhapus');
      this.recordAuditLog('DELETE_FASILITAS_OBAT', `Menghapus fasilitas ID: ${fasId}`);

      await this.fetchAdminObatList();
      this.renderFasilitasTable(obatId);
    } catch (err) {
      this.obatList = stateSnapshot;
      this.renderFasilitasTable(obatId);
      this.showToast('Koneksi terputus: Gagal menghapus fasilitas.', 'danger', 'Koneksi Terputus');
    } finally {
      this.hideCrudLoading();
    }
  }

  // ==========================================================================
  // IMPOR MASSAL (CSV) & EKSPOR CSV (3.5)
  // ==========================================================================

  downloadObatCsvTemplate() {
    const header = [
      'nama_obat', 'nama_produsen', 'bentuk_sediaan', 'jenis', 'kode_kfa',
      'golongan', 'status', 'urutan', 'indikasi_ringkas', 'deskripsi',
      'indikasi_umum', 'komposisi', 'peringatan', 'efek_samping'
    ];

    const sampleRows = [
      [
        'Cisplatin 50 mg / 50 mL',
        'Kalbe Farma',
        'Injeksi',
        'Generik',
        '93001234',
        'Obat Keras',
        'Tayang',
        '1',
        'Kemoterapi untuk berbagai jenis kanker padat',
        'Cisplatin adalah agen antineoplastik berbasis platinum yang bekerja dengan mengikat DNA sel kanker.',
        'Kanker testis metastasis, kanker ovarium lanjut, dan karsinoma kandung kemih.',
        'Cisplatin 1 mg/mL larutan infus',
        'Harus diberikan di bawah pengawasan dokter onkologi. Lakukan hidrasi sebelum dan sesudah infus.',
        'Nefrotoksisitas, mual muntah berat, ototoksisitas, mielosupresi.'
      ],
      [
        'Sitotoksin 500 mg',
        'Sanbe Farma',
        'Infus',
        'Generik',
        '93005678',
        'Obat Keras',
        'Draft',
        '2',
        'Kemoterapi kombinasi limfoma dan sarkoma',
        'Antineoplastik sitotoksik untuk regimen kombinasi onkologi.',
        'Karsinoma payudara, limfoma Hodgkin dan non-Hodgkin.',
        'Sitotoksin 500 mg serbuk injeksi',
        'Pantau fungsi hepar, ginjal, dan hitung darah lengkap secara berkala.',
        'Mielosupresi, mual, alopesia, stomatitis.'
      ]
    ];

    const csvContent = [
      header.join(','),
      ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_katalog_obat.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  openImportObatModal() {
    this.parsedValidCsvRows = [];
    const fileInput = document.getElementById('obatCsvFileInput');
    if (fileInput) fileInput.value = '';

    const previewContainer = document.getElementById('importObatPreviewContainer');
    if (previewContainer) previewContainer.style.display = 'none';

    const progressContainer = document.getElementById('importProgressBarContainer');
    if (progressContainer) progressContainer.style.display = 'none';

    const submitBtn = document.getElementById('btnSubmitImportCsv');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Kirim Impor (0 Baris Valid)';
    }

    document.getElementById('importObatModal')?.classList.add('active');
  }

  // Parse Format CSV (Mendukung Tanda Kutip & Newline dalam Field)
  parseCsvText(text) {
    const lines = [];
    let currentLine = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Lewati quote kedua
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentLine.push(currentField);
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentLine.push(currentField);
        currentField = '';
        if (currentLine.length > 1 || currentLine[0] !== '') {
          lines.push(currentLine);
        }
        currentLine = [];
      } else {
        currentField += char;
      }
    }

    if (currentField !== '' || currentLine.length > 0) {
      currentLine.push(currentField);
      lines.push(currentLine);
    }

    return lines;
  }

  handleObatCsvFile(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const rows = this.parseCsvText(text);

        if (rows.length < 2) {
          this.showToast('Berkas CSV kosong atau tidak memuat data baris.', 'warning', 'Berkas Kosong');
          return;
        }

        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const expectedHeaders = ['nama_obat', 'bentuk_sediaan', 'jenis', 'golongan'];
        for (const eh of expectedHeaders) {
          if (!headers.includes(eh)) {
            this.showToast(`Header CSV tidak lengkap. Kolom wajib '${eh}' tidak ditemukan. Silakan gunakan template resmi.`, 'danger', 'Format Salah');
            return;
          }
        }

        const validBentuk = ["Tablet", "Injeksi", "Kapsul", "Sirup", "Infus", "Lainnya"];
        const validJenis = ["Generik", "Bermerek"];
        const validGolongan = ["Obat Keras", "Obat Bebas", "Narkotika", "Lainnya"];

        const validatedRows = [];
        const validItems = [];

        for (let r = 1; r < rows.length; r++) {
          const rowData = rows[r];
          const itemObj = {};
          headers.forEach((h, idx) => {
            itemObj[h] = rowData[idx] !== undefined ? String(rowData[idx]).trim() : '';
          });

          // Validasi Sisi Klien per Baris (3.5)
          let isValid = true;
          const reasons = [];

          const nama = itemObj.nama_obat;
          if (!nama) {
            isValid = false;
            reasons.push("Field 'nama_obat' wajib diisi.");
          } else if (nama.length > 200) {
            isValid = false;
            reasons.push("Field 'nama_obat' melebihi 200 karakter.");
          }

          const bentuk = itemObj.bentuk_sediaan;
          if (!bentuk || !validBentuk.some(vb => vb.toLowerCase() === bentuk.toLowerCase())) {
            isValid = false;
            reasons.push(`Bentuk sediaan tidak valid. Pilihan: ${validBentuk.join(', ')}.`);
          }

          const jenis = itemObj.jenis;
          if (!jenis || !validJenis.some(vj => vj.toLowerCase() === jenis.toLowerCase())) {
            isValid = false;
            reasons.push(`Jenis tidak valid. Pilihan: ${validJenis.join(', ')}.`);
          }

          const golongan = itemObj.golongan;
          if (!golongan || !validGolongan.some(vg => vg.toLowerCase() === golongan.toLowerCase())) {
            isValid = false;
            reasons.push(`Golongan tidak valid. Pilihan: ${validGolongan.join(', ')}.`);
          }

          const kfa = itemObj.kode_kfa;
          if (kfa && !/^\d+$/.test(kfa)) {
            isValid = false;
            reasons.push("Kode KFA hanya boleh memuat angka numerik.");
          }

          const status = itemObj.status ? (itemObj.status.toLowerCase() === 'tayang' ? 'Tayang' : 'Draft') : 'Draft';
          itemObj.status = status;

          validatedRows.push({
            rowNumber: r + 1,
            nama: nama || '(Kosong)',
            bentukJenis: `${bentuk || '-'} / ${jenis || '-'}`,
            isValid: isValid,
            reason: reasons.join(' ') || 'Siap diimpor.'
          });

          if (isValid) {
            validItems.push({
              nama_obat: nama,
              nama_produsen: itemObj.nama_produsen || '',
              bentuk_sediaan: bentuk,
              jenis: jenis,
              kode_kfa: kfa || '',
              golongan: golongan,
              status: status,
              urutan: Number(itemObj.urutan) || (this.obatList.length + validItems.length + 1),
              indikasi_ringkas: itemObj.indikasi_ringkas || '',
              deskripsi: itemObj.deskripsi || '',
              indikasi_umum: itemObj.indikasi_umum || '',
              komposisi: itemObj.komposisi || '',
              peringatan: itemObj.peringatan || '',
              efek_samping: itemObj.efek_samping || ''
            });
          }
        }

        this.parsedValidCsvRows = validItems;

        // Tampilkan Pratinjau Baris Valid / Tidak Valid
        const previewContainer = document.getElementById('importObatPreviewContainer');
        const validBadge = document.getElementById('importValidCount');
        const invalidBadge = document.getElementById('importInvalidCount');
        const totalBadge = document.getElementById('importTotalCount');
        const previewTbody = document.getElementById('importPreviewTableBody');
        const submitBtn = document.getElementById('btnSubmitImportCsv');

        const invalidCount = validatedRows.filter(r => !r.isValid).length;
        if (validBadge) validBadge.textContent = `${validItems.length} Baris Valid`;
        if (invalidBadge) invalidBadge.textContent = `${invalidCount} Baris Tidak Valid`;
        if (totalBadge) totalBadge.textContent = `Total: ${validatedRows.length} baris`;

        if (previewTbody) {
          previewTbody.innerHTML = validatedRows.map(vr => `
            <tr style="background: ${vr.isValid ? '#ffffff' : '#fef2f2'};">
              <td style="font-weight: 600; text-align: center;">${vr.rowNumber}</td>
              <td style="font-weight: 600; color: ${vr.isValid ? '#0f172a' : '#b91c1c'};">${escapeHtml(vr.nama)}</td>
              <td>${escapeHtml(vr.bentukJenis)}</td>
              <td>
                <span class="badge-status-pill ${vr.isValid ? 'tayang' : 'draft'}" style="${vr.isValid ? '' : 'background:#fee2e2; color:#b91c1c; border-color:#fca5a5;'}">
                  ${vr.isValid ? 'Valid' : 'Gagal'}
                </span>
              </td>
              <td style="font-size: 0.76rem; color: ${vr.isValid ? '#16a34a' : '#b91c1c'};">
                ${escapeHtml(vr.reason)}
              </td>
            </tr>
          `).join('');
        }

        if (previewContainer) previewContainer.style.display = 'block';

        if (submitBtn) {
          if (validItems.length > 0) {
            submitBtn.disabled = false;
            submitBtn.textContent = `Kirim Impor (${validItems.length} Baris Valid)`;
          } else {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Tidak Ada Baris Valid untuk Diimpor';
          }
        }
      } catch (err) {
        console.error('Error parsing CSV:', err);
        this.showToast('Gagal memproses berkas CSV: ' + err.message, 'danger', 'Gagal Parse');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  // Kirim Impor Bertahap (Maksimal 200 Baris per Request) dengan Progress Bar (3.5)
  async submitImportObatBulk() {
    const items = this.parsedValidCsvRows || [];
    if (items.length === 0) {
      this.showToast('Tidak ada data baris valid untuk diimpor.', 'warning', 'Data Kosong');
      return;
    }

    const submitBtn = document.getElementById('btnSubmitImportCsv');
    const progressContainer = document.getElementById('importProgressBarContainer');
    const progressBar = document.getElementById('importProgressBar');
    const progressText = document.getElementById('importProgressText');
    const progressPercent = document.getElementById('importProgressPercent');

    if (progressContainer) progressContainer.style.display = 'block';
    if (submitBtn) this.setButtonLoading(submitBtn, true, 'Mengimpor...');

    // Bagi menjadi batch maks 200 baris
    const BATCH_SIZE = 200;
    const batches = [];
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      batches.push(items.slice(i, i + BATCH_SIZE));
    }

    let importedSuccessTotal = 0;
    const stateSnapshot = JSON.parse(JSON.stringify(this.obatList));

    try {
      for (let b = 0; b < batches.length; b++) {
        const batchItems = batches[b];
        const batchNum = b + 1;

        if (progressText) {
          progressText.textContent = `Mengimpor batch ${batchNum} dari ${batches.length} (${batchItems.length} data)...`;
        }

        const res = await fetch('/api/gas/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'import_obat_bulk',
            items: batchItems,
            token: this.getAdminToken()
          })
        });

        if (res.status === 401 || res.status === 403) {
          this.handleSessionExpired();
          return;
        }

        const json = await res.json();
        if (!res.ok || !json.success) {
          this.obatList = stateSnapshot;
          this.renderObatTable();
          this.showToast(json.error || json.message || `Gagal mengimpor batch ${batchNum}.`, 'danger', 'Gagal Impor');
          return;
        }

        importedSuccessTotal += (json.totalImported || batchItems.length);
        const percent = Math.round(((b + 1) / batches.length) * 100);
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (progressPercent) progressPercent.textContent = `${percent}%`;
      }

      // Selesai seluruh batch
      this.showToast(`Berhasil mengimpor ${importedSuccessTotal} data obat ke katalog!`, 'success', 'Impor Sukses', 6000);
      this.recordAuditLog('IMPORT_OBAT_BULK', `Mengimpor ${importedSuccessTotal} obat secara massal via CSV`);

      document.getElementById('importObatModal')?.classList.remove('active');
      await this.fetchAdminObatList();
    } catch (err) {
      this.obatList = stateSnapshot;
      this.renderObatTable();
      this.showToast('Koneksi terputus saat proses impor. Perubahan dibatalkan.', 'danger', 'Koneksi Terputus');
    } finally {
      if (submitBtn) this.setButtonLoading(submitBtn, false);
      if (progressContainer) progressContainer.style.display = 'none';
    }
  }

  // Ekspor Seluruh Katalog Obat ke Format CSV
  exportObatCsv() {
    const list = this.obatList || [];
    if (list.length === 0) {
      this.showToast('Belum ada data obat untuk diekspor.', 'warning', 'Katalog Kosong');
      return;
    }

    const headers = [
      'id', 'nama_obat', 'nama_produsen', 'bentuk_sediaan', 'jenis', 'kode_kfa',
      'golongan', 'status', 'urutan', 'indikasi_ringkas', 'deskripsi',
      'indikasi_umum', 'komposisi', 'peringatan', 'efek_samping', 'updated_at'
    ];

    const rows = list.map(item => [
      item.id || '',
      item.nama_obat || '',
      item.nama_produsen || '',
      item.bentuk_sediaan || '',
      item.jenis || '',
      item.kode_kfa || '',
      item.golongan || '',
      item.status || 'Draft',
      item.urutan || 1,
      item.indikasi_ringkas || '',
      item.deskripsi || '',
      item.indikasi_umum || '',
      item.komposisi || '',
      item.peringatan || '',
      item.efek_samping || '',
      item.updated_at || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const todayStr = new Date().toISOString().slice(0, 10);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `katalog_obat_rsud_margono_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.showToast(`Berhasil mengekspor ${list.length} data obat ke CSV.`, 'success', 'Ekspor Selesai');
  }

  // =========================================================================
  // MANAJEMEN REGIMEN KEMOTERAPI (CMS KALKULATOR)
  // =========================================================================

  bindRegimenEvents() {
    // Tombol Buka Modal Tambah Regimen
    const btnOpenAdd = document.getElementById('btnOpenAddRegimenModal');
    btnOpenAdd?.addEventListener('click', () => this.openAddRegimenModal());

    // Tombol Tutup & Batal Modal Regimen
    const btnCloseRegimen = document.getElementById('closeRegimenModalBtn');
    const btnCancelRegimen = document.getElementById('btnCancelRegimenModal');
    const regimenModal = document.getElementById('regimenModal');
    const closeRegimenHandler = () => regimenModal?.classList.remove('active');
    btnCloseRegimen?.addEventListener('click', closeRegimenHandler);
    btnCancelRegimen?.addEventListener('click', closeRegimenHandler);

    // Form Submit Regimen (Tambah / Edit)
    const regimenForm = document.getElementById('regimenForm');
    regimenForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveRegimen();
    });

    // Filter Toolbar Pencarian Realtime & Status
    const searchInput = document.getElementById('regimenSearchInput');
    let searchDebounce = null;
    searchInput?.addEventListener('input', () => {
      if (searchDebounce) clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        this.regimenFilterSearch = (searchInput.value || '').trim().toLowerCase();
        this.renderRegimenTable();
      }, 250);
    });

    const statusFilter = document.getElementById('regimenStatusFilter');
    statusFilter?.addEventListener('change', () => {
      this.regimenFilterStatus = statusFilter.value;
      this.renderRegimenTable();
    });

    const resetFilterBtn = document.getElementById('btnResetRegimenFilter');
    resetFilterBtn?.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      this.regimenFilterSearch = '';
      this.regimenFilterStatus = '';
      this.renderRegimenTable();
    });

    // Event Delegation Aksi Tabel Regimen (Edit, Toggle Status, Hapus)
    const tbody = document.getElementById('regimenTableBody');
    tbody?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'edit-regimen') {
        this.openEditRegimenModal(id);
      } else if (action === 'toggle-regimen') {
        const currentActive = btn.dataset.active === 'true';
        this.toggleRegimenStatus(id, !currentActive);
      } else if (action === 'delete-regimen') {
        this.deleteRegimen(id);
      }
    });
  }

  async fetchAdminRegimenList() {
    const token = this.getAdminToken();
    if (!token) return;

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'admin_get_regimen_list',
          token: token
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      if (this.isTokenInvalidResponse(json)) {
        this.handleSessionExpired();
        return;
      }

      if (json.success && Array.isArray(json.data)) {
        this.regimenList = json.data;
        this.renderRegimenTable();
      } else {
        this.showToast(json.error || json.message || 'Gagal memuat daftar regimen.', 'warning', 'Peringatan Server');
      }
    } catch (e) {
      console.warn('[Admin Regimen] Gagal memuat data regimen:', e.message);
    }
  }

  renderRegimenTable() {
    const tbody = document.getElementById('regimenTableBody');
    const infoEl = document.getElementById('regimenPaginationInfo');
    if (!tbody) return;

    const searchTerm = (this.regimenFilterSearch || '').toLowerCase().trim();
    const statusFilter = this.regimenFilterStatus;

    const filtered = (this.regimenList || []).filter(item => {
      const matchSearch = !searchTerm ||
        (item.nama_regimen && item.nama_regimen.toLowerCase().includes(searchTerm)) ||
        (item.deskripsi && item.deskripsi.toLowerCase().includes(searchTerm));
      const matchStatus = !statusFilter || (statusFilter === 'active' ? (item.active === true || item.active === 'true') : (item.active === false || item.active === 'false'));
      return matchSearch && matchStatus;
    });

    if (infoEl) {
      infoEl.textContent = `Menampilkan ${filtered.length} dari total ${this.regimenList.length} regimen`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding: 36px 16px; color: #64748b;">
            <div style="font-size: 1.8rem; margin-bottom: 8px;">📋</div>
            <div style="font-weight: 600; color: #334155;">Tidak ada regimen ditemukan</div>
            <div style="font-size: 0.82rem; margin-top: 4px;">Ubah kata kunci pencarian atau tambahkan regimen baru.</div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map((item, idx) => {
      const isActive = item.active === true || item.active === 'true';
      return `
        <tr>
          <td style="text-align: center; font-weight: 600; color: #64748b;">${idx + 1}</td>
          <td>
            <div style="font-weight: 700; color: #1e293b; font-size: 0.92rem;">
              ${escapeHtml(item.nama_regimen)}
            </div>
          </td>
          <td style="text-align: center;">
            <span class="katalog-tag-chip" style="font-size: 0.8rem; font-weight: 600; color: #4338ca; background: #e0e7ff; border-color: #c7d2fe;">
              ${item.default_interval} Hari
            </span>
          </td>
          <td style="text-align: center;">
            <span class="katalog-tag-chip" style="font-size: 0.8rem; font-weight: 600; color: #0284c7; background: #e0f2fe; border-color: #bae6fd;">
              ${item.default_siklus} Siklus
            </span>
          </td>
          <td>
            <div style="font-size: 0.82rem; color: #475569; max-width: 320px; line-height: 1.4;">
              ${escapeHtml(item.deskripsi || '-')}
            </div>
          </td>
          <td style="text-align: center;">
            <button type="button" 
                    class="btn-icon-sm" 
                    data-action="toggle-regimen" 
                    data-id="${escapeHtml(item.id)}" 
                    data-active="${isActive}"
                    title="${isActive ? 'Klik untuk Nonaktifkan (Sembunyikan dari User)' : 'Klik untuk Aktifkan'}"
                    style="border-radius: 9999px; padding: 4px 10px; width: auto; font-size: 0.76rem; font-weight: 700; background: ${isActive ? '#ecfdf5' : '#fef2f2'}; color: ${isActive ? '#059669' : '#dc2626'}; border: 1px solid ${isActive ? '#a7f3d0' : '#fecaca'};">
              ${isActive ? '✓ Aktif' : '✕ Nonaktif'}
            </button>
          </td>
          <td style="text-align: center;">
            <div style="display: flex; gap: 6px; justify-content: center; align-items: center;">
              <button type="button" 
                      class="btn-icon-sm" 
                      data-action="edit-regimen" 
                      data-id="${escapeHtml(item.id)}" 
                      title="Edit Regimen">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button type="button" 
                      class="btn-icon-sm danger" 
                      data-action="delete-regimen" 
                      data-id="${escapeHtml(item.id)}" 
                      title="Hapus Regimen">
                <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  openAddRegimenModal() {
    this.editingRegimenId = null;
    const title = document.getElementById('regimenModalTitle');
    if (title) title.textContent = 'Tambah Regimen Kemoterapi Baru';

    const namaInput = document.getElementById('regimenNamaInput');
    const intervalInput = document.getElementById('regimenIntervalInput');
    const siklusInput = document.getElementById('regimenSiklusInput');
    const descInput = document.getElementById('regimenDeskripsiInput');
    const activeSelect = document.getElementById('regimenActiveSelect');

    if (namaInput) namaInput.value = '';
    if (intervalInput) intervalInput.value = '21';
    if (siklusInput) siklusInput.value = '6';
    if (descInput) descInput.value = '';
    if (activeSelect) activeSelect.value = 'true';

    document.getElementById('regimenModal')?.classList.add('active');
    namaInput?.focus();
  }

  openEditRegimenModal(id) {
    const item = (this.regimenList || []).find(r => r.id === id);
    if (!item) {
      this.showToast('Data regimen tidak ditemukan.', 'warning');
      return;
    }

    this.editingRegimenId = id;
    const title = document.getElementById('regimenModalTitle');
    if (title) title.textContent = 'Edit Regimen Kemoterapi';

    const namaInput = document.getElementById('regimenNamaInput');
    const intervalInput = document.getElementById('regimenIntervalInput');
    const siklusInput = document.getElementById('regimenSiklusInput');
    const descInput = document.getElementById('regimenDeskripsiInput');
    const activeSelect = document.getElementById('regimenActiveSelect');

    if (namaInput) namaInput.value = item.nama_regimen || '';
    if (intervalInput) intervalInput.value = item.default_interval || 21;
    if (siklusInput) siklusInput.value = item.default_siklus || 6;
    if (descInput) descInput.value = item.deskripsi || '';
    const isActive = item.active === true || item.active === 'true';
    if (activeSelect) activeSelect.value = isActive ? 'true' : 'false';

    document.getElementById('regimenModal')?.classList.add('active');
    namaInput?.focus();
  }

  async saveRegimen() {
    const token = this.getAdminToken();
    if (!token) return;

    const namaInput = document.getElementById('regimenNamaInput');
    const intervalInput = document.getElementById('regimenIntervalInput');
    const siklusInput = document.getElementById('regimenSiklusInput');
    const descInput = document.getElementById('regimenDeskripsiInput');
    const activeSelect = document.getElementById('regimenActiveSelect');
    const submitBtn = document.getElementById('btnSaveRegimen');

    const nama = (namaInput?.value || '').trim();
    const interval = parseInt(intervalInput?.value, 10);
    const siklus = parseInt(siklusInput?.value, 10);
    const deskripsi = (descInput?.value || '').trim();
    const active = activeSelect?.value === 'true';

    if (!nama || nama.length < 3) {
      this.showToast('Nama regimen wajib diisi minimal 3 karakter.', 'warning', 'Validasi Form');
      namaInput?.focus();
      return;
    }

    if (isNaN(interval) || interval < 1 || interval > 365) {
      this.showToast('Interval hari harus berupa angka valid antara 1 dan 365.', 'warning', 'Validasi Form');
      intervalInput?.focus();
      return;
    }

    if (isNaN(siklus) || siklus < 1 || siklus > 100) {
      this.showToast('Jumlah siklus harus berupa angka valid antara 1 dan 100.', 'warning', 'Validasi Form');
      siklusInput?.focus();
      return;
    }

    const payloadData = {
      nama_regimen: nama,
      default_interval: interval,
      default_siklus: siklus,
      deskripsi: deskripsi,
      active: active
    };

    const isEdit = !!this.editingRegimenId;
    const action = isEdit ? 'update_regimen' : 'create_regimen';

    this.showCrudLoading(
      isEdit ? 'Memperbarui Regimen' : 'Menyimpan Regimen Baru',
      'Menyimpan konfigurasi protokol ke database Google Sheets...'
    );
    this.setButtonLoading(submitBtn, true, 'Menyimpan...');

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: action,
          token: token,
          id: this.editingRegimenId || undefined,
          data: payloadData
        })
      });

      if (res.status === 401 || res.status === 403) {
        this.hideCrudLoading();
        this.handleSessionExpired();
        return;
      }

      const json = await res.json();
      this.hideCrudLoading();

      if (json.success) {
        this.showToast(
          isEdit ? 'Regimen berhasil diperbarui.' : 'Regimen baru berhasil ditambahkan.',
          'success'
        );
        document.getElementById('regimenModal')?.classList.remove('active');
        await this.fetchAdminRegimenList();
      } else {
        this.showToast(json.error || 'Gagal menyimpan regimen.', 'danger', 'Gagal Simpan');
      }
    } catch (err) {
      this.hideCrudLoading();
      this.showToast('Koneksi terputus saat menyimpan regimen.', 'danger', 'Kesalahan Koneksi');
    } finally {
      this.setButtonLoading(submitBtn, false);
    }
  }

  async toggleRegimenStatus(id, newActive) {
    const token = this.getAdminToken();
    if (!token) return;

    const item = (this.regimenList || []).find(r => r.id === id);
    if (!item) return;

    // Snapshot rollback
    const oldStatus = item.active;
    item.active = newActive;
    this.renderRegimenTable();

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_regimen',
          token: token,
          id: id,
          active: newActive
        })
      });

      const json = await res.json();
      if (json.success) {
        this.showToast(
          `Status regimen "${item.nama_regimen}" berhasil diubah menjadi ${newActive ? 'Aktif' : 'Nonaktif'}.`,
          'success'
        );
      } else {
        item.active = oldStatus;
        this.renderRegimenTable();
        this.showToast(json.error || 'Gagal mengubah status regimen.', 'danger');
      }
    } catch (err) {
      item.active = oldStatus;
      this.renderRegimenTable();
      this.showToast('Koneksi terputus saat mengubah status.', 'danger');
    }
  }

  async deleteRegimen(id) {
    const token = this.getAdminToken();
    if (!token) return;

    const item = (this.regimenList || []).find(r => r.id === id);
    if (!item) return;

    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Regimen Kemoterapi',
      message: `Apakah Anda yakin ingin menghapus regimen "${item.nama_regimen}"? Tindakan ini akan menghapus regimen dari opsi kalkulator pasien.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Regimen',
      cancelText: 'Batal'
    });

    if (!confirmed) return;

    this.showCrudLoading('Menghapus Regimen', 'Menghapus data dari Google Sheets...');

    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_regimen',
          token: token,
          id: id
        })
      });

      this.hideCrudLoading();
      const json = await res.json();

      if (json.success) {
        this.showToast(`Regimen "${item.nama_regimen}" berhasil dihapus.`, 'success');
        await this.fetchAdminRegimenList();
      } else {
        this.showToast(json.error || 'Gagal menghapus regimen.', 'danger');
      }
    } catch (err) {
      this.hideCrudLoading();
      this.showToast('Koneksi terputus saat menghapus regimen.', 'danger');
    }
  }
}

window.WebAdminPortal = WebAdminPortal;
