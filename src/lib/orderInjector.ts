import { InjectionResult } from '@/types/pos';

/**
 * Programmatic Order Injection Hook
 * Fires DOM events directly on the underlying POS interface.
 * Called by AI agent with a CSS selector and optional modifications.
 */
export function injectAIOrder(
  elementSelector: string,
  modifications?: string[]
): InjectionResult {
  const timestamp = new Date().toISOString();
  const orderId = `ord-${Date.now().toString(36).toUpperCase()}`;

  const target = document.querySelector(elementSelector);

  if (!target) {
    const result: InjectionResult = {
      success: false,
      selector: elementSelector,
      item_name: 'UNKNOWN',
      message: `[INJECTION FAILED] Element not found in DOM: "${elementSelector}"`,
      timestamp,
      order_id: orderId,
    };
    console.error(result.message);
    return result;
  }

  // Resolve the item name from the element or its closest pos-item ancestor
  const posItemEl =
    (target.closest('[data-item-id]') as HTMLElement) || (target as HTMLElement);
  const item_name =
    posItemEl.getAttribute('data-item-name') ||
    posItemEl.querySelector('.item-name')?.textContent?.trim() ||
    elementSelector;

  // Locate the add-to-cart trigger within the target
  const addButton: HTMLButtonElement | null =
    (posItemEl.querySelector('.add-to-cart') as HTMLButtonElement) ||
    (posItemEl.querySelector('button') as HTMLButtonElement) ||
    (target.tagName === 'BUTTON' ? (target as HTMLButtonElement) : null);

  if (addButton) {
    // Programmatic click — no human input required
    addButton.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    addButton.click();
    console.log(`[OrderInjector] Fired add-to-cart for: "${item_name}" via ${elementSelector}`);
  } else {
    // Fallback: fire click on the element itself
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    console.warn(`[OrderInjector] No add-to-cart button found. Fired click on selector directly.`);
  }

  // Apply modifications to modifier inputs if provided
  if (modifications && modifications.length > 0) {
    applyModifications(posItemEl, modifications);
  }

  const result: InjectionResult = {
    success: true,
    selector: elementSelector,
    item_name,
    message: `[INJECTION SUCCESS] "${item_name}" added to POS cart via ${elementSelector}`,
    timestamp,
    order_id: orderId,
  };

  console.log(result.message);
  return result;
}

function applyModifications(element: HTMLElement, modifications: string[]): void {
  modifications.forEach((mod) => {
    const modEl = element.querySelector(`[data-modifier="${mod}"]`) as HTMLInputElement | null;
    if (!modEl) return;

    if (modEl.type === 'checkbox') {
      modEl.checked = true;
    } else if (modEl.tagName === 'SELECT') {
      modEl.value = mod;
    } else if (modEl.tagName === 'INPUT') {
      modEl.value = mod;
    }

    modEl.dispatchEvent(new Event('change', { bubbles: true }));
    modEl.dispatchEvent(new Event('input', { bubbles: true }));
    console.log(`[OrderInjector] Applied modifier: "${mod}"`);
  });
}

/**
 * Clear the POS cart programmatically.
 */
export function clearPOSCart(containerSelector: string = '#pos-simulator'): boolean {
  const clearBtn = document.querySelector(`${containerSelector} .cart-clear-btn`) as HTMLButtonElement | null;
  if (clearBtn) {
    clearBtn.click();
    console.log('[OrderInjector] Cart cleared via .cart-clear-btn');
    return true;
  }
  // Emit a custom event that the POS component can listen for
  document.dispatchEvent(new CustomEvent('revenuePulse:clearCart', { bubbles: true }));
  console.log('[OrderInjector] Cart clear event dispatched');
  return true;
}

/**
 * Initialize the global window.injectAIOrder hook.
 * This is what the AI phone agent calls after receiving the order intent.
 */
export function initGlobalInjector(): void {
  (window as any).injectAIOrder = injectAIOrder;
  (window as any).clearPOSCart = clearPOSCart;
  console.log('[RevenuePulse] ✓ window.injectAIOrder() is ready for AI agent calls.');
}
