/**
 * The self-contained revenue-pulse-agent.js bundle template.
 * Placeholders are replaced at download time with live data:
 *   __INJECTED_SCHEMA__   → current extracted menu JSON
 *   __INJECTED_CONFIG__   → restaurant config JSON (or null)
 *   __BUILD_TIMESTAMP__   → ISO timestamp
 *   __SCHEMA_COUNT__      → number of menu items
 */
export const REVENUE_PULSE_BUNDLE_SOURCE = `/*!
 * revenue-pulse-agent.js
 * Revenue Pulse Agent Bridge — V1.0
 * Built: __BUILD_TIMESTAMP__
 * Menu items embedded: __SCHEMA_COUNT__
 *
 * DROP THIS FILE INTO ANY PAGE TO ENABLE AI PHONE ORDERING.
 * No server required. No POS API key required.
 *
 * Quick start:
 *   window.revenuePlus.init(config)   — load your restaurant config
 *   window.revenuePlus.extractMenu()  — parse POS DOM → JSON
 *   window.injectAIOrder(selector)    — inject order via AI agent
 *   window.revenuePlus.lookupCustomer(phone) — resolve caller profile
 */

(function (root) {
  'use strict';

  /* ─── Embedded menu schema (captured at bundle generation time) ─── */
  var EMBEDDED_SCHEMA = __INJECTED_SCHEMA__;

  /* ─── Restaurant config (null = use defaults) ─── */
  var RESTAURANT_CONFIG = __INJECTED_CONFIG__;

  /* ─── Active runtime config ─── */
  var _config = RESTAURANT_CONFIG;
  var _schema = EMBEDDED_SCHEMA;
  var _listeners = [];

  /* ─────────────────────────────────────────────
   * MODULE 1: MENU SCHEMA EXTRACTOR
   * Parses POS DOM → structured JSON
   * ───────────────────────────────────────────── */
  function extractMenuSchema(containerSelector) {
    var selector = containerSelector
      || (_config && _config.pos_selector_map && _config.pos_selector_map.container)
      || '#pos-simulator';

    var container = document.querySelector(selector);
    if (!container) {
      console.error('[RevenuePulse] Container not found: "' + selector + '"');
      return EMBEDDED_SCHEMA; // fall back to embedded schema
    }

    var itemSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.item)
      || '[data-item-id]';
    var items = [];
    var posItems = container.querySelectorAll(itemSelector);

    posItems.forEach(function (el) {
      var nameAttr = (_config && _config.pos_selector_map && _config.pos_selector_map.nameAttr) || 'data-item-name';
      var priceAttr = (_config && _config.pos_selector_map && _config.pos_selector_map.priceAttr) || 'data-item-price';

      var itemName = el.getAttribute(nameAttr)
        || (el.querySelector('.item-name') && el.querySelector('.item-name').textContent.trim())
        || '';
      var itemPrice = parseFloat(el.getAttribute(priceAttr) || '0');
      var itemId = el.getAttribute('data-item-id') || '';
      var isUnavailable = el.classList.contains('pos-item--unavailable') || el.hasAttribute('data-unavailable');
      var category = (el.closest('[data-category]') && el.closest('[data-category]').getAttribute('data-category')) || 'Uncategorized';

      var elSelector = el.id ? '#' + el.id
        : itemId ? '[data-item-id="' + itemId + '"]'
        : itemSelector + ':nth-child(' + (Array.prototype.indexOf.call(el.parentNode.children, el) + 1) + ')';

      var modifiers = [];
      el.querySelectorAll('[data-modifier]').forEach(function (m) {
        var v = m.getAttribute('data-modifier');
        if (v) modifiers.push(v);
      });

      if (itemName && itemPrice > 0) {
        items.push({
          item_name: itemName,
          item_price: itemPrice,
          category: category,
          pos_element_selector: elSelector,
          modifiers: modifiers,
          available: !isUnavailable
        });
      }
    });

    if (items.length > 0) {
      _schema = items;
      console.log('[RevenuePulse] Extracted ' + items.length + ' items from "' + selector + '"');
    } else {
      console.warn('[RevenuePulse] No items found in DOM — returning embedded schema (' + EMBEDDED_SCHEMA.length + ' items)');
    }

    return _schema;
  }

  /* ─────────────────────────────────────────────
   * MODULE 2: ORDER INJECTION HOOK
   * Fires DOM events to add items to cart
   * Called by AI agent: window.injectAIOrder(selector, modifications)
   * ───────────────────────────────────────────── */
  function injectAIOrder(elementSelector, modifications) {
    var timestamp = new Date().toISOString();
    var orderId = 'ORD-' + Date.now().toString(36).toUpperCase();

    if (!elementSelector) {
      return { success: false, selector: '', item_name: 'UNKNOWN', message: '[INJECTION FAILED] No selector provided', timestamp: timestamp, order_id: orderId };
    }

    var target = document.querySelector(elementSelector);
    if (!target) {
      var msg = '[INJECTION FAILED] Element not found: "' + elementSelector + '"';
      console.error('[RevenuePulse]', msg);
      return { success: false, selector: elementSelector, item_name: 'UNKNOWN', message: msg, timestamp: timestamp, order_id: orderId };
    }

    var posItemEl = target.closest('[data-item-id]') || target;
    var item_name = posItemEl.getAttribute('data-item-name')
      || (posItemEl.querySelector('.item-name') && posItemEl.querySelector('.item-name').textContent.trim())
      || elementSelector;

    var addButtonSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.addButton) || '.add-to-cart';
    var addButton = posItemEl.querySelector(addButtonSelector)
      || posItemEl.querySelector('button')
      || (target.tagName === 'BUTTON' ? target : null);

    if (addButton) {
      addButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      addButton.click();
    } else {
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }

    if (modifications && modifications.length > 0) {
      modifications.forEach(function (mod) {
        var modEl = posItemEl.querySelector('[data-modifier="' + mod + '"]');
        if (!modEl) return;
        if (modEl.type === 'checkbox') modEl.checked = true;
        else modEl.value = mod;
        modEl.dispatchEvent(new Event('change', { bubbles: true }));
        modEl.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }

    var result = {
      success: true,
      selector: elementSelector,
      item_name: item_name,
      message: '[INJECTION SUCCESS] "' + item_name + '" added to cart via ' + elementSelector,
      timestamp: timestamp,
      order_id: orderId
    };

    console.log('[RevenuePulse]', result.message);
    _emit({ status: 'success', action: 'inject_order', data: result, timestamp: timestamp });
    document.dispatchEvent(new CustomEvent('revenuePulse:orderInjected', { detail: result, bubbles: true }));
    return result;
  }

  /* ─────────────────────────────────────────────
   * MODULE 3: CUSTOMER IDENTITY LOOKUP
   * Resolves phone number → saved profile or guest stub
   * ───────────────────────────────────────────── */
  function lookupCustomer(phone) {
    var normalized = phone.replace(/\\D/g, '').slice(-7);
    var timestamp = new Date().toISOString();

    // Check POS checkout DOM first
    var profileSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.savedProfile) || '#saved-profile';
    var savedEl = document.querySelector(profileSelector);
    if (savedEl) {
      var storedPhone = (savedEl.getAttribute('data-phone') || '').replace(/\\D/g, '').slice(-7);
      if (storedPhone && storedPhone === normalized) {
        var profile = {
          phone: normalized,
          name: savedEl.getAttribute('data-name') || 'Returning Customer',
          payment_token: savedEl.getAttribute('data-token') || null,
          last_order: [],
          loyalty_points: parseInt(savedEl.getAttribute('data-loyalty') || '0', 10),
          profile_exists: true,
          preferred_items: []
        };
        console.log('[RevenuePulse] DOM session matched for:', normalized);
        _emit({ status: 'success', action: 'lookup_customer', data: profile, timestamp: timestamp });
        return profile;
      }
    }

    // Inject phone into checkout form for frictionless ordering
    var phoneSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.checkoutPhone)
      || '#customer-phone, input[name="phone"], input[type="tel"]';
    var phoneInput = document.querySelector(phoneSelector);
    if (phoneInput) {
      try {
        var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (setter && setter.set) setter.set.call(phoneInput, phone);
        else phoneInput.value = phone;
      } catch (e) { phoneInput.value = phone; }
      phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
      phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    // Return guest stub (production: relay server queries actual customer DB)
    var guestProfile = {
      phone: normalized,
      name: 'Guest',
      payment_token: null,
      last_order: [],
      loyalty_points: 0,
      profile_exists: false,
      preferred_items: []
    };

    console.log('[RevenuePulse] No profile found for:', normalized, '— returning guest stub');
    _emit({ status: 'success', action: 'lookup_customer', data: guestProfile, timestamp: timestamp });
    return guestProfile;
  }

  /* ─────────────────────────────────────────────
   * MODULE 4: CART CONTROL
   * ───────────────────────────────────────────── */
  function clearCart() {
    var clearSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.cartClearButton) || '.cart-clear-btn';
    var clearBtn = document.querySelector(clearSelector);
    if (clearBtn) {
      clearBtn.click();
      console.log('[RevenuePulse] Cart cleared via', clearSelector);
      return true;
    }
    document.dispatchEvent(new CustomEvent('revenuePulse:clearCart', { bubbles: true }));
    return true;
  }

  function getCart() {
    var cartSelector = (_config && _config.pos_selector_map && _config.pos_selector_map.cart) || '#pos-cart';
    var cartItems = document.querySelectorAll(cartSelector + ' .cart-item');
    return Array.prototype.map.call(cartItems, function (el) {
      return {
        name: el.getAttribute('data-cart-item') || '',
        qty: el.getAttribute('data-qty') || '1'
      };
    });
  }

  /* ─────────────────────────────────────────────
   * AGENT BRIDGE — postMessage relay listener
   * External AI relay server communicates here
   * ───────────────────────────────────────────── */
  function _handlePostMessage(event) {
    if (!event.data || event.data.source !== 'revenuePulse-agent') return;
    var cmd = event.data.command;
    var response = _dispatch(cmd);
    if (event.source) event.source.postMessage({ source: 'revenuePulse-bridge', response: response }, '*');
  }

  function _handleCustomEvent(event) {
    _dispatch(event.detail);
  }

  function _dispatch(command) {
    if (!command || !command.action) return { status: 'error', action: '', error: 'No action specified', timestamp: new Date().toISOString() };
    switch (command.action) {
      case 'extract_menu':   return { status: 'success', action: 'extract_menu',   data: extractMenuSchema(command.payload && command.payload.selector), timestamp: new Date().toISOString() };
      case 'inject_order':   return { status: 'success', action: 'inject_order',   data: injectAIOrder(command.payload && command.payload.selector, command.payload && command.payload.modifications), timestamp: new Date().toISOString() };
      case 'lookup_customer':return { status: 'success', action: 'lookup_customer',data: lookupCustomer(command.payload && command.payload.phone), timestamp: new Date().toISOString() };
      case 'clear_cart':     return { status: 'success', action: 'clear_cart',     data: { cleared: clearCart() }, timestamp: new Date().toISOString() };
      case 'get_cart':       return { status: 'success', action: 'get_cart',       data: { items: getCart() }, timestamp: new Date().toISOString() };
      default:               return { status: 'error',   action: command.action,   error: 'Unknown command: ' + command.action, timestamp: new Date().toISOString() };
    }
  }

  function _emit(response) {
    _listeners.forEach(function (cb) { try { cb(response); } catch (e) {} });
    document.dispatchEvent(new CustomEvent('revenuePulse:response', { detail: response, bubbles: true }));
  }

  /* ─────────────────────────────────────────────
   * PUBLIC API — window.revenuePlus
   * ───────────────────────────────────────────── */
  var revenuePlus = {
    version: '1.0.0',
    init: function (config) {
      if (!config || !config.store_name || !config.store_id || !config.pos_selector_map) {
        throw new Error('[RevenuePulse] Invalid config. Required: store_name, store_id, pos_selector_map');
      }
      _config = config;
      try { sessionStorage.setItem('rp:config', JSON.stringify(config)); } catch (e) {}
      console.log('[RevenuePulse] Initialized for:', config.store_name, '(' + config.store_id + ')');
      document.dispatchEvent(new CustomEvent('revenuePulse:configLoaded', { detail: config, bubbles: true }));
    },
    extractMenu:    extractMenuSchema,
    injectOrder:    injectAIOrder,
    lookupCustomer: lookupCustomer,
    clearCart:      clearCart,
    getCart:        getCart,
    getSchema:      function () { return _schema; },
    getConfig:      function () { return _config; },
    onResponse:     function (cb) { _listeners.push(cb); },
  };

  /* ─── Register global hooks ─── */
  root.revenuePulse   = revenuePulse;
  root.injectAIOrder = injectAIOrder;

  /* ─── Start bridge listeners ─── */
  root.addEventListener('message', _handlePostMessage);
  root.addEventListener('revenuePulse:command', _handleCustomEvent);

  /* ─── Listen for config init event ─── */
  document.addEventListener('revenuePulse:configLoaded', function (e) {
    _config = e.detail;
    console.log('[RevenuePulse] Config received via event:', _config.store_name);
  });

  console.log('[RevenuePulse] ✓ revenue-pulse-agent.js loaded — V1.0');
  console.log('[RevenuePulse] Available: window.revenuePulse.init(config)');
  console.log('[RevenuePulse] Available: window.revenuePulse.extractMenu()');
  console.log('[RevenuePulse] Available: window.injectAIOrder(selector, mods)');
  console.log('[RevenuePulse] Available: window.revenuePulse.lookupCustomer(phone)');
  console.log('[RevenuePulse] Embedded schema: __SCHEMA_COUNT__ items');

  /* ─── Auto-init from sessionStorage if config exists ─── */
  try {
    var stored = sessionStorage.getItem('rp:config');
    if (stored && !_config) { _config = JSON.parse(stored); console.log('[RevenuePulse] Config restored from sessionStorage:', _config.store_name); }
  } catch (e) {}

}(window));
`;
