import { create } from 'zustand';
import { MenuItem, CartItem, CustomerProfile, InjectionResult, CommandLogEntry, AgentStats } from '@/types/pos';
import { generateSessionId } from '@/lib/utils';

interface AgentStore {
  // State
  isOnline: boolean;
  sessionId: string;
  menuSchema: MenuItem[];
  cart: CartItem[];
  customerProfile: CustomerProfile | null;
  orderLog: InjectionResult[];
  commandLog: CommandLogEntry[];
  stats: AgentStats;
  menuChangeBadge: number;  // count of unseen menu changes

  // Actions
  setOnline: (online: boolean) => void;
  setMenuChangeBadge: (count: number) => void;
  clearMenuChangeBadge: () => void;
  setMenuSchema: (items: MenuItem[]) => void;
  addToCart: (item: CartItem) => void;
  removeFromCart: (selector: string) => void;
  clearCart: () => void;
  setCustomerProfile: (profile: CustomerProfile | null) => void;
  addOrderResult: (result: InjectionResult) => void;
  addCommandLog: (entry: Omit<CommandLogEntry, 'id'>) => void;
  clearCommandLog: () => void;
  incrementLookups: () => void;
  newSession: () => void;
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  isOnline: false,
  sessionId: generateSessionId(),
  menuChangeBadge: 0,
  menuSchema: [],
  cart: [],
  customerProfile: null,
  orderLog: [],
  commandLog: [
    {
      id: 'sys-0',
      input: '',
      output: 'Revenue Pulse Agent Bridge v1.0 — Initializing...',
      type: 'system',
      timestamp: new Date().toISOString(),
    },
  ],
  stats: {
    menuItemsExtracted: 0,
    ordersInjected: 0,
    customerLookups: 0,
    sessionStart: new Date().toISOString(),
  },

  setOnline: (online) => set({ isOnline: online }),
  setMenuChangeBadge: (count) => set({ menuChangeBadge: count }),
  clearMenuChangeBadge: () => set({ menuChangeBadge: 0 }),

  setMenuSchema: (items) =>
    set((state) => ({
      menuSchema: items,
      stats: { ...state.stats, menuItemsExtracted: items.length },
    })),

  addToCart: (item) =>
    set((state) => {
      const existing = state.cart.find((c) => c.selector === item.selector);
      if (existing) {
        return {
          cart: state.cart.map((c) =>
            c.selector === item.selector ? { ...c, quantity: c.quantity + 1 } : c
          ),
        };
      }
      return { cart: [...state.cart, item] };
    }),

  removeFromCart: (selector) =>
    set((state) => ({ cart: state.cart.filter((c) => c.selector !== selector) })),

  clearCart: () => set({ cart: [] }),

  setCustomerProfile: (profile) => set({ customerProfile: profile }),

  addOrderResult: (result) =>
    set((state) => ({
      orderLog: [result, ...state.orderLog].slice(0, 50),
      stats: { ...state.stats, ordersInjected: state.stats.ordersInjected + 1 },
    })),

  addCommandLog: (entry) =>
    set((state) => ({
      commandLog: [
        ...state.commandLog,
        { ...entry, id: `cmd-${Date.now()}` },
      ].slice(-100),
    })),

  clearCommandLog: () =>
    set({
      commandLog: [
        {
          id: 'sys-clear',
          input: '',
          output: 'Console cleared.',
          type: 'system',
          timestamp: new Date().toISOString(),
        },
      ],
    }),

  incrementLookups: () =>
    set((state) => ({
      stats: { ...state.stats, customerLookups: state.stats.customerLookups + 1 },
    })),

  newSession: () =>
    set({
      sessionId: generateSessionId(),
      menuSchema: [],
      cart: [],
      customerProfile: null,
      orderLog: [],
      stats: {
        menuItemsExtracted: 0,
        ordersInjected: 0,
        customerLookups: 0,
        sessionStart: new Date().toISOString(),
      },
    }),
}));
