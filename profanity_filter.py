import os
import sys
import re
import asyncio
import aiohttp
import unicodedata
from datetime import datetime, timedelta
from typing import Tuple, Dict, List

sys.stdout.reconfigure(encoding='utf-8')

# ------------------------------------------------------------------------------
# 🧠 ULTIMATE PROFANITY & MODERATION ENGINE
# (ถอดแบบสมบูรณ์จากระบบที่ทดสอบเมื่อวันที่ 11/8/2569 เวลา 19:45 น.)
# ------------------------------------------------------------------------------

# 1. Homoglyphs Mapping (แปลงฟอนต์แปลก / Unicode / ตัวอักษรคณิตศาสตร์ / ภาษาอังกฤษผสม)
HOMOGLYPH_MAP = {
    'ℽ': 'ย', 'γ': 'ย', '𝕪': 'ย', '𝛾': 'ย', 'ყ': 'ย', 'ʏ': 'ย', 'у': 'ย', 'y': 'ย', 'ý': 'ย', 'ÿ': 'ย', 'ŷ': 'ย',
    'k': 'ค', 'κ': 'ค', 'к': 'ค', 'c': 'ค',
    'w': 'ว', 'ω': 'ว', 'ш': 'ว',
    's': 'ส', 'z': 'ส',
    'h': 'ห', 'e': 'เ', 'i': 'ิ', 'u': 'ู', 'o': 'โ'
}

# 2. ตัวอักษรสระ วรรณยุกต์ และสัญลักษณ์คั่นภาษาไทยทั้งหมด
THAI_DIACRITICS = r'[ะาำิีึืุู็์ั่้๊๋ํแเโใไ\s\.\-\*\_\=\+\,\/\:\;\'\"]'

# 3. คลังคำหยาบ (Explicit Bad Words List)
EXPLICIT_BAD_WORDS = [
    "ควย", "คูย", "คู-ย", "คิย", "คึย", "คืย", "สัส", "เหี้ย", "เชี่ย", "เย็ด", "หี", "แตด", "กะหรี่", "ดอกทอง", "ชิบหาย",
    "เยด", "เหีย", "เเพศ", "ไอ้เหี้ย", "อีเหี้ย", "ไอ้สัตว์", "อีสัตว์", "หน้าหมา", "หัวควย", "หน้าควย",
    "fuck", "shit", "bitch", "asshole", "pussy", "dick", "bastard", "cunt", "motherfucker"
]

# 4. Ultimate Regex Patterns (ดักจับสระ/วรรณยุกต์/เครื่องหมายกั้นคำหยาบ)
ULTIMATE_PATTERNS = [
    r'ค' + THAI_DIACRITICS + r'*ว?' + THAI_DIACRITICS + r'*ย',
    r'ส' + THAI_DIACRITICS + r'+ส',                                      
    r'เ?ห' + THAI_DIACRITICS + r'*ี?' + THAI_DIACRITICS + r'*ย',  
    r'เ?ช' + THAI_DIACRITICS + r'*ี?' + THAI_DIACRITICS + r'*ย',  
    r'เ?ย' + THAI_DIACRITICS + r'*็?' + THAI_DIACRITICS + r'*ด',  
    r'ห' + THAI_DIACRITICS + r'+ี',
    r'แ?ต' + THAI_DIACRITICS + r'+ด',
    r'ก' + THAI_DIACRITICS + r'*ะ?' + THAI_DIACRITICS + r'*ห' + THAI_DIACRITICS + r'*รี่',
    r'ด' + THAI_DIACRITICS + r'*อ' + THAI_DIACRITICS + r'*ก' + THAI_DIACRITICS + r'*ท' + THAI_DIACRITICS + r'*อ' + THAI_DIACRITICS + r'*ง',
    r'ช' + THAI_DIACRITICS + r'*ิ?' + THAI_DIACRITICS + r'*บ' + THAI_DIACRITICS + r'*ห' + THAI_DIACRITICS + r'*า' + THAI_DIACRITICS + r'*ย',
    r'f+[\s\.\-\*\_]*u+[\s\.\-\*\_]*c+[\s\.\-\*\_]*k+',
    r's+[\s\.\-\*\_]*h+[\s\.\-\*\_]*i+[\s\.\-\*\_]*t+',
    r'b+[\s\.\-\*\_]*i+[\s\.\-\*\_]*t+[\s\.\-\*\_]*c+[\s\.\-\*\_]*h+',
    r'a+[\s\.\-\*\_]*s+[\s\.\-\*\_]*s+[\s\.\-\*\_]*h+[\s\.\-\*\_]*o+[\s\.\-\*\_]*l+[\s\.\-\*\_]*e+'
]

