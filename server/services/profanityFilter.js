/**
 * ==============================================================================
 * 🧠 ULTIMATE PROFANITY & MODERATION ENGINE (Node.js High-Performance Port)
 * ถอดแบบ 1:1 จาก profanity_filter.py (ทดสอบเมื่อ 11/8/2569 เวลา 19:45 น.)
 * ==============================================================================
 */

// 1. Homoglyphs Mapping (แปลงฟอนต์แปลก / Unicode / ตัวอักษรคณิตศาสตร์ / ภาษาอังกฤษผสม)
const HOMOGLYPH_MAP = {
  'ℽ': 'ย', 'γ': 'ย', '𝕪': 'ย', '𝛾': 'ย', 'ყ': 'ย', 'ʏ': 'ย', 'у': 'ย', 'y': 'ย', 'ý': 'ย', 'ÿ': 'ย', 'ŷ': 'ย',
  'k': 'ค', 'κ': 'ค', 'к': 'ค', 'c': 'ค',
  'w': 'ว', 'ω': 'ว', 'ш': 'ว',
  's': 'ส', 'z': 'ส',
  'h': 'ห', 'e': 'เ', 'i': 'ิ', 'u': 'ู', 'o': 'โ'
};

// 2. ตัวอักษรสระ วรรณยุกต์ และสัญลักษณ์คั่นภาษาไทยทั้งหมด
const THAI_DIACRITICS = '[ะาำิีึืุู็์ั่้๊๋ํแเโใไ\\s\\.\\-\\*\\_\\=\\+\\,\\/\\:\\;\\\'\\"]';

// 3. คลังคำหยาบ (Explicit Bad Words List)
const EXPLICIT_BAD_WORDS = [
  "ควย", "คูย", "คู-ย", "คิย", "คึย", "คืย", "สัส", "เหี้ย", "เชี่ย", "เย็ด", "หี", "แตด", "กะหรี่", "ดอกทอง", "ชิบหาย",
  "เยด", "เหีย", "เเพศ", "ไอ้เหี้ย", "อีเหี้ย", "ไอ้สัตว์", "อีสัตว์", "หน้าหมา", "หัวควย", "หน้าควย",
  "fuck", "shit", "bitch", "asshole", "pussy", "dick", "bastard", "cunt", "motherfucker"
];

// 4. Ultimate Regex Patterns (ดักจับสระ/วรรณยุกต์/เครื่องหมายกั้นคำหยาบ)
const ULTIMATE_PATTERNS = [
  new RegExp('ค' + THAI_DIACRITICS + '*ว?' + THAI_DIACRITICS + '*ย', 'i'),
  new RegExp('ส' + THAI_DIACRITICS + '+ส', 'i'),
  new RegExp('เ?ห' + THAI_DIACRITICS + '*ี?' + THAI_DIACRITICS + '*ย', 'i'),
  new RegExp('เ?ช' + THAI_DIACRITICS + '*ี?' + THAI_DIACRITICS + '*ย', 'i'),
  new RegExp('เ?ย' + THAI_DIACRITICS + '*็?' + THAI_DIACRITICS + '*ด', 'i'),
  new RegExp('ห' + THAI_DIACRITICS + '+ี', 'i'),
  new RegExp('แ?ต' + THAI_DIACRITICS + '+ด', 'i'),
  new RegExp('ก' + THAI_DIACRITICS + '*ะ?' + THAI_DIACRITICS + '*ห' + THAI_DIACRITICS + '*รี่', 'i'),
  new RegExp('ด' + THAI_DIACRITICS + '*อ' + THAI_DIACRITICS + '*ก' + THAI_DIACRITICS + '*ท' + THAI_DIACRITICS + '*อ' + THAI_DIACRITICS + '*ง', 'i'),
  new RegExp('ช' + THAI_DIACRITICS + '*ิ?' + THAI_DIACRITICS + '*บ' + THAI_DIACRITICS + '*ห' + THAI_DIACRITICS + '*า' + THAI_DIACRITICS + '*ย', 'i'),
  new RegExp('f+[\\s\\.\\-\\*\\_]*u+[\\s\\.\\-\\*\\_]*c+[\\s\\.\\-\\*\\_]*k+', 'i'),
  new RegExp('s+[\\s\\.\\-\\*\\_]*h+[\\s\\.\\-\\*\\_]*i+[\\s\\.\\-\\*\\_]*t+', 'i'),
  new RegExp('b+[\\s\\.\\-\\*\\_]*i+[\\s\\.\\-\\*\\_]*t+[\\s\\.\\-\\*\\_]*c+[\\s\\.\\-\\*\\_]*h+', 'i'),
  new RegExp('a+[\\s\\.\\-\\*\\_]*s+[\\s\\.\\-\\*\\_]*s+[\\s\\.\\-\\*\\_]*h+[\\s\\.\\-\\*\\_]*o+[\\s\\.\\-\\*\\_]*l+[\\s\\.\\-\\*\\_]*e+', 'i')
];

// โครงสร้างเก็บประวัติความผิด (Strikes) และประวัติพิมพ์แยกบรรทัด
const userStrikes = new Map(); // userId -> count
const userRecentHistory = new Map(); // userId -> [ { content, timestamp } ]

