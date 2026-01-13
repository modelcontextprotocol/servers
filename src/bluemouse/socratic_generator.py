# Copyright (C) 2026 BlueMouse Project
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU Affero General Public License as published
# by the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU Affero General Public License for more details.
#
# You should have received a copy of the GNU Affero General Public License
# along with this program.  If not, see <https://www.gnu.org/licenses/>.

"""
AI Integration Module - 蘇格拉底問題生成器
真正的四層寄生AI架構（無阻塞版本）
"""

import json
import os
import asyncio


async def generate_socratic_questions(requirement: str, language: str = 'zh-TW', api_key: str = None) -> dict:
    """
    真正的四層寄生 AI 架構
    
    層次 1: Antigravity 內聯生成 (規則引擎，<100ms)
    層次 2: Ollama 本地 AI (異步，5-10秒，有超時)
    層次 3: 環境變數 API Key (異步，2-3秒，有超時)
    層次 4: 規則引擎降級 (保底，<100ms)
    
    每一層都無阻塞，失敗立即降級
    """
    
    print("🦠 啟動四層寄生AI...")
    
    # 層次 1: Antigravity 內聯生成 (規則引擎)
    try:
        result = layer1_antigravity_inline(requirement, language)
        return result
    except Exception as e:
        print(f"  [1/4] ⏭️  {e}")
    
    # 層次 2: Ollama 本地 AI
    try:
        result = await layer2_ollama(requirement, language)
        return result
    except Exception as e:
        print(f"  [2/4] ⏭️  {e}")
    
    # 層次 3: 環境變數 API Key
    try:
        result = await layer3_api_key(requirement, language, api_key)
        return result
    except Exception as e:
        print(f"  [3/4] ⏭️  {e}")
    
    # 層次 4: 規則引擎降級 (保底)
    result = layer4_fallback(requirement, language)
    return result


def layer1_antigravity_inline(requirement: str, language: str) -> dict:
    """
    第一層：Antigravity 內聯生成
    
    使用智能規則引擎，覆蓋常見場景
    如果規則庫未覆蓋，拋出異常進入下一層
    """
    try:
        from antigravity_inline_generator import generate_questions_inline
        
        result = generate_questions_inline(requirement, language)
        
        # 檢查是否是通用降級
        if is_generic_fallback(result):
            raise ValueError("規則庫未覆蓋此場景")
        
        print(f"  [1/4] ✅ Antigravity 內聯生成成功 (<100ms)")
        return result
        
    except ImportError:
        raise ValueError("antigravity_inline_generator 未找到")
    except Exception as e:
        raise ValueError(f"規則引擎失敗: {e}")


async def layer2_ollama(requirement: str, language: str) -> dict:
    """
    第二層：Ollama 本地 AI
    
    如果已安裝Ollama，嘗試動態生成
    超時10秒自動降級
    """
    try:
        import aiohttp
        
        # 檢查Ollama是否運行
        print(f"  [2/4] 🔍 檢測 Ollama...")
        async with aiohttp.ClientSession() as session:
            async with session.get(
                'http://localhost:11434/api/tags',
                timeout=aiohttp.ClientTimeout(total=1)
            ) as resp:
                if resp.status != 200:
                    raise ConnectionError("Ollama未運行")
        
        print(f"  [2/4] 🤖 Ollama 生成中...")
        
        # 調用生成API
        prompt = build_prompt(requirement, language)
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                'http://localhost:11434/api/generate',
                json={
                    'model': 'qwen2.5:7b',
                    'prompt': prompt,
                    'stream': False
                },
                timeout=aiohttp.ClientTimeout(total=15)
            ) as resp:
                data = await resp.json()
                ai_text = data.get('response', '')
        
        # 解析JSON
        result = robust_parse_ai_json(ai_text)
        print(f"  [2/4] ✅ Ollama 生成成功 (~8秒)")
        return result
        
    except ImportError:
        raise ValueError("aiohttp 未安裝")
    except asyncio.TimeoutError:
        raise ValueError("Ollama 超時 (>15秒)")
    except Exception as e:
        raise ValueError(f"Ollama 不可用: {e}")


