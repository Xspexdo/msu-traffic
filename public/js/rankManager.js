/**
 * =========================================================================
 * MSU Traffic - Rank, Reputation & Leaderboard Controller (Client-Side)
 * =========================================================================
 * Manages user ranks, EXP progression, real-time toasts, Hall of Fame,
 * and the Top-Right Floating Map Mini-Leaderboard HUD (Top 1-3 + My Rank)
 */

class RankManager {
  constructor() {
    this.leaderboard = [];
    this.rankTiers = [];
    this.currentUserStats = null;
    this.isMapOverlayCollapsed = localStorage.getItem('msu_map_rank_hidden') === 'true';
    this.init();
  }

  async init() {
    await this.fetchRankTiers();
    this.setupSocketListeners();
    this.initMapOverlay();
  }

  async fetchRankTiers() {
    try {
      const res = await fetch('/api/rank/tiers');
      const data = await res.json();
      if (data.success) {
        this.rankTiers = data.data;
      }
    } catch (e) {
      console.warn('Failed to fetch rank tiers:', e);
    }
  }

  // Realtime Socket listeners for live points and level-ups
  setupSocketListeners() {
    if (window.app && window.app.socket) {
      this.bindSocketEvents(window.app.socket);
    }
  }

  bindSocketEvents(socket) {
    socket.on('rank_update', (eventData) => {
      const currentUser = window.authManager?.getUser();
      if (!currentUser || !currentUser.id) return;

      const { authorId, voterId, rankReward } = eventData;

      // 1. If current user is the author of the confirmed report
      if (currentUser.id === authorId && rankReward?.authorReward) {
        const reward = rankReward.authorReward;
        this.showExpGainToast(reward.expGained, reward.reason || 'มีเพื่อนนิสิตเห็นด้วยกับรายงานของคุณ');
        if (reward.leveledUp) {
          this.showLevelUpModal(reward.newRank);
        }
        this.refreshMyRankStats();
      }

      // 2. If current user is the voter
      if (currentUser.id === voterId && rankReward?.voterReward) {
        const reward = rankReward.voterReward;
        this.showExpGainToast(reward.expGained, reward.reason || 'ร่วมยืนยันข้อมูลด่านจราจร');
        if (reward.leveledUp) {
          this.showLevelUpModal(reward.newRank);
        }
        this.refreshMyRankStats();
      }
    });

    socket.on('leaderboard_update', (updatedList) => {
      this.leaderboard = updatedList;
      this.updateMapRankOverlay(updatedList);

      const modal = document.getElementById('leaderboardModal');
      if (modal && modal.classList.contains('active')) {
        this.renderLeaderboard(updatedList);
      }
    });
  }

  // Refresh current user stats from backend
  async refreshMyRankStats() {
    if (!window.authManager?.isLoggedIn()) {
      this.updateMapRankOverlay();
      return;
    }

    try {
      const res = await fetch('/api/rank/me');
      const data = await res.json();
      if (data.success && data.data) {
        this.currentUserStats = data.data;
        const user = window.authManager.getUser();
        if (user) {
          user.stats = data.data;
          user.rank = data.data.rank;
          window.authManager.setUser(user);
        }
        if (window.app) {
          window.app.updateAuthUI();
        }
        this.updateMapRankOverlay();
      }
    } catch (e) {}
  }

  // =========================================================================
  // 🗺️ TOP-RIGHT FLOATING MAP MINI LEADERBOARD (Top 1-3 & My Rank)
  // =========================================================================

  initMapOverlay() {
    const overlay = document.getElementById('mapRankOverlay');
    if (overlay && this.isMapOverlayCollapsed) {
      overlay.classList.add('collapsed');
    }
    this.updateMapRankOverlay();
  }

  toggleMapOverlay() {
    const overlay = document.getElementById('mapRankOverlay');
    if (!overlay) return;

    overlay.classList.toggle('collapsed');
    this.isMapOverlayCollapsed = overlay.classList.contains('collapsed');
    localStorage.setItem('msu_map_rank_hidden', this.isMapOverlayCollapsed ? 'true' : 'false');
  }

