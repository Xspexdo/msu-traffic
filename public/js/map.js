/**
 * MSU Traffic - Bulletproof Map Engine (mapcn UI Design System)
 * รองรับ 100% ทุกบราวเซอร์ (Brave Browser, Chrome, Edge, Safari, มือถือ, iPad)
 * ไม่โดน WebGL Block หรือ Brave Shields บล็อกเด็ดขาด!
 */

class MSUMapManager {
  constructor() {
    this.map = null;
    this.currentTheme = 'light'; // 'light' | 'dark'
    this.is3D = false;
    this.markersLayer = null;
    this.reportMarker = null;
    this.userLocationMarker = null;
    this.tileLayer = null;

    // MSU Coordinates [lat, lng]
    this.khamriangCoords = [16.2467, 103.2520]; // มอใหม่ ขามเรียง
    this.downtownCoords = [16.1868, 103.2982];  // มอเก่า ในเมือง

    // Tile Providers (100% Free & No AdBlock / Brave Block)
    this.tileUrls = {
      light: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
      dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
    };

    this.reports = [];
  }

  initMap(containerId = 'msu-map') {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (typeof L === 'undefined') {
      console.error('❌ Leaflet library is not loaded');
      return;
    }

    try {
      // Check current theme
      const savedTheme = localStorage.getItem('msu_theme') || (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
      this.currentTheme = savedTheme === 'dark' ? 'dark' : 'light';

      // 1. Initialize Map
      this.map = L.map(containerId, {
        center: this.khamriangCoords,
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // 2. Add Tile Layer (Carto Dark or Carto Voyager Light)
      this.tileLayer = L.tileLayer(this.tileUrls[this.currentTheme] || this.tileUrls.light, {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true
      }).addTo(this.map);

      // 3. Zoom Control on Bottom Left (เพื่อไม่ให้ซ้อนทับกับกล่องอันดับมุมบนขวา)
      L.control.zoom({ position: 'bottomleft' }).addTo(this.map);

      // 4. Markers Layer Group
      this.markersLayer = L.layerGroup().addTo(this.map);

      // 5. Click on map to select/move new report pin
      this.map.on('click', (e) => {
        this.setReportPin(e.latlng.lat, e.latlng.lng);
        if (window.app) {
          window.app.showNotification('📍 เลือกจุดบนแผนที่แล้ว! สามารถแตะลากหมุดเพื่อปรับตำแหน่งได้', 'info');
        }
      });

      // 6. Init Map Drag & Auto Slide Feed Effect (เลื่อนแผนที่ -> แถบสไลด์ลง, หยุด 5 วิ หรือคลิกหมุด -> กู้คืน)
      this.initMapDragSlideEffect();

      // 7. Force Map Resize & Invalidate Size
      this.forceResize();

      console.log('🗺️ MSU Map Engine Initialized Successfully!');

      if (this.reports.length > 0) {
        this.renderReports(this.reports);
      }

    } catch (err) {
      console.error('Error initializing map:', err);
    }
  }

  // ----------------------------------------------------
  // 🗺️ แถบรายการคงที่อยู่ด้านล่างเสมอ ไม่จมหายไปเมื่อเลื่อนแผนที่
  // ----------------------------------------------------
  initMapDragSlideEffect() {
    const feedPanel = document.querySelector('.map-feed-panel');
    const restoreBtn = document.getElementById('mapRestoreFeedPill');
    if (feedPanel) {
      feedPanel.classList.remove('panel-slid-down');
    }
    if (restoreBtn) {
      restoreBtn.classList.remove('visible');
    }

    this.restoreFeedPanel = () => {
      if (feedPanel) feedPanel.classList.remove('panel-slid-down');
    };
    this.hideFeedPanel = () => {};
  }

  forceResize() {
    if (!this.map) return;
    this.map.invalidateSize();
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 150);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 500);
    setTimeout(() => { if (this.map) this.map.invalidateSize(); }, 1200);
  }

  // Toggle Dark / Light Theme
  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    if (this.map && this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = L.tileLayer(this.tileUrls[this.currentTheme], {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true
      }).addTo(this.map);
    }
    return this.currentTheme;
  }

