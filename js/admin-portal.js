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
    this.editingEmergencyId = null;
    this.emergencyRules = this.loadEmergencyRules();
    this.isLoggingOutWa = false;

    this.bindEvents();
    this.initBaileysPoller();
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
      return sessionStorage.getItem('medica_admin_token') || localStorage.getItem('medica_admin_token') || '';
    } catch (e) {
      return '';
    }
  }

  loadCurrentUser() {
    try {
      const token = this.getAdminToken();
      if (!token) {
        sessionStorage.removeItem('medica_admin_auth');
        localStorage.removeItem('medica_admin_auth');
        return null;
      }
      const stored = sessionStorage.getItem('medica_admin_auth') || localStorage.getItem('medica_admin_auth');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  }

  isAuthenticated() {
    return Boolean(this.currentUser && this.getAdminToken());
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

    // Panel-specific triggers
    if (targetPanelId === 'panelBaileys') {
      this.fetchBaileysStatus();
    } else if (targetPanelId === 'panelLogs') {
      this.fetchLiveLogs();
    } else if (targetPanelId === 'panelDashboard') {
      this.fetchLiveMetrics();
    } else if (targetPanelId === 'panelUsers') {
      this.fetchUsersFromGoogleAppsScript();
    } else if (targetPanelId === 'panelFaqs') {
      this.renderFaqTable();
    } else if (targetPanelId === 'panelEmergency') {
      this.renderEmergencyTable();
      this.syncEmergencyFormWithActiveRule();
      this.updateEmergencyLivePreview();
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

    // Verifikasi kredensial langsung ke Google Apps Script backend
    try {
      const res = await fetch('/api/gas/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email: cleanEmail, password: password })
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.currentUser = {
          email: data.user.email,
          name: data.user.name,
          role: data.user.role
        };
        sessionStorage.setItem('medica_admin_auth', JSON.stringify(this.currentUser));
        localStorage.setItem('medica_admin_auth', JSON.stringify(this.currentUser));
        sessionStorage.setItem('medica_portal_open', 'true');
        localStorage.setItem('medica_portal_open', 'true');
        if (data.token) {
          sessionStorage.setItem('medica_admin_token', data.token);
          localStorage.setItem('medica_admin_token', data.token);
        }
        this.updateNavbarUserInfo();
        this.recordAuditLog('LOGIN_BERHASIL', `Login via kredensial staf (${data.user.role})`);
        return { success: true, user: this.currentUser };
      }
      return {
        success: false,
        message: data.message || data.error || 'Email atau kata sandi tidak valid dalam database Google Apps Script.'
      };
    } catch (e) {
      return {
        success: false,
        message: 'Gagal terhubung ke server autentikasi Google Apps Script. Periksa koneksi internet atau konfigurasi server.'
      };
    }
  }

  logout() {
    if (this.currentUser) {
      this.recordAuditLog('LOGOUT_ADMIN', `Keluar dari portal admin`);
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

  updateNavbarUserInfo() {
    const emailEl = document.getElementById('adminNavbarUserEmail');
    const roleEl = document.getElementById('adminNavbarRolePill');
    if (this.currentUser) {
      if (emailEl) emailEl.textContent = this.currentUser.email;
      if (roleEl) roleEl.textContent = this.currentUser.role.toUpperCase();
    } else {
      if (emailEl) emailEl.textContent = 'Belum Masuk';
      if (roleEl) roleEl.textContent = 'TAMU';
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
    cancelText = 'Batal'
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

      modal.classList.add('active');

      const cleanup = (result) => {
        modal.classList.remove('active');
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
    this.fetchBaileysStatus();
    setInterval(() => this.fetchBaileysStatus(), 2500);
  }

  async fetchBaileysStatus() {
    try {
      const res = await fetch('/api/wa/status');
      if (!res.ok) return;
      const data = await res.json();
      this.updateBaileysUI(data);
    } catch (e) {
      // Backend status safe
    }
  }

  updateBaileysUI(data) {
    if (this.isLoggingOutWa) return;
    const pill = document.getElementById('waConnectionStatusPill');
    const pillText = document.getElementById('waConnectionStatusText');
    const qrSpinner = document.getElementById('qrSpinner');
    const qrImg = document.getElementById('waQrCodeImg');
    const logoutBtn = document.getElementById('btnLogoutWa');
    const deviceBox = document.getElementById('connectedDeviceBox');
    const phoneDisplay = document.getElementById('connectedPhoneDisplay');

    if (!pill || !pillText) return;

    if (data.status === 'connected') {
      pill.className = 'connection-status-pill connected';
      pillText.textContent = `Terhubung Aktif (+${data.connectedPhone || 'WhatsApp'})`;
      
      if (qrSpinner) qrSpinner.style.display = 'none';
      if (qrImg) {
        qrImg.style.display = 'none';
      }
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
      if (deviceBox) {
        deviceBox.style.display = 'block';
        if (phoneDisplay) phoneDisplay.textContent = `+${data.connectedPhone} (${data.connectedUser || 'Bot RS'})`;
      }
    } else if (data.status === 'qr_ready' && data.qrDataUrl) {
      pill.className = 'connection-status-pill waiting';
      pillText.textContent = 'Menunggu Scan Barcode QR';

      if (qrSpinner) qrSpinner.style.display = 'none';
      if (qrImg) {
        qrImg.src = data.qrDataUrl;
        qrImg.style.display = 'block';
      }
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (deviceBox) deviceBox.style.display = 'none';
    } else {
      pill.className = 'connection-status-pill disconnected';
      pillText.textContent = 'Menghubungkan Baileys...';

      if (qrSpinner) qrSpinner.style.display = 'flex';
      if (qrImg) qrImg.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
      if (deviceBox) deviceBox.style.display = 'none';
    }
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

    // Customizable Emergency Form Listeners
    const emergencyCustomForm = document.getElementById('emergencyCustomForm');
    if (emergencyCustomForm) {
      emergencyCustomForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveEmergencyRule();
      });
    }

    const btnResetEmergency = document.getElementById('btnResetEmergencyForm');
    if (btnResetEmergency) {
      btnResetEmergency.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetEmergencyForm();
      });
    }

    const btnCancelEditEmergency = document.getElementById('btnCancelEditEmergency');
    if (btnCancelEditEmergency) {
      btnCancelEditEmergency.addEventListener('click', (e) => {
        e.preventDefault();
        this.resetEmergencyForm();
      });
    }

    // Real-time Inputs for WhatsApp Bubble Live Preview
    const emgTitleInput = document.getElementById('emgTitleInput');
    const emgPhoneInput = document.getElementById('emgPhoneInput');
    const emgAmbulanceInput = document.getElementById('emgAmbulanceInput');
    const emgLocationInput = document.getElementById('emgLocationInput');
    const emgKeywordsInput = document.getElementById('emgKeywordsInput');
    const emgInstructionsInput = document.getElementById('emgInstructionsInput');

    [emgTitleInput, emgPhoneInput, emgAmbulanceInput, emgLocationInput, emgKeywordsInput, emgInstructionsInput].forEach(inp => {
      inp?.addEventListener('input', () => this.updateEmergencyLivePreview());
    });

    // Emergency Search Filter Input
    const emergencyTableSearchInput = document.getElementById('emergencyTableSearchInput');
    if (emergencyTableSearchInput) {
      emergencyTableSearchInput.addEventListener('input', (e) => {
        this.renderEmergencyTable(e.target.value);
      });
    }

    // Test Emergency in Chat Simulator Button
    const btnTestEmergency = document.getElementById('btnTestEmergencySimulator');
    if (btnTestEmergency) {
      btnTestEmergency.addEventListener('click', (e) => {
        e.preventDefault();
        this.testEmergencyRule(this.editingEmergencyId || null);
      });
    }

    // Baileys QR & WhatsApp Action Listeners
    const refreshQrBtn = document.getElementById('btnRefreshQr');
    if (refreshQrBtn) {
      refreshQrBtn.addEventListener('click', async () => {
        refreshQrBtn.disabled = true;
        refreshQrBtn.textContent = 'Memuat...';
        try {
          await fetch('/api/wa/restart', { method: 'POST' });
          await this.fetchBaileysStatus();
        } catch (e) {}
        setTimeout(() => {
          refreshQrBtn.disabled = false;
          refreshQrBtn.innerHTML = `
            <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>
            Muat Ulang Barcode
          `;
        }, 2000);
      });
    }

    const logoutWaBtn = document.getElementById('btnLogoutWa');
    if (logoutWaBtn) {
      logoutWaBtn.addEventListener('click', async () => {
        const confirmed = await this.showConfirmDialog({
          title: 'Putuskan Koneksi WhatsApp',
          message: 'Apakah Anda yakin ingin memutuskan sesi nomor WhatsApp yang terhubung? Bot tidak akan dapat membalas pesan pasien sampai barcode QR dipindai ulang dengan nomor baru.',
          type: 'warning',
          confirmText: 'Ya, Putuskan Sesi',
          cancelText: 'Batal'
        });
        if (!confirmed) return;

        // 1. Aktifkan flag logout & tampilkan animasi loading di tombol & status panel
        this.isLoggingOutWa = true;
        this.setButtonLoading(logoutWaBtn, true, 'Memutuskan Sesi...');

        const pill = document.getElementById('waConnectionStatusPill');
        const pillText = document.getElementById('waConnectionStatusText');
        const qrSpinner = document.getElementById('qrSpinner');
        const qrImg = document.getElementById('waQrCodeImg');
        const deviceBox = document.getElementById('connectedDeviceBox');

        if (pill) pill.className = 'connection-status-pill disconnected';
        if (pillText) {
          pillText.innerHTML = '<span class="btn-inline-spinner" style="margin-right:6px;"></span>Memutuskan Koneksi...';
        }
        if (deviceBox) {
          deviceBox.style.transition = 'opacity 0.3s ease';
          deviceBox.style.opacity = '0.4';
        }
        if (qrSpinner) {
          qrSpinner.style.display = 'flex';
          const spinnerText = qrSpinner.querySelector('span');
          if (spinnerText) spinnerText.textContent = 'Memutuskan sesi & menyiapkan barcode baru...';
        }
        if (qrImg) qrImg.style.display = 'none';

        // 2. Tampilkan Loading Dialog Overlay dengan ikon logout / unlink
        const disconnectIcon = `<svg class="svg-icon svg-icon-md" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`;

        this.showCrudLoading(
          'Memutuskan Sesi WhatsApp',
          'Sedang membersihkan autentikasi nomor terhubung dan menyiapkan barcode QR baru...',
          disconnectIcon,
          'danger'
        );

        try {
          const res = await fetch('/api/wa/logout', { method: 'POST' });
          if (!res.ok) throw new Error('Server mengembalikan kode status ' + res.status);

          // 3. Polling status sampai Barcode QR baru selesai dibuat oleh modul Baileys
          let qrReady = false;
          const startTime = Date.now();
          while (!qrReady && Date.now() - startTime < 8000) {
            await new Promise(r => setTimeout(r, 600));
            try {
              const statusRes = await fetch('/api/wa/status');
              if (statusRes.ok) {
                const statusData = await statusRes.json();
                if (statusData.status === 'qr_ready' && statusData.qrDataUrl) {
                  qrReady = true;
                  this.isLoggingOutWa = false;
                  this.updateBaileysUI(statusData);
                  break;
                }
              }
            } catch (err) {}
          }

          this.isLoggingOutWa = false;
          await this.fetchBaileysStatus();
          this.showToast('Sesi nomor WhatsApp berhasil diputuskan. Barcode baru siap dipindai.', 'info', 'WhatsApp Terputus');
        } catch (e) {
          this.isLoggingOutWa = false;
          this.showToast('Gagal memutuskan sesi WhatsApp: ' + (e.message || 'Terjadi gangguan jaringan'), 'error', 'Gagal Logout');
        } finally {
          this.isLoggingOutWa = false;
          this.hideCrudLoading();
          this.setButtonLoading(logoutWaBtn, false);
          if (deviceBox) deviceBox.style.opacity = '1';
        }
      });
    }

    const sendTestBtn = document.getElementById('btnSendTestWa');
    if (sendTestBtn) {
      sendTestBtn.addEventListener('click', async () => {
        const phone = document.getElementById('testPhoneInput')?.value.trim();
        const msg = document.getElementById('testMessageInput')?.value.trim();
        const resultEl = document.getElementById('testMessageResult');

        if (!phone || !msg) {
          this.showToast('Harap masukkan nomor WhatsApp tujuan dan pesan!', 'warning', 'Form Belum Lengkap');
          return;
        }

        sendTestBtn.disabled = true;
        sendTestBtn.textContent = 'Mengirim...';
        if (resultEl) resultEl.innerHTML = '<span style="color:#64748b;">Mengirim pesan via Baileys...</span>';

        try {
          const res = await fetch('/api/wa/send-test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetPhone: phone, message: msg })
          });
          const d = await res.json();
          if (res.ok) {
            if (resultEl) resultEl.innerHTML = `<span style="color:#16a34a; font-weight:700;">[Berhasil] ${d.message}</span>`;
          } else {
            if (resultEl) resultEl.innerHTML = `<span style="color:#dc2626;">[Gagal] ${d.error || 'Terjadi kesalahan'}</span>`;
          }
        } catch (err) {
          if (resultEl) resultEl.innerHTML = `<span style="color:#dc2626;">[Error] ${err.message}</span>`;
        } finally {
          sendTestBtn.disabled = false;
          sendTestBtn.textContent = 'Kirim Tes';
        }
      });
    }
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
    const primaryRule = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);

    if (greetingEl) greetingEl.value = s.greeting || '';
    if (fallbackEl) fallbackEl.value = s.fallback || '';
    if (hoursEl) hoursEl.value = s.operatingHours || '';
    if (igdPhoneEl) igdPhoneEl.value = s.emergencyHotline || this.bot?.emergencyHotline || primaryRule?.phone || '';
  }

  // ================= KELOLA PANGGILAN DARURAT IGD (CUSTOMIZABLE) =================
  getDefaultEmergencyRules() {
    return [];
  }

  loadEmergencyRules() {
    try {
      const stored = localStorage.getItem('hospital_emergency_rules');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Gagal memuat aturan darurat dari storage:', e);
    }
    return [];
  }

  saveEmergencyRulesToStorage(rules = null) {
    if (rules) this.emergencyRules = rules;
    try {
      localStorage.setItem('hospital_emergency_rules', JSON.stringify(this.emergencyRules));
    } catch (e) {
      console.warn('Gagal menyimpan aturan darurat ke storage:', e);
    }

    const primary = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);
    if (primary && this.bot) {
      this.bot.emergencyHotline = primary.phone || '';
      this.bot.hospitalAddress = primary.location || '';
      this.bot.emergencyRules = this.emergencyRules;
      if (this.bot.data && this.bot.data.settings) {
        this.bot.data.settings.emergencyHotline = primary.phone || '';
      }
    }

    this.syncEmergencyRulesToBackend();
  }

  async syncEmergencyRulesToBackend() {
    try {
      const primary = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);
      const payload = {
        emergencyRules: this.emergencyRules,
        settings: {
          emergencyHotline: primary ? primary.phone : '',
          hospitalAddress: primary ? primary.location : ''
        }
      };
      await fetch('/api/bot/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      // Backend offline safe
    }
  }

  syncEmergencyFormWithActiveRule() {
    if (this.editingEmergencyId) return;
    const primary = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);
    if (primary) {
      const titleInput = document.getElementById('emgTitleInput');
      const phoneInput = document.getElementById('emgPhoneInput');
      const ambInput = document.getElementById('emgAmbulanceInput');
      const locInput = document.getElementById('emgLocationInput');
      const kwInput = document.getElementById('emgKeywordsInput');
      const instInput = document.getElementById('emgInstructionsInput');

      if (titleInput && !titleInput.value) titleInput.value = primary.title || '';
      if (phoneInput && !phoneInput.value) phoneInput.value = primary.phone || '';
      if (ambInput && !ambInput.value) ambInput.value = primary.ambulance || '';
      if (locInput && !locInput.value) locInput.value = primary.location || '';
      if (kwInput && !kwInput.value) kwInput.value = (primary.keywords || []).join(', ');
      if (instInput && !instInput.value) instInput.value = primary.instructions || '';
    }
  }

  updateEmergencyLivePreview() {
    const primary = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]) || null;
    const titleVal = document.getElementById('emgTitleInput')?.value.trim() || primary?.title || 'Layanan Darurat IGD';
    const phoneVal = document.getElementById('emgPhoneInput')?.value.trim() || primary?.phone || '-';
    const ambVal = document.getElementById('emgAmbulanceInput')?.value.trim() || primary?.ambulance || '-';
    const locVal = document.getElementById('emgLocationInput')?.value.trim() || primary?.location || '-';
    const kwVal = document.getElementById('emgKeywordsInput')?.value.trim() || (primary?.keywords || []).join(', ') || '';
    const instVal = document.getElementById('emgInstructionsInput')?.value.trim() ||
      primary?.instructions || 'Jika pasien mengalami keluhan akut atau kegawatdaruratan medis, segera bawa ke IGD terdekat tanpa menunda.';

    const keywordsCount = kwVal ? kwVal.split(',').filter(s => s.trim().length > 0).length : 0;
    const kwCountEl = document.getElementById('emgKeywordsCount');
    if (kwCountEl) kwCountEl.textContent = `${keywordsCount} kata kunci`;

    const instCharCountEl = document.getElementById('emgInstructionsCharCount');
    if (instCharCountEl) instCharCountEl.textContent = `${instVal.length} karakter`;

    const pHeading = document.getElementById('previewEmgHeading');
    const pPhone = document.getElementById('previewEmgPhone');
    const pAmbulance = document.getElementById('previewEmgAmbulance');
    const pLocation = document.getElementById('previewEmgLocation');
    const pInstructions = document.getElementById('previewEmgInstructions');

    if (pHeading) pHeading.textContent = titleVal.toUpperCase();
    if (pPhone) pPhone.textContent = phoneVal;
    if (pAmbulance) pAmbulance.textContent = ambVal;
    if (pLocation) pLocation.textContent = locVal;
    if (pInstructions) pInstructions.textContent = instVal;
  }

  renderEmergencyTable(searchQuery = '') {
    const tbody = document.getElementById('emergencyTableBody');
    if (!tbody) return;

    const q = (searchQuery || '').toLowerCase().trim();
    const filtered = (this.emergencyRules || []).filter(rule => {
      if (!q) return true;
      const matchTitle = (rule.title || '').toLowerCase().includes(q);
      const matchPhone = (rule.phone || '').toLowerCase().includes(q);
      const matchAmb = (rule.ambulance || '').toLowerCase().includes(q);
      const matchLoc = (rule.location || '').toLowerCase().includes(q);
      const matchInst = (rule.instructions || '').toLowerCase().includes(q);
      const matchKw = (rule.keywords || []).some(k => k.toLowerCase().includes(q));
      return matchTitle || matchPhone || matchAmb || matchLoc || matchInst || matchKw;
    });

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 28px; color: #94a3b8;">${q ? `Tidak ada protokol darurat yang sesuai dengan "${escapeHtml(q)}"` : 'Belum ada aturan darurat terdaftar.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map((rule, idx) => {
      const isPrimary = !!rule.isPrimary;
      const kwHtml = (rule.keywords || []).slice(0, 5).map(k =>
        `<span class="emergency-keyword-chip">${escapeHtml(k)}</span>`
      ).join('');
      const moreKw = (rule.keywords || []).length > 5 ? `<span style="font-size:0.7rem; color:#94a3b8; margin-left:4px;">+${rule.keywords.length - 5} lainnya</span>` : '';

      return `
        <tr style="${this.editingEmergencyId === rule.id ? 'background: #fef2f2;' : ''}">
          <td>
            ${isPrimary
              ? `<span class="status-badge" style="background:#fee2e2; color:#b91c1c; font-weight:700;">Utama (1)</span>`
              : `<span class="status-badge" style="background:#f1f5f9; color:#475569;">Siaga (${idx + 1})</span>`
            }
          </td>
          <td>
            <div style="font-weight:700; color:var(--text-main); margin-bottom: 2px;">${escapeHtml(rule.title)}</div>
            <div style="font-size:0.75rem; color:#64748b; line-height: 1.3;">${escapeHtml(rule.location || '-')}</div>
          </td>
          <td>
            <div style="font-weight:700; color:var(--primary); font-family:monospace; font-size:0.85rem;">${escapeHtml(rule.phone)}</div>
            <div style="font-size:0.75rem; color:#64748b;">Ambulans: <strong>${escapeHtml(rule.ambulance || '-')}</strong></div>
          </td>
          <td>
            <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center; max-width:260px;">
              ${kwHtml} ${moreKw}
            </div>
          </td>
          <td>
            <span class="status-badge active">${escapeHtml(rule.status || 'Tayang')}</span>
          </td>
          <td style="text-align: center;">
            <div class="action-btns" style="justify-content:center;">
              <button class="btn-icon-sm" title="Edit Protokol Darurat" onclick="adminPortal.editEmergencyRule('${rule.id}')">
                <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
              </button>
              <button class="btn-icon-sm" title="Uji Respon Darurat di Chat Simulator" style="color:var(--primary);" onclick="adminPortal.testEmergencyRule('${rule.id}')">
                <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
              </button>
              <button class="btn-icon-sm danger" title="Hapus Protokol" onclick="adminPortal.deleteEmergencyRule('${rule.id}')">
                <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  editEmergencyRule(ruleId) {
    const rule = (this.emergencyRules || []).find(r => r.id === ruleId);
    if (!rule) return;

    this.editingEmergencyId = ruleId;
    const idInput = document.getElementById('editEmergencyIdInput');
    const titleInput = document.getElementById('emgTitleInput');
    const phoneInput = document.getElementById('emgPhoneInput');
    const ambInput = document.getElementById('emgAmbulanceInput');
    const locInput = document.getElementById('emgLocationInput');
    const kwInput = document.getElementById('emgKeywordsInput');
    const instInput = document.getElementById('emgInstructionsInput');

    if (idInput) idInput.value = rule.id;
    if (titleInput) titleInput.value = rule.title || '';
    if (phoneInput) phoneInput.value = rule.phone || '';
    if (ambInput) ambInput.value = rule.ambulance || '';
    if (locInput) locInput.value = rule.location || '';
    if (kwInput) kwInput.value = (rule.keywords || []).join(', ');
    if (instInput) instInput.value = rule.instructions || '';

    const heading = document.getElementById('emergencyFormHeading');
    if (heading) heading.textContent = `Edit Protokol: ${rule.title}`;

    const saveBtn = document.getElementById('btnSaveEmergencyRule');
    if (saveBtn) {
      saveBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Perbarui & Simpan Perubahan Protokol
      `;
    }

    const cancelBtn = document.getElementById('btnCancelEditEmergency');
    if (cancelBtn) cancelBtn.style.display = 'inline-block';

    this.updateEmergencyLivePreview();
    this.renderEmergencyTable(document.getElementById('emergencyTableSearchInput')?.value || '');

    titleInput?.focus();
    document.getElementById('emergencyCustomForm')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  resetEmergencyForm() {
    this.editingEmergencyId = null;
    const idInput = document.getElementById('editEmergencyIdInput');
    const form = document.getElementById('emergencyCustomForm');
    if (idInput) idInput.value = '';
    if (form) form.reset();

    const heading = document.getElementById('emergencyFormHeading');
    if (heading) heading.textContent = 'Tambah / Edit Protokol Panggilan Darurat';

    const saveBtn = document.getElementById('btnSaveEmergencyRule');
    if (saveBtn) {
      saveBtn.innerHTML = `
        <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        Simpan & Terbitkan Langsung (Live)
      `;
    }

    const cancelBtn = document.getElementById('btnCancelEditEmergency');
    if (cancelBtn) cancelBtn.style.display = 'none';

    this.syncEmergencyFormWithActiveRule();
    this.updateEmergencyLivePreview();
    this.renderEmergencyTable(document.getElementById('emergencyTableSearchInput')?.value || '');
  }

  async saveEmergencyRule() {
    const saveBtn = document.getElementById('btnSaveEmergencyRule');
    const title = document.getElementById('emgTitleInput')?.value.trim();
    const phone = document.getElementById('emgPhoneInput')?.value.trim();
    const ambulance = document.getElementById('emgAmbulanceInput')?.value.trim();
    const location = document.getElementById('emgLocationInput')?.value.trim();
    const kwRaw = document.getElementById('emgKeywordsInput')?.value.trim() || '';
    const instructions = document.getElementById('emgInstructionsInput')?.value.trim();

    if (!title || !phone || !instructions) {
      this.showToast('Harap lengkapi nama layanan, nomor hotline, dan arahan instruksi pasien!', 'warning', 'Form Belum Lengkap');
      return;
    }

    const keywords = kwRaw
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    this.setButtonLoading(saveBtn, true, 'Menyimpan Protokol...');
    this.showCrudLoading('Menyimpan Protokol Darurat', 'Menyinkronkan konfigurasi ke Bot WhatsApp & Server...');

    try {
      if (this.editingEmergencyId) {
        const idx = this.emergencyRules.findIndex(r => r.id === this.editingEmergencyId);
        if (idx !== -1) {
          this.emergencyRules[idx] = {
            ...this.emergencyRules[idx],
            title,
            phone,
            ambulance: ambulance || '',
            location: location || '',
            keywords,
            instructions,
            updatedAt: new Date().toISOString()
          };
          this.recordAuditLog('UPDATE_PROTOKOL_DARURAT', `Memperbarui protokol darurat: "${title}" (${phone})`);
          this.showToast(`Protokol darurat "${title}" berhasil diperbarui dan aktif langsung di WhatsApp!`, 'success', 'Protokol Diperbarui');
        }
      } else {
        const isFirst = this.emergencyRules.length === 0;
        const newRule = {
          id: 'emg-rule-' + Date.now(),
          title,
          phone,
          ambulance: ambulance || '',
          location: location || '',
          keywords,
          instructions,
          status: 'Tayang',
          isPrimary: isFirst,
          updatedAt: new Date().toISOString()
        };
        this.emergencyRules.push(newRule);
        this.recordAuditLog('TAMBAH_PROTOKOL_DARURAT', `Menambahkan protokol darurat baru: "${title}" (${phone})`);
        this.showToast(`Protokol darurat "${title}" berhasil ditambahkan dan ditayangkan!`, 'success', 'Protokol Baru Aktif');
      }

      this.saveEmergencyRulesToStorage();

      const targetRule = this.editingEmergencyId 
        ? this.emergencyRules.find(r => r.id === this.editingEmergencyId)
        : this.emergencyRules[this.emergencyRules.length - 1];

      if (targetRule) {
        this.postToAppsScript({
          action: 'save_emergency_rule',
          ruleData: targetRule,
          userEmail: this.currentUser?.email
        });
      }

      this.resetEmergencyForm();
    } catch (err) {
      console.error('Error saving emergency rule:', err);
      this.showToast('Gagal menyimpan protokol darurat: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
      if (saveBtn) this.setButtonLoading(saveBtn, false);
    }
  }

  async deleteEmergencyRule(ruleId) {
    const rule = (this.emergencyRules || []).find(r => r.id === ruleId);
    if (!rule) return;

    if (this.emergencyRules.length <= 1) {
      this.showToast('Minimal harus ada 1 protokol panggilan darurat aktif di sistem RS Medica.', 'warning', 'Tidak Dapat Dihapus');
      return;
    }

    const confirmed = await this.showConfirmDialog({
      title: 'Hapus Protokol Panggilan Darurat',
      message: `Apakah Anda yakin ingin menghapus protokol "${rule.title}"? Kata kunci pemicu klinis terkait tidak akan memicu protokol ini lagi.`,
      type: 'danger',
      confirmText: 'Ya, Hapus Protokol',
      cancelText: 'Batal'
    });
    if (!confirmed) return;

    this.showCrudLoading('Menghapus Protokol Darurat', `Menghapus "${rule.title}" dari bot & Google Sheets...`);

    try {
      const isWasPrimary = !!rule.isPrimary;
      this.emergencyRules = this.emergencyRules.filter(r => r.id !== ruleId);

      if (isWasPrimary && this.emergencyRules.length > 0) {
        this.emergencyRules[0].isPrimary = true;
      }

      this.saveEmergencyRulesToStorage();

      this.postToAppsScript({
        action: 'delete_emergency_rule',
        id: ruleId,
        userEmail: this.currentUser?.email
      });

      if (this.editingEmergencyId === ruleId) {
        this.resetEmergencyForm();
      } else {
        this.renderEmergencyTable(document.getElementById('emergencyTableSearchInput')?.value || '');
      }

      this.recordAuditLog('HAPUS_PROTOKOL_DARURAT', `Menghapus protokol darurat: "${rule.title}"`);
      this.showToast(`Protokol darurat "${rule.title}" berhasil dihapus.`, 'success', 'Protokol Dihapus');
    } catch (err) {
      console.error('Error deleting emergency rule:', err);
      this.showToast('Gagal menghapus protokol: ' + err.message, 'error', 'Error Sistem');
    } finally {
      this.hideCrudLoading();
    }
  }

  testEmergencyRule(ruleId = null) {
    let target = null;
    if (ruleId) {
      target = this.emergencyRules.find(r => r.id === ruleId);
    }
    if (!target) {
      target = (this.emergencyRules && this.emergencyRules.find(r => r.isPrimary)) || (this.emergencyRules && this.emergencyRules[0]);
    }
    if (!target) return;

    if (typeof window.openSimulatorChat === 'function') {
      window.openSimulatorChat();
      setTimeout(() => {
        const res = this.bot.handleEmergencyEscalation('Uji Coba Manual Protokol', target);
        if (typeof window.renderBotResponse === 'function') {
          window.renderBotResponse(res.text, true);
        }
        if (typeof window.scrollWaToBottom === 'function') {
          window.scrollWaToBottom();
        }
      }, 350);
    }
  }

  async saveEmergencySettings() {
    return this.saveEmergencyRule();
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
      return await res.json();
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
          if (json.data.emergencyRules && Array.isArray(json.data.emergencyRules)) {
            this.emergencyRules = json.data.emergencyRules;
            this.saveEmergencyRulesToStorage();
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
        ? 'Google Sheets & Baileys: <strong>Live</strong>'
        : 'Baileys Gateway: <strong>Live</strong>';
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
    this.renderEmergencyTable();
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
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          this.whitelistUsers = json.data;
          this.renderUsers();
        }
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
    const superAdminEl = document.getElementById('statSuperAdminCount');
    const nurseEl = document.getElementById('statNurseCount');
    const activePercentEl = document.getElementById('statActiveUsersPercent');

    if (totalUsersEl) totalUsersEl.textContent = this.whitelistUsers.length;
    if (superAdminEl) {
      superAdminEl.textContent = this.whitelistUsers.filter(u => u.role === 'Super Admin').length;
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
}

window.WebAdminPortal = WebAdminPortal;