  async updateMapRankOverlay(list = null) {
    const top3Container = document.getElementById('mapRankTop3');
    const myStatusContainer = document.getElementById('mapRankMyStatus');
    const pillText = document.getElementById('mapRankPillText');

    if (!list) {
      try {
        const res = await fetch('/api/rank/leaderboard?limit=10');
        const data = await res.json();
        if (data.success && data.data) {
          this.leaderboard = data.data;
          list = data.data;
        }
      } catch (e) {
        list = this.leaderboard || [];
      }
    }

    if (!list || list.length === 0) {
      if (top3Container) {
        top3Container.innerHTML = '<div class="map-rank-loading">ยังไม่มีข้อมูลอันดับ</div>';
      }
      return;
    }

    const currentUser = window.authManager?.getUser();
    const currentUserId = currentUser?.id;

    // 1. Render Top 1-3 Rows
    const top3 = list.slice(0, 3);
    if (top3Container) {
      top3Container.innerHTML = top3.map((u, idx) => {
        const rank = u.rank || {};
        const isMe = currentUserId && u.id === currentUserId;
        const medal = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : '🥉');
        const rowClass = `rank-${idx + 1}`;

        return `
          <div class="map-rank-row ${rowClass} ${isMe ? 'rank-is-me' : ''}" title="${u.name} (${u.exp.toLocaleString()} EXP)">
            <div class="map-rank-medal">${medal}</div>
            <img class="map-rank-avatar" src="${u.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=60'}" alt="${u.name}">
            <div class="map-rank-info">
              <div class="map-rank-name-wrap">
                <span class="map-rank-name">${u.name}</span>
                ${isMe ? '<span class="badge-me" style="font-size: 0.55rem; padding: 0 3px;">ฉัน</span>' : ''}
              </div>
              <div class="map-rank-badge-wrap">
                ${this.getRankBadgeHtml(rank, 'xs')}
              </div>
            </div>
            <div class="map-rank-exp-val">${u.exp.toLocaleString()} <span style="font-size: 0.6rem; color: #64748B;">EXP</span></div>
          </div>
        `;
      }).join('');
    }

