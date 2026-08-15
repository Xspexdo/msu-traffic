/**
 * =========================================================================
 * MSU Traffic - Enterprise WAF & Security Shield Controller (Client-Side)
 * =========================================================================
 * Inspired by Cloudflare / AWS WAF Enterprise Defense
 * 
 * Features:
 * - Automatic HTTP 429 Throttling Interceptor
 * - Enterprise Security Shield Overlay with Incident Ray ID & Telemetry
 * - Dynamic SVG Countdown Gauge & Auto-Retry
 * - Secure Developer / Admin Key Authentication Portal
 * - Simulated Burst Test Runner for Demonstration
 * =========================================================================
 */

class RateLimitAlert {
  constructor() {
    this.overlayElement = null;
    this.countdownTimer = null;
    this.remainingSeconds = 0;
    this.totalPenaltySeconds = 0;
    this.currentIncident = {
      rayId: 'RAY-MSU-INIT',
      reason: 'Standard Security Check',
      ip: '127.0.0.1'
    };

    this.initOverlay();
    this.setupFetchInterceptor();
  }

  initOverlay() {
    let overlay = document.getElementById('banOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'banOverlay';
      overlay.className = 'waf-shield-overlay';
      overlay.style.display = 'none';
      overlay.innerHTML = `
        <div class="waf-shield-card">
          <!-- Top Header & Security Status -->
          <div class="waf-card-header">
            <div class="waf-shield-icon-box">
              <span class="waf-shield-icon">🛡️</span>
            </div>
            <div class="waf-header-text">
              <div class="waf-badge">
                <span class="waf-pulse-dot"></span>
                <span>MSU TRAFFIC SECURITY SHIELD (WAF)</span>
              </div>
              <h2 class="waf-title">ตรวจพบอัตราคำขอสูงกว่าเกณฑ์ความปลอดภัย</h2>
              <p class="waf-subtitle">
                ระบบได้ทำการจำกัดการเชื่อมต่อชั่วคราวเพื่อป้องกันการโจมตีและการส่งคำขอถี่เกินไป (Rate Limit Protection)
              </p>
            </div>
          </div>

          <!-- Incident Diagnostic Telemetry Box -->
          <div class="waf-telemetry-box">
            <div class="waf-telemetry-grid">
              <div class="waf-telemetry-item">
                <span class="waf-tel-label">INCIDENT RAY ID</span>
                <span class="waf-tel-val" id="wafRayIdDisplay">RAY-MSU-XXXXXX</span>
              </div>
              <div class="waf-telemetry-item">
                <span class="waf-tel-label">CLIENT IP</span>
                <span class="waf-tel-val" id="wafIpDisplay">127.0.0.1</span>
              </div>
              <div class="waf-telemetry-item">
                <span class="waf-tel-label">THREAT REASON</span>
                <span class="waf-tel-val waf-reason-tag" id="wafReasonDisplay">High Request Velocity</span>
              </div>
              <div class="waf-telemetry-item">
                <span class="waf-tel-label">PROTECTION TIER</span>
                <span class="waf-tel-val" style="color: #F59E0B;">Sliding Window Counter</span>
              </div>
            </div>
          </div>

          <!-- Countdown Progress Area -->
          <div class="waf-countdown-container">
            <div class="waf-countdown-label">เวลาระงับการเชื่อมต่อชั่วคราวคงเหลือ:</div>
            <div class="waf-countdown-clock" id="wafCountdownClock">00:15</div>
            
            <div class="waf-progress-bar-bg">
              <div class="waf-progress-bar-fill" id="wafProgressBarFill" style="width: 100%;"></div>
            </div>
            <div class="waf-countdown-hint">
              ระบบจะทำการเชื่อมต่อใหม่อัตโนมัติเมื่อครบกำหนด หรือคุณสามารถกดปุ่มลองใหม่ด้านล่าง
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="waf-actions-wrap">
            <button class="btn btn-primary waf-retry-btn" id="wafRetryBtn" onclick="window.rateLimitAlert.retryConnection()">
              <span>🔄 ตรวจสอบและเชื่อมต่อใหม่ (Retry)</span>
            </button>

            <!-- Admin / Dev Key Accordion Toggle -->
            <button class="waf-admin-toggle-btn" onclick="window.rateLimitAlert.toggleAdminUnlockBox()">
              <span>🔐 ปลดล็อกสำหรับ Developer / ผู้ดูแลระบบ (Admin Key)</span>
              <span id="wafAdminArrow">▼</span>
            </button>

            <!-- Admin Key Input Box (Hidden by default) -->
            <div id="wafAdminUnlockBox" class="waf-admin-box" style="display: none;">
              <div class="waf-admin-box-title">ระบุ Admin Master Security Key:</div>
              <div class="waf-admin-input-row">
                <input type="password" id="wafAdminKeyInput" class="waf-admin-input" placeholder="กรอก Admin Key (เช่น msu-dev-master-sec-key-2026)">
                <button class="btn btn-primary btn-sm" onclick="window.rateLimitAlert.unlockWithAdminKey()">
                  <span>ปลดล็อก</span>
                </button>
              </div>
              <div class="waf-admin-hint">
                * สำหรับผู้พัฒนา เจ้าของระบบ หรือสถานการณ์ฉุกเฉิน
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    this.overlayElement = overlay;
  }

  showShield(incidentData = {}) {
    const remainingSeconds = parseInt(incidentData.remainingSeconds || incidentData.penaltySeconds || 15, 10);
    this.remainingSeconds = Math.max(1, remainingSeconds);
    this.totalPenaltySeconds = Math.max(this.remainingSeconds, incidentData.penaltySeconds || this.remainingSeconds);

    this.currentIncident = {
      rayId: incidentData.incidentRayId || incidentData.rayId || `RAY-MSU-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      reason: incidentData.reason || 'High Request Velocity Detected',
      ip: incidentData.ip || 'Your IP'
    };

    // Update Telemetry Elements
    const rayEl = document.getElementById('wafRayIdDisplay');
    const ipEl = document.getElementById('wafIpDisplay');
    const reasonEl = document.getElementById('wafReasonDisplay');

    if (rayEl) rayEl.textContent = this.currentIncident.rayId;
    if (ipEl) ipEl.textContent = this.currentIncident.ip;
    if (reasonEl) reasonEl.textContent = this.currentIncident.reason;

    this.overlayElement.style.display = 'flex';
    this.updateClock();

    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
    }

