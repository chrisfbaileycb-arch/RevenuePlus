import { AgentCommand, AgentResponse } from '@/types/pos';
import { extractMenuSchema } from './menuExtractor';
import { injectAIOrder, clearPOSCart, initGlobalInjector } from './orderInjector';
import { lookupCustomer } from './customerLookup';
import { initFromConfig, getActiveConfig, RestaurantConfig } from './onboardingConfig';

type BridgeEventCallback = (response: AgentResponse) => void;

const listeners: BridgeEventCallback[] = [];

/**
 * Revenue Pulse Agent Bridge
 * Central dispatch layer between the AI voice agent and the POS DOM.
 * Supports: postMessage, direct JS calls via window.revenuePulse, and custom events.
 */
export function initAgentBridge(): void {
  // 1. Register global injector hook (window.injectAIOrder)
  initGlobalInjector();

  // 2. Expose the full revenuePulse API on window
  (window as any).revenuePulse = {
    /**
     * Initialize from a restaurant JSON config.
     * This is the onboarding entry point — call once when the POS page loads.
     */
    init: (config: RestaurantConfig) => {
      initFromConfig(config);
      const response = buildResponse('init', { store_name: config.store_name, store_id: config.store_id });
      emit(response);
      return response;
    },
    getConfig: () => getActiveConfig(),
    extractMenu: (selector?: string) => {
      const items = extractMenuSchema(selector);
      const response = buildResponse('extract_menu', items);
      emit(response);
      return response;
    },
    injectOrder: (selector: string, modifications?: string[]) => {
      const result = injectAIOrder(selector, modifications);
      const response = buildResponse('inject_order', result);
      emit(response);
      return response;
    },
    lookupCustomer: (phone: string) => {
      const profile = lookupCustomer(phone);
      const response = buildResponse('lookup_customer', profile);
      emit(response);
      return response;
    },
    clearCart: () => {
      const result = clearPOSCart();
      const response = buildResponse('clear_cart', { cleared: result });
      emit(response);
      return response;
    },
    onResponse: (cb: BridgeEventCallback) => {
      listeners.push(cb);
    },
  };

  // 3. Listen for postMessage from external AI agent relay (Vapi, Bland, Retell webhook)
  window.addEventListener('message', handlePostMessage);

  // 4. Listen for custom DOM events (useful for iframe relay)
  window.addEventListener('revenuePulse:command', handleCustomEvent as EventListener);

  console.log('[AgentBridge] ✓ Revenue Pulse Agent Bridge online.');
  console.log('[AgentBridge] Available: window.revenuePulse.extractMenu()');
  console.log('[AgentBridge] Available: window.revenuePulse.injectOrder(selector, mods)');
  console.log('[AgentBridge] Available: window.revenuePulse.lookupCustomer(phone)');
  console.log('[AgentBridge] Available: window.revenuePulse.clearCart()');
}

function handlePostMessage(event: MessageEvent): void {
  // In production: validate event.origin against your AI agent domain
  if (!event.data || event.data.source !== 'revenuePulse-agent') return;

  const command: AgentCommand = event.data.command;
  const response = dispatchCommand(command);

  // Reply back to the sender
  if (event.source) {
    (event.source as Window).postMessage({ source: 'revenuePulse-bridge', response }, '*');
  }
}

function handleCustomEvent(event: CustomEvent): void {
  const command: AgentCommand = event.detail;
  dispatchCommand(command);
}

export function dispatchCommand(command: AgentCommand): AgentResponse {
  console.log('[AgentBridge] Received command:', command.action, command.payload);

  switch (command.action) {
    case 'extract_menu': {
      const items = extractMenuSchema((command.payload?.selector as string) || '#pos-simulator');
      return buildResponse('extract_menu', items);
    }
    case 'inject_order': {
      const { selector, modifications } = (command.payload || {}) as {
        selector: string;
        modifications?: string[];
      };
      const result = injectAIOrder(selector, modifications);
      return buildResponse('inject_order', result);
    }
    case 'lookup_customer': {
      const { phone } = (command.payload || {}) as { phone: string };
      const profile = lookupCustomer(phone);
      return buildResponse('lookup_customer', profile);
    }
    case 'clear_cart': {
      const cleared = clearPOSCart();
      return buildResponse('clear_cart', { cleared });
    }
    case 'get_cart': {
      const cartItems = document.querySelectorAll('#pos-cart .cart-item');
      const items = Array.from(cartItems).map((el) => ({
        name: el.getAttribute('data-cart-item') || '',
        qty: el.getAttribute('data-qty') || '1',
      }));
      return buildResponse('get_cart', { items });
    }
    default: {
      return {
        status: 'error',
        action: command.action,
        error: `Unknown command: ${command.action}`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}

function buildResponse(action: string, data: unknown): AgentResponse {
  return {
    status: 'success',
    action,
    data,
    timestamp: new Date().toISOString(),
  };
}

function emit(response: AgentResponse): void {
  listeners.forEach((cb) => cb(response));
  document.dispatchEvent(new CustomEvent('revenuePulse:response', { detail: response }));
}

export function destroyAgentBridge(): void {
  window.removeEventListener('message', handlePostMessage);
  window.removeEventListener('revenuePulse:command', handleCustomEvent as EventListener);
  delete (window as any).revenuePulse;
  delete (window as any).injectAIOrder;
  console.log('[AgentBridge] Bridge destroyed.');
}
