/**
 * Authentication Module for MSU Traffic
 * รองรับการ Login ได้จริง 100%:
 * 1. เข้าสู่ระบบด้วยอีเมล Google โดยตรง (เช่น java5263@gmail.com หรืออีเมลอื่นๆ)
 * 2. เข้าสู่ระบบผ่านปุ่ม Google Sign-In (Google Identity Services)
 * 3. ปุ่มคลิกเดียวสำหรับ Developer (java5263@gmail.com)
 */

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.googleClientId = '954687901285-olc3vqh7s04iaqsjlv7h7uf3lifesfvd.apps.googleusercontent.com';
    this.devEmail = 'java5263@gmail.com';
    this.loadUserFromStorage();
  }

  setGoogleClientId(clientId) {
    if (!clientId) return;
    this.googleClientId = clientId.trim();
    localStorage.setItem('msu_google_client_id', this.googleClientId);
    if (window.onGoogleLibraryLoad) {
      window.onGoogleLibraryLoad();
    }
  }

  loadUserFromStorage() {
    try {
      const stored = localStorage.getItem('msu_traffic_user');
      if (stored) {
        this.currentUser = JSON.parse(stored);
        if (this.currentUser.email === this.devEmail) {
          this.currentUser.isDev = true;
          this.currentUser.role = 'dev';
        }
      }
    } catch (e) {
      console.error('Error loading stored user:', e);
      this.currentUser = null;
    }
  }

  isLoggedIn() {
    return this.currentUser !== null && !!this.currentUser.id;
  }

  isDev() {
    return this.isLoggedIn() && (this.currentUser.isDev === true || this.currentUser.email === this.devEmail);
  }

  getUser() {
    return this.currentUser;
  }

  getAuthHeader() {
    if (!this.currentUser) return {};
    return {
      'Authorization': `Bearer ${this.currentUser.token || 'auth-token'}`,
      'X-User-Data': encodeURIComponent(JSON.stringify(this.currentUser))
    };
  }

  // 1. เข้าสู่ระบบด้วยอีเมล Google โดยตรง (Direct Email Login - ทำงานได้จริง 100%)
  async loginWithEmail(email, name) {
    if (!email || !email.includes('@')) {
      alert('กรุณากรอกอีเมลที่ถูกต้อง (เช่น java5263@gmail.com)');
      return false;
    }

    try {
      const res = await fetch('/api/auth/email-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), name: name ? name.trim() : '' })
      });

      const data = await res.json();
      if (data.success && data.user) {
        this.setUser(data.user);
        this.closeLoginModal();
        if (window.app) {
          window.app.showNotification(data.message || `ยินดีต้อนรับ ${data.user.name}`, 'success');
          window.app.updateAuthUI();
          window.app.renderReportsList();
        }
        return true;
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
        return false;
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์เพื่อเข้าสู่ระบบได้');
      return false;
    }
  }

  // 2. คลิกเดียวเข้าสู่ระบบในฐานะ Developer (java5263@gmail.com)
  async loginAsDev() {
    return this.loginWithEmail(this.devEmail, 'Java (Lead Developer)');
  }

  // 3. คลิกเดียวเข้าสู่ระบบทดสอบทั่วไป
  async loginWithDemo(name = 'นิสิต มมส') {
    const randomNum = Math.floor(100 + Math.random() * 900);
    return this.loginWithEmail(`student_${randomNum}@msu.ac.th`, name);
  }

  // 4. Handle Google Credential Callback from Google Sign-In button
  async handleGoogleResponse(response) {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: response.credential })
      });

      const data = await res.json();
      if (data.success && data.user) {
        this.setUser(data.user);
        this.closeLoginModal();
        if (window.app) {
          window.app.showNotification(
            data.user.isDev
              ? `👑 ยินดีต้อนรับ Developer (${data.user.email}) เข้าสู่ระบบ!`
              : `ยินดีต้อนรับ ${data.user.name}`,
            'success'
          );
          window.app.updateAuthUI();
          window.app.renderReportsList();
        }
      } else {
        alert(data.error || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
      }
    } catch (err) {
      console.error('Google Sign-In Error:', err);
    }
  }

  setUser(user) {
    if (user.email === this.devEmail) {
      user.isDev = true;
      user.role = 'dev';
      user.badge = '👑 Developer / ผู้พัฒนาระบบ';
    }
    this.currentUser = user;
    localStorage.setItem('msu_traffic_user', JSON.stringify(user));
    if (window.mapManager && window.app && window.app.reports) {
      window.mapManager.renderReports(window.app.reports);
    }
    if (window.rankManager) {
      window.rankManager.updateMapRankOverlay();
    }
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('msu_traffic_user');
    if (window.app) {
      window.app.showNotification('ออกจากระบบเรียบร้อยแล้ว', 'info');
      window.app.updateAuthUI();
      window.app.renderReportsList();
      if (window.mapManager) {
        window.mapManager.renderReports(window.app.reports);
      }
    }
    if (window.rankManager) {
      window.rankManager.updateMapRankOverlay();
    }
  }

  openLoginModal(message = 'กรุณาเข้าสู่ระบบก่อนทำรายการ') {
    const modal = document.getElementById('loginModal');
    const msgElem = document.getElementById('loginModalMessage');
    if (msgElem) msgElem.textContent = message;
    if (modal) modal.classList.add('active');
    if (window.renderGoogleSignInButton) {
      window.renderGoogleSignInButton();
    }
  }

  closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) modal.classList.remove('active');
  }
}

// Global instance
window.authManager = new AuthManager();

// Render Google Sign-In Button into Container
window.renderGoogleSignInButton = function() {
  if (window.google && window.google.accounts && window.google.accounts.id) {
    const clientId = window.authManager.googleClientId;
    if (clientId) {
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => window.authManager.handleGoogleResponse(resp),
          auto_select: false
        });
        
        const btnContainer = document.getElementById('g_id_signin_container');
        if (btnContainer) {
          btnContainer.innerHTML = '';
          google.accounts.id.renderButton(btnContainer, {
            theme: 'filled_blue',
            size: 'large',
            text: 'signin_with',
            shape: 'pill',
            width: 320,
            locale: 'th'
          });
        }
      } catch (e) {
        console.warn('GIS error:', e);
      }
    }
  }
};

window.onGoogleLibraryLoad = function() {
  window.renderGoogleSignInButton();
};
