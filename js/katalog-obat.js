/**
 * KATALOG-OBAT.JS - MODUL KATALOG OBAT KEMOTERAPI (FARMAPLUS STYLE)
 * Menampilkan daftar obat kemoterapi dan detail fasilitas ketersediaan.
 * 
 * Fitur & Keamanan:
 * - Debounce 300 ms pada pencarian teks
 * - AbortController untuk membatalkan request lama yang belum selesai
 * - sessionStorage caching (5 menit)
 * - Semua input dan respons server di-escape (XSS protection)
 * - Event delegation (tanpa atribut onclick inline)
 * - Hash routing (#/obat dan #/obat/:id) dengan dukungan tombol back browser
 */

(function (window, document) {
  'use strict';

  // ==========================================================================
  // 1. UTILITY & SECURITY HELPERS
  // ==========================================================================

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeHtmlWithNewlines(str) {
    return escapeHtml(str).replace(/\n/g, '<br>');
  }

  function formatRupiah(amount) {
    const num = Number(amount) || 0;
    return 'Rp ' + num.toLocaleString('id-ID');
  }

  function formatTanggalIndo(dateStr) {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return escapeHtml(dateStr);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    } catch (e) {
      return escapeHtml(dateStr);
    }
  }

  function normalizeWaNumber(phone) {
    if (!phone) return '';
    let clean = String(phone).replace(/\D/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    }
    return clean;
  }

  function getGoogleMapsUrl(alamat, namaFasilitas) {
    const query = encodeURIComponent([namaFasilitas, alamat].filter(Boolean).join(', '));
    return `https://www.google.com/maps/search/?api=1&query=${query}`;
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // ==========================================================================
  // 2. SESSION STORAGE CACHE (5 MENIT)
  // ==========================================================================

  const CACHE_PREFIX = 'boku_katalog_';
  const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Menit

  function getSessionCache(key) {
    try {
      const raw = sessionStorage.getItem(CACHE_PREFIX + key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() > parsed.exp) {
        sessionStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return parsed.data;
    } catch (e) {
      return null;
    }
  }

  function setSessionCache(key, data) {
    try {
      sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify({
        exp: Date.now() + CACHE_TTL_MS,
        data: data
      }));
    } catch (e) {}
  }

  // ==========================================================================
  // 3. KATALOG OBAT CONTROLLER CLASS
  // ==========================================================================

  class KatalogObatManager {
    constructor() {
      this.state = {
        q: '',
        bentuk: '',
        jenis: '',
        provinsi: '',
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 1,
        items: [],
        isLoading: false,
        activeDetailId: null,
        selectedFacilityIndex: 0
      };

      this.currentAbortController = null;
      this.dom = {};
      this.isInitialized = false;
    }

    init() {
      if (this.isInitialized) return;

      // Ambil elemen DOM
      this.dom.section = document.getElementById('katalogObatSection');
      this.dom.listView = document.getElementById('katalogListView');
      this.dom.detailView = document.getElementById('katalogDetailView');
      this.dom.cardsGrid = document.getElementById('katalogCardsGrid');
      this.dom.pagination = document.getElementById('katalogPagination');
      this.dom.resultCount = document.getElementById('katalogResultCount');
      this.dom.searchInput = document.getElementById('katalogSearchInput');
      this.dom.clearSearchBtn = document.getElementById('btnKatalogClearSearch');
      this.dom.filterBentuk = document.getElementById('filterBentuk');
      this.dom.filterJenis = document.getElementById('filterJenis');
      this.dom.filterProvinsi = document.getElementById('filterProvinsi');
      this.dom.btnResetFilter = document.getElementById('btnResetKatalogFilter');

      // Simpan referensi ke landing page sections
      this.landingSections = Array.from(document.querySelectorAll(
        '#home, #about, #services, #stories, #facilities, #chatbot, #contact'
      ));

      this.bindEvents();
      this.isInitialized = true;

      // Handle initial URL hash
      this.handleHashChange();
    }

    bindEvents() {
      // 1. Hash Routing
      window.addEventListener('hashchange', () => this.handleHashChange());

      // 2. Search Input dengan Debounce 300 ms
      const debouncedSearch = debounce((query) => {
        this.state.q = query.trim();
        this.state.page = 1;
        this.fetchList();
      }, 300);

      this.dom.searchInput?.addEventListener('input', (e) => {
        const val = e.target.value;
        if (this.dom.clearSearchBtn) {
          this.dom.clearSearchBtn.style.display = val ? 'flex' : 'none';
        }
        debouncedSearch(val);
      });

      this.dom.clearSearchBtn?.addEventListener('click', () => {
        if (this.dom.searchInput) this.dom.searchInput.value = '';
        if (this.dom.clearSearchBtn) this.dom.clearSearchBtn.style.display = 'none';
        this.state.q = '';
        this.state.page = 1;
        this.fetchList();
      });

      // 3. Dropdown Filters Change
      this.dom.filterBentuk?.addEventListener('change', (e) => {
        this.state.bentuk = e.target.value;
        this.state.page = 1;
        this.fetchList();
      });

      this.dom.filterJenis?.addEventListener('change', (e) => {
        this.state.jenis = e.target.value;
        this.state.page = 1;
        this.fetchList();
      });

      this.dom.filterProvinsi?.addEventListener('change', (e) => {
        this.state.provinsi = e.target.value;
        this.state.page = 1;
        this.fetchList();
      });

      // 4. Tombol Reset Filter
      this.dom.btnResetFilter?.addEventListener('click', () => {
        this.resetFilters();
      });

      // 5. Event Delegation untuk Kartu & Tombol Aksi
      this.dom.section?.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;

        const action = target.getAttribute('data-action');
        const id = target.getAttribute('data-id');

        if (action === 'view-detail') {
          e.preventDefault();
          if (id) {
            window.location.hash = `#/obat/${encodeURIComponent(id)}`;
          }
        } else if (action === 'back-to-list') {
          e.preventDefault();
          if (window.history.length > 1) {
            window.history.back();
          } else {
            window.location.hash = '#/obat';
          }
        } else if (action === 'reset-filter') {
          e.preventDefault();
          this.resetFilters();
        } else if (action === 'retry-fetch') {
          e.preventDefault();
          this.fetchList();
        } else if (action === 'retry-detail') {
          e.preventDefault();
          if (this.state.activeDetailId) {
            this.fetchDetail(this.state.activeDetailId);
          }
        } else if (action === 'copy-text') {
          e.preventDefault();
          const textToCopy = target.getAttribute('data-copy-text');
          if (textToCopy) {
            this.copyToClipboard(textToCopy, target);
          }
        } else if (action === 'select-facility') {
          e.preventDefault();
          const index = parseInt(target.getAttribute('data-index'), 10);
          if (!isNaN(index)) {
            this.switchFacilityTab(index);
          }
        } else if (action === 'load-more') {
          e.preventDefault();
          if (this.state.page < this.state.totalPages) {
            this.state.page++;
            this.fetchList(false, true); // append mode
          }
        }
      });
    }

    resetFilters() {
      this.state.q = '';
      this.state.bentuk = '';
      this.state.jenis = '';
      this.state.provinsi = '';
      this.state.page = 1;

      if (this.dom.searchInput) this.dom.searchInput.value = '';
      if (this.dom.clearSearchBtn) this.dom.clearSearchBtn.style.display = 'none';
      if (this.dom.filterBentuk) this.dom.filterBentuk.value = '';
      if (this.dom.filterJenis) this.dom.filterJenis.value = '';
      if (this.dom.filterProvinsi) this.dom.filterProvinsi.value = '';

      this.fetchList();
    }

    // ========================================================================
    // 4. HASH ROUTING & VIEW CONTROLLER
    // ========================================================================

    handleHashChange() {
      const hash = window.location.hash || '';

      if (hash.startsWith('#/obat')) {
        // Tampilkan section katalog obat
        this.showKatalogSection();

        const matchDetail = hash.match(/^#\/obat\/([^/?#]+)/);
        if (matchDetail) {
          const obatId = decodeURIComponent(matchDetail[1]);
          this.showDetailView(obatId);
        } else {
          this.showListView();
        }
      } else {
        // Kembali ke landing page utama
        this.hideKatalogSection();
      }
    }

    showKatalogSection() {
      if (this.dom.section) {
        this.dom.section.style.display = 'block';
      }

      const kalkulatorSection = document.getElementById('kalkulatorSection');
      if (kalkulatorSection) {
        kalkulatorSection.style.display = 'none';
      }

      // Sembunyikan bagian beranda agar katalog tampil sebagai halaman khusus yang bersih
      this.landingSections.forEach(sec => {
        if (sec) sec.style.display = 'none';
      });

      // Update Nav Link State
      document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
      document.getElementById('navServicesDropdown')?.classList.add('active');

      // Scroll ke bagian paling atas
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    hideKatalogSection() {
      if (this.dom.section) {
        this.dom.section.style.display = 'none';
      }

      // Kembalikan section landing page
      this.landingSections.forEach(sec => {
        if (sec) sec.style.display = '';
      });
    }

    showListView() {
      if (this.dom.listView) this.dom.listView.style.display = 'block';
      if (this.dom.detailView) this.dom.detailView.style.display = 'none';

      // Pastikan data dimuat
      if (this.state.items.length === 0) {
        this.fetchList();
      } else {
        this.renderList();
      }
    }

    showDetailView(id) {
      if (this.dom.listView) this.dom.listView.style.display = 'none';
      if (this.dom.detailView) this.dom.detailView.style.display = 'block';

      this.state.activeDetailId = id;
      this.state.selectedFacilityIndex = 0;
      this.fetchDetail(id);
    }

    // ========================================================================
    // 5. FETCH DATA & API INTEGRATION (DENGAN CACHE & ABORTCONTROLLER)
    // ========================================================================

    async fetchList(resetPage = false, isAppend = false) {
      if (resetPage) this.state.page = 1;

      const cacheKey = `list_${this.state.q}_${this.state.bentuk}_${this.state.jenis}_${this.state.provinsi}_p${this.state.page}`;
      const cached = getSessionCache(cacheKey);

      if (cached && !isAppend) {
        this.state.items = cached.items || [];
        this.state.total = cached.total || 0;
        this.state.totalPages = cached.totalPages || 1;
        this.renderList();
        return;
      }

      // Batalkan request yang masih berjalan
      if (this.currentAbortController) {
        this.currentAbortController.abort();
      }
      this.currentAbortController = new AbortController();

      if (!isAppend) {
        this.renderSkeleton();
      }

      try {
        const queryParams = new URLSearchParams({
          action: 'get_obat_list',
          q: this.state.q,
          bentuk: this.state.bentuk,
          jenis: this.state.jenis,
          provinsi: this.state.provinsi,
          page: String(this.state.page),
          pageSize: String(this.state.pageSize)
        });

        // Request ke proxy lokal server /api/gas/obat
        const res = await fetch(`/api/gas/obat?${queryParams.toString()}`, {
          signal: this.currentAbortController.signal,
          headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}: Gagal memuat data katalog`);
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || json.error || 'Respon data tidak valid dari server');
        }

        const newItems = json.data.items || [];
        if (isAppend) {
          this.state.items = this.state.items.concat(newItems);
        } else {
          this.state.items = newItems;
        }

        this.state.total = json.data.total || 0;
        this.state.totalPages = json.data.totalPages || 1;

        // Simpan ke sessionStorage
        setSessionCache(cacheKey, json.data);

        this.renderList();
      } catch (err) {
        if (err.name === 'AbortError') return; // Request dibatalkan secara normal
        this.renderError(err.message || 'Terjadi gangguan koneksi ke server.');
      }
    }

    async fetchDetail(id) {
      this.renderDetailSkeleton();

      const cacheKey = `detail_${id}`;
      const cached = getSessionCache(cacheKey);

      if (cached) {
        this.currentDetailData = cached;
        this.renderDetail(cached);
        return;
      }

      try {
        const res = await fetch(`/api/gas/obat/${encodeURIComponent(id)}`, {
          headers: { 'Accept': 'application/json' }
        });

        if (!res.ok) {
          throw new Error(`HTTP Error ${res.status}: Gagal memuat detail obat`);
        }

        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.message || json.error || 'Obat tidak ditemukan');
        }

        this.currentDetailData = json.data;
        setSessionCache(cacheKey, json.data);
        this.renderDetail(json.data);
      } catch (err) {
        this.renderDetailError(err.message || 'Obat tidak ditemukan atau belum ditayangkan.');
      }
    }

    // ========================================================================
    // 6. RENDERING LIST & KARTU FARMAPLUS
    // ========================================================================

    renderList() {
      if (!this.dom.cardsGrid) return;

      // Update info count
      if (this.dom.resultCount) {
        const filterApplied = this.state.q || this.state.bentuk || this.state.jenis || this.state.provinsi;
        this.dom.resultCount.innerHTML = filterApplied
          ? `Menampilkan <strong>${this.state.items.length}</strong> dari <strong>${this.state.total}</strong> obat ditemukan`
          : `Menampilkan seluruh katalog (<strong>${this.state.total}</strong> obat kemoterapi)`;
      }

      if (this.state.items.length === 0) {
        this.renderEmpty();
        if (this.dom.pagination) this.dom.pagination.innerHTML = '';
        return;
      }

      // Render Grid Kartu (2 Kolom di Desktop, 1 di Mobile)
      const htmlCards = this.state.items.map(item => {
        const isObatKeras = (item.golongan || '').toLowerCase().includes('keras');
        const badgeObatKerasHtml = isObatKeras
          ? `<span class="badge-obat-keras" title="Golongan Obat Keras - Wajib dengan resep dokter">
               <span class="badge-k-circle">K</span>
               <span class="badge-k-label">Obat Keras</span>
             </span>`
          : `<span class="badge-obat-bebas">${escapeHtml(item.golongan || 'Obat Bebas')}</span>`;

        const produsenText = item.nama_produsen 
          ? escapeHtml(item.nama_produsen) 
          : 'PRODUSEN TIDAK TERCANTUM';

        const kfaChipHtml = item.kode_kfa 
          ? `<span class="obat-chip chip-kfa"># KFA: ${escapeHtml(item.kode_kfa)}</span>`
          : '';

        const ringkasHtml = item.indikasi_ringkas
          ? `<p class="obat-summary-desc">${escapeHtml(item.indikasi_ringkas)}</p>`
          : '';

        const hargaFormatted = item.harga_termurah > 0
          ? formatRupiah(item.harga_termurah)
          : 'Hubungi Farmasi';

        const namaFasilitas = item.nama_fasilitas ? escapeHtml(item.nama_fasilitas) : 'Ruang Wijaya Kusuma RSMS';
        const provinsiFasilitas = item.provinsi ? escapeHtml(item.provinsi) : 'Jawa Tengah';
        const updatedAtText = formatTanggalIndo(item.updated_at);

        return `
          <article class="obat-card" data-action="view-detail" data-id="${escapeHtml(item.id)}" tabindex="0" role="button" aria-label="Lihat detail obat ${escapeHtml(item.nama_obat)}">
            <div class="obat-card-top">
              <div class="obat-produsen">${produsenText}</div>
              <h3 class="obat-name">${escapeHtml(item.nama_obat)}</h3>
              
              <div class="obat-chips-wrap">
                <span class="obat-chip chip-bentuk">${escapeHtml(item.bentuk_sediaan || 'Sediaan')}</span>
                <span class="obat-chip chip-jenis">${escapeHtml(item.jenis || 'Generik')}</span>
                ${kfaChipHtml}
                ${badgeObatKerasHtml}
              </div>

              ${ringkasHtml}
            </div>

            <div class="obat-card-bottom">
              <div class="obat-facility-strip">
                <div class="facility-meta">
                  <span class="facility-icon">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M3 21h18M5 21V7l8-4v18M13 21V3l6 3v15"/><path d="M9 9h1M9 13h1M9 17h1M15 9h1M15 13h1M15 17h1"/></svg>
                  </span>
                  <div class="facility-info">
                    <span class="facility-name">${namaFasilitas}</span>
                    <span class="facility-provinsi">${provinsiFasilitas}</span>
                  </div>
                </div>
                <div class="facility-price">
                  <span class="price-prefix">Harga</span>
                  <span class="price-value">${hargaFormatted}</span>
                </div>
              </div>

              <div class="obat-card-footer">
                <span class="obat-updated-at">Terakhir diperbarui: ${updatedAtText}</span>
                <span class="btn-detail-link">Lihat Detail →</span>
              </div>
            </div>
          </article>
        `;
      }).join('');

      this.dom.cardsGrid.innerHTML = htmlCards;

      // Render Pagination / Load More
      this.renderPaginationControls();
    }

    renderPaginationControls() {
      if (!this.dom.pagination) return;

      if (this.state.page < this.state.totalPages) {
        this.dom.pagination.innerHTML = `
          <div class="katalog-loadmore-wrap">
            <button type="button" class="btn btn-outline btn-load-more" data-action="load-more">
              Muat Lebih Banyak Obat (${this.state.items.length} dari ${this.state.total})
            </button>
          </div>
        `;
      } else {
        this.dom.pagination.innerHTML = `
          <div class="katalog-end-note">
            <span>Seluruh data obat telah ditampilkan (${this.state.total} obat).</span>
          </div>
        `;
      }
    }

    renderSkeleton() {
      if (!this.dom.cardsGrid) return;
      const skeletons = Array(4).fill(0).map(() => `
        <div class="katalog-skeleton-card">
          <div class="sk-line sk-produsen"></div>
          <div class="sk-line sk-title"></div>
          <div class="sk-line sk-title-short"></div>
          <div class="sk-chips-row">
            <div class="sk-chip"></div>
            <div class="sk-chip"></div>
            <div class="sk-chip"></div>
          </div>
          <div class="sk-line sk-desc"></div>
          <div class="sk-footer">
            <div class="sk-line sk-price"></div>
          </div>
        </div>
      `).join('');

      this.dom.cardsGrid.innerHTML = skeletons;
      if (this.dom.pagination) this.dom.pagination.innerHTML = '';
      if (this.dom.resultCount) this.dom.resultCount.textContent = 'Memuat katalog obat...';
    }

    renderEmpty() {
      if (!this.dom.cardsGrid) return;
      this.dom.cardsGrid.innerHTML = `
        <div class="katalog-empty-card">
          <div class="empty-icon-wrap">
            <svg class="svg-icon svg-icon-lg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
          </div>
          <h4>Obat Tidak Ditemukan</h4>
          <p>Tidak ada obat kemoterapi yang cocok dengan kriteria pencarian atau filter yang dipilih.</p>
          <div class="empty-actions">
            <button type="button" class="btn btn-primary btn-sm" data-action="reset-filter">
              Reset Semua Filter
            </button>
          </div>
        </div>
      `;
    }

    renderError(msg) {
      if (!this.dom.cardsGrid) return;
      this.dom.cardsGrid.innerHTML = `
        <div class="katalog-error-card">
          <div class="error-icon-wrap">
            <svg class="svg-icon svg-icon-md" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <h4>Gagal Memuat Katalog Obat</h4>
          <p>${escapeHtml(msg)}</p>
          <button type="button" class="btn btn-outline btn-sm" data-action="retry-fetch">
            Coba Lagi
          </button>
        </div>
      `;
    }

    // ========================================================================
    // 7. RENDERING DETAIL OBAT (FARMAPLUS DETAIL VIEW)
    // ========================================================================

    renderDetailSkeleton() {
      if (!this.dom.detailView) return;
      this.dom.detailView.innerHTML = `
        <div class="katalog-detail-skeleton">
          <div class="sk-line sk-btn-back"></div>
          <div class="sk-banner">
            <div class="sk-line sk-title"></div>
            <div class="sk-line sk-title-short"></div>
          </div>
          <div class="sk-detail-grid">
            <div class="sk-box sk-content"></div>
            <div class="sk-box sk-sidebar"></div>
          </div>
        </div>
      `;
    }

    renderDetailError(msg) {
      if (!this.dom.detailView) return;
      this.dom.detailView.innerHTML = `
        <div class="katalog-detail-container">
          <button type="button" class="btn btn-outline btn-back-katalog" data-action="back-to-list">
            ← Kembali ke Daftar Obat
          </button>
          <div class="katalog-error-card" style="margin-top:24px;">
            <h4>Obat Tidak Ditemukan</h4>
            <p>${escapeHtml(msg)}</p>
            <button type="button" class="btn btn-primary btn-sm" data-action="back-to-list">
              Kembali ke Katalog
            </button>
          </div>
        </div>
      `;
    }

    renderDetail(obat) {
      if (!this.dom.detailView) return;

      const isObatKeras = (obat.golongan || '').toLowerCase().includes('keras');
      const badgeObatKerasHtml = isObatKeras
        ? `<span class="badge-obat-keras" title="Golongan Obat Keras - Wajib dengan resep dokter">
             <span class="badge-k-circle">K</span>
             <span class="badge-k-label">Obat Keras</span>
           </span>`
        : `<span class="badge-obat-bebas">${escapeHtml(obat.golongan || 'Obat Bebas')}</span>`;

      const produsenText = obat.nama_produsen ? escapeHtml(obat.nama_produsen) : 'PRODUSEN TIDAK TERCANTUM';

      // Fasilitas List
      const fasilitas = obat.fasilitas || [];
      const selIdx = this.state.selectedFacilityIndex < fasilitas.length ? this.state.selectedFacilityIndex : 0;
      const selectedFas = fasilitas[selIdx] || null;

      let facilitySelectorHtml = '';
      if (fasilitas.length > 1) {
        facilitySelectorHtml = `
          <div class="facility-tabs-wrap">
            <span class="facility-tabs-label">Pilih Fasilitas (${fasilitas.length}):</span>
            <div class="facility-tabs-list">
              ${fasilitas.map((f, idx) => `
                <button type="button" class="facility-tab-btn ${idx === selIdx ? 'active' : ''}" data-action="select-facility" data-index="${idx}">
                  ${escapeHtml(f.nama_fasilitas)}
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }

      let facilityCardHtml = '';
      if (selectedFas) {
        const waClean = normalizeWaNumber(selectedFas.whatsapp);
        const gmapsUrl = getGoogleMapsUrl(selectedFas.alamat, selectedFas.nama_fasilitas);

        facilityCardHtml = `
          <div class="facility-active-card">
            <div class="facility-card-header">
              <span class="facility-provinsi-tag">${escapeHtml(selectedFas.provinsi || 'Jawa Tengah')}</span>
              <h4 class="facility-name-title">${escapeHtml(selectedFas.nama_fasilitas)}</h4>
              <div class="facility-main-price">
                <span class="price-lbl">Harga / Estimasi:</span>
                <span class="price-val">${formatRupiah(selectedFas.harga)}</span>
              </div>
            </div>

            <div class="facility-info-list">
              <!-- Alamat -->
              <div class="facility-info-item">
                <div class="info-icon">
                  <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                </div>
                <div class="info-content">
                  <div class="info-label">Alamat:</div>
                  <div class="info-value">${escapeHtml(selectedFas.alamat || 'Alamat tidak tersedia')}</div>
                  <div class="info-actions">
                    <button type="button" class="btn-copy-chip" data-action="copy-text" data-copy-text="${escapeHtml(selectedFas.alamat || '')}">
                      Salin Alamat
                    </button>
                    <a href="${gmapsUrl}" target="_blank" rel="noopener noreferrer" class="btn-map-link">
                      Lihat di Google Maps ↗
                    </a>
                  </div>
                </div>
              </div>

              <!-- Telepon -->
              ${selectedFas.telepon ? `
                <div class="facility-info-item">
                  <div class="info-icon">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                  </div>
                  <div class="info-content">
                    <div class="info-label">Telepon Farmasi:</div>
                    <div class="info-value"><strong>${escapeHtml(selectedFas.telepon)}</strong></div>
                    <button type="button" class="btn-copy-chip" data-action="copy-text" data-copy-text="${escapeHtml(selectedFas.telepon)}">
                      Salin Nomor
                    </button>
                  </div>
                </div>
              ` : ''}

              <!-- WhatsApp -->
              ${waClean ? `
                <div class="facility-info-item">
                  <div class="info-icon">
                    <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div class="info-content">
                    <div class="info-label">WhatsApp Farmasi:</div>
                    <div class="info-value"><strong>${escapeHtml(selectedFas.whatsapp)}</strong></div>
                    <a href="https://wa.me/${waClean}" target="_blank" rel="noopener noreferrer" class="btn btn-wa-chat">
                      <span>Chat WhatsApp Farmasi</span>
                    </a>
                  </div>
                </div>
              ` : ''}

              <!-- Terakhir Diperbarui -->
              <div class="facility-info-item updated-strip">
                <div class="info-content">
                  <span class="update-label">Terakhir Diperbarui:</span>
                  <span class="update-val">${formatTanggalIndo(selectedFas.tanggal_diperbarui)}</span>
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        facilityCardHtml = `
          <div class="facility-empty-box">
            <p>Belum ada data fasilitas ketersediaan obat yang terdaftar.</p>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-top:6px;">Silakan hubungi loket Instalasi Farmasi Ruang Wijaya Kusuma RSUD Margono.</p>
          </div>
        `;
      }

      this.dom.detailView.innerHTML = `
        <div class="katalog-detail-container">
          <!-- Tombol Kembali -->
          <div class="katalog-detail-nav">
            <button type="button" class="btn-back-katalog" data-action="back-to-list">
              <svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
              <span>Kembali ke Daftar Obat</span>
            </button>
          </div>

          <!-- Banner Judul Obat -->
          <div class="detail-hero-banner">
            <div class="detail-hero-meta">
              <div class="detail-produsen">${produsenText}</div>
              <h1 class="detail-nama-obat">${escapeHtml(obat.nama_obat)}</h1>
              
              <div class="obat-chips-wrap" style="margin-top:12px;">
                <span class="obat-chip chip-bentuk">${escapeHtml(obat.bentuk_sediaan || 'Sediaan')}</span>
                <span class="obat-chip chip-jenis">${escapeHtml(obat.jenis || 'Generik')}</span>
                ${obat.kode_kfa ? `<span class="obat-chip chip-kfa"># KFA: ${escapeHtml(obat.kode_kfa)}</span>` : ''}
                ${badgeObatKerasHtml}
              </div>

              ${obat.indikasi_ringkas ? `
                <div class="detail-highlight-indikasi">
                  <strong>Indikasi Ringkas:</strong> ${escapeHtml(obat.indikasi_ringkas)}
                </div>
              ` : ''}
            </div>
          </div>

          <!-- 2-Column Detail Grid (Desktop) -->
          <div class="katalog-detail-grid">
            
            <!-- Kolom Kiri: Informasi Medis Resmi -->
            <div class="detail-medical-col">
              
              <!-- Deskripsi Obat -->
              <section class="detail-section-card">
                <h3 class="section-card-title">
                  <span class="sec-icon"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></span> Deskripsi Obat
                </h3>
                <div class="section-card-content">
                  ${obat.deskripsi ? escapeHtmlWithNewlines(obat.deskripsi) : '<p class="text-muted">Tidak ada deskripsi rinci.</p>'}
                </div>
              </section>

              <!-- Indikasi Umum -->
              <section class="detail-section-card">
                <h3 class="section-card-title">
                  <span class="sec-icon"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span> Indikasi Umum
                </h3>
                <div class="section-card-content">
                  ${obat.indikasi_umum ? escapeHtmlWithNewlines(obat.indikasi_umum) : '<p class="text-muted">Belum ada keterangan indikasi umum.</p>'}
                </div>
              </section>

              <!-- Komposisi -->
              <section class="detail-section-card">
                <h3 class="section-card-title">
                  <span class="sec-icon"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M10 2v7.31L4.14 20.3a2 2 0 0 0 1.72 2.7h12.28a2 2 0 0 0 1.72-2.7L14 9.31V2"/></svg></span> Komposisi & Kandungan
                </h3>
                <div class="section-card-content">
                  ${obat.komposisi ? escapeHtmlWithNewlines(obat.komposisi) : '<p class="text-muted">Informasi komposisi tidak tersedia.</p>'}
                </div>
              </section>

              <!-- Peringatan Khusus -->
              <section class="detail-section-card warning-card">
                <h3 class="section-card-title warning-title">
                  <span class="sec-icon"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span> Peringatan Khusus
                </h3>
                <div class="section-card-content">
                  ${obat.peringatan ? escapeHtmlWithNewlines(obat.peringatan) : '<p class="text-muted">Gunakan sesuai anjuran dokter penanggung jawab pasien.</p>'}
                </div>
              </section>

              <!-- Efek Samping -->
              <section class="detail-section-card">
                <h3 class="section-card-title">
                  <span class="sec-icon"><svg class="svg-icon svg-icon-xs" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span> Efek Samping
                </h3>
                <div class="section-card-content">
                  ${obat.efek_samping ? escapeHtmlWithNewlines(obat.efek_samping) : '<p class="text-muted">Tidak ada catatan efek samping khusus.</p>'}
                </div>
              </section>

            </div>

            <!-- Kolom Kanan: Panel Fasilitas & Ketersediaan -->
            <div class="detail-facility-col">
              <div class="facility-sticky-box">
                <div class="facility-box-header">
                  <h3>Informasi Fasilitas & Ketersediaan</h3>
                  <p>Fasilitas farmasi penyedia obat kemoterapi resmi.</p>
                </div>

                ${facilitySelectorHtml}
                ${facilityCardHtml}
              </div>
            </div>

          </div>
        </div>
      `;
    }

    switchFacilityTab(index) {
      this.state.selectedFacilityIndex = index;
      if (this.currentDetailData) {
        this.renderDetail(this.currentDetailData);
      }
    }

    copyToClipboard(text, triggerEl) {
      if (!navigator.clipboard) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
          this.showCopyFeedback(triggerEl);
        } catch (err) {}
        document.body.removeChild(textarea);
        return;
      }

      navigator.clipboard.writeText(text).then(() => {
        this.showCopyFeedback(triggerEl);
      }).catch(() => {});
    }

    showCopyFeedback(el) {
      if (!el) return;
      const originalText = el.textContent;
      el.textContent = '✓ Tersalin!';
      el.classList.add('copied');
      setTimeout(() => {
        el.textContent = originalText;
        el.classList.remove('copied');
      }, 1800);
    }
  }

  // Inisialisasi Singleton
  window.katalogObat = new KatalogObatManager();

  document.addEventListener('DOMContentLoaded', () => {
    window.katalogObat.init();
  });

})(window, document);
