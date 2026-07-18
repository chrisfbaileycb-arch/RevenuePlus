import { CustomerProfile } from '@/types/pos';
import { MOCK_CUSTOMERS } from '@/constants/mockData';

/**
 * Customer Identity Lookup
 * Maps customer data access points within the wrapped POS checkout DOM.
 * Accepts a phone number, returns a profile or guest session stub.
 */
export function lookupCustomer(phone: string): CustomerProfile {
  const normalized = normalizePhone(phone);

  // Step 1: Check the live POS checkout DOM for an existing session or stored token
  const domProfile = inspectCheckoutDOM(normalized);
  if (domProfile) {
    console.log(`[CustomerLookup] Found DOM session profile for: ${normalized}`);
    return domProfile;
  }

  // Step 2: Query the mock customer database (replace with real DB call in production)
  const mockProfile = MOCK_CUSTOMERS.find(
    (c) => normalizePhone(c.phone) === normalized
  );

  if (mockProfile) {
    // Inject the phone into the POS checkout DOM for frictionless reorder
    injectPhoneIntoDom(normalized);
    console.log(`[CustomerLookup] Found saved profile for: ${normalized} — token: ${mockProfile.payment_token}`);
    return mockProfile;
  }

  // Step 3: Return a guest stub — customer can pay at counter
  const guestProfile: CustomerProfile = {
    phone: normalized,
    name: 'Guest',
    payment_token: null,
    last_order: [],
    loyalty_points: 0,
    profile_exists: false,
    preferred_items: [],
  };

  console.log(`[CustomerLookup] No profile found for: ${normalized} — returning guest stub`);
  return guestProfile;
}

/**
 * Inspect the POS checkout DOM for an active session or stored profile variables.
 */
function inspectCheckoutDOM(phone: string): CustomerProfile | null {
  const phoneInput = document.querySelector<HTMLInputElement>('#customer-phone');
  const savedProfileEl = document.querySelector<HTMLElement>('#saved-profile');

  if (!savedProfileEl) return null;

  const storedPhone = savedProfileEl.getAttribute('data-phone') || '';
  const storedToken = savedProfileEl.getAttribute('data-token') || '';
  const storedName = savedProfileEl.getAttribute('data-name') || '';

  if (storedPhone && normalizePhone(storedPhone) === phone) {
    console.log('[CustomerLookup] Matched active DOM session for phone:', phone);
    return {
      phone,
      name: storedName || 'Returning Customer',
      payment_token: storedToken || null,
      last_order: [],
      loyalty_points: 0,
      profile_exists: true,
      preferred_items: [],
    };
  }

  // No active DOM session
  if (phoneInput) {
    console.log('[CustomerLookup] #customer-phone field found — no active session');
  }

  return null;
}

/**
 * Programmatically inject a phone number into the POS checkout form.
 * Enables frictionless "pay at counter" or "one-click reorder" path.
 */
export function injectPhoneIntoDom(phone: string): void {
  const phoneInput = document.querySelector<HTMLInputElement>(
    '#customer-phone, input[name="phone"], input[type="tel"]'
  );

  if (phoneInput) {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(phoneInput, phone);
    } else {
      phoneInput.value = phone;
    }

    phoneInput.dispatchEvent(new Event('input', { bubbles: true }));
    phoneInput.dispatchEvent(new Event('change', { bubbles: true }));
    console.log(`[CustomerLookup] Injected phone ${phone} into checkout DOM`);
  }
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(-7);
}
