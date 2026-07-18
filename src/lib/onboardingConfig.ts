/**
 * Revenue Pulse — Restaurant Onboarding Configuration
 *
 * Accepts a JSON config object (or a path to a JSON file) and initializes
 * the agent instance for a specific restaurant. No UI. Pure configuration.
 *
 * Usage (in browser console or injected script):
 *   window.revenuePulse.init(config);
 *
 * Usage (Node / server-side test harness):
 *   const { initFromConfig } = require('./onboardingConfig');
 *   initFromConfig(require('./my-restaurant.json'));
 */

export interface POSSelectorMap {
  /** Root container of the POS menu grid */
  container: string;
  /** Selector that matches each individual menu item wrapper */
  item: string;
  /** Attribute or child selector where the item name lives */
  nameAttr: string;
  /** Attribute or child selector where the item price lives */
  priceAttr: string;
  /** The "Add to Cart" trigger button inside each item */
  addButton: string;
  /** Cart panel / overlay selector */
  cart?: string;
  /** Cart clear/reset button */
  cartClearButton?: string;
  /** Checkout phone input (for customer lookup injection) */
  checkoutPhone?: string;
  /** Stored profile element (data-phone, data-token attributes) */
  savedProfile?: string;
}

export interface RestaurantConfig {
  /** Human-readable restaurant name */
  store_name: string;
  /** Unique slug used as a namespace in logs */
  store_id: string;
  /** Timezone (IANA format, e.g. "America/Chicago") */
  timezone?: string;
  /**
   * POS selector map — describes the DOM structure of this restaurant's
   * POS system so the extractor and injector know where to look.
   */
  pos_selector_map: POSSelectorMap;
  /**
   * Special menu URLs — additional pages that contain menus
   * (e.g. specials, happy hour, catering).
   * The agent will crawl these in order and merge them into the main schema.
   */
  special_menu_urls?: string[];
  /**
   * Webhook endpoints for the AI voice agent relay.
   * These three webhooks are the only integration surface exposed to the agent.
   */
  webhooks?: {
    /** POST — receives { selector, modifications[] } to inject an order */
    inject_order: string;
    /** GET  — receives ?phone=<digits> to look up a customer profile */
    customer_lookup: string;
    /** GET  — returns the full menu JSON schema */
    menu_schema: string;
  };
  /** API key or bearer token the AI agent must send in Authorization header */
  agent_api_key?: string;
  /** Merchant reference ID for billing / analytics */
  merchant_id?: string;
}

/** Active config once initialized */
let _activeConfig: RestaurantConfig | null = null;

/**
 * Initialize the Revenue Pulse agent for a specific restaurant.
 * Call this once when the POS page loads, passing the restaurant's config JSON.
 */
export function initFromConfig(config: RestaurantConfig): void {
  validateConfig(config);
  _activeConfig = config;

  // Persist config in sessionStorage so the bridge can reference it on navigation
  try {
    sessionStorage.setItem('rp:config', JSON.stringify(config));
  } catch {
    // sessionStorage may be unavailable in some POS sandboxes
  }

  console.log(`[RevenuePulse] Restaurant config loaded: "${config.store_name}" (${config.store_id})`);
  console.log(`[RevenuePulse] POS container: ${config.pos_selector_map.container}`);

  if (config.special_menu_urls?.length) {
    console.log(`[RevenuePulse] Special menu URLs registered: ${config.special_menu_urls.join(', ')}`);
  }

  if (config.webhooks) {
    console.log('[RevenuePulse] Webhook endpoints registered:');
    console.log(`  inject_order   → ${config.webhooks.inject_order}`);
    console.log(`  customer_lookup→ ${config.webhooks.customer_lookup}`);
    console.log(`  menu_schema    → ${config.webhooks.menu_schema}`);
  }

  // Dispatch a DOM event so the bridge can pick up the config immediately
  document.dispatchEvent(
    new CustomEvent('revenuePulse:configLoaded', { detail: config, bubbles: true })
  );
}

/** Returns the currently active restaurant config, or null if not initialized. */
export function getActiveConfig(): RestaurantConfig | null {
  if (_activeConfig) return _activeConfig;

  // Try to recover from sessionStorage (e.g., page was refreshed)
  try {
    const stored = sessionStorage.getItem('rp:config');
    if (stored) {
      _activeConfig = JSON.parse(stored) as RestaurantConfig;
      return _activeConfig;
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Generates the selector map that the menu extractor and order injector
 * will use at runtime. Falls back to Revenue Pulse defaults if no config is loaded.
 */
export function getRuntimeSelectors(): POSSelectorMap {
  const cfg = getActiveConfig();
  if (cfg) return cfg.pos_selector_map;

  // Built-in defaults match the Revenue Pulse demo POS simulator
  return {
    container: '#pos-simulator',
    item: '[data-item-id]',
    nameAttr: 'data-item-name',
    priceAttr: 'data-item-price',
    addButton: '.add-to-cart',
    cart: '#pos-cart',
    cartClearButton: '.cart-clear-btn',
    checkoutPhone: '#customer-phone',
    savedProfile: '#saved-profile',
  };
}

function validateConfig(cfg: RestaurantConfig): void {
  const required: (keyof RestaurantConfig)[] = ['store_name', 'store_id', 'pos_selector_map'];
  const missing = required.filter((k) => !cfg[k]);
  if (missing.length) {
    throw new Error(`[RevenuePulse] Invalid config — missing required fields: ${missing.join(', ')}`);
  }

  const mapRequired: (keyof POSSelectorMap)[] = ['container', 'item', 'nameAttr', 'priceAttr', 'addButton'];
  const mapMissing = mapRequired.filter((k) => !cfg.pos_selector_map[k]);
  if (mapMissing.length) {
    throw new Error(`[RevenuePulse] Invalid pos_selector_map — missing: ${mapMissing.join(', ')}`);
  }
}