# โครงสร้างเก็บประวัติความผิด และสแปมพิมพ์แยกบรรทัด
user_strikes: Dict[str, int] = {}
user_recent_history: Dict[str, List[Dict]] = {}

def normalize_homoglyphs(text: str) -> str:
    """แปลกอักษร Unicode แปลกๆ / ฟอนต์สัญลักษณ์ กลับเป็นอักษรไทยปกติ"""
    nfkd = unicodedata.normalize('NFKD', text)
    result = []
    for ch in nfkd.lower():
        if ch in HOMOGLYPH_MAP:
            result.append(HOMOGLYPH_MAP[ch])
        else:
            result.append(ch)
    return "".join(result)

def deduplicate_str(text: str) -> str:
    """ยุบตัวอักษรซ้ำลากยาว เช่น ควววววย -> ควย"""
    return re.sub(r'(.)\1+', r'\1', text)

async def check_openai_chat_moderation(text: str, api_key: str = "") -> bool:
    """Layer 3: ส่งข้อความไปวิเคราะห์บริบทคำหยาบผ่าน OpenAI GPT-4o-mini API"""
    if not api_key:
        return False
    try:
        async with aiohttp.ClientSession() as session:
            payload = {
                "model": "gpt-4o-mini",
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are an expert Thai Profanity & Intent Moderator. "
                            "Examine the given input. If it contains Thai/English profanity, vulgarity, unicode homoglyph profanity "
                            "(e.g., ควℽ, ควy, คู-ย, คูย, ควย, สัส, เหี้ย, เย็ด, fuck, etc.), reply with ONLY 'TOXIC'. "
                            "Otherwise, reply with ONLY 'SAFE'."
                        )
                    },
                    {"role": "user", "content": text}
                ],
                "max_tokens": 5,
                "temperature": 0.0
            }
            async with session.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=payload,
                timeout=aiohttp.ClientTimeout(total=3)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    res = data["choices"][0]["message"]["content"].strip().upper()
                    return "TOXIC" in res
    except Exception as e:
        print(f"OpenAI GPT Moderation Error: {e}")
    return False

async def ai_analyze_toxicity(text: str, api_key: str = "") -> Tuple[bool, str]:
    """วิเคราะห์คำหยาบรวม 3 Layer"""
    raw_clean = text.lower().strip()
    homoglyph_norm = normalize_homoglyphs(raw_clean)
    dedup_text = deduplicate_str(homoglyph_norm)

    texts_to_check = [raw_clean, homoglyph_norm, dedup_text]

    # Layer 1: ตรวจ Explicit Bad Words
    for t in texts_to_check:
        for word in EXPLICIT_BAD_WORDS:
            if word in t:
                return True, f"ตรวจพบคำหยาบหรือการสแปมดัดแปลง ('{word}')"

    # Layer 2: ตรวจ Regex Patterns
    for pattern in ULTIMATE_PATTERNS:
        for t in texts_to_check:
            if re.search(pattern, t, re.IGNORECASE):
                return True, "ตรวจพบสระ/วรรณยุกต์/อักขระพิเศษกั้นคำหยาบ"

    # Layer 3: ตรวจผ่าน OpenAI GPT-4o-mini LLM (ถ้าระบุ API Key)
    if api_key and len(raw_clean) >= 2:
        is_gpt_toxic = await check_openai_chat_moderation(raw_clean, api_key)
        if not is_gpt_toxic and homoglyph_norm != raw_clean:
            is_gpt_toxic = await check_openai_chat_moderation(homoglyph_norm, api_key)
            
        if is_gpt_toxic:
            return True, "OpenAI GPT-4o-mini AI ตรวจพบเจตนาพิมพ์คำหยาบหรือคำไม่เหมาะสม"

    return False, ""

