/**
 * MSU Traffic & Campus Life - Local Geofenced Chat Manager (Season 1)
 * ระบบแชตท้องถิ่นสำหรับนิสิต มมส (@msu.ac.th) พร้อมระบบตรวจพิกัด GPS 2 ชั้น
 * + ระบบแก้ไขข้อความ (Edit Message)
 * + ระบบยกเลิก/ลบข้อความ (Delete / Unsend Message)
 * + ระบบล้างแชตสำหรับ Dev (ยืนยัน 2 ขั้นตอน)
 * + ระบบรีเซ็ตแชตอัตโนมัติทุกเที่ยงคืนเมื่อไม่มีคนคุยกัน 15 นาที
 */

class ChatManager {
  constructor() {
    this.currentRoom = 'general';
    this.rooms = [];
    this.messages = [];
    this.userLocation = null;
    this.isInsideGeofence = false;
    this.distanceKm = 999;
    this.geoWatchId = null;
    this.isAnonymous = false;
    this.countdownTimer = null;
    this.resetStatus = null;
    this.cooldownSeconds = 0;
    this.cooldownTimer = null;
  }

  async init() {
    this.initGeolocation();
    await this.loadRooms();
    await this.loadMessages(this.currentRoom);
    this.updateDevClearBtn();
    this.startMidnightResetCountdown();
  }

  bindSocketEvents(socket) {
    if (!socket) return;

    // 1. รับข้อความใหม่ (Real-time Broadcast)
    socket.on('chat_message', (newMsg) => {
      if (newMsg.roomId === this.currentRoom) {
        this.messages.push(newMsg);
        this.appendMessage(newMsg);
      }
      this.updateRoomUnreadBadge(newMsg.roomId);
      this.fetchResetStatus(); // อัปเดตเวลาสนทนาล่าสุด
    });

    // 2. รับแจ้งเตือนการแก้ไขข้อความ (Edit Message Real-time)
    socket.on('chat_message_edited', (updatedMsg) => {
      const idx = this.messages.findIndex(m => m.id === updatedMsg.id);
      if (idx !== -1) {
        this.messages[idx] = updatedMsg;
      }
      const bubbleText = document.getElementById(`msg-text-${updatedMsg.id}`);
      if (bubbleText) {
        bubbleText.innerHTML = this.escapeHtml(updatedMsg.text);
        const footer = bubbleText.closest('.chat-bubble-content')?.querySelector('.chat-bubble-footer');
        if (footer && !footer.querySelector('.chat-edited-tag')) {
          const tag = document.createElement('span');
          tag.className = 'chat-edited-tag';
          tag.textContent = '(แก้ไขแล้ว)';
          tag.title = `แก้ไขล่าสุด: ${new Date(updatedMsg.editedAt || Date.now()).toLocaleTimeString('th-TH')}`;
          footer.insertBefore(tag, footer.querySelector('.chat-msg-actions') || footer.querySelector('.chat-report-btn'));
        }
      }
    });

    // 3. รับแจ้งเตือนการยกเลิก/ลบข้อความ (Delete Message Real-time)
    socket.on('chat_message_deleted', (data) => {
      this.messages = this.messages.filter(m => m.id !== data.messageId);
      const bubbleWrap = document.getElementById(`chat-msg-${data.messageId}`);
      if (bubbleWrap) {
        bubbleWrap.style.transition = 'all 0.3s ease';
        bubbleWrap.style.opacity = '0';
        bubbleWrap.style.transform = 'scale(0.85)';
        setTimeout(() => {
          bubbleWrap.remove();
          if (this.messages.length === 0) {
            this.renderMessages();
          }
        }, 300);
      }
    });

    // 4. รับแจ้งเตือนการล้างแชต (Clear Chat Real-time)
    socket.on('chat_cleared', (data) => {
      if (!data.roomId || data.roomId === 'all' || data.roomId === this.currentRoom) {
        this.messages = [];
        const container = document.getElementById('chatMessagesContainer');
        if (container) {
          container.innerHTML = `
            <div class="chat-system-notice" style="text-align: center; padding: 3rem 1rem; color: #64748B;">
              <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🧹</div>
              <div style="font-weight: 800; font-size: 0.95rem; color: #1E293B;">ประวัติการสนทนาถูกล้างเรียบร้อยแล้ว</div>
              <div style="font-size: 0.76rem; color: #94A3B8; margin-top: 0.35rem;">${data.reason || 'โดยผู้พัฒนาหรือระบบรีเซ็ตอัตโนมัติ'}</div>
            </div>
          `;
        }
        if (window.app) {
          window.app.showNotification(`🧹 ห้องแชตนี้ถูกล้างข้อความแล้ว (${data.reason || 'สำเร็จ'})`, 'info');
        }
      }
    });

    // 5. รับแจ้งเตือนการเปิด/ปิดห้องแชต (Toggle Room Status Real-time)
    socket.on('chat_room_toggled', (data) => {
      const room = this.rooms.find(r => r.id === data.roomId);
      if (room) {
        room.enabled = data.enabled;
        this.renderRoomsList();
        if (this.currentRoom === data.roomId) {
          this.updateRoomStatusUI();
        }
      }
    });
  }