    // 2. Render Current User Rank Status Box
    if (myStatusContainer) {
      if (currentUser) {
        const myRank = currentUser.rank || {};
        const myStats = currentUser.stats || {};
        const myExp = myStats.exp !== undefined ? myStats.exp : (myRank.exp || 0);

        // Find placement in leaderboard
        const myIndexInList = list.findIndex(u => u.id === currentUser.id);
        const myPlacement = (myIndexInList !== -1) ? (myIndexInList + 1) : null;

        let placementHtml = '';
        if (myPlacement && myPlacement <= 3) {
          placementHtml = `<span class="map-rank-my-pos-badge" style="background: #D97706;">อันดับ #${myPlacement} 👑</span>`;
        } else if (myPlacement) {
          placementHtml = `<span class="map-rank-my-pos-badge">อันดับ #${myPlacement}</span>`;
        } else {
          placementHtml = `<span class="map-rank-my-pos-badge" style="background: #64748B;">อันดับ #--</span>`;
        }

        myStatusContainer.innerHTML = `
          <div class="map-rank-my-inner" title="แตะเพื่อดูโปรไฟล์ & สถิติของคุณ">
            <div class="map-rank-my-left">
              ${placementHtml}
              <span class="map-rank-my-name">${currentUser.name}</span>
            </div>
            <div style="display: flex; align-items: center; gap: 0.25rem;">
              ${this.getRankBadgeHtml(myRank, 'xs')}
              <span class="map-rank-my-exp">${myExp.toLocaleString()} EXP</span>
            </div>
          </div>
        `;
        myStatusContainer.onclick = () => window.app && window.app.openProfileModal();

        if (pillText) {
          pillText.textContent = myPlacement ? `อันดับ #${myPlacement} (${myExp} EXP)` : `อันดับ Top 3`;
        }
      } else {
        // Guest user prompt
        myStatusContainer.innerHTML = `
          <div class="map-rank-guest-prompt" title="คลิกเพื่อเข้าสู่ระบบ">
            <span>🔑</span>
            <span>เข้าสู่ระบบเพื่อดูอันดับของคุณ</span>
          </div>
        `;
        myStatusContainer.onclick = () => window.authManager && window.authManager.openLoginModal('เข้าสู่ระบบเพื่อสะสม EXP และดูอันดับของคุณ');

        if (pillText) {
          pillText.textContent = `อันดับ 1-3 🏆`;
        }
      }
    }
  }

  // Generate Rank Badge HTML
  getRankBadgeHtml(rank, size = 'sm') {
    if (!rank) return '';
    const badgeClass = rank.badgeClass || 'rank-bronze';
    const icon = rank.icon || '🥉';
    const name = rank.name || 'ผู้สัญจรมือใหม่';

    return `
      <span class="rank-badge ${badgeClass} rank-badge-${size}" title="${rank.title || name} (${rank.exp || 0} EXP)">
        <span class="rank-badge-icon">${icon}</span>
        <span class="rank-badge-text">${name}</span>
      </span>
    `;
  }

  // Floating Toast for EXP Gain
  showExpGainToast(exp, message = '') {
    const toast = document.createElement('div');
    toast.className = 'exp-toast-popup';
    toast.innerHTML = `
      <div class="exp-toast-inner">
        <div class="exp-toast-badge">+${exp} EXP 🎖️</div>
        <div class="exp-toast-msg">${message}</div>
      </div>
    `;

    document.body.appendChild(toast);

    // Audio chime effect
    if (window.app && window.app.playAlertChime) {
      window.app.playAlertChime();
    }

    setTimeout(() => {
      toast.classList.add('exp-toast-fadeout');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  // Modal Level-Up Celebration
  showLevelUpModal(newRank) {
    let modal = document.getElementById('levelUpModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'levelUpModal';
      modal.className = 'modal-overlay';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-container levelup-container" style="max-width: 440px; text-align: center;">
        <div class="levelup-sparkle-bg">
          <div class="levelup-icon-big">${newRank.icon || '🎖️'}</div>
        </div>
        <div class="modal-body" style="padding: 1.5rem 1.5rem 2rem;">
          <div class="levelup-title-tag">LEVEL UP! • เลื่อนยศใหม่</div>
          <h2 style="font-size: 1.4rem; font-weight: 800; color: #0F172A; margin: 0.4rem 0;">
            ${newRank.name}
          </h2>
          <p style="font-size: 0.85rem; color: #64748B; line-height: 1.5; margin-bottom: 1.25rem;">
            ขอแสดงความยินดี! คุณได้สะสมผลงานการรายงานและช่วยยืนยันข้อมูลด่านอันเป็นประโยชน์รอบ ม.มหาสารคาม อย่างต่อเนื่อง
          </p>

          <div style="margin-bottom: 1.25rem;">
            ${this.getRankBadgeHtml(newRank, 'lg')}
          </div>

          <button class="btn btn-primary" style="width: 100%; font-size: 0.9rem; padding: 0.65rem;" onclick="document.getElementById('levelUpModal').classList.remove('active')">
            <span>🎉 รับทราบและลุยต่อเลย!</span>
          </button>
        </div>
      </div>
    `;

    modal.classList.add('active');
  }

  // Open Leaderboard Modal
  async openLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (!modal) return;

    modal.classList.add('active');
    const container = document.getElementById('leaderboardList');
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #64748B;">⏳ กำลังโหลดตารางจัดอันดับ...</div>';
    }

    try {
      const res = await fetch('/api/rank/leaderboard?limit=15');
      const data = await res.json();
      if (data.success && data.data) {
        this.leaderboard = data.data;
        this.renderLeaderboard(data.data);
      }
    } catch (e) {
      if (container) {
        container.innerHTML = '<div style="text-align: center; padding: 2rem; color: #EF4444;">ไม่สามารถโหลดข้อมูลอันดับได้</div>';
      }
    }
  }

  closeLeaderboardModal() {
    const modal = document.getElementById('leaderboardModal');
    if (modal) modal.classList.remove('active');
  }

  // Render Leaderboard list in Hall of Fame Modal
  renderLeaderboard(list = []) {
    const container = document.getElementById('leaderboardList');
    if (!container) return;

    if (list.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2.5rem; color: #94A3B8;">
          <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🏆</div>
          <div>ยังไม่มีข้อมูลอันดับในระบบ</div>
        </div>
      `;
      return;
    }

    const currentUserId = window.authManager?.getUser()?.id;

    // Top 3 Podium Cards
    const top3 = list.slice(0, 3);
    const rest = list.slice(3);

    let html = '';

    // Podium Layout
    if (top3.length > 0) {
      html += '<div class="podium-grid">';
      
      // Order in UI: 2nd place (left), 1st place (center), 3rd place (right)
      const podiumOrder = [];
      if (top3[1]) podiumOrder.push({ user: top3[1], place: 2, label: '🥈 อันดับ 2' });
      if (top3[0]) podiumOrder.push({ user: top3[0], place: 1, label: '👑 อันดับ 1' });
      if (top3[2]) podiumOrder.push({ user: top3[2], place: 3, label: '🥉 อันดับ 3' });

      podiumOrder.forEach(item => {
        const u = item.user;
        const rank = u.rank || {};
        const isMe = currentUserId && u.id === currentUserId;

        html += `
          <div class="podium-card podium-place-${item.place} ${isMe ? 'podium-is-me' : ''}">
            <div class="podium-crown">${item.place === 1 ? '👑' : (item.place === 2 ? '🥈' : '🥉')}</div>
            <div class="podium-avatar-wrap">
              <img src="${u.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" class="podium-avatar" alt="${u.name}">
              <div class="podium-rank-pill">${item.label}</div>
            </div>
            <div class="podium-name">${u.name}</div>
            <div style="margin-bottom: 0.35rem;">
              ${this.getRankBadgeHtml(rank, 'xs')}
            </div>
            <div class="podium-score">
              <span class="podium-exp-val">${u.exp.toLocaleString()}</span> <span class="podium-exp-unit">EXP</span>
            </div>
            <div class="podium-stats-sub">
              <span>📢 ${u.reportsCount || 0} ด่าน</span> • <span>👍 ${u.upvotesReceived || 0}</span>
            </div>
          </div>
        `;
      });

      html += '</div>';
    }

    // Rank 4+ List
    if (rest.length > 0) {
      html += '<div class="leaderboard-sublist">';
      rest.forEach(u => {
        const rank = u.rank || {};
        const isMe = currentUserId && u.id === currentUserId;

        html += `
          <div class="leaderboard-row ${isMe ? 'leaderboard-row-me' : ''}">
            <div class="leaderboard-pos">#${u.placement}</div>
            <img src="${u.picture || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}" class="leaderboard-avatar" alt="${u.name}">
            <div class="leaderboard-user-info">
              <div class="leaderboard-name-row">
                <span class="leaderboard-name">${u.name}</span>
                ${isMe ? '<span class="badge-me">ฉัน</span>' : ''}
              </div>
              <div class="leaderboard-badges-row">
                ${this.getRankBadgeHtml(rank, 'xs')}
                <span class="leaderboard-meta">📢 ${u.reportsCount || 0} รายงาน • 👍 ${u.upvotesReceived || 0} คนเห็นด้วย</span>
              </div>
            </div>
            <div class="leaderboard-score-badge">
              <span class="score-num">${u.exp.toLocaleString()}</span>
              <span class="score-unit">EXP</span>
            </div>
          </div>
        `;
      });
      html += '</div>';
    }

    container.innerHTML = html;
  }
}

// Global instance
window.rankManager = new RankManager();
