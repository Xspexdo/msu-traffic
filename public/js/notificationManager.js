/**
 * 🔔 MSU Traffic - Browser Notification & Sound Alert Manager
 * รองรับ Web Notification API + Service Worker + Web Audio API Sound Synthesis
 */
class NotificationManager {
  constructor() {
    this.isEnabled = localStorage.getItem('msu_browser_notifications') === 'true';
    this.hasDismissedBanner = localStorage.getItem('msu_notif_banner_dismissed') === 'true';
    this.audioCtx = null;
    this.serviceWorkerReg = null;
    this.recentNotificationTags = new Set();
  }

  async init() {
    // 1. ตรวจสอบการลงทะเบียน Service Worker
    if ('serviceWorker' in navigator) {
      try {
        this.serviceWorkerReg = await navigator.serviceWorker.register('/sw.js');
        console.log('✅ Service Worker registered for Notifications');
      } catch (err) {
        console.warn('Service Worker registration skipped:', err);
      }

      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'FOCUS_REPORT' && event.data.reportId) {
          if (window.app && window.mapManager) {
            window.app.switchTab('map');
            window.mapManager.focusReport(event.data.reportId);
          }
        }
      });
    }

    // 2. ซิงค์สถานะ Permission
    if (this.isSupported()) {
      if (Notification.permission === 'granted') {
        if (localStorage.getItem('msu_browser_notifications') === null) {
          this.isEnabled = true;
          localStorage.setItem('msu_browser_notifications', 'true');
        }
      } else if (Notification.permission === 'denied') {
        this.isEnabled = false;
        localStorage.setItem('msu_browser_notifications', 'false');
      }
    }

    // 3. อัปเดต UI
    this.updateMenuUI();
    this.checkShowPromptBanner();
  }

  isSupported() {
    return 'Notification' in window;
  }

  getPermissionStatus() {
    if (!this.isSupported()) return 'unsupported';
    return Notification.permission;
  }

  // ----------------------------------------------------
  // 🔊 Web Audio API Synthesizer (เสียงแจ้งเตือนแบบ Chime สดใส)
  // ----------------------------------------------------
  playAlertSound(type = 'checkpoint') {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContext();
      }

      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      if (type === 'checkpoint') {
        // 🚨 สัญญาณเตือนด่าน: 2 โทนเสียงสูง-ต่ำ ชัดเจน นุ่มนวล
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(880, now); // A5
        osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.15); // D6

        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(587.33, now); // D5
        osc2.frequency.exponentialRampToValueAtTime(880, now + 0.15);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.5);
        osc2.stop(now + 0.5);
      } else if (type === 'chat') {
        // 💬 เสียงแจ้งเตือนข้อความแชท (Pop Chime)
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now); // E5
        osc.frequency.exponentialRampToValueAtTime(987.77, now + 0.08); // B5

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch (e) {
      console.warn('Audio play warning:', e);
    }
  }

  // ----------------------------------------------------
  // 🔔 ขอสิทธิ์การแจ้งเตือน (Request Permission)
  // ----------------------------------------------------
  async requestPermission() {
    if (!this.isSupported()) {
      if (window.app) {
        window.app.showNotification('❌ เบราว์เซอร์นี้ไม่รองรับระบบ Browser Notification', 'warning');
      }
      return false;
    }

    try {
      const result = await Notification.requestPermission();
      if (result === 'granted') {
        this.isEnabled = true;
        localStorage.setItem('msu_browser_notifications', 'true');
        this.updateMenuUI();
        this.dismissBanner();
        this.playAlertSound('checkpoint');
        this.showNotificationRaw('🎉 เปิดการแจ้งเตือนสำเร็จ!', {
          body: 'คุณจะได้รับการแจ้งเตือนทันทีเมื่อมีรายงานด่านใหม่รอบ มมส',
          icon: '/images/logo.png',
          tag: 'welcome-notification'
        });
        if (window.app) {
          window.app.showNotification('🔔 เปิดแจ้งเตือนผ่านเบราว์เซอร์เรียบร้อยแล้ว!', 'success');
        }
        return true;
      } else if (result === 'denied') {
        this.isEnabled = false;
        localStorage.setItem('msu_browser_notifications', 'false');
        this.updateMenuUI();
        if (window.app) {
          window.app.showNotification('⚠️ คุณได้ปฏิเสธสิทธิ์การแจ้งเตือน สามารถเปิดได้ที่การตั้งค่าไซต์ของเบราว์เซอร์', 'warning');
        }
        return false;
      }
    } catch (e) {
      console.error('Error requesting notification permission:', e);
    }
    return false;
  }

  // ----------------------------------------------------
  // 🔄 สลับเปิด/ปิด การแจ้งเตือนจากเมนู
  // ----------------------------------------------------
  async toggle() {
    if (!this.isSupported()) {
      if (window.app) window.app.showNotification('❌ เบราว์เซอร์นี้ไม่รองรับระบบ Notification', 'warning');
      return;
    }

    if (Notification.permission === 'default') {
      await this.requestPermission();
      return;
    }

    if (Notification.permission === 'denied') {
      if (window.app) {
        window.app.showNotification('⚠️ เบราว์เซอร์ถูกบล็อกการแจ้งเตือน กรุณาคลิกไอคอน 🔒/⚙️ ข้างแถบ URL เพื่อปลดล็อก', 'warning');
      }
      return;
    }

    // กรณี granted อยู่แล้ว: toggle on/off
    this.isEnabled = !this.isEnabled;
    localStorage.setItem('msu_browser_notifications', this.isEnabled ? 'true' : 'false');
    this.updateMenuUI();

    if (this.isEnabled) {
      this.playAlertSound('checkpoint');
      if (window.app) window.app.showNotification('🔔 เปิดการแจ้งเตือนเบราว์เซอร์แล้ว', 'success');
    } else {
      if (window.app) window.app.showNotification('🔕 ปิดการแจ้งเตือนเบราว์เซอร์ชั่วคราวแล้ว', 'info');
    }
  }

  // ----------------------------------------------------
  // 🚀 ส่ง Notification ไปยัง Browser
  // ----------------------------------------------------
  showNotificationRaw(title, options = {}) {
    if (!this.isSupported() || !this.isEnabled || Notification.permission !== 'granted') {
      return null;
    }

    const defaultOptions = {
      icon: '/images/logo.png',
      badge: '/favicon.svg',
      vibrate: [200, 100, 200],
      tag: 'msu-traffic-' + Date.now(),
      renotify: true
    };

    const finalOptions = Object.assign({}, defaultOptions, options);

    // ป้องกันการยิง notification ซ้ำ tag ในเสี้ยววินาที
    if (finalOptions.tag && this.recentNotificationTags.has(finalOptions.tag)) {
      return null;
    }
    if (finalOptions.tag) {
      this.recentNotificationTags.add(finalOptions.tag);
      setTimeout(() => this.recentNotificationTags.delete(finalOptions.tag), 5000);
    }

    try {
      // 1. ลองผ่าน Service Worker Registration ก่อน (แสดงผลได้ดีบน Android / PWA)
      if (this.serviceWorkerReg && 'showNotification' in this.serviceWorkerReg) {
        this.serviceWorkerReg.showNotification(title, finalOptions);
      } else {
        // 2. ใช้ Web Notification API มาตรฐาน
        const notif = new Notification(title, finalOptions);
        notif.onclick = function() {
          window.focus();
          if (finalOptions.data && finalOptions.data.reportId && window.app && window.mapManager) {
            window.app.switchTab('map');
            window.mapManager.focusReport(finalOptions.data.reportId);
          }
          notif.close();
        };
      }
    } catch (e) {
      console.warn('Browser Notification error, fallbacking:', e);
    }
  }

  // ----------------------------------------------------
  // 🚨 แจ้งเตือนเมื่อมีด่านใหม่ (New Checkpoint Alert)
  // ----------------------------------------------------
  notifyNewCheckpoint(report) {
    if (!report) return;

    // เล่นเสียงแจ้งเตือน
    this.playAlertSound('checkpoint');

    const typeNames = {
      helmet: '👮‍♂️ ด่านตรวจหมวกกันน็อก / ใบขับขี่',
      alcohol: '🍺 ด่านตรวจวัดแอลกอฮอล์',
      security: '🛡️ ด่านตรวจค้นความมั่นคง',
      traffic: '🚗 รายงานรถติดสะสม',
      accident: '🚑 อุบัติเหตุ'
    };

    const typeLabel = typeNames[report.type] || '📍 รายงานจุดตรวจใหม่';
    const loc = report.title || report.locationName || 'รอบ มมส';
    const zone = report.campusZone ? `[${report.campusZone}]` : '';
    const dir = report.direction ? ` (${report.direction})` : '';

    const title = `🚨 ด่านใหม่! ${zone} ${loc}`;
    const body = `${typeLabel}${dir}\n${report.description || 'กดเพื่อเปิดดูพิกัดบนแผนที่ทันที'}`;

    this.showNotificationRaw(title, {
      body: body,
      icon: '/images/logo.png',
      badge: '/favicon.svg',
      tag: `report-${report.id}`,
      data: { reportId: report.id, url: '/' }
    });
  }

  // ----------------------------------------------------
  // 💬 แจ้งเตือนข้อความแชทใหม่ (New Chat Message)
  // ----------------------------------------------------
  notifyNewChatMessage(msg, roomName = '') {
    if (!msg) return;

    // แจ้งเตือนเฉพาะตอนที่ผู้ใช้ไม่ได้มองแท็บเว็บนี้ (Background Tab) หรือพับหน้าต่างอยู่
    const isTabHidden = document.hidden || !document.hasFocus();
    if (!isTabHidden) return;

    this.playAlertSound('chat');

    const sender = msg.senderName || 'นิสิต มมส';
    const roomTitle = roomName ? `ห้อง ${roomName}` : 'ห้องแชท มมส';
    const text = msg.text || '';

    this.showNotificationRaw(`💬 ${sender} (${roomTitle})`, {
      body: text.length > 80 ? text.substring(0, 77) + '...' : text,
      icon: msg.senderPicture || '/images/logo.png',
      badge: '/favicon.svg',
      tag: `chat-${msg.id || Date.now()}`,
      data: { url: '/' }
    });
  }

  // ----------------------------------------------------
  // 📢 แจ้งเตือนประกาศทางการ (Announcement)
  // ----------------------------------------------------
  notifyAnnouncement(ann) {
    if (!ann || !ann.text) return;
    this.playAlertSound('checkpoint');
    this.showNotificationRaw('📢 ประกาศด่วนจาก MSU Traffic', {
      body: ann.text,
      icon: '/images/logo.png',
      badge: '/favicon.svg',
      tag: 'announcement-alert'
    });
  }

  // ----------------------------------------------------
  // 🎨 อัปเดต UI Menu Dropdown
  // ----------------------------------------------------
  updateMenuUI() {
    const btn = document.getElementById('menuNotificationBtn');
    const icon = document.getElementById('menuNotificationIcon');
    const text = document.getElementById('menuNotificationText');

    if (!btn || !icon || !text) return;

    if (!this.isSupported()) {
      icon.textContent = '🔕';
      text.textContent = 'แจ้งเตือน (ไม่รองรับ)';
      btn.style.opacity = '0.5';
      return;
    }

    if (Notification.permission === 'granted' && this.isEnabled) {
      icon.textContent = '🔔';
      text.innerHTML = 'แจ้งเตือนบราวเซอร์ <span style="color: #10B981; font-weight: 700; font-size: 0.72rem; margin-left: 4px;">(เปิดอยู่)</span>';
      btn.classList.add('active-feature');
    } else if (Notification.permission === 'denied') {
      icon.textContent = '🚫';
      text.innerHTML = 'แจ้งเตือนบราวเซอร์ <span style="color: #EF4444; font-weight: 700; font-size: 0.72rem; margin-left: 4px;">(ถูกบล็อก)</span>';
      btn.classList.remove('active-feature');
    } else {
      icon.textContent = '🔔';
      text.innerHTML = 'แจ้งเตือนบราวเซอร์ <span style="color: #F59E0B; font-weight: 700; font-size: 0.72rem; margin-left: 4px;">(กดเพื่อเปิด)</span>';
      btn.classList.remove('active-feature');
    }
  }

  // ----------------------------------------------------
  // 💬 Floating Prompt Banner สำหรับผู้ใช้ใหม่
  // ----------------------------------------------------
  checkShowPromptBanner() {
    if (!this.isSupported()) return;
    if (Notification.permission === 'default' && !this.hasDismissedBanner) {
      setTimeout(() => {
        const banner = document.getElementById('notifPromptFloatingBanner');
        if (banner) {
          banner.classList.add('show');
        }
      }, 2500);
    }
  }

  dismissBanner() {
    this.hasDismissedBanner = true;
    localStorage.setItem('msu_notif_banner_dismissed', 'true');
    const banner = document.getElementById('notifPromptFloatingBanner');
    if (banner) {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 400);
    }
  }
}

// Global Singleton
window.notificationManager = new NotificationManager();
