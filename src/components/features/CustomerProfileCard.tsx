import { User, CreditCard, Star, ShoppingBag, Zap, AlertCircle } from 'lucide-react';
import { CustomerProfile } from '@/types/pos';
import { cn } from '@/lib/utils';

interface CustomerProfileCardProps {
  profile: CustomerProfile;
}

export function CustomerProfileCard({ profile }: CustomerProfileCardProps) {
  if (!profile.profile_exists) {
    return (
      <div className="terminal-panel p-4">
        <div className="terminal-header mb-3">
          <span className="text-rp-muted text-[10px] font-mono">profile-result — guest</span>
        </div>
        <div className="flex items-center gap-2 text-rp-yellow mb-2">
          <AlertCircle size={14} />
          <span className="text-xs font-semibold">No Profile Found</span>
        </div>
        <div className="text-[11px] font-mono text-rp-muted">Phone: {profile.phone}</div>
        <div className="mt-3 p-2 rounded border border-rp-yellow/20 bg-rp-yellow/5">
          <div className="text-[10px] font-mono text-rp-yellow">AGENT RECOMMENDATION</div>
          <div className="text-[11px] font-mono text-rp-muted mt-1">Offer guest checkout → pay_at_counter flow.</div>
          <div className="text-[11px] font-mono text-rp-muted">No stored payment token available.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-panel">
      <div className="terminal-header">
        <span className="text-rp-muted text-[10px] font-mono">profile-result — {profile.phone}</span>
        <span className="ml-auto text-[9px] font-mono text-rp-green border border-rp-green/20 bg-rp-green/5 px-1.5 py-0.5 rounded">FOUND</span>
      </div>

      <div className="p-4 grid grid-cols-2 gap-4">
        {/* Identity */}
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-2">
            <User size={13} className="text-rp-cyan" />
            <span className="text-xs font-semibold text-rp-text">{profile.name}</span>
            <span className="text-[10px] font-mono text-rp-muted">#{profile.phone}</span>
          </div>
        </div>

        {/* Payment Token */}
        <div className="bg-rp-bg rounded border border-rp-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <CreditCard size={11} className="text-rp-cyan" />
            <span className="text-[10px] font-mono text-rp-muted">PAYMENT TOKEN</span>
          </div>
          {profile.payment_token ? (
            <>
              <div className="text-[11px] font-mono text-rp-text truncate">{profile.payment_token}</div>
              <div className="mt-1 text-[9px] font-mono text-rp-green">✓ One-click checkout enabled</div>
            </>
          ) : (
            <div className="text-[11px] font-mono text-rp-muted">No token</div>
          )}
        </div>

        {/* Loyalty */}
        <div className="bg-rp-bg rounded border border-rp-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Star size={11} className="text-rp-yellow" />
            <span className="text-[10px] font-mono text-rp-muted">LOYALTY PTS</span>
          </div>
          <div className="text-[18px] font-mono font-bold text-rp-yellow">{profile.loyalty_points}</div>
        </div>

        {/* Last Order */}
        <div className="col-span-2 bg-rp-bg rounded border border-rp-border p-2.5">
          <div className="flex items-center gap-1.5 mb-2">
            <ShoppingBag size={11} className="text-rp-cyan" />
            <span className="text-[10px] font-mono text-rp-muted">LAST ORDER</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {profile.last_order.map((item) => (
              <span key={item} className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-rp-border text-rp-muted">
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* One-Click Reorder Selectors */}
        {profile.preferred_items.length > 0 && (
          <div className="col-span-2 bg-rp-cyan/5 rounded border border-rp-cyan/20 p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap size={11} className="text-rp-cyan" />
              <span className="text-[10px] font-mono text-rp-cyan">AGENT INJECT SELECTORS</span>
            </div>
            <div className="space-y-1">
              {profile.preferred_items.map((sel) => (
                <div key={sel} className="text-[10px] font-mono text-rp-muted">
                  <span className="text-rp-yellow">window.injectAIOrder</span>
                  <span className="text-rp-text">(</span>
                  <span className="text-rp-green">&quot;{sel}&quot;</span>
                  <span className="text-rp-text">)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
