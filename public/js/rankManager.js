/**
 * MSU Traffic & Campus Life - Rank & Reputation Controller (Season 1)
 * จัดการตารางอันดับ Weekly (Season 1), All-Time Rank และ Floating Map HUD (มุมบนขวา)
 */

class RankManager {
  constructor() {
    this.currentTab = 'weekly'; // 'weekly' | 'all-time'
    this.weeklyData = null;
    this.allTimeData = [];
    this.myStats = null;
    this.isMapOverlayCollapsed = localStorage.getItem('msu_map_rank_collapsed') === 'true';
  }

  async init() {
    await this.loadWeeklyRank();
    await this.loadAllTimeRank();
    await this.loadMyStats();
    this.initMapOverlay();
    this.startCountdownTimer();
  }

  bindSocketEvents(socket) {
    if (!socket) return;
    socket.on('leaderboard_update', (data) => {
      if (data && data.rankings) {
        this.weeklyData = data;
        this.updateMapRankOverlay();
        if (this.currentTab === 'weekly') {
          this.renderLeaderboard();
        }
      }
    });
  }

  async loadWeeklyRank() {
    try {
      const res = await fetch('/api/rank/weekly?limit=20');
      const data = await res.json();
      if (data.success) {
        this.weeklyData = data.data;
        this.updateMapRankOverlay();
        if (this.currentTab === 'weekly') {
          this.renderLeaderboard();
        }
        this.renderHomeTop3Snapshot();
      }
    } catch (e) {
      console.error('Error loading weekly rank:', e);
    }
  }

  async loadAllTimeRank() {
    try {
      const res = await fetch('/api/rank/all-time?limit=20');
      const data = await res.json();
      if (data.success) {
        this.allTimeData = data.data;
        if (this.currentTab === 'all-time') {
          this.renderLeaderboard();
        }
      }
    } catch (e) {
      console.error('Error loading all-time rank:', e);
    }
  }

  async loadMyStats() {
    try {
      const res = await fetch('/api/rank/my-stats', {
        headers: window.authManager ? window.authManager.getAuthHeader() : {}
      });
      const data = await res.json();
      if (data.success && data.user) {
        this.myStats = data.user;
        this.updateMapRankOverlay();
        this.renderMyRankCard();
        this.renderProfileView();
      }
    } catch (e) {
      console.error('Error loading my stats:', e);
    }
  }

  // =========================================================================
  // 🗺️ TOP-RIGHT FLOATING MAP MINI LEADERBOARD (มุมบนขวา แผนที่)
  // =========================================================================
  initMapOverlay() {
    const overlay = document.getElementById('mapRankOverlay');
    const isMobile = window.innerWidth <= 768;
    const storedState = localStorage.getItem('msu_map_rank_collapsed');

    if (storedState !== null) {
      this.isMapOverlayCollapsed = storedState === 'true';
    } else {
      this.isMapOverlayCollapsed = isMobile; // Default collapsed on mobile/iPad!
    }

    if (overlay) {
      if (this.isMapOverlayCollapsed) {
        overlay.classList.add('collapsed');
      } else {
        overlay.classList.remove('collapsed');
      }
    }
    this.updateMapRankOverlay();
  }

  toggleMapOverlay() {
    const overlay = document.getElementById('mapRankOverlay');
    if (!overlay) return;

    overlay.classList.toggle('collapsed');
    this.isMapOverlayCollapsed = overlay.classList.contains('collapsed');
    localStorage.setItem('msu_map_rank_collapsed', this.isMapOverlayCollapsed ? 'true' : 'false');
  }

  updateMapRankOverlay() {
    const top3Container = document.getElementById('mapRankTop3');
    const myStatusContainer = document.getElementById('mapRankMyStatus');
    if (!top3Container) return;

    // ❗ เฉพาะผู้ใช้ที่มีคะแนนมากกว่า 0 EXP เท่านั้น
    const list = (this.weeklyData?.rankings || []).filter(u => (u.score || 0) > 0).slice(0, 3);

    if (list.length === 0) {
      top3Container.innerHTML = '<div style="font-size: 0.72rem; color: #94A3B8; text-align: center; padding: 0.6rem 0.4rem;">🏁 ยังไม่มีผู้ทำคะแนนวันนี้<br><span style="font-size: 0.65rem; color: #CBD5E1;">ปักหมุดหรือโหวตเพื่อขึ้นอันดับ!</span></div>';
    } else {
      top3Container.innerHTML = list.map((u, i) => `
        <div class="map-rank-row">
          <span class="map-rank-badge-col">${i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉')}</span>
          <img src="${u.picture}" class="map-rank-avatar" alt="avatar">
          <span class="map-rank-name">${u.name}</span>
          <span class="map-rank-score">${u.score} <span style="font-size: 0.6rem; color: #94A3B8;">EXP</span></span>
        </div>
      `).join('');
    }

    // Render my status row in HUD
    if (myStatusContainer) {
      if (this.myStats) {
        const rank = this.myStats.rank || {};
        myStatusContainer.innerHTML = `
          <div class="map-rank-my-row">
            <img src="${this.myStats.picture}" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">
            <div style="flex: 1; display: flex; flex-direction: column; overflow: hidden;">
              <span class="map-rank-my-name" style="font-weight: 700; font-size: 0.72rem; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">อันดับของคุณ (${this.myStats.name})</span>
              <span style="font-size: 0.64rem; color: #10B981; font-weight: 700;">+${this.myStats.weeklyScore || 0} EXP (วันนี้)</span>
            </div>
            <span style="font-weight: 800; font-size: 0.75rem; color: #3B82F6;">${this.myStats.allTimeScore || 0} EXP</span>
          </div>
        `;
      } else {
        myStatusContainer.innerHTML = `
          <div style="font-size: 0.68rem; color: var(--text-muted); text-align: center; cursor: pointer;" onclick="window.authManager.openLoginModal()">
            🔑 <u>เข้าสู่ระบบเพื่อดูอันดับของคุณ</u>
          </div>
        `;
      }
    }
  }

