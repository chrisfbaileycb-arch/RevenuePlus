import { REVENUE_PULSE_BUNDLE_SOURCE } from '@/constants/bundleTemplate';
import { RestaurantConfig } from './onboardingConfig';
import { extractMenuSchema } from './menuExtractor';

/**
 * Generates and downloads a self-contained revenue-plus-agent.js bundle.
 * The bundle contains the full menu schema, injector, customer lookup,
 * and agent bridge — ready to be deployed as a bookmarklet or script injection.
 */
export function downloadIntegrationBundle(config?: RestaurantConfig): void {
  // Capture the current live menu schema if available
  const schema = extractMenuSchema(config?.pos_selector_map?.container || '#pos-simulator');

  const schemaJson = JSON.stringify(schema, null, 2);
  const configJson = config ? JSON.stringify(config, null, 2) : 'null';
  const timestamp = new Date().toISOString();

  const finalBundle = REVENUE_PULSE_BUNDLE_SOURCE
    .replace('__INJECTED_SCHEMA__', schemaJson)
    .replace('__INJECTED_CONFIG__', configJson)
    .replace('__BUILD_TIMESTAMP__', timestamp)
    .replace('__SCHEMA_COUNT__', String(schema.length));

  const blob = new Blob([finalBundle], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'revenue-pulse-agent.js';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  console.log(`[BundleGenerator] Downloaded revenue-pulse-agent.js — ${schema.length} items embedded`);
}

/**
 * Generates and downloads the README.md for the integration bundle.
 */
export function downloadReadme(): void {
  const blob = new Blob([README_CONTENT], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'REVENUE_PULSE_README.md';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates and downloads a starter restaurant config JSON file.
 */
export function downloadStarterConfig(): void {
  const starterConfig: RestaurantConfig = {
    store_name: 'My Restaurant',
    store_id: 'my-restaurant-001',
    timezone: 'America/Chicago',
    pos_selector_map: {
      container: '#pos-root',
      item: '[data-item-id]',
      nameAttr: 'data-item-name',
      priceAttr: 'data-item-price',
      addButton: '.add-to-cart',
      cart: '#pos-cart',
      cartClearButton: '.cart-clear-btn',
      checkoutPhone: 'input[name="phone"]',
      savedProfile: '#saved-profile',
    },
    special_menu_urls: [
      'https://your-pos-system.com/menu',
      'https://your-pos-system.com/specials',
    ],
    webhooks: {
      inject_order: 'https://your-relay-server.com/api/inject-order',
      customer_lookup: 'https://your-relay-server.com/api/customer-lookup',
      menu_schema: 'https://your-relay-server.com/api/menu-schema',
    },
    agent_api_key: 'rp_sk_YOUR_KEY_HERE',
    merchant_id: 'MERCHANT_001',
  };

  const blob = new Blob([JSON.stringify(starterConfig, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = 'restaurant-config.json';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const README_CONTENT = `# Revenue Pulse Integration Bundle
## AI Phone Ordering Agent Bridge — V1.0

### Overview
Revenue Pulse is a headless middleware layer that enables AI voice agents (Vapi, Bland.ai, Retell, etc.)
to read menu data from and inject orders into any POS system — without requiring a native POS API key.

It works by wrapping the POS interface DOM and exposing three programmatic modules:
1. **Menu Schema Extractor** — converts POS DOM elements to structured JSON
2. **Order Injector** — fires DOM events to add items to the cart programmatically
3. **Customer Lookup** — resolves a phone number to a saved profile and payment token

---

### Files in This Bundle
\`\`\`
revenue-pulse-agent.js   ← Self-contained agent bridge (drop into any page)
restaurant-config.json  ← Your restaurant's configuration (edit and load at runtime)
REVENUE_PULSE_README.md  ← This file
\`\`\`

---

### Quick Start (2 Steps)

**Step 1 — Add the script to your POS page:**
\`\`\`html
<script src="/revenue-pulse-agent.js"></script>
\`\`\`

Or as a bookmarklet (paste into browser console):
\`\`\`js
javascript:(function(){var s=document.createElement('script');s.src='https://your-cdn.com/revenue-pulse-agent.js';document.head.appendChild(s);})()
\`\`\`

**Step 2 — Initialize with your restaurant config:**
\`\`\`js
window.revenuePulse.init({
  store_name: "Mario's Pizza",
  store_id: "marios-001",
  pos_selector_map: {
    container: "#pos-root",
    item: "[data-item-id]",
    nameAttr: "data-item-name",
    priceAttr: "data-item-price",
    addButton: ".add-to-cart"
  }
});
\`\`\`

---

### The Three Required Webhooks

Your AI voice agent relay server must implement these three HTTP endpoints.
These are the **only** integration surface the AI agent needs.

#### 1. POST /api/inject-order
Called by the AI agent when a customer selects an item over the phone.

**Request:**
\`\`\`json
{
  "selector": "#pos-item-001",
  "modifications": ["Extra Cheese", "No Onions"],
  "session_id": "rp-abc123",
  "agent_api_key": "rp_sk_YOUR_KEY"
}
\`\`\`

**Response:**
\`\`\`json
{
  "status": "success",
  "order_id": "ORD-XYZ789",
  "item_name": "Pepperoni Pizza",
  "selector": "#pos-item-001",
  "timestamp": "2026-07-18T14:23:01.000Z"
}
\`\`\`

**How it works:**
Your server relays the payload to the browser via postMessage or WebSocket,
which triggers \`window.injectAIOrder(selector, modifications)\`.

---

#### 2. GET /api/customer-lookup?phone=5551234567
Called by the AI agent at the start of every call to identify the caller.

**Response (returning customer):**
\`\`\`json
{
  "phone": "5551234",
  "name": "Jane Smith",
  "payment_token": "tok_visa_xxxx4242",
  "last_order": ["Pepperoni Pizza", "Garlic Bread"],
  "loyalty_points": 340,
  "profile_exists": true,
  "preferred_items": ["Pepperoni Pizza"]
}
\`\`\`

**Response (new caller):**
\`\`\`json
{
  "phone": "5559999",
  "name": "Guest",
  "payment_token": null,
  "last_order": [],
  "loyalty_points": 0,
  "profile_exists": false,
  "preferred_items": []
}
\`\`\`

**How it works:**
Your server calls \`window.revenuePulse.lookupCustomer(phone)\` which inspects the POS
checkout DOM for an active session, then falls back to your customer database.

---

#### 3. GET /api/menu-schema
Called once per session by the AI agent to load the full menu before taking the call.

**Response:**
\`\`\`json
[
  {
    "item_name": "Pepperoni Pizza",
    "item_price": 14.99,
    "category": "Pizza",
    "pos_element_selector": "#pos-item-001",
    "modifiers": ["Extra Cheese", "No Onions", "Gluten Free Crust"],
    "available": true
  }
]
\`\`\`

**How it works:**
Your server calls \`window.revenuePulse.extractMenu()\` which parses the live POS DOM
and returns the complete menu as structured JSON.

---

### Global API Reference

Once \`revenue-pulse-agent.js\` is loaded, the following are available globally:

\`\`\`js
// Extract full menu schema from DOM
window.revenuePulse.extractMenu(containerSelector?)     // → MenuItem[]

// Inject an order into the POS cart (AI agent calls this)
window.injectAIOrder(selector, modifications?)         // → InjectionResult

// Look up a customer by phone number
window.revenuePulse.lookupCustomer(phone)               // → CustomerProfile

// Clear the POS cart
window.revenuePulse.clearCart()                         // → boolean

// Initialize with a restaurant config
window.revenuePulse.init(config)                        // → void

// Subscribe to all agent responses
window.revenuePulse.onResponse(callback)                // → void
\`\`\`

---

### Environment Variables (Relay Server)

Copy this template to your relay server's \`.env\` file:

\`\`\`env
# Revenue Pulse Relay Server Environment Variables

# Authentication
RP_AGENT_API_KEY=rp_sk_YOUR_SECRET_KEY_HERE
RP_MERCHANT_ID=MERCHANT_001

# WebSocket / postMessage relay
RP_WS_PORT=3001
RP_ALLOWED_ORIGINS=https://your-pos-domain.com

# Customer database connection (replace with your actual DB)
RP_DB_URL=postgresql://user:pass@localhost:5432/revenue_pulse
RP_DB_TABLE_CUSTOMERS=rp_customers

# AI Agent Platform (Vapi / Bland / Retell)
VAPI_WEBHOOK_SECRET=your_vapi_webhook_secret
BLAND_API_KEY=your_bland_api_key
RETELL_API_KEY=your_retell_api_key

# Optional: POS session relay
RP_SESSION_TTL_SECONDS=3600
RP_MENU_CACHE_SECONDS=300
\`\`\`

---

### Supported POS Systems
Revenue Plus is POS-agnostic. It reads any DOM structure.
To support a new POS, provide the correct \`pos_selector_map\` in your config.

Tested DOM patterns:
- Standard data-attribute menus (\`data-item-id\`, \`data-item-name\`, \`data-item-price\`)
- Class-based menus (provide CSS selectors in the map)
- Legacy table-based POS UIs (use \`td:nth-child()\` selectors)
- iFrame-wrapped POS systems (inject the script inside the iframe)

---

### Architecture Diagram

\`\`\`
Phone Call
    │
    ▼
AI Voice Agent (Vapi / Bland / Retell)
    │
    ├─ GET  /api/menu-schema        ──► window.revenuePlus.extractMenu()
    │                                         │
    │                               POS DOM Parsing
    │                                         │
    │                               Returns MenuItem[]
    │
    ├─ GET  /api/customer-lookup    ──► window.revenuePlus.lookupCustomer(phone)
    │                                         │
    │                               DOM Inspection + DB Query
    │                                         │
    │                               Returns CustomerProfile
    │
    └─ POST /api/inject-order       ──► window.injectAIOrder(selector, mods)
                                              │
                                    DOM Event Injection
                                              │
                                    POS Cart Updated (no human touch)
\`\`\`

---

### Support
Revenue Pulse Agent Bridge V1.0
Built by Revenue Pulse — AI Phone Ordering for Independent Restaurants
`;
