/**
 * MSU Traffic & Campus Life - Main Application Controller (Season 1)
 * ควบคุม 5 แท็บหลัก (Home, Map, Rank, Chat, Profile), Socket.io, และระบบรายงานด่าน
 */

class MSUApp {
  constructor() {
    this.currentTab = 'map';
    this.reports = [];
    this.zones = [];
    this.socket = null;
    this.activeFilter = 'all';
    this.searchQuery = '';
  }

  async init() {
    console.log('🚀 Initializing MSU Traffic & Campus Life (Season 1)...');

    // 0. Initialize Dark / Light Theme
    this.initTheme();

    // 1. Initialize Socket.io
    this.initSocket();

    // 2. Initialize Sub-modules
    if (window.mapManager) window.mapManager.init();
    if (window.rankManager) window.rankManager.init();
    if (window.chatManager) window.chatManager.init();
    if (window.securityGatekeeper) window.securityGatekeeper.init();

    // 3. Load Data in parallel
    await Promise.all([
      this.loadReports(),
      this.loadZones(),
      this.loadStats()
    ]);

    // 4. Bind DOM Events
    this.bindEvents();
    this.updateAuthUI();

    // Start on Map tab as default
    this.switchTab('map');
  }

  // ----------------------------------------------------
  // 🌙 Dark / Light Mode System
  // ----------------------------------------------------
  initTheme() {
    const savedTheme = localStorage.getItem('msu_theme') || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    this.setTheme(savedTheme, false);

    // Auto-listen to system preference if user hasn't explicitly chosen
    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('msu_theme')) {
          this.setTheme(e.matches ? 'dark' : 'light', false);
        }
      });
    }
  }

  toggleTheme() {
    const current = (document.documentElement.getAttribute('data-theme') === 'dark' || document.body.classList.contains('dark-theme')) ? 'dark' : 'light';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    this.setTheme(nextTheme, true);
    if (this.showNotification) {
      this.showNotification(nextTheme === 'dark' ? '🌙 เปิดใช้งานโหมดมืด (Dark Mode)' : '☀️ เปิดใช้งานโหมดสว่าง (Light Mode)', 'info');
    }
  }

  setTheme(theme, save = true) {
    const isDark = theme === 'dark';
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
      document.body.classList.add('dark-theme');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      document.body.classList.remove('dark-theme');
    }

    if (save) {
      localStorage.setItem('msu_theme', theme);
    }

    // Update Nav Toggle Button UI
    const navBtn = document.getElementById('navThemeToggleBtn');
    if (navBtn) {
      const icon = navBtn.querySelector('.theme-toggle-icon');
      const text = navBtn.querySelector('.theme-toggle-text');
      if (icon) icon.textContent = isDark ? '☀️' : '🌙';
      if (text) text.textContent = isDark ? 'โหมดสว่าง' : 'โหมดมืด';
      navBtn.setAttribute('title', isDark ? 'เปลี่ยนเป็นโหมดสว่าง (Light Mode)' : 'เปลี่ยนเป็นโหมดมืด (Dark Mode)');
    }

    // Update Profile Modal Theme Item UI
    const profileIcon = document.getElementById('profileThemeIcon');
    const profileVal = document.getElementById('profileThemeValue');
    if (profileIcon) profileIcon.textContent = isDark ? '☀️' : '🌙';
    if (profileVal) profileVal.textContent = isDark ? 'โหมดมืด (เปิดอยู่)' : 'โหมดสว่าง (เปิดอยู่)';

    // Update Map tiles if mapManager exists
    if (window.mapManager && typeof window.mapManager.setTheme === 'function') {
      window.mapManager.setTheme(theme);
    }
  }

  // ----------------------------------------------------
  // 🔄 5-Tab Navigation Controller
  // ----------------------------------------------------
  switchTab(tabName) {
    if (tabName === 'profile') {
      this.openProfileModal();
      return;
    }

    if (tabName === 'chat') {
      if (window.chatManager) {
        window.chatManager.toggleChatPopup();
      }
      return;
    }

    this.currentTab = tabName;

    // 1. Toggle Tab Views
    document.querySelectorAll('.tab-view').forEach(view => {
      view.classList.remove('active');
    });

    const targetId = `view${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
    const targetView = document.getElementById(targetId);
    if (targetView) {
      targetView.classList.add('active');
    }

    // 2. Toggle Bottom Nav Items
    document.querySelectorAll('.bottom-nav-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // 3. Special actions per tab
    if (tabName === 'map') {
      setTimeout(() => {
        if (window.mapManager) window.mapManager.forceResize();
      }, 100);
    } else if (tabName === 'rank') {
      if (window.rankManager) {
        window.rankManager.loadWeeklyRank();
        window.rankManager.loadMyStats();
      }
    } else if (tabName === 'chat') {
      if (window.chatManager) {
        window.chatManager.checkGeofence();
        window.chatManager.scrollToBottom();
      }
    } else if (tabName === 'profile') {
      if (window.rankManager) window.rankManager.loadMyStats();
    }
  }

  // ----------------------------------------------------
  // ⚡ Socket.io Real-time Event Controller
  // ----------------------------------------------------
  initSocket() {
    try {
      this.socket = io();

      this.socket.on('connect', () => {
        console.log('⚡ Connected to MSU Traffic WebSocket Server');
      });

      this.socket.on('new_report', (newReport) => {
        this.handleNewReportEvent(newReport);
      });

      this.socket.on('report_updated', (updatedReport) => {
        this.handleReportUpdatedEvent(updatedReport);
      });

      this.socket.on('report_deleted', (deletedId) => {
        this.handleReportDeletedEvent(deletedId);
      });

      this.socket.on('stats_update', (stats) => {
        this.updateStatsUI(stats);
      });

      // 📍 Pin Live Chat Real-time Handlers
      this.socket.on('pin_chat_new', (data) => {
        this.handlePinChatNewMessage(data);
      });

      this.socket.on('pin_chat_count_update', (data) => {
        this.handlePinChatCountUpdate(data);
      });

      // Pass socket to managers
      if (window.rankManager) window.rankManager.bindSocketEvents(this.socket);
      if (window.chatManager) window.chatManager.bindSocketEvents(this.socket);

    } catch (e) {
      console.warn('Socket.io connection warning:', e);
    }
  }

  // ----------------------------------------------------
  // 📦 Data Loaders
  // ----------------------------------------------------
  async loadReports() {
    try {
      const res = await fetch('/api/reports');
      const data = await res.json();
      if (data.success && data.data) {
        this.reports = data.data;
        this.renderReportsList();
        if (window.mapManager) window.mapManager.renderReports(this.reports);
        this.updateTicker();
      }
    } catch (err) {
      console.error('Error loading reports:', err);
    }
  }

  async loadZones() {
    try {
      const res = await fetch('/api/zones');
      const data = await res.json();
      if (data.success && data.data) {
        this.zones = data.data;
        this.renderZoneOptions();
      }
    } catch (err) {
      console.error('Error loading zones:', err);
    }
  }

  async loadStats() {
    try {
      const res = await fetch('/api/reports/stats');
      const data = await res.json();
      if (data.success && data.data) {
        this.updateStatsUI(data.data);
      }
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  }

  updateStatsUI(stats) {
    if (!stats) return;
    const elActive = document.getElementById('homeStatActive');
    const elToday = document.getElementById('homeStatToday');
    const elCleared = document.getElementById('homeStatCleared');

    if (elActive) elActive.textContent = stats.active || 0;
    if (elToday) elToday.textContent = stats.today || 0;
    if (elCleared) elCleared.textContent = stats.cleared || 0;
  }

  renderZoneOptions() {
    const select = document.getElementById('reportPresetZone');
    if (!select) return;
    select.innerHTML = '<option value="">-- เลือกจุดยอดนิยม หรือ ระบุเองด้านล่าง --</option>' +
      this.zones.map(z => `<option value="${z.id}" data-lat="${z.lat}" data-lng="${z.lng}" data-campus="${z.campus}">${z.name}</option>`).join('');
  }

  // ----------------------------------------------------
  // 📋 Render Feed Cards (Map tab & Home tab)
  // ----------------------------------------------------
  renderReportsList() {
    const container = document.getElementById('feedListContainer');
    if (!container) return;

    let filtered = this.reports.filter(r => r.status !== 'deleted');

    if (this.activeFilter !== 'all') {
      filtered = filtered.filter(r => r.type === this.activeFilter);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(r =>
        (r.title && r.title.toLowerCase().includes(q)) ||
        (r.locationName && r.locationName.toLowerCase().includes(q)) ||
        (r.direction && r.direction.toLowerCase().includes(q)) ||
        (r.description && r.description.toLowerCase().includes(q))
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: #94A3B8;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🛵</div>
          <div style="font-weight: 700; color: #475569;">ไม่มีรายงานด่านในขณะนี้</div>
          <div style="font-size: 0.78rem;">รอบ ม.มหาสารคาม การจราจรปกติ สัญจรปลอดภัยครับ</div>
        </div>
      `;
      return;
    }

    container.innerHTML = filtered.map(rep => this.buildReportCardHtml(rep)).join('');

    // Attach card click -> Focus Map Marker
    container.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-vote') || e.target.closest('.btn-like')) return;
        const id = card.dataset.id;
        window.mapManager.focusReport(id);
      });
    });
  }

  formatTimeInfo(createdAt, expiresAt, status) {
    const now = Date.now();

    // 1. เวลาตอนโพสต์ (Exact time + relative time)
    let postTimeStr = 'เมื่อสักครู่';
    if (createdAt) {
      const d = new Date(createdAt);
      const hours = String(d.getHours()).padStart(2, '0');
      const mins = String(d.getMinutes()).padStart(2, '0');
      const exactTime = `${hours}:${mins} น.`;

      const diffSec = Math.floor((now - createdAt) / 1000);
      let agoStr = 'เมื่อสักครู่';
      if (diffSec >= 60 && diffSec < 3600) {
        agoStr = `${Math.floor(diffSec / 60)} นาทีที่แล้ว`;
      } else if (diffSec >= 3600 && diffSec < 86400) {
        agoStr = `${Math.floor(diffSec / 3600)} ชม. ที่แล้ว`;
      } else if (diffSec >= 86400) {
        agoStr = `${Math.floor(diffSec / 86400)} วันที่แล้ว`;
      }
      postTimeStr = `${exactTime} (${agoStr})`;
    }

    // 2. จะหายไปอีกในกี่ ชม. / นาที (Auto-expiration countdown)
    let expireStr = '';
    let isExpiringSoon = false;

    if (status === 'cleared') {
      expireStr = '✅ ยกเลิกด่านแล้ว';
    } else if (expiresAt) {
      const remainingMs = expiresAt - now;
      if (remainingMs <= 0) {
        expireStr = '⏳ กำลังจะหมดอายุ/หายไป';
        isExpiringSoon = true;
      } else if (remainingMs < 3600000) {
        const minsLeft = Math.max(1, Math.ceil(remainingMs / 60000));
        expireStr = `⏳ จะหายไปในอีก ${minsLeft} นาที`;
        isExpiringSoon = true;
      } else {
        const hrsLeft = Math.floor(remainingMs / 3600000);
        const minsLeft = Math.floor((remainingMs % 3600000) / 60000);
        if (minsLeft > 0) {
          expireStr = `⏳ จะหายไปในอีก ${hrsLeft} ชม. ${minsLeft} นาที`;
        } else {
          expireStr = `⏳ จะหายไปในอีก ${hrsLeft} ชม.`;
        }
      }
    } else {
      expireStr = '⏳ จะหายไปในอีก 6 ชม.';
    }

    return { postTimeStr, expireStr, isExpiringSoon };
  }

  buildReportCardHtml(rep) {
    const currentUserId = window.authManager?.getUser()?.id;
    const currentUserEmail = window.authManager?.getUser()?.email;
    const isDev = window.authManager?.isDev();

    const isAuthor = currentUserId && (rep.reporterId === currentUserId || rep.reporter?.email === currentUserEmail);
    const canDelete = isDev || isAuthor;

    const timeInfo = this.formatTimeInfo(rep.createdAt, rep.expiresAt, rep.status);
    const typeName = this.getTypeName(rep.type);
    const icon = window.mapManager ? window.mapManager.getTypeIcon(rep.type) : '📍';
    const isCleared = rep.status === 'cleared';

    const upVotes = rep.votes?.up?.length || 0;
    const downVotes = rep.votes?.down?.length || 0;
    const hasUpVoted = currentUserId && rep.votes?.up?.includes(currentUserId);
    const hasDownVoted = currentUserId && rep.votes?.down?.includes(currentUserId);
    const likesCount = rep.likes?.length || 0;
    const hasLiked = currentUserId && rep.likes?.includes(currentUserId);

    const isAnnouncement = rep.isAnnouncement || rep.reporter?.isAnnouncement || rep.reporter?.name === 'MSU Traffic';
    const isDevPost = rep.reporter?.isDev || rep.reporter?.email === 'java5263@gmail.com';
    const isMsuStudent = rep.reporter?.isMsuStudent || (rep.reporter?.email && rep.reporter.email.endsWith('@msu.ac.th'));

    let badgeHtml = '<span class="badge-member">👤 Member</span>';
    if (isAnnouncement) badgeHtml = '<span class="badge-official">📢 ประกาศทางการ MSU Traffic</span>';
    else if (isDevPost) badgeHtml = '<span class="badge-dev">👑 DEV</span>';
    else if (isMsuStudent) badgeHtml = '<span class="badge-msu">🎓 MSU</span>';

    return `
      <div class="report-card ${isAnnouncement ? 'card-announcement-official' : ''} ${isCleared ? 'card-cleared' : ''}" data-id="${rep.id}">
        ${isAnnouncement ? `
          <div class="announcement-card-banner">
            <span class="announcement-banner-icon">📢</span>
            <span class="announcement-banner-text">ประกาศแจ้งเตือนทางการจากผู้พัฒนา / ทีมงาน MSU Traffic</span>
          </div>
        ` : ''}
        <div class="card-header">
          <span class="card-type-tag ${isAnnouncement ? 'tag-announcement' : `tag-${rep.type}`}">
            <span>${isAnnouncement ? '📢' : icon}</span> ${isAnnouncement ? 'ประกาศแจ้งเตือน' : typeName}
          </span>
          <div class="card-time-group">
            <span class="card-post-time">🕒 โพสต์เมื่อ ${timeInfo.postTimeStr}</span>
            <span class="card-expire-pill ${timeInfo.isExpiringSoon ? 'expire-soon' : ''}">${timeInfo.expireStr}</span>
          </div>
        </div>

        <div>
          <div class="card-location-title">${rep.title || rep.locationName}</div>
          <div class="card-zone-badge">📍 ${rep.campusZone || 'มมส'}</div>
        </div>

        ${rep.direction ? `<div class="card-direction">🧭 ${rep.direction}</div>` : ''}
        ${rep.description ? `<div class="card-desc ${isAnnouncement ? 'desc-announcement' : ''}">${rep.description}</div>` : ''}

        <div class="card-footer">
          <div class="card-reporter">
            <img class="reporter-avatar" src="${rep.reporter?.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'}" alt="avatar">
            <span style="font-weight: 600;">${isAnnouncement ? 'MSU Traffic' : (rep.reporter?.name || 'นิสิต มมส')}</span>
            ${badgeHtml}
          </div>

          <div class="card-actions">
            <!-- Pin Live Chat Button -->
            <button class="btn-action-pill pill-chat" onclick="window.app.openPinChat('${rep.id}', event)" title="ห้องแชทประจำจุดนี้">
              <span class="pill-icon">💬</span>
              <span class="pill-label">แชท</span>
              <span class="pill-count">${rep.chatCount || 0}</span>
            </button>
            <!-- Like Button -->
            <button class="btn-action-pill pill-like ${hasLiked ? 'active' : ''}" onclick="window.app.likeReport('${rep.id}', event)" title="รับทราบ / ถูกใจประกาศ">
              <span class="pill-icon">❤️</span>
              <span class="pill-count">${likesCount}</span>
            </button>
            ${!isAnnouncement ? `
              <!-- Upvote -->
              <button class="btn-action-pill pill-upvote ${hasUpVoted ? 'active' : ''}" onclick="window.app.vote('${rep.id}', 'up', event)" title="ยืนยันว่ายังมีด่าน">
                <span class="pill-icon">🛡️</span>
                <span class="pill-label">ยังมีด่าน</span>
                <span class="pill-count">${upVotes}</span>
              </button>
              <!-- Downvote -->
              <button class="btn-action-pill pill-downvote ${hasDownVoted ? 'active' : ''}" onclick="window.app.vote('${rep.id}', 'down', event)" title="แจ้งว่าด่านยกแล้ว">
                <span class="pill-icon">✨</span>
                <span class="pill-label">ยกแล้ว</span>
                <span class="pill-count">${downVotes}</span>
              </button>
              <!-- Report Button -->
              <button class="btn-action-pill pill-report" onclick="window.app.openPinReportModal('${rep.id}', event)" title="รายงานหมุดไม่ถูกต้อง / หมุดเท็จ">
                <span class="pill-icon">🚩</span>
              </button>
            ` : ''}
            ${canDelete ? `
              <button class="btn-action-pill pill-delete" title="ลบประกาศนี้" onclick="window.app.deleteReport('${rep.id}', event)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  getTypeName(type) {
    switch (type) {
      case 'helmet': return 'ด่านหมวก/ใบขับขี่';
      case 'alcohol': return 'ด่านเป่าแอล';
      case 'security': return 'ตรวจค้นความมั่นคง';
      case 'traffic': return 'รถติดสะสม';
      case 'accident': return 'อุบัติเหตุ';
      default: return 'รายงานจราจร';
    }
  }

  updateTicker() {
    const ticker = document.getElementById('homeTickerText');
    if (!ticker) return;

    const activeList = this.reports.filter(r => r.status === 'active');
    if (activeList.length > 0) {
      const latest = activeList[0];
      const timeAgo = window.mapManager ? window.mapManager.formatTimeAgo(latest.createdAt) : '';
      ticker.innerHTML = `<strong>ล่าสุด:</strong> ${latest.locationName} (${latest.direction || 'รอบ มมส'}) - <em>${timeAgo}</em>`;
    } else {
      ticker.innerHTML = `<strong>สถานะปัจจุบัน:</strong> รอบ มมส การจราจรปกติ ไม่มีรายงานด่าน`;
    }
  }

  // ----------------------------------------------------
  // ⚡ Realtime Event Handlers
  // ----------------------------------------------------
  handleNewReportEvent(newReport, isLocal = false) {
    if (!newReport || !newReport.id) return;

    // Check if already exists in memory
    const idx = this.reports.findIndex(r => r.id === newReport.id);
    if (idx !== -1) {
      this.reports[idx] = newReport;
    } else {
      this.reports.unshift(newReport);
    }

    this.renderReportsList();

    if (window.mapManager) {
      window.mapManager.renderReports(this.reports);
      window.mapManager.focusReport(newReport.id);
    }

    this.updateTicker();

    if (!isLocal) {
      this.showNotification(`🚨 ด่านใหม่: ${newReport.locationName || newReport.title}`, 'alert');
    }
  }

  handleReportUpdatedEvent(updatedReport) {
    const idx = this.reports.findIndex(r => r.id === updatedReport.id);
    if (idx !== -1) {
      this.reports[idx] = updatedReport;
      this.renderReportsList();
      if (window.mapManager) window.mapManager.renderReports(this.reports);
    }
  }

  handleReportDeletedEvent(deletedId) {
    this.reports = this.reports.filter(r => r.id !== deletedId);
    this.renderReportsList();
    if (window.mapManager) {
      if (window.mapManager.map) {
        window.mapManager.map.closePopup();
      }
      window.mapManager.renderReports(this.reports);
    }
    this.updateTicker();
  }

  // ----------------------------------------------------
  // 🔘 Report, Vote & Like Handlers
  // ----------------------------------------------------
  async handleReportSubmit(e) {
    e.preventDefault();

    if (!window.authManager.isLoggedIn()) {
      this.closeReportModal();
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบด้วย Google หรือ @msu.ac.th ก่อนส่งรายงานด่าน');
      return;
    }

    const type = document.querySelector('input[name="checkpointType"]:checked')?.value;
    const presetSelect = document.getElementById('reportPresetZone');
    const customLoc = document.getElementById('reportCustomLocation')?.value.trim();
    const lat = document.getElementById('reportLat')?.value;
    const lng = document.getElementById('reportLng')?.value;
    const direction = document.getElementById('reportDirection')?.value.trim();
    const description = document.getElementById('reportDescription')?.value.trim();
    const campusZone = document.getElementById('reportCampusZone')?.value;
    const isAnonymous = document.getElementById('reportIsAnonymous')?.checked || false;

    let locationName = '';
    if (customLoc) {
      locationName = customLoc;
    } else if (presetSelect && presetSelect.selectedIndex > 0) {
      locationName = presetSelect.options[presetSelect.selectedIndex].text;
    } else {
      locationName = 'พิกัดที่ระบุบนแผนที่ มมส';
    }

    if (!type) {
      alert('กรุณาเลือกประเภทด่านหรือเหตุการณ์');
      return;
    }

    if (!lat || !lng) {
      alert('กรุณาระบุพิกัดสถานที่ หรือเลือกจุดยอดนิยม');
      return;
    }

    // ⚖️ ตรวจสอบการยอมรับข้อตกลงการใช้งาน & พ.ร.บ. คอมพิวเตอร์
    const agreeTerms = document.getElementById('reportAgreeTerms')?.checked;
    if (!agreeTerms) {
      alert('⚠️ กรุณากดยินยอมและยอมรับข้อตกลงการใช้งาน & คำเตือน พ.ร.บ. คอมพิวเตอร์ ก่อนโพสต์รายงานด่าน');
      return;
    }

    const lifespanHours = document.getElementById('reportLifespanHours')?.value || 6;
    const isAnnouncement = document.getElementById('reportIsAnnouncement')?.checked || false;

    const payload = {
      type,
      locationName,
      customLocation: customLoc,
      campusZone,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      direction,
      description,
      lifespanHours: parseFloat(lifespanHours),
      isAnonymous,
      isAnnouncement
    };

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        this.closeReportModal();
        this.showNotification('🎉 บันทึกรายงานด่านสำเร็จแล้ว (+5 EXP)', 'success');
        document.getElementById('reportForm')?.reset();
        document.getElementById('reportLat').value = '';
        document.getElementById('reportLng').value = '';

        // ลบหมุดชั่วคราวสำหรับเลือกพิกัดออก
        if (window.mapManager && window.mapManager.reportMarker) {
          window.mapManager.map.removeLayer(window.mapManager.reportMarker);
          window.mapManager.reportMarker = null;
        }

        // 🚀 อัปเดตขึ้นหน้าจอและแผนที่ทันทีแบบเรียลไทม์ โดยไม่ต้องรอรีเฟรชหน้าเว็บ
        if (data.data) {
          this.handleNewReportEvent(data.data, true);
        }
      } else {
        alert(data.error || data.message || 'เกิดข้อผิดพลาดในการส่งรายงาน');
      }
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  }

  async vote(reportId, voteType, event) {
    if (event) event.stopPropagation();

    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบก่อนกดโหวตยืนยันด่าน');
      return;
    }

    try {
      const res = await fetch(`/api/reports/${reportId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify({ voteType })
      });

      const data = await res.json();
      if (data.success && data.data) {
        this.handleReportUpdatedEvent(data.data);
        this.showNotification(data.message, 'info');
      }
    } catch (err) {
      console.error('Error voting:', err);
    }
  }

  async likeReport(reportId, event) {
    if (event) event.stopPropagation();

    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบก่อนกดไลก์');
      return;
    }

    try {
      const res = await fetch(`/api/reports/${reportId}/like`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        }
      });
      const data = await res.json();
      if (data.success && data.data) {
        this.handleReportUpdatedEvent(data.data);
      }
    } catch (e) {
      console.error('Error liking report:', e);
    }
  }

  async deleteReport(reportId, event) {
    if (event) {
      if (event.preventDefault) event.preventDefault();
      if (event.stopPropagation) event.stopPropagation();
    }
    if (!confirm('คุณต้องการลบรายงานด่านนี้ใช่หรือไม่?')) return;

    // 🚀 1. ปิด Popup และลบหมุดออกจากหน้าจอทันที 0.0 วินาที
    if (window.mapManager && window.mapManager.map) {
      window.mapManager.map.closePopup();
    }
    this.handleReportDeletedEvent(reportId);
    this.showNotification('ลบรายงานเรียบร้อยแล้ว', 'info');

    // 🚀 2. ยิงคำสั่งลบไปยังเซิร์ฟเวอร์
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (window.authManager && typeof window.authManager.getAuthHeader === 'function') {
        Object.assign(headers, window.authManager.getAuthHeader());
      }
      await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: headers
      });
    } catch (err) {
      console.warn('Delete request error:', err);
    }
  }

  // ----------------------------------------------------
  // 🪟 Modals & UI Helpers
  // ----------------------------------------------------
  openReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.add('active');

    // Default lat/lng to MSU center if empty
    const latInput = document.getElementById('reportLat');
    const lngInput = document.getElementById('reportLng');
    if (latInput && !latInput.value) latInput.value = '16.2467';
    if (lngInput && !lngInput.value) lngInput.value = '103.2520';

    // Toggle Announcement option: ONLY for Dev/Admin
    const isDev = window.authManager?.isDev();
    const annBox = document.getElementById('reportAnnouncementBox');
    if (annBox) {
      annBox.style.display = isDev ? 'flex' : 'none';
    }
    const annToggle = document.getElementById('reportIsAnnouncement');
    if (annToggle) annToggle.checked = false;
  }

  closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.remove('active');
    const annToggle = document.getElementById('reportIsAnnouncement');
    if (annToggle) annToggle.checked = false;
  }

  openDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) modal.classList.add('active');
  }

  closeDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) modal.classList.remove('active');
  }

  openLegalModal() {
    const modal = document.getElementById('legalModal');
    if (modal) modal.classList.add('active');
  }

  closeLegalModal() {
    const modal = document.getElementById('legalModal');
    if (modal) modal.classList.remove('active');
  }

  // 🚩 Pin Report Modal Actions
  openPinReportModal(pinId, event) {
    if (event) event.stopPropagation();

    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบก่อนทำการรายงานหมุด');
      return;
    }

    const modal = document.getElementById('pinReportModal');
    const targetInput = document.getElementById('reportTargetPinId');
    if (targetInput) targetInput.value = pinId;

    if (modal) modal.classList.add('active');
  }

  closePinReportModal() {
    const modal = document.getElementById('pinReportModal');
    if (modal) modal.classList.remove('active');
    const detailsInput = document.getElementById('pinReportDetails');
    if (detailsInput) detailsInput.value = '';
  }

  async submitPinReport() {
    const pinId = document.getElementById('reportTargetPinId')?.value;
    const reasonSelect = document.getElementById('pinReportReason');
    const detailsInput = document.getElementById('pinReportDetails');

    if (!pinId) {
      alert('ไม่พบรหัสหมุดที่ต้องการรายงาน');
      return;
    }

    const reason = reasonSelect ? reasonSelect.value : 'หมุดเท็จ / ไม่มีด่านจริง';
    const details = detailsInput ? detailsInput.value.trim() : '';

    try {
      const res = await fetch(`/api/reports/${pinId}/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify({ reason, details })
      });

      const data = await res.json();
      if (data.success) {
        this.closePinReportModal();
        this.showNotification('🚩 ส่งรายงานสำเร็จแล้ว ขอบคุณที่ช่วยดูแลชุมชน', 'success');
        if (data.data) {
          this.handleReportUpdatedEvent(data.data);
        }
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการส่งรายงาน');
      }
    } catch (err) {
      console.error('Error reporting pin:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  openProfileModal() {
    const user = window.authManager?.getUser();
    if (!user) {
      window.authManager?.openLoginModal('กรุณาเข้าสู่ระบบก่อนดูโปรไฟล์');
      return;
    }

    const modal = document.getElementById('profileModal');
    if (!modal) return;

    const avatarElem = document.getElementById('profileUserAvatar');
    const nameElem = document.getElementById('profileUserName');
    const emailElem = document.getElementById('profileUserEmail');
    const badgeElem = document.getElementById('profileUserBadge');
    const rankBadgeElem = document.getElementById('profileUserRankBadge');
    const trustScoreVal = document.getElementById('profileTrustScoreVal');
    const trustBar = document.getElementById('profileTrustBar');
    const trustStatus = document.getElementById('profileTrustStatus');

    if (avatarElem) avatarElem.src = user.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name || 'MSU')}&background=2563EB&color=fff`;
    if (nameElem) nameElem.textContent = user.name || 'ผู้ใช้งาน มมส';
    if (emailElem) emailElem.textContent = user.email || '';

    const isDev = window.authManager.isDev();
    const isRider = user.isRider === true || user.role === 'rider' || (user.badge && user.badge.includes('RIDER'));
    const isMsu = user.email && user.email.endsWith('@msu.ac.th');
    let badgeHtml = '<span class="badge-pill badge-member">👤 Member</span>';
    if (isDev) badgeHtml = '<span class="badge-pill badge-dev">👑 DEV</span>';
    else if (isRider) badgeHtml = '<span class="badge-pill badge-rider">🛵 RIDER</span>';
    else if (isMsu) badgeHtml = '<span class="badge-pill badge-msu">🎓 MSU</span>';

    if (badgeElem) badgeElem.innerHTML = badgeHtml;

    const devBtn = document.getElementById('profileDevPanelBtn');
    if (devBtn) devBtn.style.display = isDev ? 'flex' : 'none';

    // ปุ่มขอสิทธิ์ RIDER
    const riderBtn = document.getElementById('profileRiderRequestBtn');
    if (riderBtn) {
      if (isDev || isRider) {
        riderBtn.style.display = 'none';
      } else {
        riderBtn.style.display = 'flex';
      }
    }

    if (rankBadgeElem && window.rankManager) {
      rankBadgeElem.innerHTML = window.rankManager.getRankBadgeHtml(user.rank, 'md');
    }

    const trust = user.trustScore !== undefined ? user.trustScore : 50;
    if (trustScoreVal) trustScoreVal.textContent = trust;
    if (trustBar) trustBar.style.width = `${Math.max(5, Math.min(100, trust))}%`;
    if (trustStatus) {
      if (trust >= 80) trustStatus.innerHTML = '<span style="color: #059669; font-weight: 700;">🟢 น่าเชื่อถือสูง (High Trust)</span>';
      else if (trust >= 40) trustStatus.innerHTML = '<span style="color: #2563EB; font-weight: 700;">🔵 ปานกลาง (Standard Verified)</span>';
      else trustStatus.innerHTML = '<span style="color: #DC2626; font-weight: 700;">🔴 ต้องตรวจสอบ (Low Trust)</span>';
    }

    modal.classList.add('active');
  }

  closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('active');
  }

  openRiderRequestModal() {
    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบก่อนยื่นขอสิทธิ์ RIDER');
      return;
    }
    this.closeProfileModal();
    const modal = document.getElementById('riderRequestModal');
    if (modal) modal.classList.add('active');
  }

  closeRiderRequestModal() {
    const modal = document.getElementById('riderRequestModal');
    if (modal) modal.classList.remove('active');
  }

  async handleRiderRequestSubmit(event) {
    if (event) event.preventDefault();
    const platform = document.getElementById('riderReqPlatform')?.value || 'Grab';
    const phone = document.getElementById('riderReqPhone')?.value || '';
    const note = document.getElementById('riderReqNote')?.value || '';

    try {
      const res = await fetch('/api/chat/rider/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify({ platform, phone, note })
      });

      const data = await res.json();
      if (data.success) {
        this.closeRiderRequestModal();
        this.showNotification('🛵 ยื่นคำขอสิทธิ์ RIDER สำเร็จแล้ว รอแอดมินตรวจสอบ', 'success');
        alert('✅ ยื่นคำขอสิทธิ์ป้าย 🛵 RIDER เรียบร้อยแล้ว!\n\nแอดมินหรือผู้พัฒนา (Dev) จะตรวจสอบและอนุมัติสิทธิ์ให้ท่านเพื่อเปิดสิทธิ์การส่งข้อความในห้องแชทครับ');
      } else {
        alert(data.error || 'ไม่สามารถส่งคำขอได้');
      }
    } catch (err) {
      console.error('Rider request error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  // ----------------------------------------------------
  // 💬 Checkpoint Pin Live Chat Room Controller
  // ----------------------------------------------------
  async openPinChat(pinId, event) {
    if (event) event.stopPropagation();

    this.currentChatPinId = pinId;
    const modal = document.getElementById('pinChatModal');
    if (!modal) return;

    const isDev = window.authManager?.isDev();
    const pinAnnouncementLabel = document.getElementById('pinChatAnnouncementLabel');
    if (pinAnnouncementLabel) {
      pinAnnouncementLabel.style.display = isDev ? 'inline-flex' : 'none';
    }

    // Find pin details from reports list
    const pin = this.reports.find(r => r.id === pinId);
    if (pin) {
      const typeIcon = window.mapManager ? window.mapManager.getTypeIcon(pin.type) : '🚨';
      const isCleared = pin.status === 'cleared';

      const elIcon = document.getElementById('pinChatTypeIcon');
      const elTitle = document.getElementById('pinChatTitle');
      const elSub = document.getElementById('pinChatSubtitle');

      if (elIcon) elIcon.textContent = typeIcon;
      if (elTitle) elTitle.textContent = pin.title || pin.locationName || 'ห้องแชทสดประจำจุดตรวจ';
      if (elSub) {
        elSub.innerHTML = `
          <span>📍 ${pin.campusZone || 'มมส'}</span> • 
          <span style="color: ${isCleared ? '#059669' : '#EF4444'}; font-weight: 700;">
            ${isCleared ? '✅ ยกแล้ว' : '🚨 ยังมีด่าน'}
          </span>
        `;
      }
    }

    modal.classList.add('active');
    await this.loadPinChat(pinId);
  }

  closePinChat() {
    const modal = document.getElementById('pinChatModal');
    if (modal) modal.classList.remove('active');
    this.currentChatPinId = null;
  }

  async loadPinChat(pinId) {
    const container = document.getElementById('pinChatMessagesContainer');
    if (!container) return;

    container.innerHTML = `
      <div style="text-align: center; padding: 2rem; color: #94A3B8; font-size: 0.8rem;">
        <span class="loading-spinner">⏳</span> กำลังโหลดข้อความสด...
      </div>
    `;

    try {
      const res = await fetch(`/api/reports/${pinId}/chat`);
      const data = await res.json();
      if (data.success) {
        this.renderPinChatMessages(data.data || []);
      } else {
        container.innerHTML = `<div style="text-align: center; color: #EF4444; padding: 1.5rem; font-size: 0.8rem;">${data.error || 'ไม่สามารถโหลดข้อความได้'}</div>`;
      }
    } catch (err) {
      console.error('Error loading pin chat:', err);
      container.innerHTML = `<div style="text-align: center; color: #EF4444; padding: 1.5rem; font-size: 0.8rem;">เกิดข้อผิดพลาดในการเชื่อมต่อ</div>`;
    }
  }

  renderPinChatMessages(messages) {
    const container = document.getElementById('pinChatMessagesContainer');
    if (!container) return;

    if (!messages || messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem 1rem; color: #94A3B8;">
          <div style="font-size: 2.2rem; margin-bottom: 0.4rem;">💬</div>
          <div style="font-weight: 700; color: #475569; font-size: 0.85rem;">ยังไม่มีข้อความในจุดตรวจนี้</div>
          <div style="font-size: 0.72rem;">เป็นคนแรกที่ส่งข้อมูลอัปเดตสภาพจราจรเพื่อรับ +3 EXP 🎖️</div>
        </div>
      `;
      return;
    }

    const currentUserId = window.authManager?.getUser()?.id;
    container.innerHTML = messages.map(msg => this.buildPinChatMessageHtml(msg, currentUserId)).join('');
    container.scrollTop = container.scrollHeight;
  }

  buildPinChatMessageHtml(msg, currentUserId) {
    const isSelf = currentUserId && (msg.senderId === currentUserId || (window.authManager?.getUser()?.email && msg.senderEmail === window.authManager.getUser().email));
    const timeStr = new Date(msg.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const rankBadgeHtml = window.rankManager ? window.rankManager.getRankBadgeHtml(msg.senderRank, 'xs') : '';
    const isAnnouncement = msg.isAnnouncement || msg.senderBadge?.includes('ประกาศ') || msg.senderName === 'MSU Traffic';

    let badgeClass = 'badge-member';
    let badgeText = msg.senderBadge || '👤 สมาชิก';
    if (isAnnouncement) {
      badgeClass = 'badge-announcement';
      badgeText = '📢 ประกาศทางการ';
    } else if (msg.senderBadge?.includes('DEV')) {
      badgeClass = 'badge-dev';
      badgeText = '👑 DEVELOPER';
    } else if (msg.senderBadge?.includes('MSU')) {
      badgeClass = 'badge-msu';
      badgeText = '🎓 นิสิต มมส';
    }

    const avatarUrl = isAnnouncement 
      ? 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=120&auto=format&fit=crop&q=80'
      : (msg.senderPicture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100');

    return `
      <div class="pin-msg-row ${isSelf && !isAnnouncement ? 'self' : ''} ${isAnnouncement ? 'pin-msg-announcement' : ''}" id="pin-msg-${msg.id}">
        <div class="pin-msg-avatar-wrap">
          <img class="pin-msg-avatar" src="${avatarUrl}" alt="avatar">
          ${isAnnouncement ? '<span class="pin-avatar-official-badge">✓</span>' : ''}
        </div>
        <div class="pin-msg-content">
          <div class="pin-msg-meta">
            <span class="pin-msg-name">${msg.senderName}</span>
            <span class="chat-badge ${badgeClass}">${badgeText}</span>
            ${rankBadgeHtml}
            <span class="pin-msg-header-time">${timeStr}</span>
          </div>
          <div class="pin-msg-bubble-box ${isAnnouncement ? 'pin-box-announcement' : ''}">
            ${isAnnouncement ? `
              <div class="pin-announcement-header">
                <span class="pin-announcement-icon">📢</span>
                <span class="pin-announcement-title">ประกาศทางการจาก MSU Traffic</span>
              </div>
            ` : ''}
            <div class="pin-msg-text">${this.escapeHtml(msg.text)}</div>
          </div>
          ${isSelf && !isAnnouncement ? `<div class="pin-msg-time">${timeStr} น.</div>` : ''}
        </div>
      </div>
    `;
  }

  insertQuickChat(text) {
    const input = document.getElementById('pinChatMessageInput');
    if (input) {
      input.value = text;
      input.focus();
    }
  }

  async sendPinChatMessage(event) {
    if (event) event.preventDefault();

    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบก่อนร่วมพูดคุยในห้องแชท');
      return;
    }

    if (!this.currentChatPinId) return;

    const input = document.getElementById('pinChatMessageInput');
    const anonToggle = document.getElementById('pinChatAnonToggle');
    const announcementToggle = document.getElementById('pinChatAnnouncementToggle');
    const sendBtn = document.getElementById('pinChatSendBtn');

    const text = input ? input.value.trim() : '';
    const isAnnouncement = announcementToggle ? announcementToggle.checked : false;
    const isAnonymous = isAnnouncement ? false : (anonToggle ? anonToggle.checked : false);

    if (!text) return;

    if (sendBtn) sendBtn.disabled = true;

    try {
      const res = await fetch(`/api/reports/${this.currentChatPinId}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify({
          text,
          isAnonymous,
          isAnnouncement
        })
      });

      const data = await res.json();
      if (data.success) {
        if (input) input.value = '';
        this.appendPinChatMessage(data.data);
        this.showNotification('🎉 ส่งข้อความสำเร็จ (+3 EXP 🎖️)', 'success');
      } else {
        alert(data.error || 'ไม่สามารถส่งข้อความได้');
      }
    } catch (err) {
      console.error('Error sending pin chat message:', err);
      alert('เกิดข้อผิดพลาดในการส่งข้อความ');
    } finally {
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  appendPinChatMessage(msg) {
    const container = document.getElementById('pinChatMessagesContainer');
    if (!container) return;

    // If empty placeholder is shown -> clear it
    if (container.querySelector('.pin-msg-row') === null) {
      container.innerHTML = '';
    }

    const currentUserId = window.authManager?.getUser()?.id;
    const html = this.buildPinChatMessageHtml(msg, currentUserId);
    container.insertAdjacentHTML('beforeend', html);
    container.scrollTop = container.scrollHeight;
  }

  handlePinChatNewMessage(data) {
    if (this.currentChatPinId && this.currentChatPinId === data.pinId) {
      const currentUserId = window.authManager?.getUser()?.id;
      // If not sent by current user (since sender already appended it)
      if (data.message.senderId !== currentUserId) {
        this.appendPinChatMessage(data.message);
      }
    }
  }

  handlePinChatCountUpdate(data) {
    const rep = this.reports.find(r => r.id === data.pinId);
    if (rep) {
      rep.chatCount = data.chatCount;
      // Re-render feed cards with updated counter
      this.renderReportsList();
      this.renderHomeFeedList();
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  updateAuthUI() {
    const container = document.getElementById('navAuthContainer');
    if (!container) return;

    const user = window.authManager.getUser();
    if (user) {
      const isDev = window.authManager.isDev();
      const isMsu = user.email && user.email.endsWith('@msu.ac.th');
      let badgeHtml = '<span class="badge-pill badge-member">👤 Member</span>';
      if (isDev) badgeHtml = '<span class="badge-pill badge-dev">👑 DEV</span>';
      else if (isMsu) badgeHtml = '<span class="badge-pill badge-msu">🎓 MSU</span>';

      container.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          ${isDev ? `
            <button class="btn-dev-panel-nav" onclick="window.devManager?.openModal()" title="เปิดศูนย์ควบคุม Developer (Ctrl+Shift+D)">
              <span>🛠️ Dev Panel</span>
            </button>
          ` : ''}
          <div class="nav-user-pill" onclick="window.app.openProfileModal()" title="คลิกเพื่อเปิดดูโปรไฟล์ของคุณ">
            <img src="${user.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'}" style="width: 26px; height: 26px; border-radius: 50%; object-fit: cover; border: 1.5px solid #2563EB;">
            <span class="nav-user-name" style="font-size: 0.78rem; font-weight: 700; max-width: 110px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHtml(user.name || 'โปรไฟล์')}</span>
            ${badgeHtml}
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="window.authManager.openLoginModal()">
          <span>🔑 เข้าสู่ระบบ</span>
        </button>
      `;
    }

    if (window.chatManager) {
      window.chatManager.updateDevClearBtn();
    }
  }

  openDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) modal.classList.add('active');
  }

  closeDonateModal() {
    const modal = document.getElementById('donateModal');
    if (modal) modal.classList.remove('active');
  }

  openLegalModal() {
    const modal = document.getElementById('legalNoticeModal');
    if (modal) modal.classList.add('active');
  }

  closeLegalModal() {
    const modal = document.getElementById('legalNoticeModal');
    if (modal) modal.classList.remove('active');
  }

  showNotification(msg, type = 'info') {

    const toast = document.createElement('div');
    toast.className = `app-toast toast-${type}`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  bindEvents() {
    // Preset zone select change
    const presetSelect = document.getElementById('reportPresetZone');
    if (presetSelect) {
      presetSelect.addEventListener('change', (e) => {
        const opt = e.target.options[e.target.selectedIndex];
        if (opt && opt.dataset.lat && opt.dataset.lng) {
          const lat = parseFloat(opt.dataset.lat);
          const lng = parseFloat(opt.dataset.lng);
          const latIn = document.getElementById('reportLat');
          const lngIn = document.getElementById('reportLng');
          const campusIn = document.getElementById('reportCampusZone');
          if (latIn) latIn.value = lat.toFixed(6);
          if (lngIn) lngIn.value = lng.toFixed(6);
          if (campusIn && opt.dataset.campus) {
            campusIn.value = opt.dataset.campus;
          }
          if (window.mapManager) {
            window.mapManager.setReportPin(lat, lng, opt.text);
          }
        }
      });
    }

    // Filter chips on Map view
    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.activeFilter = chip.dataset.type || 'all';
        this.renderReportsList();
      });
    });

    // Map Search Input
    const searchInput = document.getElementById('mapSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim();
        this.renderReportsList();
      });
    }

    // Direct Bindings for Donate & Legal Buttons
    const donateBtn = document.getElementById('navDonateBtn');
    if (donateBtn) {
      donateBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.openDonateModal();
      });
    }

    const legalBtn = document.getElementById('navLegalBtn');
    if (legalBtn) {
      legalBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.openLegalModal();
      });
    }
  }
}

