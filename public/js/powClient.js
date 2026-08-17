/**
 * =========================================================================
 * MSU Traffic - Client-Side Proof-of-Work (PoW) & Anti-Replay Nonce Engine
 * =========================================================================
 * Ultra-fast WebCrypto-accelerated PoW Solver (~20-40ms) with Pre-Solving Cache
 * Protects server against high-frequency bot spam & scripted flood attacks.
 * =========================================================================
 */

class PoWClient {
  constructor() {
    this.cachedChallenge = null;
    this.solvingPromise = null;
    this.encoder = new TextEncoder();
    // Pre-warm a challenge in the background
    this.prewarm();
  }

  /**
   * Pre-fetch and pre-solve a challenge in the background so user interactions are instant (0ms lag)
   */
  async prewarm() {
    try {
      if (this.cachedChallenge && Date.now() < this.cachedChallenge.expiresAt - 15000) {
        return;
      }
      this.cachedChallenge = await this.solveFreshChallenge();
    } catch (e) {
      console.warn('[PoW Engine] Prewarm warning:', e);
    }
  }

  /**
   * Request a new challenge from server
   */
  async fetchChallenge() {
    const res = await fetch('/api/security/challenge', { cache: 'no-store' });
    const data = await res.json();
    if (!data.success || !data.challenge) {
      throw new Error('Failed to fetch PoW challenge');
    }
    return data.challenge;
  }

  /**
   * Fast SHA-256 Hash using WebCrypto API
   */
  async sha256Hex(str) {
    const buffer = this.encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Solve a given challenge
   */
  async solve(challenge) {
    const { salt, difficulty, challengeId, expiresAt, signature } = challenge;
    const targetPrefix = '0'.repeat(difficulty);
    let nonce = 0;
    const startTime = performance.now();

    // Fast Batch Processing to avoid blocking UI frame
    const BATCH_SIZE = 1000;
    while (Date.now() < expiresAt) {
      for (let i = 0; i < BATCH_SIZE; i++) {
        const candidate = `${salt}:${nonce}`;
        // Using WebCrypto
        const hash = await this.sha256Hex(candidate);
        if (hash.startsWith(targetPrefix)) {
          const duration = Math.round(performance.now() - startTime);
          return {
            challengeId,
            salt,
            difficulty,
            expiresAt,
            signature,
            nonce: nonce.toString(),
            hash,
            solveTimeMs: duration
          };
        }
        nonce++;
      }
      // Yield to main thread for a micro-task tick if needed
      if (nonce % (BATCH_SIZE * 5) === 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    throw new Error('PoW challenge expired before solution could be found');
  }

  /**
   * Fetch and solve a fresh challenge
   */
  async solveFreshChallenge() {
    const challenge = await this.fetchChallenge();
    return await this.solve(challenge);
  }

  /**
   * Get valid PoW headers for API requests (uses pre-solved challenge or solves on-the-fly)
   */
  async getPoWHeaders() {
    let solution = null;

    // Use cached pre-solved challenge if valid
    if (this.cachedChallenge && Date.now() < this.cachedChallenge.expiresAt - 10000) {
      solution = this.cachedChallenge;
      this.cachedChallenge = null; // Consume one-time token
      // Immediately prewarm next token for subsequent requests
      setTimeout(() => this.prewarm(), 100);
    } else {
      solution = await this.solveFreshChallenge();
      // Prewarm next token
      setTimeout(() => this.prewarm(), 100);
    }

    return {
      'X-PoW-Challenge': solution.challengeId,
      'X-PoW-Salt': solution.salt,
      'X-PoW-Difficulty': solution.difficulty.toString(),
      'X-PoW-Expires': solution.expiresAt.toString(),
      'X-PoW-Signature': solution.signature,
      'X-PoW-Nonce': solution.nonce
    };
  }

  /**
   * Helper to perform a fetch with automatic PoW headers attached
   */
  async powFetch(url, options = {}) {
    const headers = options.headers ? { ...options.headers } : {};
    try {
      const powHeaders = await this.getPoWHeaders();
      Object.assign(headers, powHeaders);
    } catch (e) {
      console.warn('[PoW Engine] Header generation fallback:', e);
    }

    return fetch(url, {
      ...options,
      headers
    });
  }
}

// Global Singleton Instance
window.powClient = new PoWClient();
