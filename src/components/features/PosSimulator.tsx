import { useState, useEffect } from 'react';
import { ShoppingCart, Plus, Minus, X } from 'lucide-react';
import { MOCK_MENU, CATEGORIES, MockMenuItem } from '@/constants/mockData';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';

interface CartEntry { item: MockMenuItem; qty: number; }

interface PosSimulatorProps {
  compact?: boolean;
  onCartChange?: (cart: CartEntry[]) => void;
}

export function PosSimulator({ compact = false, onCartChange }: PosSimulatorProps) {
  const [activeCategory, setActiveCategory] = useState('All');
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [showCart, setShowCart] = useState(false);
  const { addToCart, clearCart: storeClearCart } = useAgentStore();

  const filtered = MOCK_MENU.filter(
    (item) => activeCategory === 'All' || item.category === activeCategory
  );

  const addItem = (item: MockMenuItem) => {
    setCart((prev) => {
      const exists = prev.find((c) => c.item.id === item.id);
      if (exists) return prev.map((c) => c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { item, qty: 1 }];
    });
    addToCart({ item_name: item.name, item_price: item.price, quantity: 1, selector: `#pos-item-${item.id.split('-')[1]}` });
  };

  const removeItem = (id: string) => setCart((prev) => prev.filter((c) => c.item.id !== id));
  const total = cart.reduce((sum, c) => sum + c.item.price * c.qty, 0);

  useEffect(() => {
    onCartChange?.(cart);
  }, [cart, onCartChange]);

  // Listen for programmatic clear from injector
  useEffect(() => {
    const handler = () => { setCart([]); storeClearCart(); };
    document.addEventListener('revenuePulse:clearCart', handler);
    return () => document.removeEventListener('revenuePulse:clearCart', handler);
  }, [storeClearCart]);

  return (
    <div id="pos-simulator" className={cn('bg-rp-bg border border-rp-border rounded-lg overflow-hidden flex flex-col', compact ? 'h-[420px]' : 'h-[580px]')}>
      {/* POS Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-rp-surface border-b border-rp-border">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rp-green" />
          <span className="font-mono text-[10px] text-rp-muted">DEMO POS INTERFACE — DOM ACCESSIBLE</span>
        </div>
        <button onClick={() => setShowCart(!showCart)} className={cn('flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border transition-colors', cart.length > 0 ? 'border-rp-cyan/30 text-rp-cyan bg-rp-cyan/5' : 'border-rp-border text-rp-muted')}>
          <ShoppingCart size={10} />
          <span>{cart.length} items</span>
          {cart.length > 0 && <span className="text-rp-green">${total.toFixed(2)}</span>}
        </button>
      </div>

      {/* Cart overlay */}
      {showCart && (
        <div id="pos-cart" className="absolute z-20 right-4 top-24 w-64 bg-rp-panel border border-rp-border rounded-lg shadow-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-rp-text">POS Cart</span>
            <button onClick={() => setShowCart(false)} className="text-rp-muted hover:text-rp-text"><X size={12} /></button>
          </div>
          {cart.length === 0 ? (
            <div className="text-rp-muted text-xs text-center py-4">Cart is empty</div>
          ) : (
            <>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {cart.map(({ item, qty }) => (
                  <div key={item.id} className="cart-item flex items-center justify-between text-xs" data-cart-item={item.name} data-qty={qty}>
                    <span className="text-rp-text truncate flex-1">{item.name}</span>
                    <span className="text-rp-muted mx-2">x{qty}</span>
                    <span className="text-rp-cyan">${(item.price * qty).toFixed(2)}</span>
                    <button onClick={() => removeItem(item.id)} className="ml-2 text-rp-muted hover:text-rp-red"><X size={10} /></button>
                  </div>
                ))}
              </div>
              <div className="cart-total border-t border-rp-border mt-2 pt-2 flex justify-between text-xs font-semibold">
                <span className="text-rp-muted">Total</span>
                <span className="text-rp-green">${total.toFixed(2)}</span>
              </div>
              <button onClick={() => { setCart([]); storeClearCart(); }} className="cart-clear-btn w-full mt-2 text-[10px] font-mono text-rp-muted hover:text-rp-red border border-rp-border hover:border-rp-red/30 rounded px-2 py-1 transition-colors">Clear Cart</button>
            </>
          )}
          {/* Hidden checkout DOM for customerLookup */}
          <div id="pos-checkout" className="hidden">
            <input id="customer-phone" name="phone" type="tel" placeholder="Phone" />
            <input id="customer-name" name="name" type="text" placeholder="Name" />
            <div id="saved-profile" data-phone="" data-token="" data-name="" data-loyalty="0" />
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-1 px-3 py-2 bg-rp-panel border-b border-rp-border overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            data-category={cat}
            className={cn(
              'px-2.5 py-1 rounded text-[10px] font-mono whitespace-nowrap transition-colors flex-shrink-0',
              activeCategory === cat ? 'bg-rp-cyan/10 text-rp-cyan border border-rp-cyan/30' : 'text-rp-muted hover:text-rp-text border border-transparent hover:border-rp-border'
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Menu grid */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className={cn('grid gap-2', compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
          {filtered.map((item) => (
            <div
              key={item.id}
              id={`pos-item-${item.id.split('-')[1]}`}
              data-item-id={item.id}
              data-item-name={item.name}
              data-item-price={item.price}
              data-category={item.category}
              className={cn(
                'pos-item border rounded p-2.5 flex flex-col gap-1.5 transition-all',
                item.available
                  ? 'border-rp-border bg-rp-surface hover:border-rp-cyan/30 hover:bg-rp-cyan/5'
                  : 'pos-item--unavailable border-rp-border/30 bg-rp-bg opacity-40 cursor-not-allowed',
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <span className="item-name text-[11px] font-medium text-rp-text leading-tight">{item.name}</span>
                {!item.available && <span className="text-[9px] font-mono text-rp-red border border-rp-red/30 px-1 rounded flex-shrink-0">86'd</span>}
              </div>
              <div className="item-price text-[11px] font-mono text-rp-cyan">${item.price.toFixed(2)}</div>
              <div className="text-[9px] text-rp-muted font-mono truncate">{item.modifiers.slice(0, 2).join(' · ')}</div>
              {/* Modifier data nodes for extraction */}
              <div className="hidden">
                {item.modifiers.map((m) => (
                  <input key={m} type="checkbox" data-modifier={m} />
                ))}
              </div>
              {item.available && (
                <button
                  className="add-to-cart mt-1 flex items-center justify-center gap-1 w-full py-1 rounded border border-rp-border hover:border-rp-cyan/40 hover:bg-rp-cyan/5 text-[10px] font-mono text-rp-muted hover:text-rp-cyan transition-all"
                  onClick={() => addItem(item)}
                  data-item-id={item.id}
                >
                  <Plus size={9} />
                  Add
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
