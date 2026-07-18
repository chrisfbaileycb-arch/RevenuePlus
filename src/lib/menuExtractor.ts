import { MenuItem } from '@/types/pos';

/**
 * Menu Schema Extractor
 * Parses the POS DOM tree and returns a structured JSON array of all menu items.
 * Works on any POS system DOM — just point it at the container selector.
 */
export function extractMenuSchema(containerSelector: string = '#pos-simulator'): MenuItem[] {
  const container = document.querySelector(containerSelector);

  if (!container) {
    console.error(`[MenuExtractor] Container not found: "${containerSelector}"`);
    return [];
  }

  const items: MenuItem[] = [];
  const posItems = container.querySelectorAll('[data-item-id]');

  posItems.forEach((el) => {
    const element = el as HTMLElement;

    const itemId = element.getAttribute('data-item-id') || '';
    const itemName =
      element.getAttribute('data-item-name') ||
      element.querySelector('.item-name')?.textContent?.trim() ||
      '';
    const itemPrice = parseFloat(element.getAttribute('data-item-price') || '0');
    const category =
      element.closest('[data-category]')?.getAttribute('data-category') || 'Uncategorized';
    const isUnavailable =
      element.classList.contains('pos-item--unavailable') ||
      element.hasAttribute('data-unavailable');

    // Build the most reliable, unique CSS selector for this element
    const selector = element.id
      ? `#${element.id}`
      : itemId
      ? `[data-item-id="${itemId}"]`
      : buildFallbackSelector(element);

    // Extract modifier options from nested DOM nodes
    const modifiers = extractModifiers(element);

    if (itemName && itemPrice > 0) {
      items.push({
        item_name: itemName,
        item_price: itemPrice,
        category,
        pos_element_selector: selector,
        modifiers,
        available: !isUnavailable,
      });
    }
  });

  console.log(`[MenuExtractor] Extracted ${items.length} items from "${containerSelector}"`);
  return items;
}

function extractModifiers(el: HTMLElement): string[] {
  const modifierEls = el.querySelectorAll('[data-modifier]');
  return Array.from(modifierEls)
    .map((m) => m.getAttribute('data-modifier') || '')
    .filter(Boolean);
}

function buildFallbackSelector(el: HTMLElement): string {
  // Walk up the DOM to build a path selector
  const parts: string[] = [];
  let current: Element | null = el;
  while (current && current !== document.body) {
    const tag = current.tagName.toLowerCase();
    const cls = Array.from(current.classList)
      .filter((c) => !c.includes('hover') && !c.includes('active'))
      .slice(0, 2)
      .join('.');
    parts.unshift(cls ? `${tag}.${cls}` : tag);
    current = current.parentElement;
    if (parts.length > 4) break;
  }
  return parts.join(' > ');
}

/**
 * Produces a formatted JSON string of the extracted menu schema.
 */
export function getMenuSchemaJSON(containerSelector?: string): string {
  const schema = extractMenuSchema(containerSelector);
  return JSON.stringify(schema, null, 2);
}
