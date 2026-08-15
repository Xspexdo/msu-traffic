/**
 * MSU Traffic - Main Application Controller (Updated for Dev Mode & mapcn)
 */

class AppController {
  constructor() {
    this.socket = null;
    this.reports = [];
    this.zones = [];
    this.currentFilter = 'all';
    this.currentZone = 'all';
    this.searchQuery = '';
    this.soundEnabled = true;
    this.audioCtx = null;
    this.layoutMode = localStorage.getItem('msu_layout_mode') || 'layout-top-bottom'; // Default: Top Map / Bottom Feed
  }

  async init() {
    console.log('🚀 Initializing MSU Traffic Web App...');
    
    // Apply saved layout
    this.applyLayout(this.layoutMode);

    // 1. Init Map
    window.mapManager.initMap('msu-map');

    // 2. Setup Socket.io Realtime
    this.initSocket();

    // 3. Load initial data
    await Promise.all([
      this.loadReports(),
      this.loadZones(),
      this.loadStats()
    ]);

    // 4. Setup Event Listeners
    this.setupEventListeners();

    // 5. Update Auth UI
    this.updateAuthUI();

    console.log('✅ MSU Traffic is ready!');
  }

  // Toggle Layout (แมพบน-ฟีดล่าง vs แมพขวา-ฟีดซ้าย)
  toggleLayout() {
    this.layoutMode = (this.layoutMode === 'layout-top-bottom') ? 'layout-side' : 'layout-top-bottom';
    localStorage.setItem('msu_layout_mode', this.layoutMode);
    this.applyLayout(this.layoutMode);

    if (window.mapManager) {
      window.mapManager.forceResize();
    }

    this.showNotification(
      (this.layoutMode === 'layout-side')
        ? '👉 เปลี่ยนเป็นมุมมอง "ฟีดด่านซ้าย - แผนที่ย้ายไปขวา"'
        : '🗺️ เปลี่ยนเป็นมุมมอง "แผนที่ด้านบน - ฟีดด่านด้านล่าง"',
      'info'
    );
  }

  applyLayout(mode) {
    const container = document.querySelector('.app-container');
    if (container) {
      container.classList.remove('layout-side', 'layout-top-bottom');
      container.classList.add(mode);
    }
    
    const icon = document.getElementById('layoutToggleIcon');
    if (icon) {
      icon.textContent = (mode === 'layout-side') ? '🗺️ ย้ายแมพขึ้นบน' : '👉 ย้ายแมพไปขวา';
    }
  }

  // Socket.io Realtime Listener
  initSocket() {
    try {
      if (typeof io !== 'undefined') {
        this.socket = io();

        this.socket.on('connect', () => {
          console.log('⚡ Connected to MSU Traffic Real-time Socket');
          if (window.rankManager) {
            window.rankManager.bindSocketEvents(this.socket);
          }
        });

        this.socket.on('new_report', (newReport) => {
          this.handleNewReportEvent(newReport);
        });

        this.socket.on('report_updated', (updatedReport) => {
          this.handleReportUpdatedEvent(updatedReport);
        });

        this.socket.on('report_deleted', ({ id }) => {
          this.handleReportDeletedEvent(id);
        });

        this.socket.on('stats_update', (stats) => {
          this.renderStats(stats);
        });
      }
    } catch (e) {
      console.warn('Socket.io fallback mode active:', e);
    }
  }