  // 1. Initial Geolocation Tracking
  initGeolocation() {
    if (!navigator.geolocation) {
      this.updateGeofenceUI(false, 999, 'เบราว์เซอร์ไม่รองรับ GPS');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.userLocation = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        this.checkGeofence();
      },
      (err) => {
        console.warn('Geolocation warning:', err.message);
        this.updateGeofenceUI(false, 999, 'กรุณาอนุญาตเปิด Location เพื่อใช้งานส่งข้อความ');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async checkGeofence() {
    if (!this.userLocation) return;
    try {
      const res = await fetch(`/api/chat/geocheck?lat=${this.userLocation.lat}&lng=${this.userLocation.lng}`);
      const data = await res.json();
      if (data.success) {
        this.isInsideGeofence = data.inZone;
        this.distanceKm = data.distanceKm;
        this.updateGeofenceUI(data.inZone, data.distanceKm, data.message);
      }
    } catch (e) {
      console.error('Error checking geofence:', e);
    }
  }

  updateGeofenceUI(inZone, distKm, message) {
    const banner = document.getElementById('chatGeofenceBanner');
    const statusDot = document.getElementById('chatGeoStatusDot');
    const statusText = document.getElementById('chatGeoStatusText');

    const user = window.authManager?.getUser();
    const isDev = window.authManager?.isDev();
    const isMsu = user?.email && user.email.toLowerCase().endsWith('@msu.ac.th');

    if (statusDot && statusText) {
      if (isDev) {
        statusDot.className = 'geo-dot dot-dev';
        statusText.innerHTML = `👑 <strong>Dev Bypass:</strong> ส่งข้อความได้อิสระ`;
      } else if (inZone && isMsu) {
        statusDot.className = 'geo-dot dot-online';
        statusText.innerHTML = `🟢 <strong>อยู่ในเขต มมส (${distKm} กม.):</strong> พร้อมส่งข้อความ`;
      } else if (!isMsu) {
        statusDot.className = 'geo-dot dot-warning';
        statusText.innerHTML = `🔒 <strong>เฉพาะอีเมล @msu.ac.th:</strong> บัญชีทั่วไปอ่านได้อย่างเดียว`;
      } else {
        statusDot.className = 'geo-dot dot-offline';
        statusText.innerHTML = `📍 <strong>อยู่นอกพื้นที่ (${distKm} กม.):</strong> อ่านได้อย่างเดียว (รัศมี 25 กม.)`;
      }
    }

    if (banner) {
      if (!isMsu && !isDev) {
        banner.style.display = 'flex';
        banner.innerHTML = `<span>⚠️ ห้องแชตเปิดให้เฉพาะนิสิตและบุคลากรที่มีอีเมล <strong>@msu.ac.th</strong> ส่งข้อความเท่านั้น (บัญชี @gmail อ่านได้อย่างเดียว)</span>`;
      } else if (!inZone && !isDev) {
        banner.style.display = 'flex';
        banner.innerHTML = `<span>📍 คุณอยู่นอกพื้นที่มหาวิทยาลัย (${distKm} กม.) แชตจะเปิดให้ส่งข้อความเมื่ออยู่ในรัศมี 25 กม. รอบ มมส</span>`;
      } else {
        banner.style.display = 'none';
      }
    }

    this.updateDevClearBtn();
  }

  updateDevClearBtn() {
    const devBtn = document.getElementById('chatDevClearBtn');
    if (!devBtn) return;
    const isDev = window.authManager?.isDev();
    devBtn.style.display = isDev ? 'inline-flex' : 'none';
  }

  // 2. Load Rooms
  async loadRooms() {
    try {
      const res = await fetch('/api/chat/rooms');
      const data = await res.json();
      if (data.success) {
        this.rooms = data.data;
        this.renderRoomsList();
      }
    } catch (e) {
      console.error('Error loading chat rooms:', e);
    }
  }

  renderRoomsList() {
    const container = document.getElementById('chatRoomsContainer');
    if (!container) return;

    container.innerHTML = this.rooms.map(r => {
      const isClosed = r.enabled === false;
      return `
        <button class="chat-room-chip ${r.id === this.currentRoom ? 'active' : ''} ${isClosed ? 'room-closed' : ''}" onclick="window.chatManager.switchRoom('${r.id}')">
          <span class="room-icon">${r.icon}</span>
          <span class="room-name">${r.name}</span>
          ${isClosed ? '<span class="room-closed-tag">🛠️ ปิดปรับปรุง</span>' : ''}
        </button>
      `;
    }).join('');
  }

  // 3. Switch Room & Load Messages
  async switchRoom(roomId) {
    this.currentRoom = roomId;
    this.renderRoomsList();

    const roomObj = this.rooms.find(r => r.id === roomId);
    const titleElem = document.getElementById('chatCurrentRoomTitle');
    const descElem = document.getElementById('chatCurrentRoomDesc');
    if (titleElem && roomObj) {
      const isClosed = roomObj.enabled === false;
      titleElem.innerHTML = `${roomObj.icon} ${roomObj.name} ${isClosed ? '<span class="badge-maintenance">🛠️ ปิดปรับปรุง เร็วๆนี้</span>' : ''}`;
    }
    if (descElem && roomObj) descElem.textContent = roomObj.desc;

    this.updateRoomStatusUI();
    await this.loadMessages(roomId);
    this.fetchResetStatus();
  }

  updateRoomStatusUI() {
    const roomObj = this.rooms.find(r => r.id === this.currentRoom);
    const isClosed = roomObj && roomObj.enabled === false;
    const isDev = window.authManager?.isDev();

    const chatForm = document.getElementById('chatForm');
    const messageInput = document.getElementById('chatMessageInput');
    const sendBtn = document.getElementById('chatSendBtn');

    if (isClosed && !isDev) {
      if (chatForm) chatForm.classList.add('form-disabled-maintenance');
      if (messageInput) {
        messageInput.disabled = true;
        messageInput.placeholder = '🛠️ ห้องแชตนี้ปิดปรับปรุง เร็วๆนี้...';
      }
      if (sendBtn) sendBtn.disabled = true;
    } else {
      if (chatForm) chatForm.classList.remove('form-disabled-maintenance');
      if (messageInput) {
        messageInput.disabled = false;
        messageInput.placeholder = 'พิมพ์ข้อความ... (เฉพาะ @msu.ac.th ในเขต มมส)';
      }
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  async loadMessages(roomId) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    const roomObj = this.rooms.find(r => r.id === roomId);
    const isClosed = roomObj && roomObj.enabled === false;
    const isDev = window.authManager?.isDev();

    if (isClosed && !isDev) {
      container.innerHTML = `
        <div class="chat-maintenance-screen" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; min-height: 280px; text-align: center; padding: 2rem 1.5rem; color: #64748B;">
          <div style="font-size: 3.5rem; margin-bottom: 1rem; animation: pulse 2s infinite;">🛠️</div>
          <h3 style="font-size: 1.25rem; font-weight: 800; color: #0F172A; margin: 0 0 0.5rem 0; font-family: var(--font-heading);">
            ปิดปรับปรุง เร็วๆนี้
          </h3>
          <p style="font-size: 0.85rem; color: #64748B; max-width: 320px; line-height: 1.6; margin: 0 0 1rem 0;">
            ห้องแชต <strong>${roomObj ? roomObj.name : roomId}</strong> กำลังอยู่ระหว่างการปรับปรุงระบบเพื่อเพิ่มประสิทธิภาพ
          </p>
          <div style="display: inline-flex; align-items: center; gap: 0.4rem; background: #FEF3C7; color: #B45309; padding: 0.4rem 0.9rem; border-radius: 999px; font-size: 0.76rem; font-weight: 700; border: 1px solid #FDE68A;">
            <span>⏳</span>
            <span>โปรดติดตามการเปิดใช้งานเร็วๆ นี้</span>
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = '<div style="text-align: center; color: #94A3B8; font-size: 0.8rem; padding: 2rem;">กำลังโหลดข้อความ...</div>';

    try {
      const res = await fetch(`/api/chat/messages/${roomId}`);
      const data = await res.json();
      if (data.success) {
        this.messages = data.data;
        this.renderMessages();
      }
    } catch (e) {
      console.error('Error loading messages:', e);
      container.innerHTML = '<div style="text-align: center; color: #EF4444; font-size: 0.8rem; padding: 2rem;">เกิดข้อผิดพลาดในการโหลดข้อความ</div>';
    }
  }

  renderMessages() {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    if (this.messages.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #94A3B8; font-size: 0.82rem; padding: 3rem 1rem;">
          <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">💬</div>
          <div style="font-weight: 800; color: #334155; font-size: 0.95rem;">ยังไม่มีข้อความในห้องนี้</div>
          <div style="color: #64748B; margin-top: 0.2rem;">พิมพ์ข้อความทักทายเพื่อนๆ ชาว มมส ได้เลย!</div>
        </div>
      `;
      return;
    }

    const currentUserId = window.authManager?.getUser()?.id;
    const isDev = window.authManager?.isDev();

    container.innerHTML = this.messages.map(m => this.buildMessageHtml(m, currentUserId, isDev)).join('');
    this.scrollToBottom();
  }

  appendMessage(msg) {
    const container = document.getElementById('chatMessagesContainer');
    if (!container) return;

    // Remove empty notice if any
    const emptyNotice = container.querySelector('.chat-system-notice') || container.querySelector('div[style*="text-align: center"]');
    if (emptyNotice && this.messages.length === 1) {
      container.innerHTML = '';
    }

    const currentUserId = window.authManager?.getUser()?.id;
    const isDev = window.authManager?.isDev();

    const msgHtml = this.buildMessageHtml(msg, currentUserId, isDev);
    container.insertAdjacentHTML('beforeend', msgHtml);
    this.scrollToBottom();
  }

  buildMessageHtml(m, currentUserId, isDev) {
    const isMe = currentUserId && (m.senderId === currentUserId || (window.authManager?.getUser()?.email && m.senderEmail === window.authManager.getUser().email));
    const canManage = isMe || isDev;
    const timeStr = new Date(m.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const editedBadge = m.isEdited ? `<span class="chat-edited-tag" title="แก้ไขล่าสุด: ${new Date(m.editedAt || m.createdAt).toLocaleTimeString('th-TH')}">✏️ แก้ไขแล้ว</span>` : '';

    const isAnnouncement = m.isAnnouncement || m.senderBadge?.includes('ประกาศ') || m.senderName === 'MSU Traffic';

    let badgeClass = 'badge-member';
    let badgeText = m.senderBadge || '👤 สมาชิก';
    if (isAnnouncement) {
      badgeClass = 'badge-announcement';
      badgeText = '📢 ประกาศทางการ';
    } else if (m.senderBadge?.includes('DEV')) {
      badgeClass = 'badge-dev';
      badgeText = '👑 DEVELOPER';
    } else if (m.senderBadge?.includes('MSU')) {
      badgeClass = 'badge-msu';
      badgeText = '🎓 นิสิต มมส';
    }

    const avatarUrl = isAnnouncement 
      ? 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=120&auto=format&fit=crop&q=80'
      : (m.senderPicture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=60');

    return `
      <div class="chat-bubble-wrap ${isMe && !isAnnouncement ? 'bubble-me' : 'bubble-other'} ${isAnnouncement ? 'bubble-announcement' : ''}" id="chat-msg-${m.id}" data-id="${m.id}">
        ${(!isMe || isAnnouncement) ? `
          <div class="chat-avatar-wrap">
            <img class="chat-avatar" src="${avatarUrl}" alt="avatar">
            ${isAnnouncement ? '<span class="avatar-official-badge">✓</span>' : ''}
          </div>
        ` : ''}
        <div class="chat-bubble-content">
          ${(!isMe || isAnnouncement) ? `
            <div class="chat-sender-header">
              <span class="chat-sender-name">${m.senderName}</span>
              <span class="chat-badge ${badgeClass}">${badgeText}</span>
              ${m.location?.distKm !== undefined && m.location.distKm < 50 && !isAnnouncement ? `<span class="chat-geo-tag">📍 ~${m.location.distKm} กม.</span>` : ''}
              <span class="chat-header-time">${timeStr}</span>
            </div>
          ` : ''}
          <div class="chat-bubble-box ${isAnnouncement ? 'box-announcement' : ''}">
            ${isAnnouncement ? `
              <div class="announcement-ribbon">
                <span class="ribbon-title">📢 ประกาศประชาสัมพันธ์</span>
              </div>
            ` : ''}
            <div class="chat-bubble-text" id="msg-text-${m.id}">${this.escapeHtml(m.text)}</div>
          </div>
          <div class="chat-bubble-footer">
            ${isMe && !isAnnouncement ? `<span class="chat-time">${timeStr}</span>` : ''}
            ${editedBadge}
            ${canManage ? `
              <div class="chat-msg-actions">
                <button class="chat-action-btn btn-edit-msg" onclick="window.chatManager.editMessage('${m.id}')" title="แก้ไขข้อความ">✏️ แก้ไข</button>
                <button class="chat-action-btn btn-delete-msg" onclick="window.chatManager.deleteMessage('${m.id}')" title="ยกเลิก/ลบข้อความ">🗑️ ลบ</button>
              </div>
            ` : `
              <button class="chat-report-btn" onclick="window.chatManager.openReportMessageModal('${m.id}')" title="รายงานข้อความนี้">🚩 รีพอร์ต</button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  scrollToBottom() {
    const container = document.getElementById('chatMessagesContainer');
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  // ----------------------------------------------------
  // 4. Send Message Handler (พร้อมระบบกันสแปม 10 วินาที)
  // ----------------------------------------------------
  async sendMessage(e) {
    if (e) e.preventDefault();

    if (!window.authManager?.isLoggedIn()) {
      window.authManager.openLoginModal('กรุณาเข้าสู่ระบบด้วยอีเมล @msu.ac.th เพื่อร่วมพูดคุยในห้องแชต');
      return;
    }

    // ตรวจสอบ Cooldown กันสแปม
    if (this.cooldownSeconds > 0) {
      if (window.app) {
        window.app.showNotification(`⏱️ กรุณารออีก ${this.cooldownSeconds} วินาทีก่อนส่งข้อความถัดไป (ระบบกันสแปม 10 วิ)`, 'warning');
      } else {
        alert(`⏱️ กรุณารออีก ${this.cooldownSeconds} วินาทีก่อนส่งข้อความถัดไป`);
      }
      return;
    }

    const input = document.getElementById('chatMessageInput');
    const anonCheckbox = document.getElementById('chatAnonToggle');
    const announcementCheckbox = document.getElementById('chatAnnouncementToggle');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const isAnnouncement = announcementCheckbox?.checked || false;

    const payload = {
      roomId: this.currentRoom,
      text,
      lat: this.userLocation?.lat || null,
      lng: this.userLocation?.lng || null,
      isAnonymous: isAnnouncement ? false : (anonCheckbox?.checked || false),
      isAnnouncement: isAnnouncement
    };

    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        input.value = '';
        input.focus();

        // ⏱️ เริ่มนับถอยหลังกันสแปม 10 วินาที (ยกเว้น Dev)
        if (!window.authManager?.isDev()) {
          this.startSendCooldown(10);
        }
      } else {
        if (res.status === 429 && data.remainingSec) {
          this.startSendCooldown(data.remainingSec);
        }
        alert(data.error || 'ไม่สามารถส่งข้อความได้');
      }
    } catch (err) {
      console.error('Error sending message:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  // ⏱️ ฟังก์ชันนับถอยหลังปุ่มส่งข้อความ (Anti-Spam Cooldown)
  startSendCooldown(seconds = 10) {
    this.cooldownSeconds = seconds;
    const sendBtn = document.getElementById('chatSendBtn');

    if (this.cooldownTimer) clearInterval(this.cooldownTimer);

    const updateBtn = () => {
      if (!sendBtn) return;
      if (this.cooldownSeconds > 0) {
        sendBtn.disabled = true;
        sendBtn.innerHTML = `<span>⏳ รอ ${this.cooldownSeconds} วิ</span>`;
        sendBtn.style.opacity = '0.7';
        sendBtn.style.cursor = 'not-allowed';
      } else {
        sendBtn.disabled = false;
        sendBtn.innerHTML = `<span>ส่ง ➔</span>`;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        if (this.cooldownTimer) {
          clearInterval(this.cooldownTimer);
          this.cooldownTimer = null;
        }
      }
    };

    updateBtn();

    this.cooldownTimer = setInterval(() => {
      this.cooldownSeconds -= 1;
      updateBtn();
    }, 1000);
  }

  // ----------------------------------------------------
  // ✏️ 5. Edit Message (แก้ไขข้อความ)
  // ----------------------------------------------------
  async editMessage(msgId) {
    const msgObj = this.messages.find(m => m.id === msgId);
    const initialText = msgObj ? msgObj.text : '';

    const newText = prompt('✏️ แก้ไขข้อความของคุณ:', initialText);
    if (newText === null) return; // กดยกเลิก
    if (!newText.trim()) {
      alert('ข้อความไม่สามารถเว้นว่างได้');
      return;
    }
    if (newText.trim() === initialText.trim()) return; // ไม่มีการเปลี่ยนแปลง

    try {
      const res = await fetch(`/api/chat/messages/${msgId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        },
        body: JSON.stringify({ text: newText.trim() })
      });

      const data = await res.json();
      if (data.success) {
        if (window.app) {
          window.app.showNotification('✏️ แก้ไขข้อความสำเร็จแล้ว', 'success');
        }
      } else {
        alert(data.error || 'ไม่สามารถแก้ไขข้อความได้');
      }
    } catch (err) {
      console.error('Error editing message:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  // ----------------------------------------------------
  // 🗑️ 6. Delete / Unsend Message (ยกเลิก / ลบข้อความ)
  // ----------------------------------------------------
  async deleteMessage(msgId) {
    if (!confirm('🗑️ คุณต้องการยกเลิกข้อความนี้ใช่หรือไม่?')) return;

    try {
      const res = await fetch(`/api/chat/messages/${msgId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        }
      });

      const data = await res.json();
      if (data.success) {
        if (window.app) {
          window.app.showNotification('🗑️ ยกเลิกข้อความเรียบร้อยแล้ว', 'info');
        }
      } else {
        alert(data.error || 'ไม่สามารถยกเลิกข้อความได้');
      }
    } catch (err) {
      console.error('Error deleting message:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  // ----------------------------------------------------
  // 🧹 7. DEV CLEAR CHAT (ระบบยืนยัน 2 ขั้นตอน)
  // ----------------------------------------------------
  async confirmDevClearChat() {
    if (!window.authManager?.isDev()) {
      alert('🔒 เฉพาะผู้พัฒนา (Dev) เท่านั้นที่มีสิทธิ์ล้างประวัติแชต');
      return;
    }

    const roomObj = this.rooms.find(r => r.id === this.currentRoom);
    const roomName = roomObj ? roomObj.name : this.currentRoom;

    // ยืนยันขั้นที่ 1
    const step1 = confirm(`⚠️ [ยืนยันขั้นที่ 1/2 - DEV]\nคุณต้องการล้างข้อความทั้งหมดในห้อง "${roomName}" ใช่หรือไม่?`);
    if (!step1) return;

    // ยืนยันขั้นที่ 2 (ครั้งสุดท้าย)
    const step2 = confirm(`🚨 [ยืนยันขั้นที่ 2/2 - ครั้งสุดท้าย]\nข้อความทั้งหมดในห้อง "${roomName}" จะถูกลบถาวรทันทีและไม่สามารถกู้คืนได้ ยืนยันการล้างประวัติแชตหรือไม่?`);
    if (!step2) return;

    try {
      const res = await fetch(`/api/chat/rooms/${this.currentRoom}/messages`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...window.authManager.getAuthHeader()
        }
      });

      const data = await res.json();
      if (data.success) {
        if (window.app) {
          window.app.showNotification(`🧹 ${data.message}`, 'success');
        }
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการล้างประวัติแชต');
      }
    } catch (err) {
      console.error('Error clearing chat:', err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
    }
  }

  // ----------------------------------------------------
  // 🌙 8. Midnight Idle Reset Countdown Engine
  // ----------------------------------------------------
  async fetchResetStatus() {
    try {
      const res = await fetch(`/api/chat/reset-status/${this.currentRoom}`);
      const data = await res.json();
      if (data.success && data.data) {
        this.resetStatus = data.data;
        this.updateResetCountdownUI();
      }
    } catch (e) {
      console.warn('Error fetching chat reset status:', e);
    }
  }

  startMidnightResetCountdown() {
    this.fetchResetStatus();

    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = setInterval(() => {
      if (this.resetStatus && this.resetStatus.secToMidnight > 0) {
        this.resetStatus.secToMidnight -= 1;
        if (this.resetStatus.idleSeconds !== null) {
          this.resetStatus.idleSeconds += 1;
        }
      }
      this.updateResetCountdownUI();
    }, 1000);
  }

  updateResetCountdownUI() {
    const countdownElem = document.getElementById('chatResetCountdown');
    if (!countdownElem || !this.resetStatus) return;

    const sec = this.resetStatus.secToMidnight || 0;
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    const pad = (n) => String(n).padStart(2, '0');

    if (sec <= 0 || (hrs === 0 && mins === 0)) {
      // Midnight window
      const idleSec = this.resetStatus.idleSeconds || 0;
      if (idleSec >= 900) {
        countdownElem.innerHTML = `<span style="color: #EF4444; font-weight: 800;">🧹 พร้อมรีเซ็ตอัตโนมัติ (ไม่มีคนคุยเกิน 15 นาที)</span>`;
      } else {
        const remainingIdleSec = Math.max(0, 900 - idleSec);
        const remMins = Math.floor(remainingIdleSec / 60);
        const remSecs = remainingIdleSec % 60;
        countdownElem.innerHTML = `<span style="color: #F59E0B; font-weight: 700;">💬 มีการสนทนาอยู่ (จะรีเซ็ตเมื่อไม่มีคนคุยอีก ${remMins}:${pad(remSecs)} นาที)</span>`;
      }
    } else {
      countdownElem.innerHTML = `⏳ อีก <strong>${hrs} ชม. ${pad(mins)} นาที</strong> (เที่ยงคืน)`;
    }
  }

  updateDevClearBtn() {
    const isDev = window.authManager?.isDev();
    const btn = document.getElementById('devClearChatBtn');
    if (btn) {
      btn.style.display = isDev ? 'inline-flex' : 'none';
    }
    const announcementLabel = document.getElementById('chatAnnouncementLabel');
    if (announcementLabel) {
      announcementLabel.style.display = isDev ? 'inline-flex' : 'none';
    }
  }

  openReportMessageModal(msgId) {
    const reason = prompt('กรุณาระบุเหตุผลในการรายงานข้อความนี้ (เช่น สแปม, ขายของผิดห้อง, คำหยาบคาย):');
    if (!reason || !reason.trim()) return;

    fetch(`/api/chat/messages/${msgId}/report`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...window.authManager.getAuthHeader()
      },
      body: JSON.stringify({ reason: reason.trim() })
    })
    .then(res => res.json())
    .then(data => {
      alert(data.message || 'บันทึกการรายงานแล้ว');
    })
    .catch(err => console.error(err));
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

  updateRoomUnreadBadge(roomId) {
    // optional unread indicator
  }
}

window.chatManager = new ChatManager();
