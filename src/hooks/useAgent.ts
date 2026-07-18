import { useCallback } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { extractMenuSchema } from '@/lib/menuExtractor';
import { injectAIOrder, clearPOSCart } from '@/lib/orderInjector';
import { lookupCustomer } from '@/lib/customerLookup';
import { formatTimestamp } from '@/lib/utils';

export function useAgent() {
  const store = useAgentStore();

  const runExtractMenu = useCallback(() => {
    const ts = new Date().toISOString();
    store.addCommandLog({
      input: 'extract_menu #pos-simulator',
      output: 'Scanning POS DOM...',
      type: 'info',
      timestamp: ts,
    });

    const items = extractMenuSchema('#pos-simulator');
    store.setMenuSchema(items);

    store.addCommandLog({
      input: '',
      output: `✓ Extracted ${items.length} items across ${new Set(items.map((i) => i.category)).size} categories`,
      type: 'success',
      timestamp: new Date().toISOString(),
    });

    return items;
  }, [store]);

  const runInjectOrder = useCallback(
    (selector: string, modifications?: string[]) => {
      const ts = new Date().toISOString();
      store.addCommandLog({
        input: `inject_order ${selector}${modifications ? ' --mods ' + modifications.join(',') : ''}`,
        output: `Injecting order via selector: ${selector}`,
        type: 'info',
        timestamp: ts,
      });

      const result = injectAIOrder(selector, modifications);
      store.addOrderResult(result);

      if (result.success) {
        store.addToCart({
          item_name: result.item_name,
          item_price: 0,
          quantity: 1,
          selector,
        });
        store.addCommandLog({
          input: '',
          output: `✓ ${result.message}  [order_id: ${result.order_id}]`,
          type: 'success',
          timestamp: new Date().toISOString(),
        });
      } else {
        store.addCommandLog({
          input: '',
          output: `✗ ${result.message}`,
          type: 'error',
          timestamp: new Date().toISOString(),
        });
      }

      return result;
    },
    [store]
  );

  const runLookupCustomer = useCallback(
    (phone: string) => {
      const ts = new Date().toISOString();
      store.addCommandLog({
        input: `lookup_customer ${phone}`,
        output: `Querying POS DOM and profile DB for phone: ${phone}`,
        type: 'info',
        timestamp: ts,
      });

      const profile = lookupCustomer(phone);
      store.setCustomerProfile(profile);
      store.incrementLookups();

      const status = profile.profile_exists
        ? `✓ Profile found: ${profile.name} | token: ${profile.payment_token || 'none'} | pts: ${profile.loyalty_points}`
        : `⚠ No profile found for ${phone} — guest session`;

      store.addCommandLog({
        input: '',
        output: status,
        type: profile.profile_exists ? 'success' : 'info',
        timestamp: new Date().toISOString(),
      });

      return profile;
    },
    [store]
  );

  const runClearCart = useCallback(() => {
    clearPOSCart();
    store.clearCart();
    store.addCommandLog({
      input: 'clear_cart',
      output: '✓ POS cart cleared',
      type: 'success',
      timestamp: new Date().toISOString(),
    });
  }, [store]);

  return {
    ...store,
    runExtractMenu,
    runInjectOrder,
    runLookupCustomer,
    runClearCart,
    formatTimestamp,
  };
}
