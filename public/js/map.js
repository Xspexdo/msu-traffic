/**
 * ==============================================================================
 * 🗺️ MSU Traffic - Bulletproof Leaflet Map & Pin Engine (Rewritten from 0)
 * ==============================================================================
 * ออกแบบใหม่ทั้งหมด:
 * 1. หมุดเด่นชัด 100% พร้อมป้ายชื่อกำกับและเอฟเฟกต์เรดาร์คลื่นกระจาย
 * 2. รองรับทุกอุปกรณ์ (มือถือ, แท็บเล็ต, คอมพิวเตอร์)
 * 3. เลื่อน/จัดตำแหน่งมุมมองไม่ให้แถบรายการด้านล่างบังหมุด
 * 4. รองรับการแตะลากย้ายพิกัด (20 วินาทีแรก + 3 ครั้งหลังหมดเวลา / Dev ย้ายได้ตลอด)
 * 5. ฟังก์ชันซูมครอบคลุมหมุดทั้งหมดอัตโนมัติ (Fit Bounds)
 * ==============================================================================
 */

class MSUMapManager {
  constructor() {
    this.map = null;
    this.currentTheme = 'light';
    this.is3D = false;
    this.markersLayer = null;
    this.reportMarker = null;
    this.userLocationMarker = null;
    this.tileLayer = null;
    this.markers = {};
    this.reports = [];
    this.pinTimers = {};

    // MSU Coordinates [lat, lng]
    this.khamriangCoords = [16.2467, 103.2520]; // มอใหม่ ขามเรียง
    this.downtownCoords = [16.1868, 103.2982];  // มอเก่า ในเมือง

    // High performance Carto & OSM Tile Providers
    this.tileUrls = {
      light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    };
  }

  // ----------------------------------------------------
  // 🚀 1. INITIALIZE MAP ENGINE
  // ----------------------------------------------------
  init() {
    this.initMap();
  }

  initMap(containerId = 'msu-map') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (typeof L === 'undefined') {
      console.error('❌ Leaflet library is not loaded');
      return;
    }

    try {
      if (this.map) {
        this.map.remove();
        this.map = null;
      }

      // Check current theme
      const savedTheme = localStorage.getItem('msu_theme') || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
      this.currentTheme = savedTheme === 'dark' ? 'dark' : 'light';

      // 1. Create Leaflet Map Instance
      this.map = L.map(containerId, {
        center: this.khamriangCoords,
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // 2. Add Tile Layer
      this.tileLayer = L.tileLayer(this.tileUrls[this.currentTheme] || this.tileUrls.light, {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true
      }).addTo(this.map);

      // 3. Zoom Controls Bottom-Left
      L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

      // 4. Markers Layer Group
      this.markersLayer = L.layerGroup().addTo(this.map);

      // 5. Map Click Listener -> Set Selection Pin
      this.map.on('click', (e) => {
        this.setReportPin(e.latlng.lat, e.latlng.lng);
        if (window.app) {
          window.app.showNotification('📍 เลือกจุดบนแผนที่แล้ว! คุณสามารถแตะลากหมุดเพื่อปรับตำแหน่งได้', 'info');
        }
      });

      // 6. Invalidate Size
      this.forceResize();

      console.log('🗺️ MSU Map Engine Initialized Successfully from 0!');

      // Render reports if already loaded in memory
      const repList = (this.reports && this.reports.length > 0) ? this.reports : (window.app?.reports || []);
      if (repList.length > 0) {
        this.renderReports(repList);
      }

    } catch (err) {
      console.error('Error initializing map:', err);
    }
  }

  forceResize() {
    if (!this.map) return;
    this.map.invalidateSize();
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 150);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
  }