async def process_user_message(user_id: str, message_text: str, api_key: str = "") -> Dict:
    """
    ฟังก์ชันหลักสำหรับรับข้อความจากแชท ประมวลผลสแปมพิมพ์แยกบรรทัด และคำนวณบทลงโทษขั้นบันได
    (ถอดแบบตรรกะระบบควบคุมความประพฤติที่ทดสอบเมื่อ 11/8/2569)
    """
    now = datetime.now()

    # 1. SPLIT MESSAGE MERGER & SPAM TRACKER (รวมข้อความที่พิมพ์แยกติดกันใน 5 วินาที)
    if user_id not in user_recent_history:
        user_recent_history[user_id] = []

    user_recent_history[user_id] = [
        item for item in user_recent_history[user_id]
        if (now - item["timestamp"]).total_seconds() <= 5
    ]

    user_recent_history[user_id].append({
        "content": message_text,
        "timestamp": now
    })

    combined_recent_text = "".join([item["content"] for item in user_recent_history[user_id]])

    # 2. 3-LAYER HYBRID AI PROFANITY ENGINE
    is_toxic_single, reason_single = await ai_analyze_toxicity(message_text, api_key)
    is_toxic_combined, reason_combined = await ai_analyze_toxicity(combined_recent_text, api_key)

    if is_toxic_single or (is_toxic_combined and len(user_recent_history[user_id]) > 1):
        reason = reason_single if is_toxic_single else f"สแปมพิมพ์แยกบรรทัดคละคำหยาบ ({reason_combined})"
        user_recent_history[user_id] = []

        # 3. PROGRESSIVE PENALTY SYSTEM (บทลงโทษขั้นบันได 1-5 ครั้ง)
        current_strike = user_strikes.get(user_id, 0) + 1
        user_strikes[user_id] = current_strike

        if current_strike == 1:
            penalty_action = "TIMEOUT_5M"
            penalty_desc = "🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 5 นาที"
        elif current_strike == 2:
            penalty_action = "TIMEOUT_10M"
            penalty_desc = "🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 10 นาที"
        elif current_strike == 3:
            penalty_action = "TIMEOUT_15M"
            penalty_desc = "🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 15 นาที"
        elif current_strike == 4:
            penalty_action = "TIMEOUT_1D"
            penalty_desc = "🛑 ห้ามพิมพ์/ปิดปาก (Timeout) เป็นเวลา 1 วัน (24 ชั่วโมง)"
        else:
            penalty_action = "BAN"
            penalty_desc = "🔨 แบนออกจากระบบถาวร (Permanent Ban)"

        return {
            "is_toxic": True,
            "reason": reason,
            "strike_count": current_strike,
            "max_strikes": 5,
            "penalty_action": penalty_action,
            "penalty_desc": penalty_desc,
            "should_delete_message": True
        }

    return {
        "is_toxic": False,
        "reason": "ข้อความผ่านการตรวจสอบ",
        "strike_count": user_strikes.get(user_id, 0),
        "should_delete_message": False
    }

# ------------------------------------------------------------------------------
# 🧪 ทดสอบระบบ (Test Script Matching 11/8/2569 Test Cases)
# ------------------------------------------------------------------------------
if __name__ == "__main__":
    async def run_tests():
        print("================================================================")
        print("🧪 PROFANITY ENGINE (11/8/2569 19:45 TEST SUITE VERIFICATION)")
        print("================================================================")
        
        test_messages = [
            ("user1", "สวัสดีครับ ขอสอบถามหน่อย"),
            ("user1", "ควย"),
            ("user1", "คู-ย"),
            ("user1", "ควℽ"),
            ("user1", "ควy"),
            ("user2", "ค"),
            ("user2", "ว"),
            ("user2", "ย")
        ]

        for uid, msg in test_messages:
            res = await process_user_message(uid, msg)
            if res["is_toxic"]:
                print(f"❌ [{uid}] ข้อความ: '{msg:15}' ➔ 🔴 บล็อก! สาเหตุ: {res['reason']}")
                print(f"   📊 ผิดครั้งที่ {res['strike_count']}/{res['max_strikes']} | บทลงโทษ: {res['penalty_desc']}\n")
            else:
                print(f"✅ [{uid}] ข้อความ: '{msg:15}' ➔ 🟢 ผ่าน\n")

    asyncio.run(run_tests())