async def layer3_api_key(requirement: str, language: str, api_key: str = None) -> dict:
    """
    第三層：環境變數 API Key
    
    如果配置了API Key，調用雲端AI
    超時10秒自動降級
    """
    try:
        # 優先使用傳入的 Key (BYOK)，否則查環境變數
        used_key = api_key or \
                  os.getenv('ANTHROPIC_API_KEY') or \
                  os.getenv('OPENAI_API_KEY') or \
                  os.getenv('GEMINI_API_KEY')
        
        if not used_key:
            raise ValueError("未配置 API Key")
        
        print(f"  [3/4] 🔑 API Key 調用中... (Key: ...{used_key[-4:]})")
        
        # 這裡簡化實現，實際需要異步客戶端
        # 由於anthropic庫是同步的，這裡只是示例
        raise ValueError("API Key 層暫未實現（需要異步客戶端）")
        
    except Exception as e:
        raise ValueError(f"API Key 不可用: {e}")



# ==========================================
# 🧠 DYNAMIC KNOWLEDGE ENGINE (The Brain)
# ==========================================

# 1. Load Knowledge Base
KB_FILE = "knowledge_base.json"
INVERTED_INDEX = {}
KB_MODULES = {}

def load_knowledge_base():
    """載入並構建倒排索引 (O(N) -> O(1))"""
    global INVERTED_INDEX, KB_MODULES
    
    if not os.path.exists(KB_FILE):
        print("⚠️ Knowledge Base not found, using Fallback Static Rules.")
        return

    try:
        with open(KB_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        KB_MODULES = data.get('modules', {})
        
        # Build Index: Keyword -> ModuleKey
        for mod_key, mod_data in KB_MODULES.items():
            for kw in mod_data.get('keywords', []):
                INVERTED_INDEX[kw.lower()] = mod_key
                
        print(f"✅ Knowledge Engine Loaded: {len(KB_MODULES)} modules, {len(INVERTED_INDEX)} keywords indexed.")
        
    except Exception as e:
        print(f"❌ Failed to load Knowledge Base: {e}")

# Initialize on module import
load_knowledge_base()


def robust_parse_ai_json(text: str) -> dict:
    """
    Robust JSON parser specifically for Socratic Questions.
    1. Extracts JSON from markdown code blocks if present.
    2. Injects default 'risk_score' if missing (fixes UI 'Unknown Risk' bug).
    """
    try:
        # Extract JSON from ```json ... ```
        if "```" in text:
            parts = text.split("```")
            for p in parts:
                p = p.strip()
                if p.startswith("json"):
                    p = p[4:].strip()
                if p.startswith("{") and p.endswith("}"):
                    text = p
                    break
        
        # Parse
        data = json.loads(text)
        
        # Validate & Inject Defaults
        if "questions" in data:
            for q in data["questions"]:
                if "options" in q:
                    for opt in q["options"]:
                        if "risk_score" not in opt:
                            # Inject default risk score based on option logic or generic text
                            opt["risk_score"] = "Potential Trade-off"
                            
                            # Try to infer from description if possible (simple heuristic)
                            desc = opt.get("description", "")
                            if "慢" in desc or "slow" in desc.lower():
                                opt["risk_score"] = "效能折損"
                            elif "難" in desc or "complex" in desc.lower():
                                opt["risk_score"] = "開發成本高"
                            elif "險" in desc or "risk" in desc.lower():
                                opt["risk_score"] = "潛在風險"
                            
        return data
    except Exception as e:
        print(f"JSON Parse Error: {e}")
        # Return a fallback valid structure to prevent crash
        return get_fallback_questions()

def layer4_fallback(requirement: str, language: str) -> dict:
    """
    第四層：規則引擎降級 (Data-Driven Multi-Fusion)
    
    支援「混合架構」：如果用戶同時提到了電商和區塊鏈，
    系統會自動融合兩個領域的考題，生成一份客製化的架構問卷。
    """
    # 1. 嘗試多重索引搜尋 (Multi-Index Search)
    matched_keys = search_index_multi(requirement)
    
    # 2. 檢測所有靜態類型 (Static Analysis)
    static_cats = detect_static_categories(requirement)
    
    if matched_keys or static_cats:
        print(f"  [4/4] 🧠 命中領域: DD={matched_keys}, Static={static_cats} (Fusion Mode)")
        
        # 融合所有命中領域的題目
        fused_questions = []
        seen_ids = set()
        
        # Add Data-Driven Questions
        for key in matched_keys:
            module_data = KB_MODULES.get(key)
            if not module_data: continue
            
            for q in module_data.get('questions', []):
                if q['id'] not in seen_ids:
                    fused_questions.append(q)
                    seen_ids.add(q['id'])
        
        # Add Static Questions
        for cat in static_cats:
             # Default to empty if not found
             static_qs = TEMPLATE_LIBRARY.get(cat, lambda l: {'questions': []})(language).get('questions', [])
             for q in static_qs:
                 if q['id'] not in seen_ids:
                     fused_questions.append(q)
                     seen_ids.add(q['id'])
        
        # If successfully fused questions, return
        if fused_questions:
            return {
                "questions": fused_questions,
                "template_id": f"fusion_{'_'.join(matched_keys + static_cats)}"
            }
    
    # 3. 如果完全沒命中，回退到 Default
    print(f"  [4/4] 📋 未命中特定領域，使用預設題庫")
    return TEMPLATE_LIBRARY['default'](language)

def search_index_multi(req: str) -> list:
    """
    O(N) 多重關鍵字掃描 - 找出所有相關領域
    """
    req = req.lower()
    matches = set()
    
    for kw, mod_key in INVERTED_INDEX.items():
        if kw in req:
            matches.add(mod_key)
            
    return list(matches)

def search_index(req: str) -> str:
    # 為了兼容性保留單一回傳，但實際邏輯已升級
    res = search_index_multi(req)
    return res[0] if res else None


def detect_static_categories(req: str) -> list:
    """找出所有符合的靜態類別 (回傳列表)"""
    req = req.lower()
    categories = set()
    
    if any(k in req for k in ['shop', 'buy', 'order', 'pay', 'store', '電商', '購物', '訂單', '支付', '賣', '買', '下單']):
        categories.add('ecommerce')
        
    if any(k in req for k in ['chat', 'social', 'message', 'friend', 'post', 'feed', '社交', '聊天', '社群', '動態', '這交']):
        categories.add('social')
        
    if any(k in req for k in ['video', 'stream', 'music', 'blog', 'news', 'cms', '影音', '直播', '新聞', '內容', '文章', 'netflix', 'youtube', 'movie', 'film', 'spotify']):
        categories.add('content')
        
    if any(k in req for k in ['bank', 'finance', 'money', 'wallet', 'ledger', 'coin', '銀行', '金融', '錢包', '帳本', '支付', '幣', '區塊鏈', 'blockchain', 'crypto']):
        categories.add('fintech')
        
    if any(k in req for k in ['saas', 'crm', 'erp', 'tenant', 'b2b', '管理', '企業', '租戶']):
        categories.add('saas')
        
    return list(categories) if categories else []

def detect_static_category(req: str) -> str:
    # 兼容舊函數，只回傳第一個
    cats = detect_static_categories(req)
    return cats[0] if cats else 'default'

# ==========================================
# 🏛️ TEMPLATE LIBRARY (The Vault of Doom)
# ==========================================

TEMPLATE_LIBRARY = {
    # ... (Keep existing templates as fallback) ...
    'default': lambda lang: get_fallback_questions(lang), 

    
    'ecommerce': lambda lang: {
        "questions": [
            {
                "id": "ecom_inventory",
                "type": "single_choice",
                "text": "針對「庫存超賣」災難，如果最後一件商品同時被 100 人下單，怎麼辦？" if lang == 'zh-TW' else "For 'Flash Sale' disaster, if 100 users buy the last item simultaneously?",
                "options": [
                    {
                        "label": "A. 資料庫鎖死 (Row Lock)",
                        "description": "最安全，但資料庫 CPU 會瞬間飆高，導致全站卡頓。",
                        "risk_score": "效能瓶頸",
                        "value": "db_lock"
                    },
                    {
                        "label": "B. 預扣庫存 (Redis)",
                        "description": "極快，但如果用戶取消訂單，庫存回補會很麻煩 (少賣風險)。",
                        "risk_score": "數據一致性",
                        "value": "redis_stock"
                    },
                    {
                        "label": "C. 下單後異步檢查 (Async Queue)",
                        "description": "讓用戶先下單，稍後再通知「抱歉被砍單了」。體驗極差但系統最穩。",
                        "risk_score": "用戶暴怒風險",
                        "value": "async_check"
                    }
                ]
            },
            {
                "id": "ecom_payment",
                "type": "single_choice",
                "text": "如果用戶付錢了，但我們系統崩潰沒收到通知 (Double Spending 疑慮)？" if lang == 'zh-TW' else "User paid, but our system crashed before callback (Lost Payment)?",
                "options": [
                    {
                        "label": "A. 每日對帳 (T+1 Reconciliation)",
                        "description": "隔天才發現，人工退款。開發簡單但反應慢。",
                        "risk_score": "營運成本高",
                        "value": "reconciliation"
                    },
                    {
                        "label": "B. 支付狀態輪詢 (Polling)",
                        "description": "主動一直問金流方「他不付錢沒？」。增加伺服器負擔。",
                        "risk_score": "資源浪費",
                        "value": "polling"
                    },
                    {
                        "label": "C. 事務最終一致性 (Event Sourcing)",
                        "description": "最完美的架構，保證不掉單。但開發難度是原本的 3 倍。",
                        "risk_score": "開發極難",
                        "value": "event_sourcing"
                    }
                ]
            }
        ]
    },

    'social': lambda lang: {
        "questions": [
            {
                "id": "social_feed",
                "type": "single_choice",
                "text": "當一位擁有 1000萬 粉絲的大V發文，如何推播給所有人？ (Feed Explosion)" if lang == 'zh-TW' else "A user with 10M followers posts. How to fan-out to all feeds?",
                "options": [
                    {
                        "label": "A. 寫擴散 (Push Model)",
                        "description": "發文當下寫入 1000萬 人的信箱。發文者會卡住 5 分鐘。",
                        "risk_score": "寫入延遲極高",
                        "value": "push"
                    },
                    {
                        "label": "B. 讀擴散 (Pull Model)",
                        "description": "粉絲上線時才去拉取。大V發文快，但讀取時資料庫壓力山大。",
                        "risk_score": "讀取效能瓶頸",
                        "value": "pull"
                    },
                    {
                        "label": "C. 混合模式 (Hybrid)",
                        "description": "活躍粉絲用推的，殭屍粉用拉的。架構最複雜。",
                        "risk_score": "維護成本高",
                        "value": "hybrid"
                    }
                ]
            },
            {
                "id": "social_moderation",
                "type": "single_choice",
                "text": "關於「違規內容」，您希望多快被刪除？" if lang == 'zh-TW' else "For 'Content Integrity', how fast should we ban bad posts?",
                "options": [
                    {
                        "label": "A. 先發後審 (Post-Moderation)",
                        "description": "發文 0 延遲，體驗好。但在大選期間可能會有法律風險。",
                        "risk_score": "法律合規風險",
                        "value": "post_mod"
                    },
                    {
                        "label": "B. 先審後發 (Pre-Moderation)",
                        "description": "內容絕對乾淨。但用戶發文要等 10 秒 AI 檢查。",
                        "risk_score": "用戶體驗下降",
                        "value": "pre_mod"
                    },
                    {
                        "label": "C. 用戶檢舉 (Community)",
                        "description": "省錢省算力。但霸凌發生後很久才處理。",
                        "risk_score": "品牌聲譽風險",
                        "value": "community"
                    }
                ]
            }
        ]
    },

    'content': lambda lang: {
        "questions": [
            {
                "id": "content_cdn",
                "type": "single_choice",
                "text": "關於「影片流量費」，如果突然爆紅導致頻寬費破產？" if lang == 'zh-TW' else "If a video goes viral and bandwidth costs bankrupt us?",
                "options": [
                    {
                        "label": "A. 限速限流 (Throttling)",
                        "description": "超過預算直接卡住。公司活下來了，但用戶跑光了。",
                        "risk_score": "用戶流失",
                        "value": "throttle"
                    },
                    {
                        "label": "B. P2P 輔助 (WebRTC)",
                        "description": "讓用戶互相傳輸。省錢，但會佔用用戶手機頻寬與電量。",
                        "risk_score": "用戶端效能",
                        "value": "p2p"
                    },
                    {
                        "label": "C. 動態畫質降級 (Adaptive Bitrate)",
                        "description": "人多時自動變模糊 (360p)。最平衡的做法。",
                        "risk_score": "體驗折衷",
                        "value": "abr"
                    }
                ]
            },
            {
                "id": "content_storage",
                "type": "single_choice",
                "text": "對於「冷門舊影片」(3年前的)，如何節省儲存費？" if lang == 'zh-TW' else "How to store 'Cold Data' (3-year old videos) cheaply?",
                "options": [
                    {
                        "label": "A. Glacier 深度歸檔",
                        "description": "極便宜。但用戶要看時，需等待 5小時 解凍。",
                        "risk_score": "無法即時觀看",
                        "value": "glacier"
                    },
                    {
                        "label": "B. 刪除原檔只留低清 (Transcode)",
                        "description": "空間省 80%。但未來無法再做 4K 修復。",
                        "risk_score": "畫質永久損失",
                        "value": "transcode_only"
                    },
                    {
                        "label": "C. 智能分層 (Intelligent Tiering)",
                        "description": "自動搬移。費用不確定，帳單可能會忽高忽低。",
                        "risk_score": "成本不可預測",
                        "value": "tiering"
                    }
                ]
            }
        ]
    },

    'fintech': lambda lang: {
        "questions": [
            {
                "id": "fintech_consistency",
                "type": "single_choice",
                "text": "如果 A 轉帳給 B，A 扣款成功但 B 沒收到 (Network Partition)？" if lang == 'zh-TW' else "A transfer to B. A deducted, B not received. (Partition)?",
                "options": [
                    {
                        "label": "A. 強制回滾 (Rollback)",
                        "description": "交易失敗，A 的錢退回。安全，但用戶會困惑「為什麼轉不過去」。",
                        "risk_score": "交易成功率低",
                        "value": "rollback"
                    },
                    {
                        "label": "B. 無限重試 (Exactly-Once)",
                        "description": "系統在背景一直試直到成功。技術極難實現。",
                        "risk_score": "系統複雜度",
                        "value": "exactly_once"
                    },
                    {
                        "label": "C. 人工介入 (Manual)",
                        "description": "先讓交易掛起 (Pending)。需要大量客服人力。",
                        "risk_score": "營運成本",
                        "value": "manual"
                    }
                ]
            },
            {
                "id": "fintech_audit",
                "type": "single_choice",
                "text": "工程師是否有權限修改資料庫金額 (Production Access)？" if lang == 'zh-TW' else "Can engineers modify DB directly?",
                "options": [
                    {
                        "label": "A. 可以 (Root Access)",
                        "description": "修 Bug 超快。但如果工程師被買通，錢就被偷了。",
                        "risk_score": "極高內控風險",
                        "value": "root"
                    },
                    {
                        "label": "B. 雙人制衡 (Four-Eyes Principle)",
                        "description": "修改需要第二人核准。流程慢，緊急時會來不及救火。",
                        "risk_score": "反應速度慢",
                        "value": "four_eyes"
                    },
                    {
                        "label": "C. 完全禁止 (Zero Trust)",
                        "description": "只能透過 API 修改。這需要非常完善的 Admin 後台。",
                        "risk_score": "後台開發成本",
                        "value": "zero_trust"
                    }
                ]
            }
        ]
    },

    'saas': lambda lang: {
         "questions": [
            {
                "id": "saas_tenant",
                "type": "single_choice",
                "text": "大客戶 (Enterprise) 要求資料完全隔離，不能跟小客戶放一起？" if lang == 'zh-TW' else "Enterprise client wants full data isolation.",
                "options": [
                    {
                        "label": "A. 獨立資料庫 (Database per Tenant)",
                        "description": "安全性最高。但這我們運維成本會高到爆炸。",
                        "risk_score": "運維地獄",
                        "value": "db_per_tenant"
                    },
                    {
                        "label": "B. 邏輯隔離 (Tenant_ID)",
                        "description": "都在同一個表。開發快，但如果代碼寫錯，資料就洩漏了。",
                        "risk_score": "洩漏風險",
                        "value": "tenant_id"
                    },
                    {
                        "label": "C. 獨立 Schema (Schema per Tenant)",
                        "description": "折衷方案。成本適中，隔離性尚可。",
                        "risk_score": "遷移困難",
                        "value": "schema_per_tenant"
                    }
                ]
            },
            {
                "id": "saas_custom",
                "type": "single_choice",
                "text": "客戶想修改系統的「核心邏輯」(Custom Logic)？" if lang == 'zh-TW' else "Client wants to customize core logic?",
                "options": [
                    {
                        "label": "A. 為他拉分叉 (Fork Codebase)",
                        "description": "最快滿足他。但以後這客戶就無法升級新功能了。",
                        "risk_score": "維護噩夢",
                        "value": "fork"
                    },
                    {
                        "label": "B. 插件架構 (Plugin System)",
                        "description": "最優雅。但我們需要花 3 個月開發插件系統。",
                        "risk_score": "前期成本高",
                        "value": "plugin"
                    },
                    {
                        "label": "C. 拒絕客製 (Standard Only)",
                        "description": "保持產品純淨。但可能會失去這個大客戶。",
                        "risk_score": "營收損失",
                        "value": "reject"
                    }
                ]
            }
        ]
    }
}





def build_prompt(requirement: str, language: str) -> str:
    """構建AI prompt"""
    if language == 'zh-TW':
        return f"""你是一個資深架構師，專門挖掘需求中的邏輯漏洞。

用戶需求：{requirement}

請生成 2 個「災難導向」的選擇題，用於蘇格拉底式邏輯面試。

重要規則：
1. **禁止問配置問題**（如：資料庫選 MySQL 還是 PostgreSQL？端口號是多少？）
2. **必須問災難場景**（如：如果兩個用戶同時操作怎麼辦？如果外部API超時怎麼辦？）
3. 每個問題提供 3 個選項，每個選項都有明確的「代價」(trade-off)

請以 JSON 格式返回：

{{
  "questions": [
    {{
      "id": "q1_xxx",
      "type": "single_choice",
      "text": "問題文字",
      "options": [
        {{
          "label": "A. 選項名稱",
          "description": "這個選擇的代價是什麼",
          "risk_score": "風險標籤（如：低風險，高延遲）",
          "value": "option_value"
        }}
      ]
    }}
  ]
}}

只返回 JSON，不要其他文字。"""
    else:
        return f"""You are a senior architect who specializes in finding logic gaps in requirements.

User requirement: {requirement}

Generate 2 "disaster-oriented" multiple choice questions for Socratic logic interview.

Important rules:
1. **DO NOT ask configuration questions**
2. **MUST ask disaster scenarios**
3. Each question provides 3 options with clear trade-offs

Return in JSON format only."""


def get_fallback_questions(language: str = 'zh-TW') -> dict:
    """備用問題（當AI無法生成時）"""
    
    if language == 'zh-TW':
        return {
            "questions": [
                {
                    "id": "q1_concurrency",
                    "type": "single_choice",
                    "text": "如果您的系統真的「爆紅」了 (同時 10萬人在搶票)，您希望系統怎麼反應？",
                    "options": [
                        {
                            "label": "A. 寧可排隊，不能出錯 (悲觀鎖)",
                            "description": "這是最安全的做法。用戶會看到「排隊中」，但絕不會買到重複的票。",
                            "risk_score": "用戶可能會等到不耐煩",
                            "value": "pessimistic"
                        },
                        {
                            "label": "B. 速度優先，出錯再說 (樂觀鎖)",
                            "description": "搶票很快，但最後結帳時可能告訴用戶「抱歉，票沒了」。",
                            "risk_score": "用戶體驗可能很差",
                            "value": "optimistic"
                        },
                        {
                            "label": "C. 為了速度不顧一切 (Redis)",
                            "description": "極限速度，但如果伺服器突然當機，可能會導致數據錯亂。",
                            "risk_score": "數據有遺失風險",
                            "value": "redis"
                        }
                    ]
                },
                {
                    "id": "q2_privacy",
                    "type": "single_choice",
                    "text": "如果用戶要求「刪除帳號」，您希望我們做得多徹底？ (GDPR)",
                    "options": [
                        {
                            "label": "A. 假裝刪除 (軟刪除)",
                            "description": "只是標記為「已刪除」，資料其實還在資料庫裡。方便以後救回。",
                            "risk_score": "可能不符合歐盟法規",
                            "value": "soft_delete"
                        },
                        {
                            "label": "B. 真的刪除 (物理刪除)",
                            "description": "連根拔起，資料庫裡完全找不到。最安全，但救不回來。",
                            "risk_score": "資料無法恢復",
                            "value": "hard_delete"
                        },
                        {
                            "label": "C. 匿名化 (去識別化)",
                            "description": "保留他的消費數據做報表，但塗掉名字和電話。",
                            "risk_score": "開發成本較貴",
                            "value": "anonymize"
                        }
                    ]
                },
                {
                    "id": "q3_scalability",
                    "type": "single_choice",
                    "text": "如果您的用戶量從 1千 突然變成 100萬，您的預算是？",
                    "options": [
                        {
                            "label": "A. 花錢消災 (垂直擴展)",
                            "description": "直接買一台超級電腦。最簡單，但再貴的電腦也有極限。",
                            "risk_score": "硬體成本高",
                            "value": "vertical"
                        },
                        {
                            "label": "B. 請分身幫忙 (讀寫分離)",
                            "description": "多開幾台小電腦幫忙「讀」資料。標準做法，CP值高。",
                            "risk_score": "資料可能有延遲",
                            "value": "read_write_split"
                        },
                        {
                            "label": "C. 重新架構 (水平分片)",
                            "description": "像 Google 一樣的架構。可以無限擴展，但開發非常非常難。",
                            "risk_score": "開發時間最長",
                            "value": "sharding"
                        }
                    ]
                }
            ]
        }
    else:  # en-US
        return {
            "questions": [
                {
                    "id": "q1_concurrency",
                    "type": "single_choice",
                    "text": "For 'data consistency', what if multiple users operate simultaneously?",
                    "options": [
                        {
                            "label": "A. Pessimistic Lock",
                            "description": "Absolutely safe, but terrible performance. Users may have to queue.",
                            "risk_score": "Low Risk, High Latency",
                            "value": "pessimistic"
                        },
                        {
                            "label": "B. Optimistic Lock (CAS)",
                            "description": "Good performance, but causes many retry failures on conflict.",
                            "risk_score": "High Risk, Low Latency",
                            "value": "optimistic"
                        },
                        {
                            "label": "C. Distributed Lock (Redlock)",
                            "description": "Extremely fast, but introduces Redis dependency complexity.",
                            "risk_score": "Architecture Complexity",
                            "value": "redis"
                        }
                    ]
                },
                {
                    "id": "q2_privacy",
                    "type": "single_choice",
                    "text": "For 'GDPR Compliance', how should we handle data deletion?",
                    "options": [
                        {
                            "label": "A. Soft Delete (is_active=False)",
                            "description": "Easy to recover, but might violate 'Right to be Forgotten'.",
                            "risk_score": "Regulatory Risk",
                            "value": "soft_delete"
                        },
                        {
                            "label": "B. Hard Delete (Physical)",
                            "description": "Clean, but impossible to recover data or audit logs.",
                            "risk_score": "Data Loss Risk",
                            "value": "hard_delete"
                        },
                        {
                            "label": "C. Anonymization",
                            "description": "Keep stats but mask PII. Complex to implement correctly.",
                            "risk_score": "Implementation Cost",
                            "value": "anonymize"
                        }
                    ]
                },
                 {
                    "id": "q3_scalability",
                    "type": "single_choice",
                    "text": "Anticipating 100k+ daily users, what's your database strategy?",
                    "options": [
                        {
                            "label": "A. Vertical Scaling (Bigger Server)",
                            "description": "Simplest, but has a hard cost ceiling.",
                            "risk_score": "Cost Ceiling",
                            "value": "vertical"
                        },
                        {
                            "label": "B. Read/Write Splitting",
                            "description": "Standard practice, but introduces replication lag issues.",
                            "risk_score": "Replication Lag",
                            "value": "read_write_split"
                        },
                        {
                            "label": "C. Sharding (Horizontal)",
                            "description": "Infinite scale, but joins become impossible/complex.",
                            "risk_score": "Development Complexity",
                            "value": "sharding"
                        }
                    ]
                }
            ]
        }