    this.countdownTimer = setInterval(() => {
      this.remainingSeconds -= 1;
      this.updateClock();

      if (this.remainingSeconds <= 0) {
        this.hideShield();
        this.retryConnection();
      }
    }, 1000);
  }

  updateClock() {
    const clockEl = document.getElementById('wafCountdownClock');
    const progressEl = document.getElementById('wafProgressBarFill');

    if (clockEl) {
      const mins = Math.floor(this.remainingSeconds / 60);
      const secs = this.remainingSeconds % 60;
      clockEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    if (progressEl && this.totalPenaltySeconds > 0) {
      const percentage = Math.max(0, Math.min(100, (this.remainingSeconds / this.totalPenaltySeconds) * 100));
      progressEl.style.width = `${percentage}%`;
    }
  }

  hideShield() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    if (this.overlayElement) {
      this.overlayElement.style.display = 'none';
    }
  }

  toggleAdminUnlockBox() {
    const box = document.getElementById('wafAdminUnlockBox');
    const arrow = document.getElementById('wafAdminArrow');
    if (box) {
      const isVisible = box.style.display !== 'none';
      box.style.display = isVisible ? 'none' : 'block';
      if (arrow) arrow.textContent = isVisible ? '▼' : '▲';
    }
  }

  // Admin Key Unlock Action
  async unlockWithAdminKey() {
    const input = document.getElementById('wafAdminKeyInput');
    const key = input ? input.value.trim() : '';

    if (!key) {
      alert('กรุณากรอก Admin Security Key');
      return;
    }

    try {
      const res = await fetch('/api/security/admin/unban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminKey: key, unbanAll: true })
      });

      const data = await res.json();
      if (data.success) {
        this.hideShield();
        // Save key for session convenience if dev
        sessionStorage.setItem('msu_admin_key', key);
        if (window.app) {
          window.app.showNotification('🛡️ ปลดล็อกระบบ WAF สำเร็จ (สิทธิ์ Security Administrator)', 'success');
          window.app.loadReports();
        }
      } else {
        alert(data.message || 'รหัส Admin Key ไม่ถูกต้อง');
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อเพื่อปลดล็อก');
    }
  }

  // Check and retry connection
  async retryConnection() {
    const btn = document.getElementById('wafRetryBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span>⏳ กำลังตรวจสอบสถานะการเชื่อมต่อ...</span>';
    }

    try {
      const res = await fetch('/api/security/status');
      const data = await res.json();

      if (data.client && data.client.banned) {
        this.showShield({
          remainingSeconds: data.client.remainingSeconds,
          penaltySeconds: data.client.remainingSeconds,
          reason: data.client.reason,
          incidentRayId: data.client.rayId,
          ip: data.client.ip
        });
      } else {
        this.hideShield();
        if (window.app) {
          window.app.showNotification('✅ การเชื่อมต่อกลับสู่สภาวะปกติแล้ว', 'success');
          window.app.loadReports();
        }
      }
    } catch (e) {
      this.hideShield();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>🔄 ตรวจสอบและเชื่อมต่อใหม่ (Retry)</span>';
      }
    }
  }

  setupFetchInterceptor() {
    const originalFetch = window.fetch;
    const self = this;

    window.fetch = async function(url, options = {}) {
      options.headers = options.headers || {};

      // Auto attach auth header if logged in
      if (window.authManager && window.authManager.isLoggedIn()) {
        options.headers = {
          ...options.headers,
          ...window.authManager.getAuthHeader()
        };
      }

      // Auto attach admin key if previously saved in session
      const savedAdminKey = sessionStorage.getItem('msu_admin_key');
      if (savedAdminKey) {
        options.headers['x-admin-key'] = savedAdminKey;
      }

      try {
        const response = await originalFetch.call(this, url, options);

        if (response.status === 429) {
          const clone = response.clone();
          clone.json().then(data => {
            self.showShield({
              remainingSeconds: data.remainingSeconds || 15,
              penaltySeconds: data.penaltySeconds || data.remainingSeconds || 15,
              reason: data.reason || 'Rate Limit Exceeded',
              incidentRayId: data.incidentRayId || response.headers.get('X-Incident-Ray-ID'),
              ip: data.ip
            });
          }).catch(() => {
            const retryAfter = response.headers.get('Retry-After');
            self.showShield({
              remainingSeconds: retryAfter ? parseInt(retryAfter, 10) : 15,
              penaltySeconds: 15,
              reason: 'HTTP 429 Too Many Requests'
            });
          });
        }

        return response;
      } catch (err) {
        throw err;
      }
    };
  }

  // Simulated Stress Test Runner (Burst of requests)
  async runBurstSimulation(count = 30) {
    if (confirm(`คุณต้องการจำลองส่ง Traffic Burst จำนวน ${count} Requests ใน 1 วินาที เพื่อทดสอบระบบ WAF และการสกัดกั้นอัตโนมัติ ใช่หรือไม่?`)) {
      if (window.app) {
        window.app.showNotification(`⚡ กำลังจำลองส่ง ${count} Requests พร้อมกัน...`, 'warning');
      }

      const promises = [];
      for (let i = 0; i < count; i++) {
        promises.push(
          fetch('/api/security/test-ping', {
            headers: { 'Cache-Control': 'no-cache' }
          }).catch(() => {})
        );
      }

      await Promise.all(promises);
    }
  }
}

// Global WAF Controller Instance
window.rateLimitAlert = new RateLimitAlert();