// Global Shortcuts for reliable modal access
window.openDonateModal = function() {
  const modal = document.getElementById('donateModal');
  if (modal) {
    modal.classList.add('active');
  }
};

window.closeDonateModal = function() {
  const modal = document.getElementById('donateModal');
  if (modal) {
    modal.classList.remove('active');
  }
};

window.openLegalModal = function(isManual = true) {
  const modal = document.getElementById('legalNoticeModal');
  if (!modal) return;

  if (isManual) {
    // โหมดดูภายหลัง (กดจากปุ่ม กฎหมาย ใน nav)
    modal.classList.remove('mandatory-mode');
    modal.querySelector('.legal-close-btn').style.display = '';
    modal.querySelector('.legal-accept-btn').style.display = 'none';
    modal.querySelector('.legal-dismiss-btn').style.display = '';
  }
  modal.classList.add('active');
};

window.closeLegalModal = function() {
  const modal = document.getElementById('legalNoticeModal');
  if (modal) {
    modal.classList.remove('active');
    modal.classList.remove('mandatory-mode');
  }
};

// ⚖️ ฟังก์ชันยอมรับข้อกำหนด (บังคับครั้งแรก)
window.acceptLegalTerms = function() {
  localStorage.setItem('msu_legal_accepted', 'true');
  localStorage.setItem('msu_legal_accepted_at', new Date().toISOString());
  window.closeLegalModal();
  if (window.app) {
    window.app.showNotification('✅ ยอมรับข้อกำหนดเรียบร้อยแล้ว ยินดีต้อนรับสู่ MSU Traffic!', 'success');
  }
};

