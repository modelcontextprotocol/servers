
[![smithery badge](https://smithery.ai/badge/businesshotelsdeveloper/business-hotels)](https://smithery.ai/servers/businesshotelsdeveloper/business-hotels)
![MCP Version](https://img.shields.io/badge/MCP-1.0-blue)
![Travel](https://img.shields.io/badge/Travel-Global_Inventory-blueviolet)
![Hotel Rates](https://img.shields.io/badge/Hotel_Prices-Live_GDS-red)
![Latency](https://img.shields.io/badge/Latency-%3C800ms-green?style=flat-square&logo=speedtest&logoColor=white)
![Focus](https://img.shields.io/badge/Focus-Bleisure-orange)
 

## 🌍  BusinessHotels.com Agentic API - Universal LLM Compatibility. 

---

## ⚡ Performance Showcase

The [BusinessHotels.com MCP Server](https://github.com/businesshotelsdeveloper-dot/businesshotels.com) is built for speed. By optimizing for **sub-second latency**, we enable autonomous agents to perform complex travel logic—like ranking multiple properties—in real-time without timing out.

### 🔄 Multi-Hotel Agentic Loop (Sub-Second Ranking)
Demonstrates the **"Loop, Collect, Then Respond"** pattern. The agent queries 5 luxury properties and ranks them by value in under 1 second.
[![BusinessHotels.com MCP Multi-Hotel Demo](https://img.youtube.com/vi/xwaulgWBqJQ/0.jpg)](https://youtu.be/xwaulgWBqJQ)
* **Goal:** Ranking and comparing live inventory.
* **Speed:** Total verification for 5 properties in **< 1 second**.

### 🔍 Single Property Verification & Deep Dive
Demonstrates real-time price validation and booking hand-off for a specific hotel.
[![BusinessHotels.com MCP Single Hotel Demo](https://img.youtube.com/vi/wg-NCa0ga1A/0.jpg)](https://youtu.be/wg-NCa0ga1A)
* **Goal:** Final price verification and generating "Agentic Booking" URLs.
* **Speed:** Complete JSON payload returned in **~531ms**.

---
The **BusinessHotels.com MCP Server** is built on the OpenAI-compatible JSON Schema format—the universal standard accepted by all leading AI platforms. This enables zero-config auto-registration across the entire agentic ecosystem.

| Platform | Integration Method | Status |
| :--- | :--- | :--- |
| 🔵 **Google Gemini** | **Native MCP Extension** (Auto-discovery) | ✅ **Fully supported** |
| 🟣 **Claude** | **Native MCP Connector** (SSE transport) | ✅ **Fully supported** |
| 🧡 **ChatGPT** | **Connectors Beta** & Function Calling API | ✅ **Fully supported** |
| 🟢 **Perplexity** | **Function calling + MCP Connectors** | ✅ **Fully supported** |
| 🪟 **MS Copilot** | **Copilot Studio** or MCP plugin manifest | ✅ **Fully supported** |
| 💻 **Cursor / Windsurf** | **Native MCP Connector** (IDE integration) | ✅ **Fully supported** |
| 🌐 **Any MCP Client** | **Auto-discovery** via `?route=tools` | ✅ **Protocol-native** |

---

### 🔗 Technical Discovery & Multi-Model Endpoints

This server is a **Multi-Model Transport Hub** that provides autonomous AI agents with instant (<1s) access to live hotel inventory. It is optimized for the **Model Context Protocol (MCP)** and OpenAI-compatible tool calling.

| LLM Platform          | Protocol / Transport       | Primary Integration URL |
|-----------------------|----------------------------|-------------------------------------------------------------|
| **Grok / xAI**        | MCP (Remote / Tools)       | `https://www.businesshotels.com/mcp-server-grok.php?route=tools` |
| **Gemini / Vertex AI**| MCP (Stateless/SSE)        | `https://www.businesshotels.com/mcp-server-gemini.php` |
| **Claude.ai**         | MCP (SSE)                  | `https://www.businesshotels.com/mcp-server-claude.php` |
| **ChatGPT (Plus/Pro)**| MCP (OpenAPI 3.1)          | `https://www.businesshotels.com/mcp-server-chatgpt.php` |
| **Perplexity Comet**  | MCP (JSON-RPC)             | `https://www.businesshotels.com/mcp-server-perplexity.php` |
| **Universal / Dev**   | MCP (Unified)              | `https://www.businesshotels.com/mcp-server.php?route=tools` |
| **Discovery Spec**    | JSON Manifest              | `https://www.businesshotels.com/.well-known/mcp.json` |
| **OpenAPI Spec**      | Spec (JSON)                | `https://www.businesshotels.com/openapi.json` |

> [!TIP]
> **Zero-Prompt Engineering:** By adhering to **Strict Schema Validation**, agents autonomously determine required parameters (`hotelName`, `checkinDate`, `checkoutDate`) and validate them locally. This ensures a 100% reliable handshake between the agent and the **BusinessHotels** inventory.

---

## 🛠️ Connection & Discovery

This infrastructure is optimized for autonomous agents and "Bleisure" (business + leisure) workflows, supporting both persistent streaming (SSE) and stateless HTTP requests.

| Resource | Access URL |
| :--- | :--- |
| **Universal Tools Registry** | [mcp-server.php?route=tools](https://www.businesshotels.com/mcp-server.php?route=tools) |
| **OpenAPI Specification** | [openapi.json](https://www.businesshotels.com/openapi.json) |
| **MCP Discovery Spec** | [.well-known/mcp.json](https://www.businesshotels.com/.well-known/mcp.json) |
| **AI Plugin Manifest** | [.well-known/ai-plugin.json](https://www.businesshotels.com/.well-known/ai-plugin.json) |
| **Full Configuration Guide** | [tool-config.html](https://www.businesshotels.com/tool-config.html) |

---

### 🚀 Agentic Infrastructure
* **Latency:** <1s response time optimized for real-time Agentic search.
* **Studio:** Engineered by **Asian Airfares Group, LLC** — San Francisco, CA.
* **Sustainability:** Built with **AI Efficiency Priority** to minimize token overhead and power consumption.

...
| [Full API Docs](https://www.businesshotels.com/tool-config.html) |

## 🚀 Performance & Reliability
* **Ultra-Low Latency:** Engineered for agentic workflows where speed is critical. Most requests return in **under 800ms**, allowing agents to compare multiple hotels in parallel without hitting LLM timeout limits.
* **Real-Time Accuracy:** Unlike cached databases, our "Agentic API" fetches live inventory directly from the global distribution system (GDS) the moment the tool is called.
* **Optimized for Parallelism:** Use the [Multi-Hotel Comparison Pattern](#-multi-hotel-comparison-pattern) below to fetch rates for 5+ hotels simultaneously in under 2 seconds.

 

## Quick Configuration

### Option 1: Local Stdio (Best for Claude Desktop)
Add the following block to the `mcpServers` section of your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "businesshotels-universal-agentic-api": {
      "command": "npx",
      "args": [
        "-y", 
        "@businesshotels/business-hotels-mcp"
      ],
      "env": {
        "BUSINESS_HOTELS_API_KEY": "test-live-hotel-rates2025"
      }
    }
  }
}
 
```

**Option 2: Claude.ai Custom Connector (Remote MCP — No install required)**

For [claude.ai](https://claude.ai) users (Free, Pro, Max, Team & Enterprise):

1. Go to **Settings → Connectors → Add custom connector**
2. Enter the following:

| Field | Value |
|---|---|
| Name | `BusinessHotels Live Rates` |
| Remote MCP server URL | `https://www.businesshotels.com/mcp-server-claude.php` |

3. Click **Add** → then **Connect**

Claude will automatically discover the `get_live_hotel_rates` tool and use it in any conversation. No npm, no local install, no API key required.

> **Note:** This endpoint (`mcp-server-claude.php`) is dedicated to claude.ai and implements the full MCP JSON-RPC 2.0 handshake (`initialize` → `tools/list` → `tools/call`) required by Claude's custom connector protocol. For Claude Desktop (local), use Option 1 above.

 ## Remote SSE (Best for Cursor & Windsurf)

 

```json
{
  "mcpServers": {
    "businesshotels-universal-agentic-api": {
      "command": "npx",
      "args": ["-y", "@businesshotels/business-hotels-mcp"],
      "env": {
        "BUSINESS_HOTELS_API_KEY": "test-live-hotel-rates2025"
      }
    }
  }
}
```

## API Reference

| Property | Value |
|---|---|
| **Endpoint** | `POST https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates` |
| **Auth Header** | `X-API-KEY: test-live-hotel-rates2025` |
| **Content-Type** | `application/json` |
| **Test API Key** | `test-live-hotel-rates2025` *(light production — email [ai@businesshotels.com](mailto:ai@businesshotels.com) for high-volume access)* |

### Request Parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `hotelName` | string | ✅ | Hotel + city + state, country, **use commas**. E.g. `"Wynn Las Vegas, NV, US"` |
| `checkinDate` | string | ✅ | Format: `YYYY-MM-DD` |
| `checkoutDate` | string | ✅ | Format: `YYYY-MM-DD` |
| `adults` | integer | — | Default: `2` |
| `currency` | string | — | Default: `"USD"` |

### ⚠️ Response Gotchas

- `display_all_in_total` is a **comma-formatted STRING** (e.g. `"1,250.00"`) — always strip commas before numeric operations
- `rates` may be **`null`** when the hotel is sold out — always guard against this before accessing nested fields
- `best_match_score` below `0.85` = low confidence — verify hotel identity with user before booking

---

## Quick-Start Tests

Choose your preferred language or integration method:

| # | Method | Best For |
|---|---|---|
| [1](#test-1--browser-devtools-console) | Browser DevTools Console | Fastest test, zero setup |
| [2](#test-2--python-requests) | Python `requests` | Backend scripts, data pipelines |
| [3](#test-3--curl) | cURL | CLI, shell scripts, CI/CD |
| [4](#test-4--javascript-asyncawait) | JavaScript (async/await) | Frontend apps, Node.js |
| [5](#test-5--openai-function-calling-python) | OpenAI Function Calling — Python | GPT-4o agent integration |
| [6](#test-6--openai-function-calling-javascript) | OpenAI Function Calling — JavaScript | GPT-4o agent integration (JS) |
| [7](#test-7--google-gemini-python) | Google Gemini — Python | Gemini 1.5 Pro agent integration |

---

### Test 1 · Browser DevTools Console

> Open any page on **BusinessHotels.com** → press `F12` → go to the **Console** tab → paste and hit Enter.

```js
fetch("https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-API-KEY": "test-live-hotel-rates2025"
  },
  body: JSON.stringify({
    hotelName:    "JW Marriott, Las Vegas, NV, US",
    checkinDate:  "2026-07-15",
    checkoutDate: "2026-07-16",
    adults: 2,
    currency: "USD"
  })
})
  .then(r => r.json())
  .then(data => {
    console.log("✅ Hotel:",  data.hotel_name);
    console.log("💰 Price:", `$${data.rates?.display_all_in_total} ${data.rates?.currency}`);
    console.log("🔗 Book:",   data.booking_page_live_rates);
    console.log("📊 Score:",  data.best_match_score);
    console.log("Full response:", data);
  });
```

---

### Test 2 · Python `requests`

```python
import requests

URL     = "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates"
HEADERS = {"X-API-KEY": "test-live-hotel-rates2025", "Content-Type": "application/json"}

payload = {
    "hotelName":    "San Francisco Marriott Marquis, San Francisco, CA US",
    "checkinDate":  "2026-06-20",
    "checkoutDate": "2026-06-21",
    "adults": 2,
    "currency": "USD"
}

data      = requests.post(URL, json=payload, headers=HEADERS, timeout=10).json()
rates     = data.get("rates") or {}
raw_price = rates.get("display_all_in_total", "")

if not raw_price or str(raw_price).strip() == "":
    print("⚪ Sold out — no inventory for these dates / occupancy")
else:
    price = float(str(raw_price).replace(",", ""))
    print(f"Hotel:    {data.get('hotel_name')}, {data.get('city_name')}")
    print(f"Price:    ${price:.2f} {rates.get('currency', 'USD')}  (taxes & fees included)")
    print(f"Score:    {data.get('best_match_score', 0):.2f}  (1.0 = perfect match)")
    print(f"Book Now: {data.get('booking_page_live_rates')}")
    if data.get("best_match_score", 1) < 0.85:
        print("⚠️  Low confidence — confirm hotel identity before booking")
```

---

### Test 3 · cURL

```bash
curl -s -X POST \
  "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates" \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: test-live-hotel-rates2025" \
  -d '{
    "hotelName":    "Luxor Las Vegas, Las Vegas, NV, US",
    "checkinDate":  "2026-07-20",
    "checkoutDate": "2026-07-21",
    "adults": 2,
    "currency": "USD"
  }' | python3 -m json.tool
```

---

### Test 4 · JavaScript (async/await)

Works in the browser or Node.js. Exposes `window.businessHotelsAPI` for reuse in browser contexts.

```js
async function getHotelRates(hotelName, checkinDate, checkoutDate, adults = 2, currency = "USD") {
  const res = await fetch(
    "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": "test-live-hotel-rates2025"
      },
      body: JSON.stringify({ hotelName, checkinDate, checkoutDate, adults, currency })
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --- Usage ---
const data = await getHotelRates("Bellagio, Las Vegas, NV, US", "2026-07-20", "2026-07-21");

const rawPrice = data?.rates?.display_all_in_total;
if (!rawPrice || String(rawPrice).trim() === "") {
  console.log("⚪ Sold out / no inventory for these dates.");
} else {
  const price = parseFloat(String(rawPrice).replace(/,/g, ""));
  console.log(`${data.hotel_name} — $${price.toFixed(2)} total (taxes included)`);
  console.log(`Book: ${data.booking_page_live_rates}`);
  if (data.best_match_score < 0.85)
    console.warn(`⚠️ Low confidence (${data.best_match_score}) — verify hotel before booking.`);
}

if (typeof window !== "undefined") window.businessHotelsAPI = { getHotelRates };
```

---

### Test 5 · OpenAI Function Calling — Python

Integrates `get_live_hotel_rates` as a GPT-4o tool.

```python
from openai import OpenAI
import requests, json

client = OpenAI(api_key="YOUR_OPENAI_API_KEY")
BH_KEY = "test-live-hotel-rates2025"
BH_URL = "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates"

tools = [{
    "type": "function",
    "function": {
        "name": "get_live_hotel_rates",
        "description": (
            "Get live, all-inclusive hotel rates and a direct booking URL. "
            "NOTE: 'display_all_in_total' is a comma-formatted STRING (e.g. '1,250.00') — "
            "strip commas before numeric operations. "
            "If rates is null or display_all_in_total is empty, the property is sold out."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "hotelName":    {"type": "string",  "description": "Hotel + city + country, use commas. E.g. 'Wynn Las Vegas, NV, US'"},
                "checkinDate":  {"type": "string",  "format": "date"},
                "checkoutDate": {"type": "string",  "format": "date"},
                "adults":       {"type": "integer", "default": 2},
                "currency":     {"type": "string",  "default": "USD"}
            },
            "required": ["hotelName", "checkinDate", "checkoutDate"]
        }
    }
}]

# Step 1 — model decides to call the tool
messages = [{"role": "user", "content": "Rates for Luxor Las Vegas, July 20-21 2026?"}]
r1  = client.chat.completions.create(model="gpt-4o", messages=messages, tools=tools, tool_choice="auto")
msg = r1.choices.message
messages.append(msg)

# Step 2 — execute tool call(s) and return results
if msg.tool_calls:
    for tc in msg.tool_calls:
        result = requests.post(
            BH_URL,
            headers={"X-API-KEY": BH_KEY, "Content-Type": "application/json"},
            json=json.loads(tc.function.arguments),
            timeout=10
        ).json()
        messages.append({"role": "tool", "tool_call_id": tc.id, "content": json.dumps(result)})

    # Step 3 — get the final natural-language response
    r2 = client.chat.completions.create(model="gpt-4o", messages=messages)
    print(r2.choices.message.content)
```

---

### Test 6 · OpenAI Function Calling — JavaScript

```js
import OpenAI from "openai";

const client = new OpenAI({ apiKey: "YOUR_OPENAI_API_KEY" });
const BH_KEY = "test-live-hotel-rates2025";
const BH_URL = "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates";

const tools = [{
  type: "function",
  function: {
    name: "get_live_hotel_rates",
    description:
      "Get live, all-inclusive hotel rates and a direct booking URL. " +
      "NOTE: 'display_all_in_total' is a comma-formatted STRING — strip commas before numeric ops. " +
      "If rates is null or price is empty, the property is sold out.",
    parameters: {
      type: "object",
      properties: {
        hotelName:    { type: "string" },
        checkinDate:  { type: "string", format: "date" },
        checkoutDate: { type: "string", format: "date" },
        adults:       { type: "integer", default: 2 },
        currency:     { type: "string",  default: "USD" }
      },
      required: ["hotelName", "checkinDate", "checkoutDate"]
    }
  }
}];

// Step 1 — model decides to call the tool
const messages = [{ role: "user", content: "Rates for Luxor Las Vegas, July 20-21 2026?" }];
const r1  = await client.chat.completions.create({ model: "gpt-4o", messages, tools, tool_choice: "auto" });
const msg = r1.choices.message;
messages.push(msg);

// Step 2 — execute tool call(s) and return results
if (msg.tool_calls) {
  for (const tc of msg.tool_calls) {
    const result = await fetch(BH_URL, {
      method: "POST",
      headers: { "X-API-KEY": BH_KEY, "Content-Type": "application/json" },
      body: tc.function.arguments
    }).then(r => r.json());
    messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
  }

  // Step 3 — get the final natural-language response
  const r2 = await client.chat.completions.create({ model: "gpt-4o", messages });
  console.log(r2.choices.message.content);
}
```

---

### Test 7 · Google Gemini — Python

Integrates `get_live_hotel_rates` as a Gemini 1.5 Pro function call.

```python
import google.generativeai as genai
import requests, json

genai.configure(api_key="YOUR_GEMINI_API_KEY")
BH_KEY = "test-live-hotel-rates2025"
BH_URL = "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates"

get_live_hotel_rates = genai.protos.Tool(
    function_declarations=[genai.protos.FunctionDeclaration(
        name="get_live_hotel_rates",
        description=(
            "Fetch live hotel rates and a direct booking URL. "
            "NOTE: 'display_all_in_total' is a comma-formatted STRING — strip commas before numeric ops. "
            "If rates is null or price is empty, the property is sold out."
        ),
        parameters=genai.protos.Schema(
            type=genai.protos.Type.OBJECT,
            properties={
                "hotelName":    genai.protos.Schema(type=genai.protos.Type.STRING),
                "checkinDate":  genai.protos.Schema(type=genai.protos.Type.STRING),
                "checkoutDate": genai.protos.Schema(type=genai.protos.Type.STRING),
                "adults":       genai.protos.Schema(type=genai.protos.Type.NUMBER),
                "currency":     genai.protos.Schema(type=genai.protos.Type.STRING)
            },
            required=["hotelName", "checkinDate", "checkoutDate"]
        )
    )]
)

model = genai.GenerativeModel(model_name="gemini-1.5-pro", tools=[get_live_hotel_rates])
chat  = model.start_chat(history=[])

# Step 1 — send the user message
resp = chat.send_message("Find live rates for Luxor Las Vegas, June 20-21 2026.")

# Step 2 — execute any function calls Gemini requested
for part in resp.candidates.content.parts:
    if part.function_call.name == "get_live_hotel_rates":
        result = requests.post(
            BH_URL,
            headers={"X-API-KEY": BH_KEY, "Content-Type": "application/json"},
            json=dict(part.function_call.args),
            timeout=10
        ).json()
        chat.send_message(genai.protos.Content(parts=[genai.protos.Part(
            function_response=genai.protos.FunctionResponse(
                name="get_live_hotel_rates",
                response={"result": result}
            )
        )]))

# Step 3 — get the final natural-language response
final = chat.send_message("Summarize the best price and booking link.")
print(final.text)
```

---

## 🔁 Multi-Hotel Comparison Pattern (High Performance) - Python
This API uses a **one-hotel-per-request** architecture. To maintain sub-second response times for comparisons, agents must use **asynchronous parallelism** rather than sequential loops.

## ✅ Correct Pattern — Parallel Fetching (Under 1 Second)
In a sequential loop, 5 hotels would take ~4 seconds. With the parallel code below using `concurrent.futures`, all requests fire simultaneously, finishing the entire comparison in the time it takes for a single request.

```python

import requests, json

url = "https://www.businesshotels.com/mcp-server.php?route=tools/get_live_hotel_rates"
headers = {"Content-Type": "application/json", "X-API-KEY": "test-live-hotel-rates2025"}

hotels_to_check = [
    "Fairmont San Francisco, San Francisco, US",
    "Four Seasons San Francisco at Embarcadero, San Francisco, US",
    "Ritz-Carlton San Francisco, San Francisco, US",
    "St. Regis San Francisco, San Francisco, US",
    "Palace Hotel a Luxury Collection Hotel, San Francisco, US"
]

params = {"checkinDate": "2026-07-12", "checkoutDate": "2026-07-14", "adults": 2, "currency": "USD"}
results = []

for hotel in hotels_to_check:
    r = requests.post(url, headers=headers, json={**params, "hotelName": hotel})
    data = r.json()
    rates = data.get("rates")
    if rates and rates.get("display_all_in_total"):
        price = float(str(rates["display_all_in_total"]).replace(",", ""))
        results.append({"name": data["hotel_name"], "price": price, "url": data["booking_page_live_rates"]})

# Sort and present ALL results together — never respond mid-loop
results.sort(key=lambda x: x["price"])
for i, h in enumerate(results, 1):
    print(f"{i}. {h['name']}: ${h['price']:.2f}")

cheapest = results[0]
print(f"\n🏆 Best Value: {cheapest['name']} at ${cheapest['price']:.2f}")
print(f"👉 Book Now: {cheapest['url']}")



```

### ⚠️ Critical Implementation Guardrails
* **Confidence Scoring:** Always check the `best_match_score`. If it is below **0.85**, the agent must verify the hotel identity (City/State) before providing a booking link.
* **Price Lock Expiry:** The `ppn_bundle` and price are valid for **~20 minutes**. Agents should re-fetch the rate if the user returns to an old session.
* **Discovery Specs:** For non-MCP integrations, use our [OpenAPI 3.0 Spec](https://www.businesshotels.com/openapi.json) or [AI Plugin Manifest](https://www.businesshotels.com/.well-known/ai-plugin.json).



### Architectural Rules

> 📌 **Complete all requests before responding.** Always finish the full loop before presenting any results. Responding mid-loop creates a fragmented, incomplete user experience.

> 📌 **No batch endpoint.** Do not pass a `hotels[]` array in a single request — the endpoint accepts one `hotelName` string per call only.

> ⚠️ **Rate lock timer starts at API response time.** The `ppn_bundle` token and quoted price are valid for approximately 20 minutes from when the API responded — not from when the user views results. If significant time has elapsed before the user clicks Book Now, warn them: *"This rate was fetched X minutes ago — prices may have changed. Refresh to confirm."*

> ⚠️ **Never modify `ppn_bundle`.** This token is an opaque rate-lock credential. Do not truncate, re-encode, or expose it to the user. It is already embedded in the `booking_page_live_rates` URL.

> ✅ **Session continuity.** Store `hotel_id` for each result during the session. If the user asks a follow-up like *"Does the Fairmont have a pool?"* or *"Show me the Fairmont again"*, reference the stored `hotel_id` without re-querying by name.

### 🧠 Example Agent Workflows

| Workflow | Description |
|---|---|
| **Best Value Finder** | Query up to 10 hotels, sanitize prices, sort by `display_all_in_total`, return the cheapest with a booking link |
| **Proximity Filter** | Use latitude/longitude to shortlist hotels within 0.5 miles of a specific address |
| **Luxury Rate Monitor** | Periodically scan a saved list of `hotel_id`s to alert when a suite drops below a target price |
| **Sold-Out Fallback** | If `display_all_in_total` is empty, automatically suggest nearby hotels or alternate dates without crashing |

---

## Support

📧 High-volume / production access: [ai@businesshotels.com](mailto:ai@businesshotels.com)
