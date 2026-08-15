/**
 * ==============================================================================
 * 🛡️ MSU Traffic - Security Gatekeeper & Anti-VPN / Mandatory GPS Module
 * ==============================================================================
 * หน้าที่:
 * 1. บังคับให้ผู้ใช้เปิดตำแหน่ง GPS จริง หากไม่เปิดจะไม่สามารถเข้าดูหรือใช้งานเว็บได้
 * 2. ตรวจจับและบล็อกการมุด VPN / Proxy / Mock Location จนกว่าจะใช้อินเทอร์เน็ตจริง
 * 3. ตรวจสอบความถูกต้องของพิกัดและกระจายตำแหน่งไปยัง Map & Chat
 * ==============================================================================
 */

class SecurityGatekeeper {
  constructor() {
    this.gpsVerified = false;
    this.vpnDetected = false;
    this.userLocation = null;
    this.isChecking = false;
    this.vpnReason = '';
  }

  async init() {
    console.log('🛡️ Initializing Security Gatekeeper (Mandatory GPS & Anti-VPN Shield)...');

    // 1. Perform Anti-VPN / Proxy Check First (Strictly Enforced)
    const isCleanNetwork = await this.checkVpnStatus();
    if (!isCleanNetwork) {
      this.showVpnBlockScreen(this.vpnReason);
      return;
    }

    // 2. Mandatory GPS Check (Required for Everyone without exception)
    await this.requestGpsLocation();
  }

  /**
   * 🌐 1. Anti-VPN & Proxy Detection
   */
  async checkVpnStatus() {
    try {
      // 1. Client-Side Timezone Check (Cross-Verification)
      const clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezoneOffset = new Date().getTimezoneOffset(); // Thailand is -420 (UTC+7)

      // 2. Backend WAF VPN Inspection
      const res = await fetch('/api/security/vpn-check');
      const data = await res.json();

      if (data.isVpn || data.blocked) {
        this.vpnDetected = true;
        this.vpnReason = data.reason || 'ตรวจพบการเชื่อมต่อผ่านเครือข่าย Proxy หรือ VPN';
        return false;
      }

      // Check timezone anomaly (e.g. UTC offset vastly different from Thailand without Dev)
      // Note: Allow minor offsets for nearby SEA, but block Western/European VPN proxies
      if (Math.abs(timezoneOffset - (-420)) > 300) {
        // Mismatch of more than 5 hours from Bangkok time
        this.vpnDetected = true;
        this.vpnReason = `เวลาโซนเครื่องไม่ตรงกับประเทศไทย (${clientTimezone} / UTC Offset: ${-timezoneOffset/60}h) ตรวจพบการใช้งาน VPN ต่างประเทศ`;
        return false;
      }

      this.vpnDetected = false;
      return true;
    } catch (err) {
      console.warn('VPN check warning (allowing fallback if server unreachable):', err);
      return true;
    }
  }