function normalizeHomoglyphs(text) {
  if (!text) return '';
  const nfkd = text.normalize('NFKD');
  let result = '';
  for (const ch of nfkd.toLowerCase()) {
    result += HOMOGLYPH_MAP[ch] || ch;
  }
  return result;
}

function deduplicateStr(text) {
  if (!text) return '';
  return text.replace(/(.)\1+/g, '$1');
}

/**
 * วิเคราะห์ความหยาบคาย (Layer 1: Explicit + Layer 2: Regex + Homoglyphs)
 */
function analyzeToxicity(text) {
  if (!text) return { isToxic: false, reason: '' };

  const rawClean = text.toLowerCase().trim();
  const homoglyphNorm = normalizeHomoglyphs(rawClean);
  const dedupText = deduplicateStr(homoglyphNorm);

  const textsToCheck = [rawClean, homoglyphNorm, dedupText];

  // Layer 1: ตรวจ Explicit Bad Words
  for (const t of textsToCheck) {
    for (const word of EXPLICIT_BAD_WORDS) {
      if (t.includes(word)) {
        return { isToxic: true, reason: `ตรวจพบคำหยาบหรือการสแปมดัดแปลง ('${word}')` };
      }
    }
  }

  // Layer 2: ตรวจ Regex Patterns
  for (const pattern of ULTIMATE_PATTERNS) {
    for (const t of textsToCheck) {
      if (pattern.test(t)) {
        return { isToxic: true, reason: 'ตรวจพบสระ/วรรณยุกต์/อักขระพิเศษกั้นคำหยาบ' };
      }
    }
  }

  return { isToxic: false, reason: '' };
}

/**
 * ประมวลผลข้อความจากผู้ใช้ พร้อมระบบสแปมแยกบรรทัด และบทลงโทษขั้นบันได
 */
function processUserMessage(userId, messageText) {
  const now = Date.now();

  // 1. SPLIT MESSAGE MERGER & SPAM TRACKER (รวมข้อความที่พิมพ์แยกติดกันใน 5 วินาที)
  if (!userRecentHistory.has(userId)) {
    userRecentHistory.set(userId, []);
  }

  const history = userRecentHistory.get(userId).filter(item => (now - item.timestamp) <= 5000);
  history.push({ content: messageText, timestamp: now });
  userRecentHistory.set(userId, history);

  const combinedRecentText = history.map(item => item.content).join('');

  // 2. ตรวจสอบทั้งแบบเดี่ยว และแบบรวมที่พิมพ์แยกบรรทัด
  const singleCheck = analyzeToxicity(messageText);
  const combinedCheck = analyzeToxicity(combinedRecentText);

  const isToxic = singleCheck.isToxic || (combinedCheck.isToxic && history.length > 1);

  if (isToxic) {
    const reason = singleCheck.isToxic ? singleCheck.reason : `สแปมพิมพ์แยกบรรทัดคละคำหยาบ (${combinedCheck.reason})`;
    userRecentHistory.set(userId, []); // ล้างประวัติพิมพ์แยก

    // 3. PROGRESSIVE PENALTY SYSTEM (บทลงโทษขั้นบันได 1-5 ครั้ง)
    const currentStrike = (userStrikes.get(userId) || 0) + 1;
    userStrikes.set(userId, currentStrike);

    let penaltyAction = 'TIMEOUT_5M';
    let penaltyDesc = '🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 5 นาที';

    if (currentStrike === 2) {
      penaltyAction = 'TIMEOUT_10M';
      penaltyDesc = '🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 10 นาที';
    } else if (currentStrike === 3) {
      penaltyAction = 'TIMEOUT_15M';
      penaltyDesc = '🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 15 นาที';
    } else if (currentStrike === 4) {
      penaltyAction = 'TIMEOUT_1D';
      penaltyDesc = '🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 1 วัน (24 ชั่วโมง)';
    } else if (currentStrike >= 5) {
      penaltyAction = 'BAN';
      penaltyDesc = '🔨 แบนออกจากระบบถาวร (Permanent Ban)';
    }

    return {
      isToxic: true,
      reason,
      strikeCount: currentStrike,
      maxStrikes: 5,
      penaltyAction,
      penaltyDesc,
      shouldBlock: true
    };
  }

  return {
    isToxic: false,
    reason: 'ข้อความผ่านการตรวจสอบ',
    strikeCount: userStrikes.get(userId) || 0,
    shouldBlock: false
  };
}

/**
 * เซนเซอร์คำหยาบในข้อความเป็นดอกจัน (สำหรับ Dev) เช่น ควย -> *** หรือ ******
 */
function censorProfanity(text) {
  if (!text) return '';
  let censored = text;

  // 1. เซนเซอร์ Explicit Bad Words
  for (const word of EXPLICIT_BAD_WORDS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');
    censored = censored.replace(regex, '*'.repeat(Math.max(3, word.length)));
  }

  // 2. เซนเซอร์ Regex Patterns
  for (const pattern of ULTIMATE_PATTERNS) {
    censored = censored.replace(pattern, (match) => '*'.repeat(Math.max(3, match.length)));
  }

  return censored;
}

module.exports = {
  analyzeToxicity,
  processUserMessage,
  censorProfanity,
  normalizeHomoglyphs,
  deduplicateStr
};
