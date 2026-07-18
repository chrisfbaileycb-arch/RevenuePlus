import { useState } from 'react';
import { Phone, Search, UserSearch } from 'lucide-react';
import { CustomerProfileCard } from '@/components/features/CustomerProfileCard';
import { useAgent } from '@/hooks/useAgent';
import { MOCK_CUSTOMERS } from '@/constants/mockData';
import { cn } from '@/lib/utils';

export default function CustomerLookup() {
  const [phone, setPhone] = useState('');
  const [isLooking, setIsLooking] = useState(false);
  const { customerProfile, runLookupCustomer, stats } = useAgent();

  const lookup = (targetPhone: string) => {
    if (!targetPhone.trim()) return;
    setIsLooking(true);
    setTimeout(() => {
      runLookupCustomer(targetPhone);
      setIsLooking(false);
    }, 400);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    lookup(phone);
  };

  const demoProfiles = MOCK_CUSTOMERS.map((c) => ({
    phone: c.phone,
    label: `${c.name} — ${c.phone}`,
    hasToken: !!c.payment_token,
  }));

  return (
    <div className="p-5 space-y-4 max-w-3xl">
      <div>
        <h2 className="text-sm font-semibold text-rp-text">Module 3 — Customer Identity Lookup</h2>
        <p className="text-[11px] text-rp-muted font-mono mt-0.5">
          Maps phone number → POS DOM checkout fields + saved profile + payment token
        </p>
      </div>

      {/* How it works */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <span className="text-rp-muted text-[10px] font-mono">lookup-flow — 3 steps</span>
        </div>
        <div className="p-3 space-y-2">
          {[
            { step: '01', label: 'Inspect POS Checkout DOM', desc: 'Checks #saved-profile[data-phone], #customer-phone for active session', color: 'text-rp-cyan' },
            { step: '02', label: 'Query Profile Database', desc: 'Looks up phone in stored profile DB for payment token + loyalty pts', color: 'text-rp-purple' },
            { step: '03', label: 'Inject Phone + Return Profile', desc: 'Calls injectPhoneIntoDom() on checkout form, returns profile JSON to AI agent', color: 'text-rp-green' },
          ].map(({ step, label, desc, color }) => (
            <div key={step} className="flex items-start gap-3">
              <span className={cn('font-mono text-xs font-bold flex-shrink-0', color)}>{step}</span>
              <div>
                <div className="text-[11px] font-semibold text-rp-text">{label}</div>
                <div className="text-[10px] font-mono text-rp-muted">{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative flex-1">
          <Phone size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-rp-muted" />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter phone number (e.g. 5550101)"
            className="w-full bg-rp-panel border border-rp-border rounded px-3 py-2 pl-8 font-mono text-xs text-rp-text placeholder:text-rp-muted/50 focus:outline-none focus:border-rp-cyan/50"
            type="tel"
          />
        </div>
        <button
          type="submit"
          disabled={!phone.trim() || isLooking}
          className="flex items-center gap-2 px-4 py-2 rounded border border-rp-cyan/40 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLooking ? (
            <span className="animate-pulse">Querying...</span>
          ) : (
            <>
              <Search size={11} />
              Lookup
            </>
          )}
        </button>
      </form>

      {/* Demo quick-lookup */}
      <div>
        <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-2">
          Demo Profiles — click to test:
        </div>
        <div className="flex flex-wrap gap-2">
          {demoProfiles.map(({ phone: p, label, hasToken }) => (
            <button
              key={p}
              onClick={() => { setPhone(p); lookup(p); }}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-mono transition-all',
                hasToken
                  ? 'border-rp-green/30 text-rp-green bg-rp-green/5 hover:bg-rp-green/10'
                  : 'border-rp-border text-rp-muted bg-rp-surface hover:border-rp-border/80'
              )}
            >
              <UserSearch size={9} />
              {label}
              {hasToken && <span className="text-[8px] border border-rp-green/30 px-1 rounded">TOKEN</span>}
            </button>
          ))}
          <button
            onClick={() => { setPhone('9999999'); lookup('9999999'); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rp-red/20 text-rp-red/60 bg-rp-red/5 text-[10px] font-mono hover:border-rp-red/40 transition-all"
          >
            <UserSearch size={9} />
            Unknown: 9999999 (guest test)
          </button>
        </div>
      </div>

      {/* Result */}
      {customerProfile && (
        <div className="animate-slide-in">
          <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-2">
            Lookup Result — {stats.customerLookups} queries this session
          </div>
          <CustomerProfileCard profile={customerProfile} />
        </div>
      )}
    </div>
  );
}