  // ----------------------------------------------------
  // 📍 2. RENDER PIN MARKERS (เขียนใหม่ 100%)
  // ----------------------------------------------------
  renderReports(reports) {
    this.reports = reports || (window.app && window.app.reports) || [];
    if (!this.map) return;

    if (!this.markersLayer) {
      this.markersLayer = L.layerGroup().addTo(this.map);
    }
    this.markersLayer.clearLayers();
    this.markers = {};

    const currentUser = window.authManager ? window.authManager.getUser() : null;
    const isDev = window.authManager ? window.authManager.isDev() : false;

    this.reports.forEach(report => {
      const lat = parseFloat(report.lat);
      const lng = parseFloat(report.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      if (report.status === 'deleted') return;

      const isCleared = report.status === 'cleared' || report.status === 'expired';
      const iconEmoji = this.getTypeIcon(report.type);
      const typeLabel = this.getTypeShortLabel(report.type);
      const themeColor = this.getTypeColor(report.type);

      // Permission to drag
      const isAuthor = currentUser && (
        (report.reporter?.id && report.reporter.id === currentUser.id) ||
        (report.reporterId && report.reporterId === currentUser.id) ||
        (report.reporter?.email && report.reporter.email === currentUser.email)
      );

      const createdAtMs = new Date(report.createdAt).getTime();
      const elapsedMs = Date.now() - createdAtMs;
      const MOVE_WINDOW_MS = 20 * 1000;
      const isWithin20s = elapsedMs < MOVE_WINDOW_MS;
      const postMovesUsed = report.post20sMoveCount || 0;
      const canDrag = isDev || (isAuthor && (isWithin20s || postMovesUsed < 3));

      // Badges
      let dragBadgeHtml = '';
      if (isDev) {
        dragBadgeHtml = '<span class="dev-drag-crown" title="Dev สามารถลากหมุดนี้ได้ (ไม่จำกัดเวลา)">👑</span>';
      } else if (isAuthor && isWithin20s) {
        const remainingSec = Math.max(0, Math.ceil((MOVE_WINDOW_MS - elapsedMs) / 1000));
        dragBadgeHtml = `<span class="author-drag-badge pin-timer-badge" id="pin-timer-${report.id}" title="ย้ายได้เรื่อยๆ ใน 20 วินาทีแรก">⏱️ ${remainingSec}s</span>`;
      } else if (isAuthor && !isWithin20s && postMovesUsed < 3) {
        dragBadgeHtml = `<span class="author-drag-badge" style="background:#EFF6FF; border-color:#2563EB; color:#2563EB; font-weight:800;" title="โพสต์ของคุณ: ย้ายได้อีก ${3 - postMovesUsed} ครั้ง">✏️ ${3 - postMovesUsed}</span>`;
      } else if (isAuthor && !isWithin20s && postMovesUsed >= 3) {
        dragBadgeHtml = '<span class="author-drag-badge" style="background:#F1F5F9; border-color:#CBD5E1; color:#94A3B8;" title="ย้ายครบโควตา 3 ครั้งแล้ว (ล็อกตำแหน่งถาวร)">🔒</span>';
      }

      // High Visibility Pin Marker HTML
      const pinHtml = `
        <div class="msu-map-pin ${isCleared ? 'pin-cleared' : 'pin-active'} ${canDrag ? 'pin-draggable' : ''}" style="--pin-color: ${themeColor};">
          ${!isCleared ? `<div class="pin-pulse-wave" style="border-color: ${themeColor}; background: ${themeColor}25;"></div>` : ''}
          <div class="pin-bubble" style="border-color: ${themeColor};">
            <span class="pin-icon">${iconEmoji}</span>
            ${dragBadgeHtml}
          </div>
          <div class="pin-label-pill" style="background: rgba(15, 23, 42, 0.9); color: #FFFFFF;">
            <span>${typeLabel}</span>
          </div>
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'msu-leaflet-div-icon',
        html: pinHtml,
        iconSize: [60, 68],
        iconAnchor: [30, 48],
        popupAnchor: [0, -42]
      });

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        draggable: canDrag,
        autoPan: canDrag,
        zIndexOffset: isAuthor ? 500 : (isDev ? 600 : 100)
      });

      // ⏱️ Live 20s Countdown Timer
      if (isAuthor && isWithin20s && !isDev) {
        if (!this.pinTimers) this.pinTimers = {};
        if (this.pinTimers[report.id]) clearInterval(this.pinTimers[report.id]);

        this.pinTimers[report.id] = setInterval(() => {
          const currentRem = Math.max(0, Math.ceil((MOVE_WINDOW_MS - (Date.now() - createdAtMs)) / 1000));
          const badgeEl = document.getElementById(`pin-timer-${report.id}`);
          if (badgeEl) {
            if (currentRem > 0) {
              badgeEl.innerHTML = `⏱️ ${currentRem}s`;
            } else {
              const remainingPostMoves = Math.max(0, 3 - (report.post20sMoveCount || 0));
              if (remainingPostMoves > 0) {
                badgeEl.outerHTML = `<span class="author-drag-badge" style="background:#EFF6FF; border-color:#2563EB; color:#2563EB; font-weight:800;" title="ย้ายได้อีก ${remainingPostMoves} ครั้ง">✏️ ${remainingPostMoves}</span>`;
                if (marker && marker.dragging) marker.dragging.enable();
              } else {
                badgeEl.outerHTML = '<span class="author-drag-badge" style="background:#F1F5F9; border-color:#CBD5E1; color:#94A3B8;" title="ย้ายครบโควตา 3 ครั้งแล้ว (ล็อกตำแหน่งถาวร)">🔒</span>';
                if (marker && marker.dragging) marker.dragging.disable();
              }
              clearInterval(this.pinTimers[report.id]);
              delete this.pinTimers[report.id];
              if (window.app) {
                window.app.showNotification(`⏱️ ครบ 20 วิแรกแล้ว: คุณยังสามารถย้ายหมุด "${report.title || report.locationName}" ได้อีก ${remainingPostMoves} ครั้ง`, 'info');
              }
            }
          }
        }, 1000);
      }

      // Drag listener
      if (canDrag) {
        marker.on('dragend', async (e) => {
          const newPos = e.target.getLatLng();
          const oldLat = report.lat;
          const oldLng = report.lng;
          const pinTitle = report.title || report.locationName || 'ด่านตรวจ';

          if (navigator.vibrate) navigator.vibrate(60);

          try {
            const res = await fetch(`/api/reports/${report.id}/location`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...(window.authManager ? window.authManager.getAuthHeader() : {})
              },
              body: JSON.stringify({
                lat: newPos.lat,
                lng: newPos.lng
              })
            });
            const data = await res.json();
            if (data.success) {
              report.lat = newPos.lat;
              report.lng = newPos.lng;
              report.moveCount = data.moveCount;
              report.post20sMoveCount = data.pin?.post20sMoveCount || report.post20sMoveCount;

              if (window.app) {
                const msg = isDev
                  ? `👑 DEV: ย้ายตำแหน่งหมุด "${pinTitle}" สำเร็จแล้ว!`
                  : (data.isWithinInitial20s
                      ? `📍 ย้ายตำแหน่งสำเร็จ! (เหลือเวลาย้ายไม่จำกัดอีก ${data.secondsRemaining} วิ + ย้ายได้อีก 3 ครั้ง)`
                      : `📍 ย้ายตำแหน่งสำเร็จ! (เหลือโควตาย้ายได้อีก ${data.post20sMovesRemaining} ครั้ง)`);
                window.app.showNotification(msg, 'success');
              }

              if (!isDev && !data.isWithinInitial20s && data.post20sMovesRemaining <= 0) {
                marker.dragging.disable();
              }
            } else {
              alert('ไม่สามารถย้ายตำแหน่งได้: ' + (data.message || data.error || 'เกิดข้อผิดพลาด'));
              marker.setLatLng([oldLat, oldLng]);
              window.app && window.app.loadReports();
            }
          } catch (err) {
            console.error('Error updating report location:', err);
            marker.setLatLng([oldLat, oldLng]);
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
          }
        });
      }

      // 🪟 Interactive Popup
      const popupHtml = this.buildPopupHtml(report, isAuthor, isDev, canDrag);
      marker.bindPopup(popupHtml, { className: 'mapcn-custom-popup', maxWidth: 340, minWidth: 280 });

      marker.on('click', () => {
        if (window.app && window.app.highlightReportCard) {
          window.app.highlightReportCard(report.id);
        }
      });

      this.markers[report.id] = marker;
      this.markersLayer.addLayer(marker);
    });
  }

  // ----------------------------------------------------
  // 🪟 3. POPUP BUILDER
  // ----------------------------------------------------
  buildPopupHtml(report, isAuthor, isDev, canDrag) {
    const isCleared = report.status === 'cleared' || report.status === 'expired';
    const upVotes = report.votes?.up?.length || 0;
    const downVotes = report.votes?.down?.length || 0;
    const likesCount = report.likes?.length || 0;
    const currentUserId = window.authManager?.getUser()?.id;
    const hasUpVoted = currentUserId && report.votes?.up?.includes(currentUserId);
    const hasDownVoted = currentUserId && report.votes?.down?.includes(currentUserId);
    const hasLiked = currentUserId && report.likes?.includes(currentUserId);
    const canDelete = isDev || isAuthor;

    const timeInfo = window.app
      ? window.app.formatTimeInfo(report.createdAt, report.expiresAt, report.status)
      : { postTimeStr: this.formatTimeAgo(report.createdAt), expireStr: '', isExpiringSoon: false };

    const isAnnouncement = report.isAnnouncement || report.reporter?.isAnnouncement || report.reporter?.name === 'MSU Traffic';
    let badgeHtml = '<span class="badge-pill badge-member">👤 Member</span>';
    if (isAnnouncement) {
      badgeHtml = '<span class="badge-pill badge-official">📢 MSU Traffic</span>';
    } else if (report.reporter?.isDev) {
      badgeHtml = '<span class="badge-pill badge-dev">👑 DEV</span>';
    } else if (report.reporter?.isMsuStudent || (report.reporter?.email && report.reporter.email.endsWith('@msu.ac.th'))) {
      badgeHtml = '<span class="badge-pill badge-msu">🎓 MSU</span>';
    }

    let dragTip = '';
    if (canDrag) {
      dragTip = isDev
        ? `<div style="font-size: 0.72rem; color: #F59E0B; font-weight: 700; background: #FEF3C7; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">👑 สิทธิ์ Dev: แตะลากหมุดนี้เพื่อย้ายพิกัดได้</div>`
        : `<div style="font-size: 0.72rem; color: #2563EB; font-weight: 700; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">✏️ โพสต์ของคุณ: แตะลากย้ายหมุดได้</div>`;
    }

    return `
      <div class="mapcn-popup-card">
        <div class="popup-header">
          <span class="popup-zone">📍 ${report.campusZone || 'มมส'}</span>
          <div class="popup-time-col">
            <span class="popup-time">🕒 โพสต์ ${timeInfo.postTimeStr}</span>
            <span class="popup-expire-tag ${timeInfo.isExpiringSoon ? 'expire-soon' : ''}">${timeInfo.expireStr}</span>
          </div>
        </div>

        <div class="popup-title">${report.title || report.locationName}</div>
        ${report.direction ? `<div class="popup-loc">🧭 ${report.direction}</div>` : ''}
        ${report.description ? `<div class="popup-desc">${report.description}</div>` : ''}
        ${dragTip}

        <div class="popup-actions-grid">
          <button class="btn-action-pill pill-upvote ${hasUpVoted ? 'active' : ''}" onclick="window.app.vote('${report.id}', 'up', event)" title="ยืนยันว่ายังมีด่าน">
            <span class="pill-icon">🛡️</span>
            <span class="pill-label">ยังมีด่าน</span>
            <span class="pill-count">${upVotes}</span>
          </button>
          <button class="btn-action-pill pill-downvote ${hasDownVoted ? 'active' : ''}" onclick="window.app.vote('${report.id}', 'down', event)" title="แจ้งว่าด่านยกแล้ว">
            <span class="pill-icon">✨</span>
            <span class="pill-label">ยกแล้ว</span>
            <span class="pill-count">${downVotes}</span>
          </button>
          <button class="btn-action-pill pill-like ${hasLiked ? 'active' : ''}" onclick="window.app.likeReport('${report.id}', event)" title="ขอบคุณผู้รายงาน">
            <span class="pill-icon">❤️</span>
            <span class="pill-count">${likesCount}</span>
          </button>
          <button class="btn-action-pill pill-report" onclick="window.app.openPinReportModal('${report.id}', event)" title="รายงานหมุดไม่ถูกต้อง">
            <span class="pill-icon">🚩</span>
            <span class="pill-label">รีพอร์ต</span>
          </button>
          ${canDelete ? `
            <button class="btn-action-pill pill-delete" title="ลบรายงานนี้" onclick="window.app.deleteReport('${report.id}', event)">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          ` : ''}
        </div>

        <button class="popup-chat-cta" onclick="window.app.openPinChat('${report.id}', event)">
          <div style="display: flex; align-items: center; gap: 0.45rem;">
            <span class="live-chat-beacon"></span>
            <span class="chat-cta-title">ห้องแชทสดประจำจุดนี้</span>
          </div>
          <span class="chat-cta-badge">${report.chatCount || 0} ข้อความ ➔</span>
        </button>

        <div class="popup-footer">
          <div class="popup-status-pill ${isCleared ? 'status-cleared' : 'status-active'}">
            <span class="status-dot"></span>
            <span>${isCleared ? 'ยกเลิกด่านแล้ว' : 'กำลังตั้งด่าน'}</span>
          </div>
          <div class="popup-reporter-info">
            ${report.isAnonymous ? `
              ${isDev ? `
                <span class="reporter-name" style="display: inline-flex; align-items: center; gap: 0.3rem; flex-wrap: wrap;">
                  <span>🕵️‍♂️ นิสิตนิรนาม</span>
                  <button type="button" class="dev-anon-inspect-btn" onclick="event.stopPropagation(); window.devManager?.inspectUser('${report.realReporter?.id || report.reporterId || report.reporter?.id}')" title="สิทธิ์ Dev: ดูข้อมูลจริงและโปรไฟล์">
                    (จริง: ${this.escapeHtml(report.realReporter?.name || report.reporter?.realName || report.reporter?.name || 'ผู้ใช้ มมส')} #${(report.realReporter?.id || report.reporterId || '').slice(-6)}) ℹ️ info
                  </button>
                </span>
              ` : `
                <span class="reporter-name">🕵️‍♂️ นิสิตนิรนาม</span>
              `}
            ` : `
              <span class="reporter-name">${this.escapeHtml(report.reporter?.name || 'นิสิต มมส')}</span>
            `}
            ${badgeHtml}
          </div>
        </div>
      </div>
    `;
  }

  // ----------------------------------------------------
  // 🎯 4. FOCUS & AUTO-CENTER (เลื่อนหมุดขึ้นมากลางจอเหนือแผงล่าง)
  // ----------------------------------------------------
  focusReport(reportId) {
    const rep = (this.reports && this.reports.find(r => r.id === reportId)) || (window.app && window.app.reports && window.app.reports.find(r => r.id === reportId));
    if (rep && rep.lat && rep.lng && this.map) {
      const lat = parseFloat(rep.lat);
      const lng = parseFloat(rep.lng);
      const targetZoom = Math.max(16, this.map.getZoom());
      
      // Calculate offset so pin is centered in visible upper portion of the screen
      const targetPoint = this.map.project([lat, lng], targetZoom);
      const isMobile = window.innerWidth <= 768;
      const offsetY = isMobile ? 140 : 160;
      const offsetPoint = L.point(targetPoint.x, targetPoint.y + offsetY);
      const offsetLatLng = this.map.unproject(offsetPoint, targetZoom);

      this.map.flyTo(offsetLatLng, targetZoom, { duration: 0.8 });

      if (!this.markers || !this.markers[reportId]) {
        this.renderReports(window.app?.reports || this.reports);
      }

      setTimeout(() => {
        if (this.markers && this.markers[reportId]) {
          this.markers[reportId].openPopup();
        }
      }, 500);
    }
  }

  // Zoom to fit all active pins
  fitAllPins() {
    if (!this.map || !this.reports || this.reports.length === 0) return;
    const latLngs = this.reports
      .filter(r => r.lat && r.lng && r.status !== 'deleted')
      .map(r => [parseFloat(r.lat), parseFloat(r.lng)]);

    if (latLngs.length > 0) {
      const bounds = L.latLngBounds(latLngs);
      this.map.fitBounds(bounds, { padding: [60, 60], maxZoom: 16 });
    }
  }

  // ----------------------------------------------------
  // 📍 5. PIN SELECTION FOR REPORT MODAL
  // ----------------------------------------------------
  setReportPin(lat, lng) {
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (isNaN(latNum) || isNaN(lngNum)) return;

    const latIn = document.getElementById('reportLat');
    const lngIn = document.getElementById('reportLng');
    if (latIn && lngIn) {
      latIn.value = latNum.toFixed(6);
      lngIn.value = lngNum.toFixed(6);
    }

    if (this.reportMarker) {
      this.reportMarker.setLatLng([latNum, lngNum]);
      this.reportMarker.openPopup();
    } else {
      const pinIcon = L.divIcon({
        className: 'new-pin-picker-wrap',
        html: `
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: auto;">
            <div style="background: rgba(15, 23, 42, 0.92); color: #FFFFFF; font-size: 0.72rem; font-weight: 800; padding: 0.25rem 0.65rem; border-radius: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.35); border: 1.5px solid rgba(255,255,255,0.4); white-space: nowrap; margin-bottom: 3px;">
              ✋ แตะลากหมุดนี้ได้
            </div>
            <div style="font-size: 2.2rem; line-height: 1; filter: drop-shadow(0 4px 8px rgba(239, 68, 68, 0.7));">📍</div>
          </div>
        `,
        iconSize: [140, 60],
        iconAnchor: [70, 54]
      });

      this.reportMarker = L.marker([latNum, lngNum], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(this.map);

      const pickerPopupHtml = `
        <div style="text-align: center; padding: 0.4rem 0.5rem;">
          <div style="font-weight: 800; font-size: 0.88rem; color: #0F172A; margin-bottom: 0.25rem;">📍 ตำแหน่งที่เลือก</div>
          <div style="font-size: 0.72rem; color: #64748B; margin-bottom: 0.6rem;">แตะลากหมุดเพื่อปรับตำแหน่ง หรือกดยืนยันเพื่อปักหมุด</div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openReportModal()" style="width: 100%; background: #EF4444; border-color: #EF4444; font-weight: 800; padding: 0.5rem 0.85rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(239,68,68,0.4);">
            ➕ ปักหมุดรายงานจุดนี้
          </button>
        </div>
      `;
      this.reportMarker.bindPopup(pickerPopupHtml, { offset: [0, -40] });
      this.reportMarker.openPopup();

      this.reportMarker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        if (latIn && lngIn) {
          latIn.value = pos.lat.toFixed(6);
          lngIn.value = pos.lng.toFixed(6);
        }
      });

      this.reportMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        if (latIn && lngIn) {
          latIn.value = pos.lat.toFixed(6);
          lngIn.value = pos.lng.toFixed(6);
        }
        if (navigator.vibrate) navigator.vibrate(50);
        this.reportMarker.openPopup();
      });
    }

    if (this.map) {
      this.map.flyTo([latNum, lngNum], Math.max(16, this.map.getZoom()), { duration: 0.8 });
    }
  }

  // ----------------------------------------------------
  // 🧭 6. UTILITIES & HELPERS
  // ----------------------------------------------------
  switchCampus(campus) {
    document.querySelectorAll('.campus-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.campus === campus);
    });

    if (campus === 'downtown') {
      this.map.flyTo(this.downtownCoords, 15, { duration: 1 });
    } else {
      this.map.flyTo(this.khamriangCoords, 15, { duration: 1 });
    }
  }

  setTheme(theme) {
    if (this.currentTheme === theme && this.tileLayer) return;
    this.currentTheme = theme;
    if (this.map && this.tileLayer && this.tileUrls[theme]) {
      this.tileLayer.setUrl(this.tileUrls[theme]);
    }
  }

  getTypeIcon(type) {
    if (window.app && Array.isArray(window.app.categories)) {
      const found = window.app.categories.find(c => c.key === type);
      if (found && found.icon) return found.icon;
    }
    switch (type) {
      case 'helmet': return '👮‍♂️';
      case 'alcohol': return '🍺';
      case 'security': return '🚔';
      case 'emission': return '💨';
      case 'speed': return '📸';
      case 'traffic': return '🚗';
      case 'accident': return '⚠️';
      default: return '📍';
    }
  }

  getTypeShortLabel(type) {
    if (window.app && Array.isArray(window.app.categories)) {
      const found = window.app.categories.find(c => c.key === type);
      if (found && found.name) return found.name;
    }
    switch (type) {
      case 'helmet': return 'ด่านหมวก/ใบขับขี่';
      case 'alcohol': return 'ด่านเป่าแอล';
      case 'security': return 'ด่านตรวจค้น';
      case 'traffic': return 'รถติดสะสม';
      case 'accident': return 'อุบัติเหตุ';
      default: return 'ด่านตรวจ';
    }
  }

  getTypeColor(type) {
    switch (type) {
      case 'helmet': return '#EF4444';   // Red
      case 'alcohol': return '#F59E0B';  // Amber
      case 'security': return '#8B5CF6'; // Purple
      case 'traffic': return '#3B82F6';  // Blue
      case 'accident': return '#DC2626'; // Dark Red
      default: return '#EF4444';
    }
  }

  formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม. ที่แล้ว`;
    return new Date(timestamp).toLocaleDateString('th-TH');
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Global instance
window.mapManager = new MSUMapManager();