  // Toggle 3D Perspective Tilt View
  toggle3D() {
    this.is3D = !this.is3D;
    const mapEl = document.getElementById('msu-map');
    if (mapEl) {
      if (this.is3D) {
        mapEl.style.transform = 'perspective(900px) rotateX(25deg) scale(1.04)';
        mapEl.style.transformOrigin = 'center bottom';
        mapEl.style.transition = 'transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
      } else {
        mapEl.style.transform = 'none';
      }
    }
    this.forceResize();
    return this.is3D;
  }

  // Fly to campus (มอใหม่ vs มอเก่า)
  flyToCampus(campusType) {
    if (!this.map) return;
    const center = (campusType === 'downtown' || campusType === 'มอเก่า')
      ? this.downtownCoords
      : this.khamriangCoords;

    this.map.flyTo(center, 15, { duration: 1.2 });
  }

  // Locate User GPS
  locateUser() {
    if (!navigator.geolocation) {
      alert('อุปกรณ์ของคุณไม่รองรับ Geolocation');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;

        if (this.userLocationMarker) {
          this.userLocationMarker.setLatLng([lat, lng]);
        } else {
          const userIcon = L.divIcon({
            className: 'user-gps-marker',
            html: `<div style="width: 18px; height: 18px; background: #2563EB; border: 3px solid #FFFFFF; border-radius: 50%; box-shadow: 0 0 12px rgba(37,99,235,0.8);"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          });
          this.userLocationMarker = L.marker([lat, lng], { icon: userIcon }).addTo(this.map);
        }

        this.map.flyTo([lat, lng], 16, { duration: 1.2 });
      },
      (err) => {
        alert('ไม่สามารถเข้าถึงตำแหน่งของคุณได้: ' + err.message);
      }
    );
  }

  onMapClick(latlng) {
    this.setReportPin(latlng.lat, latlng.lng, 'ตำแหน่งที่เลือก');

    const latInput = document.getElementById('reportLat');
    const lngInput = document.getElementById('reportLng');
    if (latInput && lngInput) {
      latInput.value = latlng.lat.toFixed(6);
      lngInput.value = latlng.lng.toFixed(6);
    }
  }

  setReportPin(lat, lng, name = 'จุดที่เลือก') {
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
            <div style="background: rgba(15, 23, 42, 0.92); backdrop-filter: blur(8px); color: #FFFFFF; font-size: 0.7rem; font-weight: 800; padding: 0.22rem 0.6rem; border-radius: 16px; box-shadow: 0 4px 14px rgba(0,0,0,0.3); border: 1.5px solid rgba(255,255,255,0.4); white-space: nowrap; margin-bottom: 2px;">
              ✋ แตะลากหมุดนี้ได้
            </div>
            <div style="font-size: 2rem; line-height: 1; filter: drop-shadow(0 4px 8px rgba(239, 68, 68, 0.6));">📍</div>
          </div>
        `,
        iconSize: [130, 55],
        iconAnchor: [65, 50]
      });

      this.reportMarker = L.marker([latNum, lngNum], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(this.map);

      // Popup บนหมุดสำหรับกด "ปักหมุดที่นี่"
      const pickerPopupHtml = `
        <div style="text-align: center; padding: 0.35rem 0.45rem;">
          <div style="font-weight: 800; font-size: 0.85rem; color: #0F172A; margin-bottom: 0.2rem;">📍 จุดที่เลือก</div>
          <div style="font-size: 0.72rem; color: #64748B; margin-bottom: 0.5rem;">แตะลากหมุดเพื่อเลื่อน หรือกดยืนยันเพื่อปักหมุด</div>
          <button class="btn btn-primary btn-sm" onclick="window.app.openReportModal()" style="width: 100%; background: #EF4444; border-color: #EF4444; font-weight: 800; padding: 0.45rem 0.75rem; border-radius: 8px; box-shadow: 0 2px 8px rgba(239,68,68,0.35);">
            ➕ ปักหมุดรายงานจุดนี้
          </button>
        </div>
      `;
      this.reportMarker.bindPopup(pickerPopupHtml, { offset: [0, -35] });
      this.reportMarker.openPopup();

      // On Drag: Update Lat/Lng Live
      this.reportMarker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        if (latIn && lngIn) {
          latIn.value = pos.lat.toFixed(6);
          lngIn.value = pos.lng.toFixed(6);
        }
      });

      // On Drag End: Auto detect MSU location name
      this.reportMarker.on('dragend', (e) => {
        const pos = e.target.getLatLng();
        if (latIn && lngIn) {
          latIn.value = pos.lat.toFixed(6);
          lngIn.value = pos.lng.toFixed(6);
        }

        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        this.reportMarker.openPopup();

        if (window.app) {
          window.app.showNotification(`📍 ย้ายตำแหน่งด่านไปที่ [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}] เรียบร้อยแล้ว`, 'info');
        }
      });
    }

    // 🚀 เลื่อนแผนที่ไปยังตำแหน่งที่เลือกอัตโนมัติ 100%
    if (this.map) {
      this.map.flyTo([latNum, lngNum], Math.max(16, this.map.getZoom()), { duration: 0.8 });
    }
  }

