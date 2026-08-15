/**
 * ==============================================================================
 * 🛠️ MSU Traffic - Developer & Moderation Manager Module
 * รองรับการจัดการข้อมูลด่าน ผู้ใช้ IP และทดสอบ Filter สำหรับยศ Dev
 * ==============================================================================
 */

class DevManager {
  constructor() {
    this.currentTab = 'pins';
    this.allPins = [];
    this.bannedUsers = [];
    this.auditLogs = [];
    this.filterType = 'all';
    this.filterStatus = 'all';
    this.searchQuery = '';
    this.initKeybindings();
  }

  initKeybindings() {
    window.addEventListener('keydown', (e) => {
      // Shortcut: Ctrl + Shift + D or Cmd + Shift + D
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        this.toggleModal();
      }
    });
  }

  toggleModal() {
    const modal = document.getElementById('devModerationModal');
    if (modal && modal.classList.contains('active')) {
      this.closeModal();
    } else {
      this.openModal();
    }
  }

  openModal(tab = 'pins') {
    if (!window.authManager || !window.authManager.isDev()) {
      if (window.app) {
        window.app.showNotification('🔒 เฉพาะบัญชี Developer เท่านั้นที่เข้าถึงเมนูนี้ได้', 'warning');
      }
      window.authManager?.openLoginModal('กรุณาเข้าสู่ระบบด้วยบัญชี Developer (java5263@gmail.com)');
      return;
    }

    const modal = document.getElementById('devModerationModal');
    if (!modal) return;

    modal.classList.add('active');
    this.switchTab(tab);
  }

  closeModal() {
    const modal = document.getElementById('devModerationModal');
    if (modal) modal.classList.remove('active');
  }

  switchTab(tabName) {
    this.currentTab = tabName;

    // Update tab button styles
    document.querySelectorAll('.dev-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update tab content visibility
    document.querySelectorAll('.dev-tab-content').forEach(content => {
      content.classList.toggle('active', content.id === `devTab-${tabName}`);
    });

    // Load data for selected tab
    if (tabName === 'pins') {
      this.loadPins();
    } else if (tabName === 'users') {
      this.loadBannedUsers();
      this.loadSecurityTelemetry();
    } else if (tabName === 'profanity') {
      this.loadAuditLogs();
    } else if (tabName === 'sheets') {
      this.loadSheetsConfig();
    } else if (tabName === 'reset') {
      const resultBox = document.getElementById('devResetResultBox');
      if (resultBox) resultBox.style.display = 'none';
    } else if (tabName === 'settings') {
      this.loadSettingsState();
    }
  }

  // ============================================================================
  // ⚙️ TAB 6: SYSTEM SETTINGS (ตั้งค่าระบบ)
  // ============================================================================
  loadSettingsState() {
    // โหลดสถานะปุ่ม Donate จาก localStorage
    const donateEnabled = localStorage.getItem('msu_donate_enabled');
    const toggle = document.getElementById('devDonateToggle');
    const label = document.getElementById('devDonateStatusLabel');

    // ค่าเริ่มต้นคือเปิด (ถ้ายังไม่เคยตั้งค่า)
    const isEnabled = donateEnabled !== 'false';
    if (toggle) toggle.checked = isEnabled;
    if (label) {
      label.textContent = isEnabled ? 'เปิดอยู่' : 'ปิดอยู่';
      label.style.color = isEnabled ? '#10B981' : '#EF4444';
    }

    // โหลดสถานะห้องแชตทั้งหมด
    this.loadChatRoomsSettings();
  }

  async loadChatRoomsSettings() {
    const listContainer = document.getElementById('devChatRoomsSettingsList');
    if (!listContainer) return;

    listContainer.innerHTML = '<div style="text-align: center; color: #94A3B8; font-size: 0.8rem; padding: 1rem;">กำลังโหลดรายการห้อง...</div>';

    try {
      const res = await fetch('/api/chat/rooms');
      const data = await res.json();
      if (data.success) {
        listContainer.innerHTML = data.data.map(room => {
          const isRoomEnabled = room.enabled !== false;
          return `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 0.9rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; margin-bottom: 0.5rem;">
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span style="font-size: 1.3rem;">${room.icon}</span>
                <div>
                  <div style="font-weight: 700; font-size: 0.85rem; color: #0F172A;">${room.name}</div>
                  <div style="font-size: 0.72rem; color: #64748B;">ID: ${room.id} • ${room.desc}</div>
                </div>
              </div>
              <div style="display: flex; align-items: center; gap: 0.6rem;">
                <span id="room-status-label-${room.id}" style="font-size: 0.72rem; font-weight: 700; color: ${isRoomEnabled ? '#10B981' : '#EF4444'};">
                  ${isRoomEnabled ? 'เปิดใช้งาน' : 'ปิดปรับปรุง'}
                </span>
                <label class="dev-toggle-switch" style="position: relative; display: inline-block; width: 44px; height: 24px; cursor: pointer; margin: 0;">
                  <input type="checkbox" ${isRoomEnabled ? 'checked' : ''} onchange="window.devManager.toggleRoomStatus('${room.id}', this.checked)" style="opacity: 0; width: 0; height: 0;">
                  <span class="dev-toggle-slider" style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-color: #CBD5E1; border-radius: 24px; transition: 0.3s;"></span>
                </label>
              </div>
            </div>
          `;
        }).join('');
      }
    } catch (e) {
      console.error('Error loading chat rooms for settings:', e);
      listContainer.innerHTML = '<div style="color: #EF4444; font-size: 0.8rem; padding: 0.5rem;">เกิดข้อผิดพลาดในการโหลดข้อมูลห้อง</div>';
    }
  }

  async toggleRoomStatus(roomId, enabled) {
    try {
      const res = await fetch(`/api/chat/rooms/${roomId}/status`, {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ enabled })
      });

      const data = await res.json();
      if (data.success) {
        const label = document.getElementById(`room-status-label-${roomId}`);
        if (label) {
          label.textContent = enabled ? 'เปิดใช้งาน' : 'ปิดปรับปรุง';
          label.style.color = enabled ? '#10B981' : '#EF4444';
        }

        if (window.chatManager) {
          const target = window.chatManager.rooms.find(r => r.id === roomId);
          if (target) {
            target.enabled = enabled;
            window.chatManager.renderRoomsList();
            if (window.chatManager.currentRoom === roomId) {
              window.chatManager.updateRoomStatusUI();
              window.chatManager.loadMessages(roomId);
            }
          }
        }

        if (window.app) {
          window.app.showNotification(
            enabled ? `✅ เปิดห้องแชต ${roomId} สำเร็จแล้ว` : `🛠️ ปิดห้องแชต ${roomId} (แสดงปิดปรับปรุง เร็วๆนี้)`,
            enabled ? 'success' : 'warning'
          );
        }
      } else {
        alert(data.error || 'ไม่สามารถเปลี่ยนสถานะห้องได้');
        this.loadChatRoomsSettings();
      }
    } catch (e) {
      console.error('Error toggling room status:', e);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      this.loadChatRoomsSettings();
    }
  }

  toggleDonate(enabled) {
    localStorage.setItem('msu_donate_enabled', enabled ? 'true' : 'false');

    // อัปเดตปุ่ม Donate บน Nav Bar ทันที
    const donateBtn = document.getElementById('navDonateBtn');
    if (donateBtn) {
      donateBtn.style.display = enabled ? '' : 'none';
    }

    // อัปเดต Label สถานะ
    const label = document.getElementById('devDonateStatusLabel');
    if (label) {
      label.textContent = enabled ? 'เปิดอยู่' : 'ปิดอยู่';
      label.style.color = enabled ? '#10B981' : '#EF4444';
    }

    if (window.app) {
      window.app.showNotification(
        enabled ? '⭐ เปิดระบบ Donate แล้ว — ปุ่มโดเนทจะแสดงบนหน้าเว็บ' : '🚫 ปิดระบบ Donate แล้ว — ปุ่มโดเนทจะถูกซ่อนจากหน้าเว็บ',
        enabled ? 'success' : 'warning'
      );
    }
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      ...window.authManager.getAuthHeader()
    };
  }

  // ============================================================================
  // 📍 TAB 1: PINS MODERATION
  // ============================================================================
  async loadPins() {
    const tbody = document.getElementById('devPinsTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2rem; color: #94A3B8;">
          ⏳ กำลังโหลดรายการรายงานทั้งหมด...
        </td>
      </tr>
    `;

    try {
      const res = await fetch('/api/security/admin/all-pins', {
        headers: this.getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        this.allPins = data.data || [];
        this.renderPinsTable();
      } else {
        tbody.innerHTML = `
          <tr>
            <td colspan="7" style="text-align: center; padding: 2rem; color: #EF4444;">
              ❌ ${data.error || 'ไม่สามารถโหลดข้อมูลได้'}
            </td>
          </tr>
        `;
      }
    } catch (err) {
      console.error('Error loading pins for dev:', err);
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2rem; color: #EF4444;">
            ❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์
          </td>
        </tr>
      `;
    }
  }

  filterPins() {
    this.searchQuery = (document.getElementById('devPinSearchInput')?.value || '').toLowerCase().trim();
    this.filterType = document.getElementById('devPinTypeFilter')?.value || 'all';
    this.filterStatus = document.getElementById('devPinStatusFilter')?.value || 'all';
    this.renderPinsTable();
  }

  renderPinsTable() {
    const tbody = document.getElementById('devPinsTableBody');
    const countBadge = document.getElementById('devPinCountBadge');
    if (!tbody) return;

    let filtered = [...this.allPins];

    if (this.filterType !== 'all') {
      filtered = filtered.filter(p => p.type === this.filterType);
    }

    if (this.filterStatus !== 'all') {
      filtered = filtered.filter(p => p.status === this.filterStatus);
    }

    if (this.searchQuery) {
      const q = this.searchQuery;
      filtered = filtered.filter(p =>
        (p.id && p.id.toLowerCase().includes(q)) ||
        (p.locationName && p.locationName.toLowerCase().includes(q)) ||
        (p.description && p.description.toLowerCase().includes(q)) ||
        (p.reporter?.name && p.reporter.name.toLowerCase().includes(q)) ||
        (p.campusZone && p.campusZone.toLowerCase().includes(q))
      );
    }

    if (countBadge) {
      countBadge.textContent = `${filtered.length} รายการ`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 2.5rem; color: #64748B;">
            🔍 ไม่พบรายงานที่ตรงกับเงื่อนไข
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(pin => {
      const upVotes = pin.votes?.up?.length || 0;
      const downVotes = pin.votes?.down?.length || 0;
      const timeAgo = window.mapManager ? window.mapManager.formatTimeAgo(pin.createdAt) : '';
      const typeName = window.app ? window.app.getTypeName(pin.type) : pin.type;
      const typeIcon = window.mapManager ? window.mapManager.getTypeIcon(pin.type) : '📍';
      const reporterName = pin.reporter?.name || 'นิรนาม';
      const reporterId = pin.reporterId || pin.reporter?.id || '';

      let statusBadge = `<span class="dev-badge badge-active">🟢 Active</span>`;
      if (pin.status === 'cleared') statusBadge = `<span class="dev-badge badge-cleared">✅ Cleared</span>`;
      else if (pin.status === 'hidden') statusBadge = `<span class="dev-badge badge-hidden">👁️ Hidden</span>`;
      else if (pin.status === 'under_review') statusBadge = `<span class="dev-badge badge-review">⚠️ Review</span>`;

      return `
        <tr>
          <td style="font-family: monospace; font-size: 0.72rem; color: #64748B; font-weight: 700;">
            #${pin.id}
          </td>
          <td>
            <div style="font-weight: 700; color: #0F172A; font-size: 0.82rem;">${this.escapeHtml(pin.locationName || 'ไม่ระบุชื่อ')}</div>
            <div style="font-size: 0.72rem; color: #64748B; margin-top: 2px;">
              <span>📍 ${pin.campusZone || 'มมส'}</span>
              ${pin.direction ? ` • <span>🧭 ${this.escapeHtml(pin.direction)}</span>` : ''}
            </div>
            ${pin.description ? `<div style="font-size: 0.7rem; color: #475569; margin-top: 3px; font-style: italic;">"${this.escapeHtml(pin.description)}"</div>` : ''}
          </td>
          <td>
            <span class="dev-type-pill tag-${pin.type}">
              ${typeIcon} ${typeName}
            </span>
          </td>
          <td style="font-size: 0.74rem;">
            <div style="font-weight: 600; color: #1E293B;">${this.escapeHtml(reporterName)}</div>
            <div style="font-size: 0.68rem; color: #94A3B8;">${pin.reporter?.email || ''}</div>
          </td>
          <td style="font-size: 0.74rem; color: #475569; white-space: nowrap;">
            <div>🕒 ${timeAgo}</div>
            <div style="font-size: 0.7rem; color: #059669; font-weight: 700; margin-top: 2px;">👍 ${upVotes} / 👎 ${downVotes}</div>
          </td>
          <td>
            ${statusBadge}
          </td>
          <td style="white-space: nowrap;">
            <div class="dev-action-btn-group">
              <button class="btn-dev-action" title="ดูบนแผนที่" onclick="window.devManager.locatePin(${pin.lat}, ${pin.lng}, '${pin.id}')">
                🗺️
              </button>
              
              <select class="dev-status-select" onchange="window.devManager.changePinStatus('${pin.id}', this.value)" title="เปลี่ยนสถานะ">
                <option value="active" ${pin.status === 'active' ? 'selected' : ''}>Active (แสดง)</option>
                <option value="cleared" ${pin.status === 'cleared' ? 'selected' : ''}>Cleared (ยกแล้ว)</option>
                <option value="hidden" ${pin.status === 'hidden' ? 'selected' : ''}>Hidden (ซ่อน)</option>
              </select>

              <button class="btn-dev-action btn-danger" title="ลบหมุดนี้" onclick="window.devManager.deletePin('${pin.id}')">
                🗑️
              </button>

              ${reporterId ? `
                <button class="btn-dev-action btn-ban" title="แบนผู้สร้างหมุดนี้" onclick="window.devManager.quickBanUser('${reporterId}', '${this.escapeHtml(reporterName)}')">
                  🚫
                </button>
              ` : ''}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  locatePin(lat, lng, pinId) {
    this.closeModal();
    if (window.app) {
      window.app.switchTab('map');
    }
    if (window.mapManager) {
      window.mapManager.focusReport(pinId);
    }
  }

  async changePinStatus(pinId, status) {
    try {
      const res = await fetch('/api/security/admin/pin-status', {
        method: 'PATCH',
        headers: this.getHeaders(),
        body: JSON.stringify({ pinId, status })
      });
      const data = await res.json();
      if (data.success) {
        if (window.app) {
          window.app.showNotification(`อัปเดตสถานะหมุดเป็น ${status} สำเร็จ`, 'success');
          // Reload pins in main app
          window.app.loadReports();
        }
        // Update local state and re-render table
        const p = this.allPins.find(x => x.id === pinId);
        if (p) p.status = status;
        this.renderPinsTable();
      } else {
        alert(data.error || 'ไม่สามารถอัปเดตสถานะได้');
      }
    } catch (err) {
      console.error('Error changing pin status:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async deletePin(pinId) {
    if (!confirm(`คุณต้องการลบหมุด #${pinId} ออกจากระบบถาวรใช่หรือไม่?`)) return;

    // 🚀 ลบหมุดออกจากหน้าจอแผนที่และตาราง Dev ทันที 0.0 วินาที
    if (window.app) {
      window.app.handleReportDeletedEvent(pinId);
      window.app.showNotification(`ลบหมุด #${pinId} เรียบร้อยแล้ว`, 'info');
    }
    this.allPins = this.allPins.filter(p => p.id !== pinId);
    this.renderPinsTable();

    try {
      const res = await fetch(`/api/security/admin/delete-pin/${pinId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });
      const data = await res.json();
      if (!data.success) {
        alert(data.error || 'ไม่สามารถลบหมุดได้');
        if (window.app) window.app.loadReports();
        this.loadPins();
      }
    } catch (err) {
      console.error('Error deleting pin:', err);
      if (window.app) window.app.loadReports();
      this.loadPins();
    }
  }

  async quickBanUser(userId, userName) {
    const reason = prompt(`ระบุเหตุผลในการแบนผู้ใช้ "${userName}":`, 'ปักหมุดเท็จ / ละเมิดข้อกำหนดชุมชน');
    if (reason === null) return;

    try {
      const res = await fetch('/api/security/admin/ban-user', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ targetUserId: userId, reason: reason.trim() })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ระงับสิทธิ์ผู้ใช้ ${userName} สำเร็จ`);
        if (window.app) window.app.showNotification(`แบนผู้ใช้ ${userName} เรียบร้อย`, 'warning');
      } else {
        alert(data.error || 'ไม่สามารถแบนผู้ใช้ได้');
      }
    } catch (err) {
      console.error('Error banning user:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  // ============================================================================
  // 🛡️ TAB 2: USER & IP MODERATION
  // ============================================================================
  async loadBannedUsers() {
    const tbody = document.getElementById('devBannedUsersTableBody');
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 1.5rem; color: #94A3B8;">
          ⏳ กำลังโหลดรายชื่อผู้ใช้ที่ถูกแบน...
        </td>
      </tr>
    `;

    try {
      const res = await fetch('/api/security/admin/banned-users', {
        headers: this.getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        this.bannedUsers = data.data || [];
        this.renderBannedUsersTable();
      } else {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 1rem;">${data.error || 'โหลดไม่สำเร็จ'}</td></tr>`;
      }
    } catch (err) {
      console.error('Error loading banned users:', err);
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #EF4444; padding: 1rem;">เกิดข้อผิดพลาดในการเชื่อมต่อ</td></tr>`;
    }
  }

  renderBannedUsersTable() {
    const tbody = document.getElementById('devBannedUsersTableBody');
    if (!tbody) return;

    if (this.bannedUsers.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 1.8rem; color: #059669; font-weight: 600;">
            ✨ ไม่มีผู้ใช้ที่ถูกแบนในขณะนี้
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = this.bannedUsers.map(u => {
      const bannedDate = u.bannedAt ? new Date(u.bannedAt).toLocaleString('th-TH') : '-';
      return `
        <tr>
          <td style="font-family: monospace; font-size: 0.72rem; color: #64748B;">${u.id}</td>
          <td>
            <div style="font-weight: 700; color: #1E293B; font-size: 0.8rem;">${this.escapeHtml(u.name || 'ไม่ระบุชื่อ')}</div>
            <div style="font-size: 0.7rem; color: #94A3B8;">${u.email || '-'}</div>
          </td>
          <td style="font-size: 0.75rem; color: #DC2626; font-weight: 600;">
            ${this.escapeHtml(u.banReason || 'ละเมิดข้อกำหนด')}
          </td>
          <td style="font-size: 0.7rem; color: #64748B; white-space: nowrap;">
            ${bannedDate}
          </td>
          <td>
            <button class="btn btn-outline btn-xs" style="color: #059669; border-color: #A7F3D0;" onclick="window.devManager.unbanUser('${u.id}', '${this.escapeHtml(u.name)}')">
              🔓 ปลดแบน
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async unbanUser(userId, userName) {
    if (!confirm(`คุณต้องการปลดแบนผู้ใช้ "${userName}" ใช่หรือไม่?`)) return;

    try {
      const res = await fetch('/api/security/admin/unban-user', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ targetUserId: userId })
      });
      const data = await res.json();
      if (data.success) {
        if (window.app) window.app.showNotification(`ปลดแบน ${userName} เรียบร้อยแล้ว`, 'success');
        this.loadBannedUsers();
      } else {
        alert(data.error || 'ไม่สามารถปลดแบนได้');
      }
    } catch (err) {
      console.error('Error unbanning user:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async handleManualBan(e) {
    e.preventDefault();
    const userIdInput = document.getElementById('devManualBanUserId');
    const reasonInput = document.getElementById('devManualBanReason');

    const userId = userIdInput?.value.trim();
    const reason = reasonInput?.value.trim() || 'ละเมิดข้อกำหนด/สแปมรายงานเท็จ';

    if (!userId) {
      alert('กรุณาระบุ User ID ที่ต้องการแบน');
      return;
    }

    try {
      const res = await fetch('/api/security/admin/ban-user', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ targetUserId: userId, reason })
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ แบนผู้ใช้เรียบร้อยแล้ว');
        if (userIdInput) userIdInput.value = '';
        if (reasonInput) reasonInput.value = '';
        this.loadBannedUsers();
      } else {
        alert(data.error || 'ไม่สามารถแบนผู้ใช้ได้');
      }
    } catch (err) {
      console.error('Manual ban error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async handleAdjustTrust(e) {
    e.preventDefault();
    const userIdInput = document.getElementById('devAdjustTrustUserId');
    const deltaSelect = document.getElementById('devAdjustTrustDelta');
    const reasonInput = document.getElementById('devAdjustTrustReason');

    const userId = userIdInput?.value.trim();
    const delta = parseInt(deltaSelect?.value, 10);
    const reason = reasonInput?.value.trim() || 'ผู้ดูแลปรับคะแนน Trust Score';

    if (!userId) {
      alert('กรุณาระบุ User ID');
      return;
    }

    try {
      const res = await fetch('/api/security/admin/adjust-trust', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ userId, delta, reason })
      });
      const data = await res.json();
      if (data.success) {
        alert(`✅ ปรับคะแนน Trust Score ของ ${userId} เป็น ${data.trustScore} แต้มเรียบร้อย`);
        if (userIdInput) userIdInput.value = '';
      } else {
        alert(data.error || 'ไม่สามารถปรับคะแนนได้');
      }
    } catch (err) {
      console.error('Adjust trust error:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
  }

  async loadSecurityTelemetry() {
    const container = document.getElementById('devBlockedIpsContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: #94A3B8; padding: 1rem;">⏳ กำลังโหลดข้อมูล WAF...</div>`;

    try {
      const res = await fetch('/api/security/telemetry');
      const data = await res.json();

      if (data.success && data.telemetry) {
        const t = data.telemetry;
        const activeBans = t.activeBansList || [];

        if (activeBans.length === 0) {
          container.innerHTML = `
            <div style="text-align: center; padding: 1.2rem; color: #059669; font-size: 0.8rem; background: #ECFDF5; border-radius: 8px; border: 1px solid #A7F3D0;">
              🛡️ ปัจจุบันไม่มี IP ที่ติด Rate Limit หรือโดนแบน (WAF ปกติ)
            </div>
          `;
          return;
        }

        container.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
            <span style="font-size: 0.78rem; font-weight: 700; color: #DC2626;">พบ IP ที่ถูกบล็อกชั่วคราว: ${activeBans.length} IP</span>
            <button class="btn btn-outline btn-xs" style="color: #DC2626; border-color: #FECACA;" onclick="window.devManager.unbanAllIps()">💥 ปลดแบน IP ทั้งหมด</button>
          </div>
          <div class="dev-ip-list">
            ${activeBans.map(b => `
              <div class="dev-ip-item">
                <div>
                  <div style="font-family: monospace; font-weight: 700; color: #1E293B; font-size: 0.8rem;">${b.ip}</div>
                  <div style="font-size: 0.68rem; color: #64748B;">เหตุผล: ${b.reason || 'Spike/Rate limit'} • Ray ID: ${b.rayId || '-'}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                  <span class="dev-badge badge-hidden">⏳ เหลือ ${b.remainingSeconds}s</span>
                  <button class="btn btn-outline btn-xs" onclick="window.devManager.unbanIp('${b.ip}')">🔓 ปลดแบน</button>
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }
    } catch (err) {
      console.error('Error loading telemetry:', err);
      container.innerHTML = `<div style="color: #EF4444; font-size: 0.78rem;">โหลดข้อมูล IP ไม่สำเร็จ</div>`;
    }
  }

  async unbanIp(ip) {
    try {
      const res = await fetch('/api/security/admin/unban', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ targetIp: ip, adminKey: 'msu-dev-master-sec-key-2026' })
      });
      const data = await res.json();
      if (data.success) {
        if (window.app) window.app.showNotification(`ปลดแบน IP ${ip} เรียบร้อย`, 'success');
        this.loadSecurityTelemetry();
      } else {
        alert(data.error || 'ปลดแบนไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error unbanning IP:', err);
    }
  }

  async unbanAllIps() {
    if (!confirm('ต้องการปลดแบน IP ทั้งหมดใน WAF ทันทีใช่หรือไม่?')) return;
    try {
      const res = await fetch('/api/security/admin/unban', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ unbanAll: true, adminKey: 'msu-dev-master-sec-key-2026' })
      });
      const data = await res.json();
      if (data.success) {
        if (window.app) window.app.showNotification('ปลดแบน IP ทั้งหมดเรียบร้อย', 'success');
        this.loadSecurityTelemetry();
      } else {
        alert(data.error || 'ปลดแบนไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error unbanning all IPs:', err);
    }
  }

  // ============================================================================
  // 🤬 TAB 3: PROFANITY FILTER SANDBOX & AUDIT LOGS
  // ============================================================================
  async testProfanity(textToTest) {
    const input = document.getElementById('devProfanityInput');
    const resultBox = document.getElementById('devProfanityResult');
    const text = textToTest || (input ? input.value.trim() : '');

    if (!text) {
      alert('กรุณาพิมพ์ข้อความเพื่อทดสอบ');
      return;
    }

    if (input) input.value = text;
    if (resultBox) {
      resultBox.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: #94A3B8;">🧪 กำลังวิเคราะห์ข้อความผ่าน AI & Rule Engine...</div>`;
      resultBox.style.display = 'block';
    }

    try {
      const res = await fetch('/api/security/admin/test-filter', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({ text })
      });
      const data = await res.json();

      if (data.success && resultBox) {
        const isToxic = data.analysis.isToxic;
        const statusColor = isToxic ? '#EF4444' : '#10B981';
        const statusBg = isToxic ? '#FEF2F2' : '#ECFDF5';
        const statusBorder = isToxic ? '#FECACA' : '#A7F3D0';
        const statusIcon = isToxic ? '❌ ตรวจพบคำต้องห้าม (BLOCKED)' : '✅ ข้อความปลอดภัย (PASSED)';

        resultBox.innerHTML = `
          <div style="background: ${statusBg}; border: 1.5px solid ${statusBorder}; border-radius: 10px; padding: 1rem; margin-top: 0.8rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;">
              <span style="font-weight: 800; font-size: 0.9rem; color: ${statusColor};">${statusIcon}</span>
              <span style="font-size: 0.72rem; background: ${statusColor}; color: #fff; padding: 2px 8px; border-radius: 12px; font-weight: 700;">
                ${isToxic ? 'TOXIC' : 'CLEAN'}
              </span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.78rem; color: #334155;">
              <div><strong>ข้อความต้นฉบับ:</strong> <span style="font-family: monospace; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #CBD5E1;">${this.escapeHtml(data.input)}</span></div>
              <div><strong>Homoglyphs Normalized:</strong> <span style="font-family: monospace; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #CBD5E1;">${this.escapeHtml(data.normalized)}</span></div>
              <div><strong>Deduplicated:</strong> <span style="font-family: monospace; background: #fff; padding: 2px 6px; border-radius: 4px; border: 1px solid #CBD5E1;">${this.escapeHtml(data.deduplicated)}</span></div>
              <div><strong>ตัวอย่างข้อความเมื่อเซนเซอร์ (Dev View):</strong> <span style="font-family: monospace; background: #FFFBEB; color: #B45309; padding: 2px 6px; border-radius: 4px; font-weight: 700;">${this.escapeHtml(data.censored)}</span></div>
              <div style="margin-top: 0.3rem; padding-top: 0.4rem; border-top: 1px dashed ${statusBorder};">
                <strong>เหตุผลการวิเคราะห์:</strong> <span style="color: ${statusColor}; font-weight: 700;">${data.analysis.reason || 'ผ่านการตรวจสอบ'}</span>
              </div>
            </div>
          </div>
        `;
      }
    } catch (err) {
      console.error('Error testing profanity filter:', err);
      if (resultBox) resultBox.innerHTML = `<div style="color: #EF4444; padding: 1rem;">เกิดข้อผิดพลาดในการทดสอบ</div>`;
    }
  }

  async loadAuditLogs() {
    const container = document.getElementById('devAuditLogsContainer');
    if (!container) return;

    container.innerHTML = `<div style="text-align: center; color: #94A3B8; padding: 1rem;">⏳ กำลังโหลดประวัติ Audit Logs...</div>`;

    try {
      const res = await fetch('/api/security/admin/audit-logs?limit=40', {
        headers: this.getHeaders()
      });
      const data = await res.json();

      if (data.success) {
        this.auditLogs = data.data || [];
        this.renderAuditLogs();
      }
    } catch (err) {
      console.error('Error loading audit logs:', err);
      container.innerHTML = `<div style="color: #EF4444; font-size: 0.78rem;">โหลดประวัติ Audit Logs ไม่สำเร็จ</div>`;
    }
  }

  renderAuditLogs() {
    const container = document.getElementById('devAuditLogsContainer');
    if (!container) return;

    if (this.auditLogs.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: #94A3B8; padding: 1rem;">ยังไม่มีประวัติการบันทึก Audit Logs</div>`;
      return;
    }

    container.innerHTML = `
      <div class="dev-audit-list">
        ${this.auditLogs.map(log => {
          const timeStr = log.createdAt ? new Date(log.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
          const isProfanity = log.action.includes('PROFANITY') || log.action.includes('BLOCK');
          const isBan = log.action.includes('BAN');

          let badgeClass = 'badge-active';
          if (isProfanity) badgeClass = 'badge-hidden';
          else if (isBan) badgeClass = 'badge-danger';

          return `
            <div class="dev-audit-item">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                <span class="dev-badge ${badgeClass}" style="font-size: 0.65rem;">${log.action}</span>
                <span style="font-size: 0.68rem; color: #94A3B8;">🕒 ${timeStr}</span>
              </div>
              <div style="font-size: 0.75rem; color: #1E293B; font-weight: 600;">${this.escapeHtml(log.details || '-')}</div>
              <div style="font-size: 0.68rem; color: #64748B; margin-top: 2px;">User: ${log.userId || '-'} • Target: ${log.targetId || '-'}</div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  // ============================================================================
  // 📊 TAB 4: GOOGLE SHEETS & CLOUD SYNC
  // ============================================================================
  async loadSheetsConfig() {
    try {
      const res = await fetch('/api/sheets/config', {
        headers: this.getHeaders()
      });
      const data = await res.json();
      if (data.success && data.data) {
        const conf = data.data;
        const urlInput = document.getElementById('devSheetsWebhookUrl');
        const enabledBox = document.getElementById('devSheetsEnabled');
        const syncPinsBox = document.getElementById('devSheetsSyncPins');
        const syncReportsBox = document.getElementById('devSheetsSyncReports');
        const statusBadge = document.getElementById('devSheetsStatusBadge');

        if (urlInput) urlInput.value = conf.webhookUrl || '';
        if (enabledBox) enabledBox.checked = conf.enabled === true;
        if (syncPinsBox) syncPinsBox.checked = conf.autoSyncNewPins !== false;
        if (syncReportsBox) syncReportsBox.checked = conf.autoSyncReports !== false;

        if (statusBadge) {
          if (conf.enabled && conf.webhookUrl) {
            const timeStr = conf.lastSyncAt ? new Date(conf.lastSyncAt).toLocaleTimeString('th-TH') : 'ยังไม่เคยซิงค์';
            statusBadge.innerHTML = `🟢 เชื่อมต่อแล้ว (ซิงค์ล่าสุด: ${timeStr})`;
            statusBadge.style.background = '#065F46';
            statusBadge.style.color = '#6EE7B7';
            statusBadge.style.borderColor = '#10B981';
          } else {
            statusBadge.innerHTML = `⚪ ยังไม่เปิดใช้งาน`;
            statusBadge.style.background = '#334155';
            statusBadge.style.color = '#CBD5E1';
            statusBadge.style.borderColor = '#475569';
          }
        }
      }
    } catch (err) {
      console.error('Error loading sheets config:', err);
    }
  }

  async saveSheetsConfig() {
    const webhookUrl = document.getElementById('devSheetsWebhookUrl')?.value.trim();
    const enabled = document.getElementById('devSheetsEnabled')?.checked;
    const autoSyncNewPins = document.getElementById('devSheetsSyncPins')?.checked;
    const autoSyncReports = document.getElementById('devSheetsSyncReports')?.checked;

    if (enabled && !webhookUrl) {
      alert('กรุณากรอก Webhook URL ของ Google Apps Script ก่อนเปิดใช้งาน');
      return;
    }

    try {
      const res = await fetch('/api/sheets/config', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          webhookUrl,
          enabled,
          autoSyncNewPins,
          autoSyncReports
        })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.app?.showNotification('💾 บันทึกการตั้งค่า Google Sheets สำเร็จแล้ว', 'success');
        this.loadSheetsConfig();
      } else {
        alert(data.error || data.message || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch (err) {
      console.error('Error saving sheets config:', err);
      alert('เกิดข้อผิดพลาดในการบันทึก: ' + err.message);
    }
  }

  async testSheetsConnection() {
    const webhookUrl = document.getElementById('devSheetsWebhookUrl')?.value.trim();
    if (!webhookUrl) {
      alert('กรุณากรอก Google Apps Script Webhook URL ก่อนกดทดสอบ');
      return;
    }

    window.app?.showNotification('⚡ กำลังทดสอบส่งข้อมูลไปยัง Google Sheets...', 'info');

    try {
      const res = await fetch('/api/sheets/test', {
        method: 'POST',
        headers: this.getHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert('🎉 ยอดเยี่ยม! ' + data.message);
        this.loadSheetsConfig();
      } else {
        alert(data.message || data.error || 'การทดสอบล้มเหลว ตรวจสอบว่าได้ตั้งค่า Web App เป็น Anyone หรือยัง');
      }
    } catch (err) {
      console.error('Error testing sheets connection:', err);
      alert('เกิดข้อผิดพลาดในการทดสอบ: ' + err.message);
    }
  }

  async fullSyncSheets() {
    if (!confirm('คุณต้องการส่งข้อมูลหมุด, ผู้ใช้ และรายงานทั้งหมดในระบบขึ้น Google Sheets ทันทีใช่หรือไม่?')) return;

    window.app?.showNotification('📤 กำลังซิงค์ข้อมูลทั้งหมดขึ้น Google Sheets...', 'info');

    try {
      const res = await fetch('/api/sheets/sync-all', {
        method: 'POST',
        headers: this.getHeaders()
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        alert('🎉 ' + data.message);
        this.loadSheetsConfig();
      } else {
        alert(data.message || data.error || 'ซิงค์ไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error in full sync:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
    }
  }

  async copyGoogleAppsScript() {
    try {
      const res = await fetch('/api/sheets/script-template');
      const data = await res.json();
      if (data.success && data.script) {
        const scriptText = data.script;
        let copied = false;

        // Try modern clipboard API
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(scriptText);
            copied = true;
          } catch (e) {
            console.warn('navigator.clipboard failed, using fallback:', e);
          }
        }

        // Fallback using textarea element
        if (!copied) {
          const tempArea = document.createElement('textarea');
          tempArea.value = scriptText;
          tempArea.style.position = 'fixed';
          tempArea.style.left = '-9999px';
          document.body.appendChild(tempArea);
          tempArea.focus();
          tempArea.select();
          try {
            copied = document.execCommand('copy');
          } catch (err) {
            console.error('execCommand copy failed:', err);
          }
          document.body.removeChild(tempArea);
        }

        // Also populate the script preview box
        const codeArea = document.getElementById('devSheetsScriptCode');
        const codeContainer = document.getElementById('devSheetsScriptContainer');
        if (codeArea) codeArea.value = scriptText;
        if (codeContainer) codeContainer.style.display = 'block';

        if (copied) {
          alert('📋 คัดลอกโค้ด Google Apps Script สำเร็จเรียบร้อยแล้ว!\n\nให้นำโค้ดนี้ไปวางใน: Google Sheets > ส่วนขยาย (Extensions) > Apps Script ได้เลยครับ');
        } else {
          alert('👀 ระบบได้เปิดกล่องแสดงโค้ดด้านล่างให้แล้ว คุณสามารถกดปุ่ม "✨ เลือกโค้ดทั้งหมด" แล้วกด Ctrl+C เพื่อคัดลอกได้เลยครับ');
        }
      }
    } catch (err) {
      console.error('Error fetching script:', err);
      alert('ไม่สามารถดึงโค้ดได้ กรุณาลองใหม่อีกครั้ง');
    }
  }

  async toggleScriptViewer() {
    const container = document.getElementById('devSheetsScriptContainer');
    const textarea = document.getElementById('devSheetsScriptCode');
    if (!container || !textarea) return;

    if (container.style.display === 'block') {
      container.style.display = 'none';
      return;
    }

    if (!textarea.value) {
      try {
        const res = await fetch('/api/sheets/script-template');
        const data = await res.json();
        if (data.success && data.script) {
          textarea.value = data.script;
        }
      } catch (e) {
        console.error('Error loading script:', e);
      }
    }

    container.style.display = 'block';
  }

  selectAllScript() {
    const textarea = document.getElementById('devSheetsScriptCode');
    if (!textarea) return;
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
      window.app?.showNotification('📋 คัดลอกโค้ดทั้งหมดแล้ว (Ctrl+C)', 'success');
    } catch (e) {
      // Ignored
    }
  }

  // ============================================================================
  // 🧹 TAB 5: SYSTEM DATA RESET (ล้างยศ, แต้ม, หมุด, แชท)
  // ============================================================================
  setResetPresets(preset) {
    const checkRanks = document.getElementById('resetCheckRanks');
    const checkPoints = document.getElementById('resetCheckPoints');
    const checkPins = document.getElementById('resetCheckPins');
    const checkChat = document.getElementById('resetCheckChat');

    if (preset === 'all') {
      if (checkRanks) checkRanks.checked = true;
      if (checkPoints) checkPoints.checked = true;
      if (checkPins) checkPins.checked = true;
      if (checkChat) checkChat.checked = true;
    } else if (preset === 'pins_only') {
      if (checkRanks) checkRanks.checked = false;
      if (checkPoints) checkPoints.checked = false;
      if (checkPins) checkPins.checked = true;
      if (checkChat) checkChat.checked = false;
    } else if (preset === 'ranks_points') {
      if (checkRanks) checkRanks.checked = true;
      if (checkPoints) checkPoints.checked = true;
      if (checkPins) checkPins.checked = false;
      if (checkChat) checkChat.checked = false;
    } else if (preset === 'none') {
      if (checkRanks) checkRanks.checked = false;
      if (checkPoints) checkPoints.checked = false;
      if (checkPins) checkPins.checked = false;
      if (checkChat) checkChat.checked = false;
    }
  }

  async executeSystemReset() {
    const resetRanks = document.getElementById('resetCheckRanks')?.checked === true;
    const resetPoints = document.getElementById('resetCheckPoints')?.checked === true;
    const resetPins = document.getElementById('resetCheckPins')?.checked === true;
    const resetChat = document.getElementById('resetCheckChat')?.checked === true;

    if (!resetRanks && !resetPoints && !resetPins && !resetChat) {
      alert('⚠️ กรุณาติ๊กเลือกอย่างน้อย 1 รายการที่ต้องการล้าง');
      return;
    }

    const items = [];
    if (resetRanks) items.push('1. 🎖️ ล้างยศผู้ใช้ทั้งหมด (Rank Reset)');
    if (resetPoints) items.push('2. 🏆 ล้างแต้มและคะแนนสะสม (Points & Leaderboard Reset)');
    if (resetPins) items.push('3. 📍 ล้างหมุดรายงานด่านทั้งหมด (Pins Reset)');
    if (resetChat) items.push('4. 💬 ล้างประวัติข้อความแชท (Chat Reset)');

    const confirmMsg = `⚠️ ยืนยันการล้างข้อมูลระบบ (SYSTEM RESET)\n\nคุณกำลังจะล้างข้อมูลดังต่อไปนี้:\n${items.join('\n')}\n\n❗ ข้อมูลที่ถูกล้างจะไม่สามารถกู้คืนได้\nคุณแน่ใจหรือไม่ว่าต้องการดำเนินการต่อ?`;
    if (!confirm(confirmMsg)) return;

    // Double confirmation for safety
    const finalConfirm = prompt('🔒 กรุณาพิมพ์คำว่า "RESET" ตัวพิมพ์ใหญ่ เพื่อยืนยันการล้างข้อมูล:');
    if (finalConfirm !== 'RESET') {
      if (finalConfirm !== null) {
        alert('❌ รหัสยืนยันไม่ถูกต้อง ยกเลิกการล้างข้อมูล');
      }
      return;
    }

    const resultBox = document.getElementById('devResetResultBox');
    if (resultBox) {
      resultBox.style.display = 'block';
      resultBox.innerHTML = `
        <div style="background: #EFF6FF; border: 1.5px solid #BFDBFE; border-radius: 10px; padding: 1rem; color: #1E40AF; text-align: center; font-size: 0.85rem; font-weight: 700;">
          ⏳ กำลังดำเนินการล้างข้อมูลระบบและกระจายสัญญาณอัปเดตแบบเรียลไทม์...
        </div>
      `;
    }

    try {
      const res = await fetch('/api/security/admin/system-reset', {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          resetRanks,
          resetPoints,
          resetPins,
          resetChat
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        if (resultBox) {
          resultBox.innerHTML = `
            <div style="background: #ECFDF5; border: 1.5px solid #6EE7B7; border-radius: 10px; padding: 1.1rem; color: #065F46; font-size: 0.85rem;">
              <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
                <span>🎉</span>
                <span>${data.message}</span>
              </div>
              <div style="font-size: 0.76rem; color: #047857; margin-top: 0.3rem;">
                ระบบได้รีเซ็ตและส่งสัญญาณ Socket.IO อัปเดตแผนที่ อันดับ และแชทสดไปยังผู้ใช้ทุกคนที่กำลังออนไลน์แล้ว
              </div>
            </div>
          `;
        }

        window.app?.showNotification('🧹 ล้างข้อมูลระบบตามที่เลือกสำเร็จเรียบร้อยแล้ว!', 'success');

        // Auto Refresh All Local Client Subsystems safely
        if (resetPins) {
          if (window.app?.loadReports) window.app.loadReports();
          this.loadPins();
        }
        if (resetPoints || resetRanks) {
          if (window.rankManager?.loadLeaderboard) window.rankManager.loadLeaderboard();
          if (window.rankManager?.loadMyStats) window.rankManager.loadMyStats();
          if (window.rankManager?.loadUserRank) window.rankManager.loadUserRank();
        }
        if (resetChat) {
          if (window.chatManager?.loadMessages) window.chatManager.loadMessages();
        }

      } else {
        if (resultBox) {
          resultBox.innerHTML = `
            <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 10px; padding: 1rem; color: #991B1B; font-size: 0.85rem; font-weight: 700;">
              ❌ ไม่สามารถล้างข้อมูลได้: ${data.error || 'เกิดข้อผิดพลาด'}
            </div>
          `;
        }
        alert(data.error || 'ไม่สามารถล้างข้อมูลได้');
      }
    } catch (err) {
      console.error('System reset error:', err);
      if (resultBox) {
        resultBox.innerHTML = `
          <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 10px; padding: 1rem; color: #991B1B; font-size: 0.85rem; font-weight: 700;">
            ❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ${err.message}
          </div>
        `;
      }
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ: ' + err.message);
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
}

// Global Instance
window.devManager = new DevManager();