  // =========================================================================
  // 🏆 FULL LEADERBOARD MODAL (Hall of Fame)
  // =========================================================================
  async loadLeaderboard() {
    await Promise.all([
      this.loadWeeklyRank(),
      this.loadAllTimeRank(),
      this.loadMyStats()
    ]);
    this.renderLeaderboard();
  }

  async loadUserRank() {
    return await this.loadMyStats();
  }

  openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) {
      modal.classList.add('active');
      this.loadLeaderboard();
    }
  }

  closeLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) modal.classList.remove('active');
  }

  switchRankTab(tab) {
    this.currentTab = tab;
    document.querySelectorAll('.rank-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    this.renderLeaderboard();
  }

  renderLeaderboard() {
    const container = document.getElementById('rankLeaderboardList');
    if (!container) return;

    const list = (this.currentTab === 'weekly' ? (this.weeklyData?.rankings || []) : this.allTimeData)
      .filter(u => (u.score || 0) > 0);

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: #94A3B8; padding: 2.5rem 1rem;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏆</div>
          <div style="font-weight: 700; color: #334155;">ยังไม่มีคะแนนในรอบวันนี้ (0 EXP)</div>
          <div style="font-size: 0.78rem; margin-top: 0.2rem;">ร่วมปักหมุดหรือช่วยโหวตยืนยันด่านเพื่อเป็นที่ 1 ของ มมส!</div>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map((user, idx) => {
      let medalBadge = `<span class="rank-pos-number">#${idx + 1}</span>`;
      if (idx === 0) medalBadge = '<span class="rank-medal medal-gold">🥇 1</span>';
      else if (idx === 1) medalBadge = '<span class="rank-medal medal-silver">🥈 2</span>';
      else if (idx === 2) medalBadge = '<span class="rank-medal medal-bronze">🥉 3</span>';

      const isDev = user.isDev || user.email === 'java5263@gmail.com';
      const isMsu = user.email && user.email.toLowerCase().endsWith('@msu.ac.th');

      return `
        <div class="rank-item-card ${idx < 3 ? 'top-card' : ''}">
          <div class="rank-pos-col">${medalBadge}</div>
          <img class="rank-avatar" src="${user.picture || 'https://ui-avatars.com/api/?name=MSU&background=2563EB&color=fff'}" alt="avatar">
          <div class="rank-info-col">
            <div class="rank-user-name">
              <span>${user.name}</span>
              ${isDev ? '<span class="badge-dev">👑 DEV</span>' : (isMsu ? '<span class="badge-msu">🎓 MSU</span>' : '<span class="badge-member">👤 Member</span>')}
            </div>
            <div class="rank-meta-row">
              <span class="rank-trust-badge">🛡️ Trust: <strong>${user.trustScore || 50}</strong></span>
              <span>📍 ปักแล้ว ${user.pinsCreated || 0} จุด</span>
            </div>
          </div>
          <div class="rank-score-col">
            <span class="rank-score-val">${user.score || 0}</span>
            <span class="rank-score-label">EXP</span>
          </div>
        </div>
      `;
    }).join('');
  }

  renderMyRankCard() {
    const card = document.getElementById('myRankOverviewCard');
    if (!card || !this.myStats) return;

    const rank = this.myStats.rank || {};
    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.65rem;">
          <img src="${this.myStats.picture}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid #F59E0B;">
          <div>
            <div style="font-weight: 800; font-size: 0.95rem; color: #0F172A;">${this.myStats.name}</div>
            <div style="font-size: 0.74rem; color: #B45309; font-weight: 700;">${rank.icon || '🥉'} ${rank.name || 'ผู้สัญจรมือใหม่'}</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 1.15rem; font-weight: 800; color: #2563EB;">${this.myStats.allTimeScore || 0} <span style="font-size: 0.72rem; color: #64748B;">EXP</span></div>
          <div style="font-size: 0.7rem; color: #059669; font-weight: 700;">วันนี้: +${this.myStats.weeklyScore || 0} EXP</div>
        </div>
      </div>
      <!-- Progress Bar -->
      <div style="margin-top: 0.65rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.68rem; color: #64748B; margin-bottom: 0.2rem;">
          <span>ความก้าวหน้าสู่ยศถัดไป</span>
          <span>${rank.progressPercent || 0}%</span>
        </div>
        <div style="width: 100%; height: 6px; background: #E2E8F0; border-radius: 10px; overflow: hidden;">
          <div style="width: ${rank.progressPercent || 0}%; height: 100%; background: linear-gradient(90deg, #F59E0B, #10B981); border-radius: 10px;"></div>
        </div>
      </div>
    `;
  }

  renderProfileView() {
    const trustGauge = document.getElementById('profileTrustScoreVal');
    const trustBar = document.getElementById('profileTrustBar');
    const trustStatus = document.getElementById('profileTrustStatus');
    const nameElem = document.getElementById('profileUserName');
    const emailElem = document.getElementById('profileUserEmail');
    const avatarElem = document.getElementById('profileUserAvatar');
    const badgeElem = document.getElementById('profileUserBadge');

    if (!this.myStats) return;

    const trust = this.myStats.trustScore || 50;
    if (trustGauge) trustGauge.textContent = trust;
    if (trustBar) trustBar.style.width = `${trust}%`;
    if (nameElem) nameElem.textContent = this.myStats.name;
    if (emailElem) emailElem.textContent = this.myStats.email;
    if (avatarElem) avatarElem.src = this.myStats.picture;

    const isDev = this.myStats.isDev;
    const isMsu = this.myStats.email && this.myStats.email.endsWith('@msu.ac.th');

    if (badgeElem) {
      if (isDev) badgeElem.innerHTML = '<span class="badge-dev" style="font-size: 0.8rem; padding: 3px 8px;">👑 DEVELOPER</span>';
      else if (isMsu) badgeElem.innerHTML = '<span class="badge-msu" style="font-size: 0.8rem; padding: 3px 8px;">🎓 นิสิต มมส (@msu.ac.th)</span>';
      else badgeElem.innerHTML = '<span class="badge-member" style="font-size: 0.8rem; padding: 3px 8px;">👤 Member ทั่วไป</span>';
    }

    if (trustStatus) {
      if (trust >= 80) trustStatus.innerHTML = '<span style="color: #059669; font-weight: 700;">🟢 น่าเชื่อถือสูงมาก (Trusted Citizen)</span>';
      else if (trust >= 50) trustStatus.innerHTML = '<span style="color: #2563EB; font-weight: 700;">🔵 ปานกลาง (Standard Verified)</span>';
      else trustStatus.innerHTML = '<span style="color: #DC2626; font-weight: 700;">🔴 เฝ้าระวัง (Under Observation)</span>';
    }
  }

  renderHomeTop3Snapshot() {
    const container = document.getElementById('homeTop3Container');
    if (!container) return;

    const list = (this.weeklyData?.rankings || []).slice(0, 3);
    if (list.length === 0) {
      container.innerHTML = '<div style="font-size: 0.74rem; color: #94A3B8; text-align: center; padding: 0.5rem;">ยังไม่มีผู้ทำคะแนนวันนี้</div>';
      return;
    }

    container.innerHTML = list.map((u, i) => `
      <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.35rem 0.5rem; background: #F8FAFC; border-radius: 8px; border: 1px solid #E2E8F0;">
        <div style="display: flex; align-items: center; gap: 0.45rem;">
          <span style="font-size: 0.85rem;">${i === 0 ? '🥇' : (i === 1 ? '🥈' : '🥉')}</span>
          <img src="${u.picture}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #0F172A;">${u.name}</span>
        </div>
        <span style="font-size: 0.78rem; font-weight: 800; color: #2563EB;">${u.score} <span style="font-size: 0.65rem; color: #64748B;">EXP</span></span>
      </div>
    `).join('');
  }

  startCountdownTimer() {
    const timerElem = document.getElementById('rankResetCountdown');
    if (!timerElem) return;

    setInterval(() => {
      if (!this.weeklyData?.weekEnd) return;
      const diff = Math.max(0, this.weeklyData.weekEnd - Date.now());
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      timerElem.textContent = `รีเซ็ตอันดับประจำวันในอีก ${hours} ชม. ${minutes} นาที ${seconds} วิ`;
    }, 1000);
  }

  getRankBadgeHtml(rank, size = 'sm') {
    if (!rank) return '';
    return `<span class="rank-badge-inline ${rank.badgeClass || 'rank-bronze'}">${rank.icon || '🥉'} ${rank.name || ''}</span>`;
  }
}

window.rankManager = new RankManager();
