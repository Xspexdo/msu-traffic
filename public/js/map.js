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
      // 1. Initialize Map
      this.map = L.map(containerId, {
        center: this.khamriangCoords,
        zoom: 15,
        zoomControl: false,
        attributionControl: false
      });

      // 2. Add Tile Layer (Default: CARTO Voyager Light)
      this.tileLayer = L.tileLayer(this.tileUrls[this.currentTheme], {
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true
      }).addTo(this.map);

      // 3. Zoom Control on Top Right
      L.control.zoom({ position: 'topright' }).addTo(this.map);

      // 4. Markers Layer Group
      this.markersLayer = L.layerGroup().addTo(this.map);

      // 5. Click on map to select/move new report pin
      this.map.on('click', (e) => {
        this.setReportPin(e.latlng.lat, e.latlng.lng);
        if (window.app) {
          window.app.showNotification('📍 เลือกจุดบนแผนที่แล้ว! สามารถแตะลากหมุดเพื่อปรับตำแหน่งได้', 'info');
        }
      });

      // 6. Force Map Resize & Invalidate Size
      this.forceResize();

      console.log('🗺️ MSU Map Engine Initialized Successfully!');

      if (this.reports.length > 0) {
        this.renderReports(this.reports);
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
    const latIn = document.getElementById('reportLat');
    const lngIn = document.getElementById('reportLng');
    if (latIn && lngIn) {
      latIn.value = lat.toFixed(6);
      lngIn.value = lng.toFixed(6);
    }

    if (this.reportMarker) {
      this.reportMarker.setLatLng([lat, lng]);
    } else {
      const pinIcon = L.divIcon({
        className: 'new-pin-picker-wrap',
        html: `
          <div class="draggable-pin-bubble">
            <span>✋ แตะลากหมุดนี้ได้</span>
          </div>
          <div class="draggable-pin-icon">📍</div>
          <div class="draggable-pin-shadow"></div>
        `,
        iconSize: [120, 50],
        iconAnchor: [60, 46]
      });

      this.reportMarker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true,
        autoPan: true
      }).addTo(this.map);

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

        // Haptic feedback
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }

        if (window.app) {
          window.app.showNotification(`📍 ย้ายตำแหน่งด่านไปที่ [${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}] เรียบร้อยแล้ว`, 'info');
        }
      });
    }
  }

  renderReports(reports) {
    this.reports = reports;
    if (!this.markersLayer) return;
    this.markersLayer.clearLayers();

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
      const canDrag = isDev || isAuthor;

      let dragBadgeHtml = '';
      if (isDev) {
        dragBadgeHtml = '<span class="dev-drag-crown" title="Dev สามารถลากหมุดนี้ได้">👑</span>';
      } else if (isAuthor) {
        dragBadgeHtml = '<span class="author-drag-badge" title="โพสต์ของคุณ: แตะลากเพื่อย้ายตำแหน่งได้">✏️</span>';
      }

      const customIcon = L.divIcon({
        className: `mapcn-marker ${isCleared ? 'marker-cleared' : 'marker-active'} ${canDrag ? 'marker-can-drag' : ''} ${isAuthor ? 'marker-my-post' : ''}`,
        html: `
          <div class="mapcn-marker-inner">
            <span class="mapcn-marker-icon">${iconEmoji}</span>
            ${!isCleared ? '<span class="mapcn-pulse-ring"></span>' : ''}
            ${dragBadgeHtml}
          </div>
        `,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
        popupAnchor: [0, -22]
      });

      const marker = L.marker([report.lat, report.lng], {
        icon: customIcon,
        draggable: canDrag,
        autoPan: canDrag
      });

      // ✋ ถ้าเป็นเจ้าของโพสต์ หรือเป็น DEV: เมื่อลากหมุดเสร็จจะบันทึกพิกัดใหม่ลง Server ทันที
      if (canDrag) {
        marker.on('dragend', async (e) => {
          const newPos = e.target.getLatLng();
          if (navigator.vibrate) navigator.vibrate(60);

          try {
            const res = await fetch(`/api/reports/${report.id}/location`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                lat: newPos.lat,
                lng: newPos.lng
              })
            });
            const data = await res.json();
            if (data.success) {
              if (window.app) {
                const msg = isDev
                  ? `👑 DEV: ย้ายตำแหน่งหมุด "${report.locationName || 'ด่านตรวจ'}" ไปยังพิกัดใหม่แล้ว!`
                  : `📍 ย้ายตำแหน่งโพสต์ของคุณเรียบร้อยแล้ว!`;
                window.app.showNotification(msg, 'success');
              }
            } else {
              alert('ไม่สามารถย้ายตำแหน่งได้: ' + (data.error || 'เกิดข้อผิดพลาด'));
              window.app && window.app.loadReports();
            }
          } catch (err) {
            console.error('Error updating report location:', err);
            alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
          }
        });
      }

      let dragTipText = '';
      if (isDev) {
        dragTipText = '<div style="font-size: 0.72rem; color: #F59E0B; font-weight: 700; background: #FEF3C7; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">👑 สิทธิ์ Dev: แตะลากหมุดนี้เพื่อย้ายพิกัดได้</div>';
      } else if (isAuthor) {
        dragTipText = '<div style="font-size: 0.72rem; color: #2563EB; font-weight: 700; background: #EFF6FF; border: 1px solid #BFDBFE; padding: 0.25rem 0.45rem; border-radius: 4px; margin-top: 0.2rem;">✏️ โพสต์ของคุณ: แตะลากหมุดบนแผนที่เพื่อย้ายที่ตั้งได้ตลอดเวลา</div>';
      }

      const downVotes = report.votes?.down?.length || 0;
      const currentUserId = currentUser?.id;
      const hasUpVoted = currentUserId && report.votes?.up?.includes(currentUserId);
      const hasDownVoted = currentUserId && report.votes?.down?.includes(currentUserId);
      const canDelete = isDev || isAuthor;

      const popupHtml = `
        <div class="mapcn-popup-card">
          <!-- 1. Header -->
          <div class="popup-header">
            <span class="popup-zone">📍 ${report.campusZone || 'มมส'}</span>
            <span class="popup-time">🕒 ${timeAgo}</span>
          </div>

          <!-- 2. Title & Direction -->
          <div class="popup-title">${report.title || report.locationName}</div>
          <div class="popup-loc">🧭 ${report.direction ? report.direction : report.locationName}</div>

          <!-- 3. Description (if any) -->
          ${report.description ? `<div class="popup-desc">${report.description}</div>` : ''}
          ${dragTipText}

          <!-- 4. Vote Actions Row (No squishing, clean horizontal buttons) -->
          <div class="popup-vote-row">
            <button class="popup-vote-btn ${hasUpVoted ? 'active-up' : ''}" onclick="window.app.vote('${report.id}', 'up', event)">
              <span>👍 ยังอยู่</span>
              <span class="vote-count-pill">${upVotes}</span>
            </button>
            <button class="popup-vote-btn ${hasDownVoted ? 'active-down' : ''}" onclick="window.app.vote('${report.id}', 'down', event)">
              <span>🚀 ยกแล้ว</span>
              <span class="vote-count-pill">${downVotes}</span>
            </button>
            ${canDelete ? `
              <button class="popup-delete-btn" title="ลบรายงานนี้" onclick="window.app.deleteReport('${report.id}', event)">
                🗑️
              </button>
            ` : ''}
          </div>

          <!-- 5. Footer: Status Badge + Reporter Profile -->
          <div class="popup-footer">
            <span class="popup-status-badge ${isCleared ? 'status-cleared' : 'status-active'}">
              ${isCleared ? '✅ ยกแล้ว' : '🚨 ยังมีด่าน'}
            </span>
            <div class="popup-reporter-info">
              <span class="reporter-name">${report.reporter?.name || 'นิสิต มมส'}</span>
              ${report.reporter?.isDev ? '<span style="background: #FEF3C7; color: #B45309; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #FDE68A;">👑 DEV</span>' : 
                (report.reporter?.isMsuStudent || (report.reporter?.email && report.reporter.email.endsWith('@msu.ac.th')) ? 
                  '<span style="background: #FEF3C7; color: #B45309; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #FDE68A;">🎓 MSU</span>' : 
                  '<span style="background: #F1F5F9; color: #475569; font-size: 0.65rem; font-weight: 800; padding: 1px 5px; border-radius: 4px; border: 1px solid #E2E8F0;">👤 Member</span>')}
              ${window.rankManager ? window.rankManager.getRankBadgeHtml(report.reporter?.rank, 'xs') : ''}
            </div>
          </div>
        </div>
      `;

      marker.bindPopup(popupHtml, { className: 'mapcn-custom-popup' });
      this.markersLayer.addLayer(marker);
    });
  }

  focusReport(reportId) {
    const rep = this.reports.find(r => r.id === reportId);
    if (rep && rep.lat && rep.lng && this.map) {
      this.map.flyTo([rep.lat, rep.lng], 16.5, { duration: 1 });
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