  /**
   * 📍 2. Mandatory GPS Geolocation Request
   */
  async requestGpsLocation() {
    if (!navigator.geolocation) {
      this.showGpsBlockScreen('อุปกรณ์หรือเบราว์เซอร์ของคุณไม่รองรับระบบระบุตำแหน่ง GPS');
      return;
    }

    this.showGpsCheckingScreen();

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        // Anti-Mock Location & Server Verification
        const verified = await this.verifyGpsWithServer(lat, lng, accuracy);
        if (verified) {
          this.gpsVerified = true;
          this.userLocation = { lat, lng, accuracy };
          window.userLocation = this.userLocation;

          // Hide Gatekeeper and unlock app
          this.hideGatekeeper();

          if (window.mapManager) {
            window.mapManager.updateUserLocationMarker(lat, lng, accuracy);
          }

          if (window.app) {
            window.app.showNotification('📍 ยืนยันพิกัด GPS จริงสำเร็จ เข้าสู่ระบบเรียบร้อย', 'success');
          }

          // 🛰️ Continuous Watcher: If user turns off GPS later, re-lock screen immediately!
          if (navigator.geolocation.watchPosition) {
            navigator.geolocation.watchPosition(
              (pos) => {
                this.userLocation = {
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy
                };
                window.userLocation = this.userLocation;
              },
              (err) => {
                console.warn('GPS turned off during session:', err);
                this.gpsVerified = false;
                this.showGpsBlockScreen('สัญญาณ GPS ถูกปิดระหว่างการใช้งาน กรุณาเปิด GPS อีกครั้งเพื่อใช้งานต่อ');
              },
              { enableHighAccuracy: true, maximumAge: 5000 }
            );
          }
        }
      },
      (error) => {
        let errorMsg = 'กรุณากด "อนุญาต (Allow)" เพื่อเปิดตำแหน่ง GPS ของคุณ';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'คุณได้ปฏิเสธการเข้าถึงตำแหน่ง GPS กรุณาเปิดสิทธิ์ Location ในการตั้งค่าเบราว์เซอร์เพื่อเข้าใช้งาน';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'ไม่สามารถตรวจหาพิกัดดาวเทียม GPS ได้ กรุณาเปิด GPS/Location ในเครื่องของคุณ';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'หมดเวลาการค้นหาพิกัด GPS กรุณากดลองใหม่อีกครั้ง';
        }
        this.showGpsBlockScreen(errorMsg);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );

    // Permission change observer
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(status => {
        status.onchange = () => {
          if (status.state === 'denied') {
            this.gpsVerified = false;
            this.showGpsBlockScreen('คุณได้ปิดสิทธิ์ตำแหน่ง GPS กรุณาเปิดใหม่อีกครั้ง');
          } else if (status.state === 'granted') {
            this.requestGpsLocation();
          }
        };
      }).catch(() => {});
    }
  }

  /**
   * 🔍 Server-side GPS Validation
   */
  async verifyGpsWithServer(lat, lng, accuracy) {
    try {
      const res = await fetch('/api/security/verify-gps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          accuracy,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffset: new Date().getTimezoneOffset()
        })
      });

      const data = await res.json();
      if (data.success && data.valid) {
        return true;
      } else {
        this.showGpsBlockScreen(data.message || 'พิกัด GPS ไม่ผ่านการตรวจสอบความปลอดภัย');
        return false;
      }
    } catch (err) {
      console.warn('GPS server verify fallback:', err);
      return true;
    }
  }

  /**
   * 🖥️ UI: Show Loading State
   */
  showGpsCheckingScreen() {
    const overlay = document.getElementById('securityGatekeeperOverlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="gatekeeper-card">
        <div class="gatekeeper-radar">
          <div class="radar-pulse"></div>
          <span style="font-size: 2.8rem; position: relative; z-index: 2;">📍</span>
        </div>
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0.8rem 0 0.3rem 0;">
          กำลังตรวจหาตำแหน่ง GPS จริงของคุณ...
        </h3>
        <p style="font-size: 0.8rem; color: #64748B; margin: 0; line-height: 1.5;">
          ระบบกำลังเชื่อมต่อสัญญาณพิกัดดาวเทียมเพื่อความปลอดภัยของชุมชน มมส
        </p>
      </div>
    `;
  }

  /**
   * 🚫 UI: Show GPS Blocked Screen
   */
  showGpsBlockScreen(reason) {
    const overlay = document.getElementById('securityGatekeeperOverlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="gatekeeper-card">
        <div class="gatekeeper-icon-wrap" style="background: #FEE2E2; color: #DC2626;">
          <span style="font-size: 2.2rem;">📍</span>
        </div>
        
        <h3 style="font-size: 1.15rem; font-weight: 800; color: #0F172A; margin: 0.8rem 0 0.3rem 0;">
          จำเป็นต้องเปิด GPS เพื่อเข้าดูเว็บ
        </h3>
        
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 10px; padding: 0.75rem 0.95rem; margin: 0.6rem 0; font-size: 0.78rem; color: #991B1B; line-height: 1.5; text-align: left;">
          <strong>⚠️ สาเหตุ:</strong> ${reason}
        </div>

        <p style="font-size: 0.76rem; color: #64748B; margin: 0.2rem 0 1rem 0; line-height: 1.5;">
          เว็บไซต์ MSU Traffic กำหนดให้เปิดตำแหน่งพิกัดจริงเพื่อป้องกันบอท ข้อมูลเท็จ และการสแปมรายงาน
        </p>

        <!-- Device Guide -->
        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 0.75rem; font-size: 0.74rem; color: #334155; text-align: left; margin-bottom: 1rem;">
          <div style="font-weight: 700; color: #0F172A; margin-bottom: 0.3rem;">💡 วิธีเปิด GPS:</div>
          <div>• <strong>มือถือ (iOS/Android):</strong> เปิด Location ในการตั้งค่าด่วน และกด <strong>"อนุญาต"</strong> บนเบราว์เซอร์</div>
          <div style="margin-top: 2px;">• <strong>คอมพิวเตอร์:</strong> กดไอคอน 🔒 หรือ 📍 ที่แถบ URL ด้านบน แล้วเลือก <strong>"อนุญาต (Allow)"</strong></div>
        </div>

        <button type="button" class="btn btn-primary" onclick="window.securityGatekeeper.requestGpsLocation()" style="width: 100%; background: #2563EB; font-weight: 800; font-size: 0.88rem; padding: 0.75rem; border-radius: 10px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
          <span>🔄 เปิดและตรวจหาตำแหน่ง GPS ทันที</span>
        </button>

        <div style="margin-top: 0.75rem;">
          <button type="button" class="btn btn-outline btn-xs" onclick="window.securityGatekeeper.checkVpnAndRetry()" style="color: #64748B;">
            รีเฟรชการตรวจสอบ
          </button>
        </div>
      </div>
    `;
  }

  /**
   * 🛡️ UI: Show VPN / Proxy Blocked Screen
   */
  showVpnBlockScreen(reason) {
    const overlay = document.getElementById('securityGatekeeperOverlay');
    if (!overlay) return;

    overlay.style.display = 'flex';
    overlay.innerHTML = `
      <div class="gatekeeper-card" style="border: 2px solid #EF4444;">
        <div class="gatekeeper-icon-wrap" style="background: #450A0A; color: #EF4444; border: 2px solid #EF4444;">
          <span style="font-size: 2.2rem;">🛡️</span>
        </div>
        
        <div style="background: #EF4444; color: #FFFFFF; font-weight: 800; font-size: 0.7rem; padding: 2px 8px; border-radius: 20px; display: inline-block; margin-top: 0.75rem;">
          SECURITY SHIELD ACTIVATED
        </div>

        <h3 style="font-size: 1.15rem; font-weight: 800; color: #991B1B; margin: 0.5rem 0 0.3rem 0;">
          ตรวจพบการใช้งาน VPN หรือ Proxy (บล็อกการเข้าถึง)
        </h3>
        
        <div style="background: #FEF2F2; border: 1.5px solid #FECACA; border-radius: 10px; padding: 0.85rem 1rem; margin: 0.6rem 0; font-size: 0.78rem; color: #991B1B; line-height: 1.5; text-align: left;">
          <strong>🚫 เหตุผลการบล็อก:</strong><br>${reason}
        </div>

        <p style="font-size: 0.78rem; color: #475569; margin: 0.3rem 0 1.1rem 0; line-height: 1.5;">
          ระบบมีด่าน มมส ไม่อนุญาตให้ใช้ VPN, Proxy หรือโปรแกรมจำลองพิกัด (Mock GPS) ในการเข้าดูเว็บ<br>
          <strong>กรุณาปิด VPN แล้วเชื่อมต่อด้วยสัญญาณอินเทอร์เน็ตจริงของคุณ</strong>
        </p>

        <button type="button" class="btn btn-primary" onclick="window.securityGatekeeper.checkVpnAndRetry()" style="width: 100%; background: #DC2626; border-color: #B91C1C; font-weight: 800; font-size: 0.88rem; padding: 0.75rem; border-radius: 10px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.35);">
          <span>🔄 ปิด VPN แล้ว กดตรวจสอบการเชื่อมต่อใหม่</span>
        </button>
      </div>
    `;
  }

  /**
   * 🔓 Unlock Web Interface
   */
  hideGatekeeper() {
    const overlay = document.getElementById('securityGatekeeperOverlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.classList.remove('fade-out');
      }, 350);
    }
  }

  /**
   * 🔄 Re-check after user turns off VPN
   */
  async checkVpnAndRetry() {
    this.showGpsCheckingScreen();
    const isClean = await this.checkVpnStatus();
    if (!isClean) {
      this.showVpnBlockScreen(this.vpnReason);
      return;
    }
    await this.requestGpsLocation();
  }
}

// Global Instance
window.securityGatekeeper = new SecurityGatekeeper();