// ⚖️ ตรวจสอบและแสดง Legal Modal บังคับเมื่อเข้าเว็บครั้งแรก
window.checkFirstVisitLegal = function() {
  const accepted = localStorage.getItem('msu_legal_accepted');
  if (!accepted) {
    const modal = document.getElementById('legalNoticeModal');
    if (modal) {
      modal.classList.add('mandatory-mode');
      modal.querySelector('.legal-close-btn').style.display = 'none';
      modal.querySelector('.legal-accept-btn').style.display = '';
      modal.querySelector('.legal-dismiss-btn').style.display = 'none';
      modal.classList.add('active');
    }
  }
};

// ⭐ ระบบเปิด/ปิด Donate จาก Dev Settings (ใช้ localStorage)
window.checkDonateVisibility = function() {
  const donateEnabled = localStorage.getItem('msu_donate_enabled');
  const donateBtn = document.getElementById('navDonateBtn');
  if (donateBtn) {
    // ค่าเริ่มต้นคือเปิด (ถ้ายังไม่เคยตั้งค่า)
    if (donateEnabled === 'false') {
      donateBtn.style.display = 'none';
    } else {
      donateBtn.style.display = '';
    }
  }
};

window.app = new MSUApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();

  // ⚖️ ตรวจสอบการยอมรับข้อกำหนดเมื่อเข้าเว็บครั้งแรก
  window.checkFirstVisitLegal();

  // ⭐ ตรวจสอบการแสดงผลปุ่ม Donate
  window.checkDonateVisibility();
});