  renderReports(reports) {
    this.reports = reports;
    if (!this.markersLayer) return;
    this.markersLayer.clearLayers();
    this.markers = {};

    const currentUser = window.authManager ? window.authManager.getUser() : null;
    const isDev = window.authManager ? window.authManager.isDev() : false;

    reports.forEach(report => {
      if (!report.lat || !report.lng) return;

      const isCleared = report.status === 'cleared' || report.status === 'expired';
      const iconEmoji = this.getTypeIcon(report.type);
      const timeAgo = this.formatTimeAgo(report.createdAt);
      const upVotes = report.votes?.up?.length || 0;

      // ตรวจสอบว่าเป็นโพสต์ของตัวเอง หรือเป็น Dev
      const isAuthor = currentUser && (
        (report.reporter?.id && report.reporter.id === currentUser.id) ||
        (report.reporter?.email && report.reporter.email === currentUser.email)
      );
      const createdAtMs = new Date(report.createdAt).getTime();
      const elapsedMs = Date.now() - createdAtMs;
      const MOVE_WINDOW_MS = 20 * 1000;
      const isWithin20s = elapsedMs < MOVE_WINDOW_MS;
      const postMovesUsed = report.post20sMoveCount || 0;
      const canDrag = isDev || (isAuthor && (isWithin20s || postMovesUsed < 3));

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

      const customIcon = L.divIcon({
        className: `mapcn-marker ${isCleared ? 'marker-cleared' : 'marker-active'} ${canDrag ? 'marker-can-drag' : ''} ${isAuthor ? 'marker-my-post' : ''}`,
        html: `
          <div class="mapcn-marker-inner">
            <span class="mapcn-marker-icon">${iconEmoji}</span>
            ${!isCleared ? '<span class="mapcn-pulse-ring"></span><span class="mapcn-pulse-ring ring-2"></span>' : ''}
            ${dragBadgeHtml}
          </div>
        `,
        iconSize: [52, 52],
        iconAnchor: [26, 26],
        popupAnchor: [0, -28]
      });

      const marker = L.marker([report.lat, report.lng], {
        icon: customIcon,
        draggable: canDrag,
        autoPan: canDrag
      });

      // ⏱️ ระบบนับถอยหลัง 20 วินาทีแบบ Real-time
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

      // ✋ แตะลากหมุดเพื่อเปลี่ยนตำแหน่ง
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
                  ? `👑 DEV: ย้ายตำแหน่งหมุด "${pinTitle}" สำเร็จแล้ว! (ไม่จำกัดครั้ง)`
                  : (data.isWithinInitial20s
                      ? `📍 ย้ายตำแหน่งสำเร็จ! (เหลือเวลาย้ายไม่จำกัดอีก ${data.secondsRemaining} วิ + ย้ายได้อีก 3 ครั้งหลังหมดเวลา)`
                      : `📍 ย้ายตำแหน่งสำเร็จ! (เหลือโควตาย้ายได้อีก ${data.post20sMovesRemaining} ครั้ง)`);
                window.app.showNotification(msg, 'success');
              }

              // ถ้าหมดโควตาย้ายแล้ว ให้ปิด draggable
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

      let dragTipText = '';
      if (isDev) {
        dragTipText = '<div style="font-size: 0.72rem; color: #F59E0B; font-weight: 700; background: #FEF3C7; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">👑 สิทธิ์ Dev: แตะลากหมุดนี้เพื่อย้ายพิกัดได้ (ไม่จำกัดเวลา)</div>';
      } else if (isAuthor) {
        if (isWithin20s) {
          const currentRem = Math.max(0, Math.ceil((MOVE_WINDOW_MS - (Date.now() - createdAtMs)) / 1000));
          dragTipText = `<div style="font-size: 0.72rem; color: #DC2626; font-weight: 700; background: #FEF2F2; border: 1px solid #FECACA; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">⏱️ ย้ายหมุดได้เรื่อยๆ ใน 20 วินาที (เหลืออีก ${currentRem} วิ) + ย้ายได้อีก 3 ครั้งหลังจากนั้น</div>`;
        } else if (postMovesUsed < 3) {
          dragTipText = `<div style="font-size: 0.72rem; color: #2563EB; font-weight: 700; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">✏️ โพสต์ของคุณ: แตะลากย้ายได้อีก ${3 - postMovesUsed} ครั้ง</div>`;
        } else {
          dragTipText = `<div style="font-size: 0.72rem; color: #64748B; font-weight: 700; background: #F1F5F9; border: 1px solid #E2E8F0; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">🔒 ย้ายครบโควตา 3 ครั้งแล้ว (ล็อกตำแหน่งถาวร)</div>`;
        }
      }

      const downVotes = report.votes?.down?.length || 0;
      const currentUserId = currentUser?.id;
      const hasUpVoted = currentUserId && report.votes?.up?.includes(currentUserId);
      const hasDownVoted = currentUserId && report.votes?.down?.includes(currentUserId);
      const canDelete = isDev || isAuthor;

      const timeInfo = window.app
        ? window.app.formatTimeInfo(report.createdAt, report.expiresAt, report.status)
        : { postTimeStr: timeAgo, expireStr: '', isExpiringSoon: false };

      const isAnnouncement = report.isAnnouncement || report.reporter?.isAnnouncement || report.reporter?.name === 'MSU Traffic';
      let badgeHtml = '<span class="badge-pill badge-member">👤 Member</span>';
      if (isAnnouncement) {
        badgeHtml = '<span class="badge-pill badge-official">📢 MSU Traffic</span>';
      } else if (report.reporter?.isDev) {
        badgeHtml = '<span class="badge-pill badge-dev">👑 DEV</span>';
      } else if (report.reporter?.isMsuStudent || (report.reporter?.email && report.reporter.email.endsWith('@msu.ac.th'))) {
        badgeHtml = '<span class="badge-pill badge-msu">🎓 MSU</span>';
      }

      const likesCount = report.likes?.length || 0;
      const hasLiked = currentUserId && report.likes?.includes(currentUserId);

      const popupHtml = `
        <div class="mapcn-popup-card">
          <!-- 1. Header -->
          <div class="popup-header">
            <span class="popup-zone">📍 ${report.campusZone || 'มมส'}</span>
            <div class="popup-time-col">
              <span class="popup-time">🕒 โพสต์ ${timeInfo.postTimeStr}</span>
              <span class="popup-expire-tag ${timeInfo.isExpiringSoon ? 'expire-soon' : ''}">${timeInfo.expireStr}</span>
            </div>
          </div>

          <!-- 2. Title & Direction -->
          <div class="popup-title">${report.title || report.locationName}</div>
          ${report.direction ? `<div class="popup-loc">🧭 ${report.direction}</div>` : ''}

          <!-- 3. Description (if any) -->
          ${report.description ? `<div class="popup-desc">${report.description}</div>` : ''}
          ${dragTipText}

          <!-- 4. Premium Vote & Reaction Actions Grid -->
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
            <button class="btn-action-pill pill-report" onclick="window.app.openPinReportModal('${report.id}', event)" title="รายงานหมุดไม่ถูกต้อง / หมุดเท็จ">
              <span class="pill-icon">🚩</span>
              <span class="pill-label">รีพอร์ต</span>
            </button>
            ${canDelete ? `
              <button class="btn-action-pill pill-delete" title="ลบรายงานนี้" onclick="window.app.deleteReport('${report.id}', event)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
              </button>
            ` : ''}
          </div>

          <!-- 5. Modern Live Chat CTA Button with Pulse Beacon -->
          <button class="popup-chat-cta" onclick="window.app.openPinChat('${report.id}', event)">
            <div style="display: flex; align-items: center; gap: 0.45rem;">
              <span class="live-chat-beacon"></span>
              <span class="chat-cta-title">ห้องแชทสดประจำจุดนี้</span>
            </div>
            <span class="chat-cta-badge">${report.chatCount || 0} ข้อความ ➔</span>
          </button>

          <!-- 6. Footer: Status Pill Beacon + Reporter Profile -->
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
              ${window.rankManager ? window.rankManager.getRankBadgeHtml(report.reporter?.rank, 'xs') : ''}
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'mapcn-custom-popup' });
      
      // 📍 เมื่อคลิกเลือกหมุด: กู้คืนแถบรายการกลับมาทันที
      marker.on('click', () => {
        if (this.restoreFeedPanel) this.restoreFeedPanel();
        if (window.app && window.app.highlightReportCard) {
          window.app.highlightReportCard(report.id);
        }
      });
      marker.on('popupopen', () => {
        if (this.restoreFeedPanel) this.restoreFeedPanel();
      });

      this.markers[report.id] = marker;
      this.markersLayer.addLayer(marker);
    });
  }

  focusReport(reportId) {
    const rep = this.reports.find(r => r.id === reportId);
    if (rep && rep.lat && rep.lng && this.map) {
      const targetZoom = Math.max(16.5, this.map.getZoom());
      const targetPoint = this.map.project([rep.lat, rep.lng], targetZoom);
      const isMobile = window.innerWidth <= 768;
      const offsetY = isMobile ? 120 : 150;
      const offsetPoint = L.point(targetPoint.x, targetPoint.y + offsetY);
      const offsetLatLng = this.map.unproject(offsetPoint, targetZoom);

      this.map.flyTo(offsetLatLng, targetZoom, { duration: 0.8 });

      if (this.markers && this.markers[reportId]) {
        setTimeout(() => {
          if (this.markers && this.markers[reportId]) {
            this.markers[reportId].openPopup();
          }
        }, 450);
      }
    }
  }

  getTypeIcon(type) {
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

  init() {
    this.initMap();
  }

  forceResize() {
    if (this.map) {
      this.map.invalidateSize();
    }
  }

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

  formatTimeAgo(timestamp) {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'เมื่อสักครู่';
    if (diff < 3600) return `${Math.floor(diff / 60)} นาทีที่แล้ว`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} ชม. ที่แล้ว`;
    return new Date(timestamp).toLocaleDateString('th-TH');
  }
}

// Global instance
window.mapManager = new MSUMapManager();
