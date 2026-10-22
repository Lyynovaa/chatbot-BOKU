/**
 * KALKULATOR-KEMO.JS
 * Modul Frontend Kalkulator Perkiraan Jadwal Kemoterapi (Custom Chemotherapy Calculator)
 * RSUD Prof. Dr. Margono Soekarjo - Unit Onkologi Terpadu Wijayakusuma
 */

(function () {
  'use strict';

  // State internal kalkulator
  const state = {
    regimens: [],
    selectedRegimen: null,
    startDate: '',
    intervalDays: 21,
    totalCycles: 6,
    userNotes: '',
    // Array per siklus: { cycleNum, dateStr, isWeekend, dayName, isOverridden, originalDateStr, note }
    calculatedSchedule: [],
    // Riwayat override manual per siklus { [cycleNum]: dateStr }
    overrides: {}
  };

  const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const INDO_MONTHS = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ];

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatDateIndo(dateObj, withDay = true) {
    if (!dateObj || isNaN(dateObj.getTime())) return '-';
    const dayName = INDO_DAYS[dateObj.getDay()];
    const dateNum = dateObj.getDate();
    const monthName = INDO_MONTHS[dateObj.getMonth()];
    const year = dateObj.getFullYear();
    if (withDay) {
      return `${dayName}, ${dateNum} ${monthName} ${year}`;
    }
    return `${dateNum} ${monthName} ${year}`;
  }

  function formatIsoDate(dateObj) {
    if (!dateObj || isNaN(dateObj.getTime())) return '';
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseDateInput(dateStr) {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(dateStr);
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return new Date(y, m, d, 8, 0, 0); // Jam 08:00 WIB
  }

  function addDays(startDate, days) {
    const res = new Date(startDate.getTime());
    res.setDate(res.getDate() + days);
    return res;
  }

  /**
   * Mengambil daftar regimen aktif dari backend /api/gas/regimen
   */
  async function fetchRegimens() {
    try {
      const res = await fetch('/api/gas/regimen');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          state.regimens = json.data;
          renderRegimenDropdown();
          return;
        }
      }
    } catch (err) {
      console.warn('[Kalkulator Kemo] Gagal memuat regimen dari server, menggunakan dataset fallback:', err.message);
    }

    // Fallback klinis lokal jika server sedang offline
    state.regimens = [
      {
        id: "reg-folfox",
        nama_regimen: "FOLFOX (Fluorouracil + Leucovorin + Oxaliplatin)",
        default_interval: 14,
        default_siklus: 12,
        deskripsi: "Protokol kemoterapi kombinasi lini pertama untuk kanker kolorektal (usus besar/rektum) stadium ajuvan atau lanjut. Diberikan secara siklikal setiap 14 hari (2 minggu) dengan evaluasi profil darah tepi dan respons klinis berkala.",
        active: true
      },
      {
        id: "reg-gem-cis",
        nama_regimen: "Gemcitabine + Cisplatin",
        default_interval: 21,
        default_siklus: 6,
        deskripsi: "Protokol kemoterapi kombinasi berbasis platinum untuk karsinoma saluran kemih, kandung kemih, karsinoma saluran empedu (kolangiokarsinoma), serta kanker paru. Diberikan setiap 21 hari (3 minggu) dengan hidrasi cairan optimal.",
        active: true
      },
      {
        id: "reg-ac-t",
        nama_regimen: "AC-T (Doxorubicin + Cyclophosphamide diikuti Paclitaxel)",
        default_interval: 21,
        default_siklus: 8,
        deskripsi: "Protokol ajuvan standar kanker payudara: 4 siklus AC (interval 21 hari) dilanjutkan 4 siklus Paclitaxel/Docetaxel (interval 21 hari). Memerlukan pemantauan fungsi kardiovaskular (ECHO) dan hematologi rutin sebelum tiap siklus.",
        active: true
      },
      {
        id: "reg-pac-carb",
        nama_regimen: "Paclitaxel + Carboplatin",
        default_interval: 21,
        default_siklus: 6,
        deskripsi: "Protokol kemoterapi lini pertama kanker ovarium epitelial dan kanker paru bukan sel kecil (NSCLC). Siklus infus diberikan setiap 21 hari (3 minggu) disertai premedikasi pencegah reaksi hipersensitivitas.",
        active: true
      },
      {
        id: "reg-chop",
        nama_regimen: "CHOP (Cyclophosphamide + Doxorubicin + Vincristine + Prednisone)",
        default_interval: 21,
        default_siklus: 6,
        deskripsi: "Protokol kemoterapi kuratif lini utama untuk limfoma non-Hodgkin (NHL). Diberikan setiap 21 hari (3 minggu) dengan premedikasi antiemetik profilaksis dan kortikosteroid terjadwal.",
        active: true
      },
      {
        id: "reg-cis-5fu",
        nama_regimen: "Cisplatin + 5-Fluorouracil (5-FU)",
        default_interval: 28,
        default_siklus: 6,
        deskripsi: "Protokol kemoradioterapi untuk karsinoma nasofaring (KNF), kanker kepala-leher stadium lanjut, dan kanker serviks. Diberikan setiap 28 hari (4 minggu) dengan hidrasi agresif dan pemantauan fungsi ginjal.",
        active: true
      }
    ];
    renderRegimenDropdown();
  }

  /**
   * Render opsi pada dropdown regimen kemoterapi
   */
  function renderRegimenDropdown() {
    const selectEl = document.getElementById('calcRegimenSelect');
    if (!selectEl) return;

    const previousValue = selectEl.value || (state.selectedRegimen ? state.selectedRegimen.id : '');

    let html = '<option value="">-- Pilih Protokol / Regimen Kemoterapi --</option>';
    state.regimens.forEach(r => {
      html += `<option value="${escapeHtml(r.id)}">${escapeHtml(r.nama_regimen)} (Default: ${r.default_siklus} Siklus @ ${r.default_interval} Hari)</option>`;
    });

    selectEl.innerHTML = html;

    // Pertahankan pilihan sebelumnya jika masih ada dalam daftar, atau pilih yang pertama
    if (previousValue && state.regimens.some(r => r.id === previousValue)) {
      selectEl.value = previousValue;
      handleRegimenSelected(previousValue);
    } else if (state.regimens.length > 0) {
      selectEl.value = state.regimens[0].id;
      handleRegimenSelected(state.regimens[0].id);
    }
  }

  /**
   * Menangani pemilihan regimen: Auto pre-fill interval dan siklus
   */
  function handleRegimenSelected(regimenId) {
    const reg = state.regimens.find(r => r.id === regimenId);
    state.selectedRegimen = reg || null;

    const intervalInput = document.getElementById('calcIntervalInput');
    const siklusInput = document.getElementById('calcSiklusInput');
    const descBox = document.getElementById('calcRegimenDescBox');

    if (reg) {
      if (intervalInput) intervalInput.value = reg.default_interval || 21;
      if (siklusInput) siklusInput.value = reg.default_siklus || 6;
      state.intervalDays = Number(reg.default_interval) || 21;
      state.totalCycles = Number(reg.default_siklus) || 6;

      if (descBox) {
        descBox.innerHTML = `
          <div class="regimen-info-card">
            <div class="regimen-info-header">
              <div class="regimen-title-badge">
                <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                <span class="regimen-tag">Indikasi Regimen</span>
              </div>
              <span class="regimen-pill">
                Standar: ${reg.default_siklus} Siklus • Tiap ${reg.default_interval} Hari
              </span>
            </div>
            <div class="regimen-desc-body">
              <p class="regimen-desc-text">${escapeHtml(reg.deskripsi || 'Protokol kemoterapi onkologi standar.')}</p>
            </div>
          </div>
        `;
        descBox.style.display = 'block';
      }
    } else {
      if (descBox) descBox.style.display = 'none';
    }

    // Jalankan kalkulasi jika tanggal sudah terisi
    calculateSchedule();
  }

  /**
   * Menghitung jadwal siklus kemoterapi lengkap
   */
  function calculateSchedule() {
    const dateInput = document.getElementById('calcStartDateInput');
    const intervalInput = document.getElementById('calcIntervalInput');
    const siklusInput = document.getElementById('calcSiklusInput');
    const notesInput = document.getElementById('calcCatatanInput');

    const startDateStr = dateInput?.value || state.startDate;
    const interval = parseInt(intervalInput?.value, 10);
    const totalCycles = parseInt(siklusInput?.value, 10);
    const userNotes = notesInput?.value?.trim() || '';

    state.startDate = startDateStr;
    state.intervalDays = isNaN(interval) || interval < 1 ? 21 : interval;
    state.totalCycles = isNaN(totalCycles) || totalCycles < 1 ? 6 : Math.min(totalCycles, 30);
    state.userNotes = userNotes;

    if (!startDateStr) {
      renderEmptyState('Silakan pilih Tanggal Kemoterapi Pertama untuk melihat rincian jadwal siklus.');
      return;
    }

    const baseDate = parseDateInput(startDateStr);
    if (!baseDate || isNaN(baseDate.getTime())) {
      renderEmptyState('Format tanggal awal tidak valid.');
      return;
    }

    const schedule = [];
    let weekendCount = 0;

    for (let i = 1; i <= state.totalCycles; i++) {
      let cycleDate = null;
      let isOverridden = false;

      // Cek apakah ada override manual untuk siklus ini
      if (state.overrides[i]) {
        cycleDate = parseDateInput(state.overrides[i]);
        isOverridden = true;
      }

      // Rumus standar: Tanggal_Pertama + ((N - 1) * Interval_Hari)
      if (!cycleDate || isNaN(cycleDate.getTime())) {
        const offsetDays = (i - 1) * state.intervalDays;
        cycleDate = addDays(baseDate, offsetDays);
        isOverridden = false;
      }

      const dayOfWeek = cycleDate.getDay();
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6); // 0 = Minggu, 6 = Sabtu
      if (isWeekend) weekendCount++;

      let cycleLabel = `Siklus ${i}`;
      if (i === 1) cycleLabel = `Siklus 1 (Awal Dimulai)`;
      else if (i === state.totalCycles) cycleLabel = `Siklus ${i} (Perkiraan Selesai)`;

      schedule.push({
        cycleNum: i,
        cycleLabel: cycleLabel,
        dateObj: cycleDate,
        dateFormatted: formatDateIndo(cycleDate, true),
        isoDate: formatIsoDate(cycleDate),
        dayName: INDO_DAYS[dayOfWeek],
        isWeekend: isWeekend,
        isOverridden: isOverridden
      });
    }

    state.calculatedSchedule = schedule;
    renderResults(schedule, weekendCount);
    renderPrintDocument();
  }

  /**
   * Render hasil kalkulasi: Rangkuman + Breakdown Timeline Siklus
   */
  function renderResults(schedule, weekendCount) {
    const resultsContainer = document.getElementById('calcResultsArea');
    if (!resultsContainer) return;

    if (!schedule || schedule.length === 0) {
      renderEmptyState();
      return;
    }

    const firstCycle = schedule[0];
    const lastCycle = schedule[schedule.length - 1];

    // Estimasi total durasi hari & bulan
    const totalDurationDays = Math.round((lastCycle.dateObj - firstCycle.dateObj) / (1000 * 60 * 60 * 24));
    const approxMonths = (totalDurationDays / 30.4).toFixed(1);

    const regimenName = state.selectedRegimen?.nama_regimen || 'Regimen Kustom';

    let weekendNoticeHtml = '';
    if (weekendCount > 0) {
      weekendNoticeHtml = `
        <div class="calc-weekend-alert" role="alert">
          <div class="alert-icon-box">
            <svg class="svg-icon svg-icon-md alert-warning-icon" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div class="alert-body">
            <h5 class="alert-title">Deteksi Hari Akhir Pekan (${weekendCount} Siklus)</h5>
            <p>Terdapat siklus yang jatuh pada hari Sabtu/Minggu. Jadwal dapat disesuaikan ke hari kerja terdekat bersama dokter DPJP.</p>
          </div>
        </div>
      `;
    }

    let rowsHtml = '';
    schedule.forEach(item => {
      const weekendBadge = item.isWeekend
        ? `<span class="badge-status-weekend" title="Jatuh pada akhir pekan (${item.dayName}). Harap konfirmasi dengan RS.">
             <svg class="svg-icon svg-icon-xs" style="width:12px;height:12px;" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
             Akhir Pekan (${item.dayName})
           </span>`
        : `<span class="badge-status-weekday">
             <svg class="svg-icon svg-icon-xs" style="width:12px;height:12px;" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
             Hari Kerja (${item.dayName})
           </span>`;

      const overrideBadge = item.isOverridden
        ? `<span class="badge-overridden" title="Tanggal telah disesuaikan manual">• Tanggal Disesuaikan</span>`
        : '';

      rowsHtml += `
        <tr class="cycle-row ${item.isWeekend ? 'row-weekend' : ''}">
          <td class="col-cycle-num">
            <div class="cycle-number-circle">${item.cycleNum}</div>
            <div class="cycle-title-sub">
              <strong>${escapeHtml(item.cycleLabel)}</strong>
              ${overrideBadge}
            </div>
          </td>
          <td class="col-cycle-date">
            <div class="cycle-date-display">
              <span class="date-main">${escapeHtml(item.dateFormatted)}</span>
            </div>
          </td>
          <td class="col-cycle-status">
            ${weekendBadge}
          </td>
          <td class="col-cycle-actions no-print">
            <div class="override-action-group">
              <label class="override-date-label">
                <span>Sesuaikan:</span>
                <input type="date" class="form-input form-input-sm cycle-date-picker" data-action="override-cycle-date" data-cycle="${item.cycleNum}" value="${item.isoDate}">
              </label>
              ${item.isOverridden ? `
                <button type="button" class="btn-reset-cycle" data-action="reset-cycle-override" data-cycle="${item.cycleNum}" title="Kembalikan ke hitungan formula otomatis">
                  Reset
                </button>
              ` : ''}
              <button type="button" class="btn-cascade-cycle" data-action="cascade-cycle-delay" data-cycle="${item.cycleNum}" title="Tunda siklus ini dan seluruh siklus berikutnya sebesar +7 hari">
                +7 Hari
              </button>
            </div>
          </td>
        </tr>
      `;
    });

    resultsContainer.innerHTML = `
      <!-- Rangkuman Hasil Kalkulasi -->
      <div class="calc-summary-card">
        <div class="summary-header">
          <div class="summary-title-wrap">
            <span class="summary-pill">Rangkuman Estimasi Jadwal</span>
            <h3 class="summary-heading">${escapeHtml(regimenName)}</h3>
          </div>
          <div class="summary-actions-bar no-print">
            <button type="button" class="btn btn-outline btn-print-schedule" data-action="print-pdf" title="Cetak atau Simpan sebagai PDF">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              <span>Cetak / Export PDF</span>
            </button>
            <button type="button" class="btn btn-primary btn-export-ics" data-action="export-ics" title="Unduh berkas kalender untuk Google Calendar, Apple Calendar, atau Outlook">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="M12 14v4"/><path d="M10 16h4"/></svg>
              <span>Simpan ke Kalender (.ics)</span>
            </button>
          </div>
        </div>

        <!-- Metrics Grid -->
        <div class="summary-metrics-grid">
          <div class="metric-box">
            <span class="metric-label">Jumlah Siklus</span>
            <span class="metric-val">${state.totalCycles} Siklus</span>
            <span class="metric-sub">Interval ${state.intervalDays} Hari</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Tanggal Siklus Pertama</span>
            <span class="metric-val">${escapeHtml(firstCycle.dateFormatted)}</span>
            <span class="metric-sub">Hari ${firstCycle.dayName}</span>
          </div>
          <div class="metric-box highlight">
            <span class="metric-label">Perkiraan Siklus Terakhir</span>
            <span class="metric-val text-primary">${escapeHtml(lastCycle.dateFormatted)}</span>
            <span class="metric-sub">Hari ${lastCycle.dayName}</span>
          </div>
          <div class="metric-box">
            <span class="metric-label">Total Estimasi Durasi</span>
            <span class="metric-val">${totalDurationDays} Hari</span>
            <span class="metric-sub">~${approxMonths} Bulan (${Math.round(totalDurationDays / 7)} Minggu)</span>
          </div>
        </div>

        ${state.userNotes ? `
          <div class="summary-user-notes">
            <div class="user-notes-header">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <strong>Catatan Khusus Pasien / Dokter DPJP:</strong>
            </div>
            <p>${escapeHtml(state.userNotes)}</p>
          </div>
        ` : ''}

        ${weekendNoticeHtml}

        <!-- Peringatan Medis Sesuai Standar Klinis -->
        <div class="calc-medical-disclaimer" role="alert">
          <p class="disclaimer-text">
            <svg class="svg-icon svg-icon-xs" style="vertical-align:-2px; margin-right:4px;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <strong>Catatan Medis:</strong> Estimasi ini sebagai alat bantu perencanaan mandiri. Pelaksanaan aktual disesuaikan dengan toleransi klinis dan evaluasi laboratorium pasien sebelum setiap siklus.
          </p>
        </div>
      </div>

      <!-- Tabel Breakdown Timeline Siklus -->
      <div class="calc-timeline-card">
        <div class="timeline-header">
          <h4>Rincian Jadwal Per Siklus (${state.totalCycles} Siklus)</h4>
        </div>

        <div class="calc-table-wrap">
          <table class="calc-schedule-table">
            <thead>
              <tr>
                <th style="width: 25%;">Siklus</th>
                <th style="width: 30%;">Hari & Tanggal</th>
                <th style="width: 20%;">Status Hari</th>
                <th style="width: 25%;" class="no-print">Penyesuaian Manual</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <!-- Tombol Aksi Bawah -->
        <div class="timeline-footer-actions no-print">
          <button type="button" class="btn btn-outline" data-action="reset-all-overrides">
            Reset Semua Penyesuaian Manual
          </button>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button type="button" class="btn btn-outline" data-action="print-pdf">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
              <span>Cetak Jadwal PDF</span>
            </button>
            <button type="button" class="btn btn-primary" data-action="export-ics">
              <svg class="svg-icon svg-icon-sm" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              <span>Unduh Kalender (.ics)</span>
            </button>
          </div>
        </div>
      </div>
    `;

    resultsContainer.style.display = 'block';
  }

  function renderEmptyState(msg = 'Pilih protokol regimen dan tentukan tanggal siklus pertama di formulir atas untuk melihat estimasi jadwal.') {
    const resultsContainer = document.getElementById('calcResultsArea');
    if (!resultsContainer) return;

    resultsContainer.innerHTML = `
      <div class="calc-empty-card">
        <div class="empty-icon-box">
          <svg class="svg-icon svg-icon-xl" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/></svg>
        </div>
        <h4>Belum Ada Perhitungan Jadwal</h4>
        <p class="empty-desc">${escapeHtml(msg)}</p>
      </div>
    `;
    resultsContainer.style.display = 'block';
  }

  /**
   * Ekspor berkas Kalender (.ics) RFC 5545
   */
  function exportToIcs() {
    if (!state.calculatedSchedule || state.calculatedSchedule.length === 0) {
      alert('Silakan lakukan perhitungan jadwal terlebih dahulu.');
      return;
    }

    const regimenName = state.selectedRegimen?.nama_regimen || 'Kemoterapi';
    const cleanRegimen = regimenName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//RSUD Prof. Dr. Margono Soekarjo//Kalkulator Kemoterapi Wijayakusuma//ID',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Jadwal Kemoterapi - ' + regimenName,
      'X-WR-TIMEZONE:Asia/Jakarta'
    ];

    state.calculatedSchedule.forEach(item => {
      const d = item.dateObj;
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dt = String(d.getDate()).padStart(2, '0');

      // Waktu acara: Mulai 08:00 WIB sampai 13:00 WIB (Durasi 5 Jam)
      const dtStart = `${y}${m}${dt}T010000Z`; // UTC 01:00 = 08:00 WIB
      const dtEnd = `${y}${m}${dt}T060000Z`;   // UTC 06:00 = 13:00 WIB
      const uid = `kemo-${y}${m}${dt}-cycle${item.cycleNum}@rsud-margono.go.id`;

      const summary = `Kemoterapi Siklus ${item.cycleNum}/${state.totalCycles} - ${regimenName}`;
      let description = `Estimasi Jadwal Kemoterapi Siklus ${item.cycleNum} dari ${state.totalCycles}.\n\n` +
        `Protokol: ${regimenName}\n` +
        `Interval: ${state.intervalDays} Hari\n` +
        `Lokasi: Ruang Wijaya Kusuma / Unit Onkologi Terpadu RSUD Prof. Dr. Margono Soekarjo\n`;

      if (state.userNotes) {
        description += `Catatan Tambahan: ${state.userNotes}\n`;
      }

      description += `\nPERINGATAN MEDIS: Jadwal ini merupakan estimasi awal dan wajib dikonfirmasikan dengan dokter spesialis penanggung jawab Anda sebelum pelaksanaan.`;

      // Format RFC 5545 newline escaping
      const escapedDesc = description.replace(/\n/g, '\\n');

      icsContent.push('BEGIN:VEVENT');
      icsContent.push('UID:' + uid);
      icsContent.push('DTSTAMP:' + nowIso);
      icsContent.push('DTSTART:' + dtStart);
      icsContent.push('DTEND:' + dtEnd);
      icsContent.push('SUMMARY:' + summary);
      icsContent.push('DESCRIPTION:' + escapedDesc);
      icsContent.push('LOCATION:Ruang Wijaya Kusuma, Gedung Onkologi Terpadu RSUD Margono Soekarjo, Purwokerto');
      icsContent.push('STATUS:CONFIRMED');

      // Alarm / Pengingat H-1 (24 Jam sebelum tindakan) jam 08:00 pagi
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-P1D');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push('DESCRIPTION:Pengingat: Jadwal Kemoterapi Siklus ' + item.cycleNum + ' Besok di Ruang Wijaya Kusuma');
      icsContent.push('END:VALARM');

      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const icsString = icsContent.join('\r\n');
    const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jadwal_kemoterapi_${cleanRegimen}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Render Dokumen Cetak / PDF Resmi (Kop Surat RSUD Margono & Ruang Wijayakusuma)
   */
  function renderPrintDocument() {
    const printDoc = document.getElementById('kemoPrintDoc');
    if (!printDoc) return;

    if (!state.calculatedSchedule || state.calculatedSchedule.length === 0) {
      printDoc.innerHTML = '';
      return;
    }

    const firstCycle = state.calculatedSchedule[0];
    const lastCycle = state.calculatedSchedule[state.calculatedSchedule.length - 1];
    const totalDurationDays = Math.round((lastCycle.dateObj - firstCycle.dateObj) / (1000 * 60 * 60 * 24));
    const regimenName = state.selectedRegimen?.nama_regimen || 'Regimen Kemoterapi Kustom';
    const regimenDesc = state.selectedRegimen?.deskripsi || 'Protokol kemoterapi onkologi standar.';
    const today = new Date();
    const printedAt = formatDateIndo(today, true) + ' pukul ' + String(today.getHours()).padStart(2, '0') + ':' + String(today.getMinutes()).padStart(2, '0') + ' WIB';

    let tableRowsHtml = '';
    state.calculatedSchedule.forEach(item => {
      const statusBadge = item.isWeekend
        ? `<span class="print-weekend-tag">Akhir Pekan (${item.dayName})</span>`
        : `<span class="print-weekday-tag">Hari Kerja (${item.dayName})</span>`;

      const adjustedNote = item.isOverridden ? ' <small style="color:#0284c7;font-weight:600;">(Disesuaikan Manual)</small>' : '';

      tableRowsHtml += `
        <tr>
          <td style="text-align: center; font-weight: 700;">${item.cycleNum}</td>
          <td><strong>${escapeHtml(item.cycleLabel)}</strong>${adjustedNote}</td>
          <td><strong>${escapeHtml(item.dateFormatted)}</strong></td>
          <td>${statusBadge}</td>
          <td style="min-width: 130px; border-bottom: 1px dotted #9ca3af;">&nbsp;</td>
        </tr>
      `;
    });

    const userNotesHtml = state.userNotes ? `
      <div class="print-user-notes-row">
        <strong>Catatan Khusus Pasien / Dokter DPJP:</strong> ${escapeHtml(state.userNotes)}
      </div>
    ` : '';

    printDoc.innerHTML = `
      <!-- Kop Surat Resmi RSUD Margono Soekarjo -->
      <div class="print-kop-header">
        <img src="assets/images/logo-jateng.svg" alt="Logo Jawa Tengah" class="print-kop-logo">
        <div class="print-kop-text">
          <h3>PEMERINTAH PROVINSI JAWA TENGAH</h3>
          <h2>RSUD PROF. DR. MARGONO SOEKARJO PURWOKERTO</h2>
          <h4>UNIT ONKOLOGI TERPADU • RUANG WIJAYAKUSUMA</h4>
          <p>Jl. Dr. Gumbreg No. 1, Purwokerto Selatan, Kab. Banyumas, Jawa Tengah 53146 | Telp: (0281) 632708</p>
        </div>
      </div>
      <div class="print-kop-divider"></div>

      <!-- Judul Dokumen -->
      <div class="print-title-box">
        <h1 class="print-doc-title">LEMBAR PERENCANAAN JADWAL KEMOTERAPI</h1>
        <p class="print-doc-sub">Panduan Siklus Terapi & Pengawasan Kontrol Pasien Rawat Inap / Day Care</p>
      </div>

      <!-- Ringkasan Parameter Regimen -->
      <div class="print-meta-grid">
        <div class="print-meta-col">
          <table>
            <tr>
              <td class="print-meta-label">Protokol / Regimen</td>
              <td style="width: 10px;">:</td>
              <td class="print-meta-val">${escapeHtml(regimenName)}</td>
            </tr>
            <tr>
              <td class="print-meta-label">Indikasi Terapi</td>
              <td>:</td>
              <td>${escapeHtml(regimenDesc)}</td>
            </tr>
            <tr>
              <td class="print-meta-label">Rencana Siklus</td>
              <td>:</td>
              <td class="print-meta-val">${state.totalCycles} Siklus (Interval Tiap ${state.intervalDays} Hari)</td>
            </tr>
          </table>
        </div>
        <div class="print-meta-col">
          <table>
            <tr>
              <td class="print-meta-label">Siklus Pertama (Ke-1)</td>
              <td style="width: 10px;">:</td>
              <td class="print-meta-val">${escapeHtml(firstCycle.dateFormatted)}</td>
            </tr>
            <tr>
              <td class="print-meta-label">Estimasi Siklus Akhir</td>
              <td>:</td>
              <td class="print-meta-val">${escapeHtml(lastCycle.dateFormatted)} (~${totalDurationDays} Hari)</td>
            </tr>
            <tr>
              <td class="print-meta-label">Waktu Dokumen Dicetak</td>
              <td>:</td>
              <td>${printedAt}</td>
            </tr>
          </table>
        </div>
        ${userNotesHtml}
      </div>

      <!-- Tabel Rincian Siklus -->
      <table class="print-schedule-table">
        <thead>
          <tr>
            <th style="width: 8%; text-align: center;">No</th>
            <th style="width: 26%;">Siklus Terapi</th>
            <th style="width: 28%;">Hari & Tanggal Rencana</th>
            <th style="width: 18%;">Status Operasional</th>
            <th style="width: 20%; text-align: center;">Paraf Petugas / Realisasi</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>

      <!-- Petunjuk Pasien -->
      <div class="print-guidelines-box">
        <h5>Instruksi Penting Bagi Pasien & Keluarga Pendamping:</h5>
        <ul>
          <li><strong>Pemeriksaan Darah Pendukung:</strong> Pasien wajib melakukan pemeriksaan laboratorium (Darah Lengkap & Fungsi Organ) H-2 atau H-1 sebelum setiap siklus terapi.</li>
          <li><strong>Jadwal Akhir Pekan:</strong> Jika tanggal jatuh pada hari Sabtu/Minggu, harap berkoordinasi dengan perawat/DPJP untuk penyesuaian jadwal ke hari kerja terdekat.</li>
          <li><strong>Toleransi Klinis:</strong> Pelaksanaan aktual dapat disesuaikan oleh dokter penanggung jawab (DPJP) bergantung pada hasil laboratorium dan kondisi fisik pasien.</li>
          <li><strong>Bawa Dokumen:</strong> Harap selalu membawa lembar jadwal kemoterapi ini setiap kali kontrol dan administrasi di Ruang Wijayakusuma.</li>
        </ul>
      </div>

      <!-- Area Tanda Tangan Resmi -->
      <div class="print-signature-row">
        <div class="print-sign-col">
          <p style="margin: 0 0 4px 0;">Mengetahui,</p>
          <p style="margin: 0; font-weight: 600;">Pasien / Keluarga Pendamping</p>
          <div class="print-sign-spacer"></div>
          <div class="print-sign-line"></div>
          <p style="margin: 4px 0 0 0; font-size: 8pt; color: #6b7280;">Nama Jelas & Tanda Tangan</p>
        </div>
        <div class="print-sign-col">
          <p style="margin: 0 0 4px 0;">Purwokerto, ${escapeHtml(formatDateIndo(today, false))}</p>
          <p style="margin: 0; font-weight: 600;">Dokter DPJP / Petugas Onkologi</p>
          <div class="print-sign-spacer"></div>
          <div class="print-sign-line"></div>
          <p style="margin: 4px 0 0 0; font-size: 8pt; color: #6b7280;">NIP / SIP & Tanda Tangan</p>
        </div>
      </div>

      <div class="print-doc-footer">
        Dokumen ini diterbitkan secara digital melalui Portal Asisten Virtual Wijayakusuma RSUD Prof. Dr. Margono Soekarjo • Dicetak mandiri untuk keperluan edukasi dan koordinasi terapi
      </div>
    `;
  }

  /**
   * Fungsi Cetak / Export PDF via Dialog Browser Print
   */
  function printSchedule() {
    if (!state.calculatedSchedule || state.calculatedSchedule.length === 0) {
      alert('Silakan tentukan parameter dan hitung jadwal terlebih dahulu sebelum mencetak.');
      return;
    }
    renderPrintDocument();

    // Sembunyikan secara eksplisit seluruh launcher, bubble chat, dan elemen mengambang
    const floatingElements = document.querySelectorAll(
      '.wa-floating-launcher, .portal-simulator-bubble, #portalSimulatorBubble, #waCircleBtn, #waBadgeLauncher, .wa-modal-overlay, .admin-toast-container'
    );
    const prevStyles = [];
    floatingElements.forEach(el => {
      prevStyles.push({ el, display: el.style.display, visibility: el.style.visibility });
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
    });

    document.body.classList.add('is-printing-pdf');

    // Ubah title sementara ke format nama dokumen resmi agar nama berkas PDF bersih tanpa URL/domain
    const originalTitle = document.title;
    document.title = 'Jadwal-Perencanaan-Kemoterapi-RSUD-Margono';

    const restoreAfterPrint = () => {
      document.title = originalTitle;
      document.body.classList.remove('is-printing-pdf');
      floatingElements.forEach((item, idx) => {
        if (prevStyles[idx]) {
          item.el.style.display = prevStyles[idx].display;
          item.el.style.visibility = prevStyles[idx].visibility;
        }
      });
      window.removeEventListener('afterprint', restoreAfterPrint);
    };

    window.addEventListener('afterprint', restoreAfterPrint, { once: true });
    setTimeout(restoreAfterPrint, 3000);

    window.print();
  }

  /**
   * Inisialisasi Event Delegation untuk Komponen Kalkulator
   */
  function bindEvents() {
    // Dropdown Regimen Change
    const selectEl = document.getElementById('calcRegimenSelect');
    selectEl?.addEventListener('change', (e) => {
      handleRegimenSelected(e.target.value);
    });

    // Date Input & Number Inputs Change
    const dateInput = document.getElementById('calcStartDateInput');
    const intervalInput = document.getElementById('calcIntervalInput');
    const siklusInput = document.getElementById('calcSiklusInput');
    const notesInput = document.getElementById('calcCatatanInput');

    [dateInput, intervalInput, siklusInput, notesInput].forEach(el => {
      el?.addEventListener('input', () => {
        calculateSchedule();
      });
    });

    // Tombol Hitung
    const calcBtn = document.getElementById('btnCalculateSchedule');
    calcBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      calculateSchedule();
      const resultsContainer = document.getElementById('calcResultsArea');
      resultsContainer?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    // Tombol Reset
    const resetBtn = document.getElementById('btnResetSchedule');
    resetBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      state.overrides = {};
      state.userNotes = '';
      if (notesInput) notesInput.value = '';
      const today = new Date();
      if (dateInput) dateInput.value = formatIsoDate(today);
      if (selectEl && state.regimens.length > 0) {
        selectEl.value = state.regimens[0].id;
        handleRegimenSelected(state.regimens[0].id);
      }
      calculateSchedule();
    });

    // Event Delegation Terpusat untuk Kontainer Hasil Kalkulasi
    document.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      if (!target) return;

      const action = target.getAttribute('data-action');
      if (action === 'print-pdf') {
        e.preventDefault();
        printSchedule();
      } else if (action === 'export-ics') {
        e.preventDefault();
        exportToIcs();
      } else if (action === 'reset-cycle-override') {
        e.preventDefault();
        const cycleNum = target.getAttribute('data-cycle');
        if (cycleNum) {
          delete state.overrides[cycleNum];
          calculateSchedule();
        }
      } else if (action === 'reset-all-overrides') {
        e.preventDefault();
        state.overrides = {};
        calculateSchedule();
      } else if (action === 'cascade-cycle-delay') {
        e.preventDefault();
        const cycleNum = parseInt(target.getAttribute('data-cycle'), 10);
        if (!isNaN(cycleNum) && state.calculatedSchedule.length >= cycleNum) {
          // Tambahkan 7 hari ke siklus ini dan seluruh siklus berikutnya
          for (let i = cycleNum; i <= state.totalCycles; i++) {
            const currentItem = state.calculatedSchedule[i - 1];
            if (currentItem && currentItem.dateObj) {
              const newDate = addDays(currentItem.dateObj, 7);
              state.overrides[i] = formatIsoDate(newDate);
            }
          }
          calculateSchedule();
        }
      }
    });

    // Event Listener untuk Perubahan Tanggal Manual pada Tabel
    document.addEventListener('change', (e) => {
      if (e.target && e.target.matches('[data-action="override-cycle-date"]')) {
        const cycleNum = e.target.getAttribute('data-cycle');
        const newDateStr = e.target.value;
        if (cycleNum && newDateStr) {
          state.overrides[cycleNum] = newDateStr;
          calculateSchedule();
        }
      }
    });

    // Tangani Routing Hash Navigation (e.g. #/kalkulator or #kalkulator)
    window.addEventListener('hashchange', checkHashRoute);
    window.addEventListener('DOMContentLoaded', checkHashRoute);
  }

  function checkHashRoute() {
    const hash = window.location.hash.toLowerCase();
    const kalkulatorSection = document.getElementById('kalkulatorSection');
    const katalogSection = document.getElementById('katalogObatSection');
    const navLink = document.getElementById('navKalkulatorLink');
    const mobileNavLink = document.getElementById('mobileNavKalkulatorLink');
    const landingSections = document.querySelectorAll(
      '#home, #about, #services, #stories, #facilities, #chatbot, #contact'
    );

    if (hash === '#/kalkulator' || hash === '#kalkulator') {
      if (kalkulatorSection) {
        kalkulatorSection.style.display = 'block';
      }
      if (katalogSection) {
        katalogSection.style.display = 'none';
      }
      landingSections.forEach(sec => {
        if (sec) sec.style.display = 'none';
      });

      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.mobile-nav-item').forEach(l => l.classList.remove('active'));
      document.getElementById('navServicesDropdown')?.classList.add('active');
      navLink?.classList.add('active');
      mobileNavLink?.classList.add('active');

      // Refresh data regimen dari server/proxy saat membuka kalkulator
      fetchRegimens();

      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (hash.startsWith('#/obat') || hash.startsWith('#obat')) {
      if (kalkulatorSection) {
        kalkulatorSection.style.display = 'none';
      }
      navLink?.classList.remove('active');
      mobileNavLink?.classList.remove('active');
    } else {
      if (kalkulatorSection) {
        kalkulatorSection.style.display = 'none';
      }
      navLink?.classList.remove('active');
      mobileNavLink?.classList.remove('active');
    }
  }

  /**
   * Inisialisasi Modul Kalkulator Kemoterapi
   */
  function init() {
    const dateInput = document.getElementById('calcStartDateInput');
    if (dateInput && !dateInput.value) {
      dateInput.value = formatIsoDate(new Date());
      state.startDate = dateInput.value;
    }

    bindEvents();
    fetchRegimens();
  }

  // Ekspor API publik ke window
  window.ChemoCalculator = {
    init,
    fetchRegimens,
    calculateSchedule,
    exportToIcs,
    printSchedule,
    getState: () => state
  };

  // Jalankan saat DOM siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