  // Play alert sound
  playAlertChime() {
    if (!this.soundEnabled) return;
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.5);
    } catch (e) {}
  }

  // Fetch Reports
  async loadReports() {
    try {
      const params = new URLSearchParams();
      if (this.currentFilter !== 'all') params.append('type', this.currentFilter);
      if (this.currentZone !== 'all') params.append('zone', this.currentZone);
      if (this.searchQuery) params.append('search', this.searchQuery);

      const res = await fetch(`/api/reports?${params.toString()}`);
      const result = await res.json();
      
      if (result.success && result.data) {
        this.reports = result.data;
        this.renderReportsList();
        window.mapManager.renderReports(this.reports);
        this.updateTicker();
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
    }
  }

  // Fetch Zones
  async loadZones() {
    try {
      const res = await fetch('/api/zones');
      const result = await res.json();
      if (result.success && result.data) {
        this.zones = result.data;
        this.populateZoneOptions();
      }
    } catch (err) {}
  }

  // Fetch Stats
  async loadStats() {
    try {
      const res = await fetch('/api/reports/stats');
      const result = await res.json();
      if (result.success && result.data) {
        this.renderStats(result.data);
      }
    } catch (err) {}
  }

  renderStats(stats) {
    const activeEl = document.getElementById('statActive');
    const todayEl = document.getElementById('statToday');
    const clearedEl = document.getElementById('statCleared');

    if (activeEl) activeEl.textContent = stats.activeCheckpoints || 0;
    if (todayEl) todayEl.textContent = stats.todayReports || 0;
    if (clearedEl) clearedEl.textContent = stats.clearedToday || 0;
  }

  populateZoneOptions() {
    const selectEl = document.getElementById('reportPresetZone');
    if (!selectEl) return;

    selectEl.innerHTML = '<option value="">-- เลือกจุดยอดนิยม หรือ ระบุเองด้านล่าง --</option>';
    
    const khamriangGroup = document.createElement('optgroup');
    khamriangGroup.label = '📍 โซน มอใหม่ (ขามเรียง / ท่าขอนยาง)';
    
    const downtownGroup = document.createElement('optgroup');
    downtownGroup.label = '📍 โซน มอเก่า (ในเมือง)';

    this.zones.forEach(z => {
      const opt = document.createElement('option');
      opt.value = z.id;
      opt.textContent = `${z.name}`;
      opt.dataset.lat = z.lat;
      opt.dataset.lng = z.lng;
      opt.dataset.campus = z.campus;
      opt.dataset.name = z.name;

      if (z.campus.includes('มอใหม่') || z.campus.includes('ท่าขอนยาง') || z.campus.includes('เลี่ยงเมือง')) {
        khamriangGroup.appendChild(opt);
      } else {
        downtownGroup.appendChild(opt);
      }
    });

    selectEl.appendChild(khamriangGroup);
    selectEl.appendChild(downtownGroup);
  }

  renderReportsList() {
    const container = document.getElementById('feedListContainer');
    if (!container) return;

    if (this.reports.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem; color: #94A3B8;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎉</div>
          <div style="font-weight: 700; color: #475569; margin-bottom: 0.25rem;">ไม่พบรายงานด่านในขณะนี้</div>
          <div style="font-size: 0.8rem;">เส้นทางปลอดโปร่ง หรือเป็นคนแรกที่รายงานจุดตรวจ</div>
        </div>
      `;
      return;
    }

    const isUserDev = window.authManager.isDev();
    const currentUserId = window.authManager.getUser()?.id;

    container.innerHTML = this.reports.map(rep => {
      const isCleared = rep.status === 'cleared' || rep.status === 'expired';
      const typeTagClass = `tag-${rep.type}`;
      const typeName = this.getTypeName(rep.type);
      const icon = window.mapManager.getTypeIcon(rep.type);
      const timeAgo = window.mapManager.formatTimeAgo(rep.createdAt);
      const upVotes = rep.votes?.up?.length || 0;
      const downVotes = rep.votes?.down?.length || 0;
      
      const hasUpVoted = currentUserId && rep.votes?.up?.includes(currentUserId);
      const hasDownVoted = currentUserId && rep.votes?.down?.includes(currentUserId);
      const isAuthor = currentUserId && (rep.reporter?.id === currentUserId || rep.reporter?.email === window.authManager.getUser()?.email);
      const canDelete = isUserDev || isAuthor;

      const isDevPost = rep.reporter?.isDev || rep.reporter?.email === 'java5263@gmail.com';

      return `
        <div class="report-card ${isCleared ? 'card-cleared' : 'card-active'}" data-id="${rep.id}">
          <div class="report-card-top">
            <span class="card-type-tag ${typeTagClass}">
              <span>${icon}</span> ${typeName}
            </span>
            <span class="card-time">🕒 ${timeAgo}</span>
          </div>

          <div>
            <div class="card-location-title">${rep.locationName}</div>
            <div class="card-zone-badge">📍 ${rep.campusZone || 'มมส'}</div>
          </div>

          ${rep.direction ? `<div class="card-direction">🧭 ${rep.direction}</div>` : ''}

          ${rep.description ? `<div class="card-desc">${rep.description}</div>` : ''}

          <div class="card-footer">
            <div class="card-reporter">
              <img class="reporter-avatar" src="${rep.reporter?.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60'}" alt="avatar">
              <span style="font-weight: 600;">${rep.reporter?.name || 'นิสิต มมส'}</span>
              ${rep.reporter?.isDev ? '<span style="background: #FEF3C7; color: #B45309; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #FDE68A;">👑 DEV</span>' : 
                (rep.reporter?.isMsuStudent || (rep.reporter?.email && rep.reporter.email.endsWith('@msu.ac.th')) ? 
                  '<span style="background: #FEF3C7; color: #B45309; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #FDE68A;">🎓 MSU</span>' : 
                  '<span style="background: #F1F5F9; color: #475569; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #E2E8F0;">👤 Member</span>')}
              ${window.rankManager ? window.rankManager.getRankBadgeHtml(rep.reporter?.rank, 'xs') : ''}
            </div>

            <div class="card-actions">
              <button class="btn-vote ${hasUpVoted ? 'active-up' : ''}" onclick="window.app.vote('${rep.id}', 'up', event)">
                👍 ยังอยู่ (${upVotes})
              </button>
              <button class="btn-vote ${hasDownVoted ? 'active-down' : ''}" onclick="window.app.vote('${rep.id}', 'down', event)">
                🚀 ยกแล้ว (${downVotes})
              </button>
              ${canDelete ? `
                <button class="btn-vote" style="color: #EF4444; border-color: #FCA5A5;" title="ลบรายงานนี้" onclick="window.app.deleteReport('${rep.id}', event)">
                  🗑️
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card click -> Focus Map Marker
    container.querySelectorAll('.report-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-vote')) return;
        const id = card.dataset.id;
        window.mapManager.focusReport(id);
        
        if (window.innerWidth <= 768) {
          this.switchMobileTab('map');
        }
      });
    });
  }

  updateTicker() {
    const ticker = document.getElementById('liveTickerText');
    if (!ticker) return;

    const activeList = this.reports.filter(r => r.status === 'active');
    if (activeList.length > 0) {
      const latest = activeList[0];
      ticker.innerHTML = `<strong>ล่าสุด:</strong> ${latest.locationName} (${latest.direction || 'รอบ มมส'}) - <em>${window.mapManager.formatTimeAgo(latest.createdAt)}</em>`;
    } else {
      ticker.innerHTML = `<strong>สถานะปัจจุบัน:</strong> รอบ มมส การจราจรปกติ ไม่มีรายงานด่าน`;
    }
  }

  handleNewReportEvent(newReport) {
    this.playAlertChime();
    this.reports.unshift(newReport);
    this.renderReportsList();
    window.mapManager.renderReports(this.reports);
    this.updateTicker();
    this.showNotification(`🚨 ด่านใหม่: ${newReport.locationName}`, 'alert');
  }

  handleReportUpdatedEvent(updatedReport) {
    const idx = this.reports.findIndex(r => r.id === updatedReport.id);
    if (idx !== -1) {
      this.reports[idx] = updatedReport;
      this.renderReportsList();
      window.mapManager.renderReports(this.reports);
    }
  }

  handleReportDeletedEvent(deletedId) {
    this.reports = this.reports.filter(r => r.id !== deletedId);
    this.renderReportsList();
    window.mapManager.renderReports(this.reports);
    this.updateTicker();
  }

  // Delete Report
  async deleteReport(reportId, event) {
    if (event) event.stopPropagation();
    if (!confirm('คุณต้องการลบรายงานด่านนี้ใช่หรือไม่?')) return;

    try {
      const res = await fetch(`/api/reports/${reportId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        }
      });

      const data = await res.json();
      if (data.success) {
        this.handleReportDeletedEvent(reportId);
        this.showNotification('🗑️ ลบรายงานเรียบร้อยแล้ว', 'info');
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการลบรายงาน');
      }
    } catch (err) {
      console.error('Delete error:', err);
    }
  }

  // Submit Report
  async handleReportSubmit(e) {
    e.preventDefault();

    if (!window.authManager.isLoggedIn()) {
      this.closeReportModal();
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบด้วย Google ก่อนส่งรายงานด่าน เพื่อป้องกันการแจ้งข้อมูลเท็จ');
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

    const isAnonymous = document.getElementById('reportIsAnonymous')?.checked || false;

    const payload = {
      type,
      locationName,
      customLocation: customLoc,
      campusZone,
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      direction,
      description,
      isAnonymous
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
        this.showNotification('🎉 บันทึกรายงานด่านสำเร็จแล้ว ขอบคุณที่ร่วมแจ้งข้อมูล', 'success');
        document.getElementById('reportForm')?.reset();
        document.getElementById('reportLat').value = '';
        document.getElementById('reportLng').value = '';
      } else {
        alert(data.error || data.message || 'เกิดข้อผิดพลาดในการส่งรายงาน');
      }
    } catch (err) {
      console.error('Error submitting report:', err);
    }
  }

  // Voting
  async vote(reportId, voteType, event) {
    if (event) event.stopPropagation();

    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบด้วย Google เพื่อโหวตยืนยันสถานะด่าน');
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
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการโหวต');
      }
    } catch (err) {
      console.error('Error voting:', err);
    }
  }

  // Update Auth UI in Header & Profile
  // Update Auth UI in Header & Profile
  updateAuthUI() {
    const container = document.getElementById('navAuthContainer');
    if (!container) return;

    const user = window.authManager.getUser();
    if (user) {
      const isDev = user.isDev || user.email === 'java5263@gmail.com';
      const rankBadge = window.rankManager ? window.rankManager.getRankBadgeHtml(user.rank, 'xs') : '';
      container.innerHTML = `
        <div class="user-profile-badge" onclick="window.app.openProfileModal()" style="${isDev ? 'border-color: #F59E0B; background: #FEF3C7;' : ''}">
          <img class="user-avatar" src="${user.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + user.id}" alt="User Avatar">
          <span class="user-name-text" style="${isDev ? 'color: #B45309; font-weight: 800;' : ''}">
            ${isDev ? '👑 ' : ''}${user.name}
          </span>
          ${rankBadge}
        </div>
      `;
    } else {
      container.innerHTML = `
        <button class="btn btn-outline btn-sm" onclick="window.authManager.openLoginModal()">
          <span>🔑 เข้าสู่ระบบ</span>
        </button>
      `;
    }
  }

  openReportModal() {
    if (!window.authManager.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบด้วย Google ก่อนส่งรายงานด่าน');
      return;
    }

    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.add('active');

    const latIn = document.getElementById('reportLat');
    const lngIn = document.getElementById('reportLng');
    if (latIn && lngIn && (!latIn.value || !lngIn.value)) {
      const center = window.mapManager.map.getCenter();
      latIn.value = center.lat.toFixed(6);
      lngIn.value = center.lng.toFixed(6);
      window.mapManager.setReportPin(center.lat, center.lng);
    }
  }

  closeReportModal() {
    const modal = document.getElementById('reportModal');
    if (modal) modal.classList.remove('active');
  }

  async openProfileModal() {
    const modal = document.getElementById('profileModal');
    const user = window.authManager.getUser();
    if (!user) {
      window.authManager.openLoginModal();
      return;
    }

    // Refresh fresh rank stats from server
    if (window.rankManager) {
      await window.rankManager.refreshMyRankStats();
    }

    const updatedUser = window.authManager.getUser() || user;
    const stats = updatedUser.stats || {};
    const rank = updatedUser.rank || stats.rank || {};

    const avatarEl = document.getElementById('profileAvatar');
    const nameEl = document.getElementById('profileName');
    const emailEl = document.getElementById('profileEmail');
    const rankBadgeWrap = document.getElementById('profileRankBadgeWrap');

    if (avatarEl) avatarEl.src = updatedUser.picture || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + updatedUser.id;
    if (nameEl) nameEl.textContent = updatedUser.name;
    if (emailEl) emailEl.textContent = updatedUser.email || 'ผู้ใช้ทั่วไป';
    
    if (rankBadgeWrap && window.rankManager) {
      rankBadgeWrap.innerHTML = window.rankManager.getRankBadgeHtml(rank, 'md');
    }

    // EXP Card
    const expLabelEl = document.getElementById('profileExpLabel');
    const expValueEl = document.getElementById('profileExpValue');
    const expBarFillEl = document.getElementById('profileExpBarFill');
    const nextRankHintEl = document.getElementById('profileNextRankHint');

    if (expLabelEl) expLabelEl.textContent = `ยศ: ${rank.name || 'ผู้สัญจรมือใหม่'}`;
    if (expValueEl) expValueEl.textContent = `${(stats.exp || rank.exp || 0).toLocaleString()} EXP`;
    if (expBarFillEl) expBarFillEl.style.width = `${rank.progressPercent || 0}%`;
    
    if (nextRankHintEl) {
      if (rank.nextRank) {
        nextRankHintEl.textContent = `อีก ${rank.pointsToNext} EXP เพื่อเลื่อนสู่ ${rank.nextRank} (${rank.progressPercent}%)`;
      } else {
        nextRankHintEl.textContent = `👑 บรรลุระดับยศสูงสุดแล้ว (100%)`;
      }
    }

    // Community Stats
    const statReportsEl = document.getElementById('profileStatReports');
    const statUpvotesEl = document.getElementById('profileStatUpvotes');
    const statAccuracyEl = document.getElementById('profileStatAccuracy');

    if (statReportsEl) statReportsEl.textContent = stats.reportsCount || 0;
    if (statUpvotesEl) statUpvotesEl.textContent = stats.upvotesReceived || 0;
    if (statAccuracyEl) statAccuracyEl.textContent = `${stats.accuracyRate || 100}%`;

    if (modal) modal.classList.add('active');
  }

  closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('active');
  }

  showNotification(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'app-toast';
    const bgCol = type === 'alert' ? '#EF4444' : (type === 'success' ? '#10B981' : '#1E293B');
    
    toast.style.cssText = `
      position: fixed;
      top: 1rem;
      left: 50%;
      transform: translateX(-50%) translateY(-20px);
      background: ${bgCol};
      color: #FFFFFF;
      padding: 0.65rem 1.25rem;
      border-radius: 9999px;
      font-size: 0.88rem;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 10px 25px rgba(0,0,0,0.25);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      pointer-events: none;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    `;
    toast.innerHTML = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
      toast.style.opacity = '1';
    }, 10);

    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(-20px)';
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  switchMobileTab(tab) {
    const sidebar = document.getElementById('sidebar');
    const navItems = document.querySelectorAll('.bottom-nav-item');

    navItems.forEach(item => item.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

    if (tab === 'feed') {
      sidebar?.classList.add('mobile-open');
    } else if (tab === 'map') {
      sidebar?.classList.remove('mobile-open');
      window.mapManager.map?.resize();
    } else if (tab === 'report') {
      this.openReportModal();
    } else if (tab === 'legal') {
      this.openLegalModal();
    } else if (tab === 'security') {
      this.openSecurityModal();
    } else if (tab === 'profile') {
      if (window.authManager.isLoggedIn()) {
        this.openProfileModal();
      } else {
        window.authManager.openLoginModal();
      }
    }
  }

  openLegalModal() {
    const modal = document.getElementById('legalModal');
    if (modal) modal.classList.add('active');
  }

  closeLegalModal() {
    const modal = document.getElementById('legalModal');
    if (modal) modal.classList.remove('active');
  }

  openSecurityModal() {
    const modal = document.getElementById('securityModal');
    if (modal) modal.classList.add('active');
  }

  closeSecurityModal() {
    const modal = document.getElementById('securityModal');
    if (modal) modal.classList.remove('active');
  }

  setupEventListeners() {
    const presetSelect = document.getElementById('reportPresetZone');
    presetSelect?.addEventListener('change', (e) => {
      const opt = presetSelect.options[presetSelect.selectedIndex];
      if (opt && opt.dataset.lat && opt.dataset.lng) {
        const lat = parseFloat(opt.dataset.lat);
        const lng = parseFloat(opt.dataset.lng);
        const campus = opt.dataset.campus;

        document.getElementById('reportLat').value = lat;
        document.getElementById('reportLng').value = lng;
        if (campus) document.getElementById('reportCampusZone').value = campus;

        window.mapManager.setReportPin(lat, lng, opt.dataset.name);
        window.mapManager.map.flyTo({ center: [lng, lat], zoom: 16 });
      }
    });

    document.querySelectorAll('.filter-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.currentFilter = chip.dataset.type || 'all';
        this.loadReports();
      });
    });

    document.querySelectorAll('.campus-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.campus-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const campus = btn.dataset.campus;
        window.mapManager.flyToCampus(campus);
      });
    });

    const searchInput = document.getElementById('searchInput');
    let debounceTimer;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value;
        this.loadReports();
      }, 300);
    });

    document.getElementById('reportForm')?.addEventListener('submit', (e) => {
      this.handleReportSubmit(e);
    });
  }

  getTypeName(type) {
    switch (type) {
      case 'helmet': return 'ด่านหมวก/ใบขับขี่';
      case 'alcohol': return 'ด่านเป่าแอลกอฮอล์';
      case 'security': return 'ด่านตรวจค้น';
      case 'emission': return 'ด่านควันดำ';
      case 'speed': return 'ด่านจับความเร็ว';
      case 'traffic': return 'รถติดสะสม';
      case 'accident': return 'อุบัติเหตุ';
      default: return 'จุดตรวจ';
    }
  }
}

// Global App Instance
window.app = new AppController();

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
