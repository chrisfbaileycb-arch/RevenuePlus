import { useLocation } from 'react-router-dom';
import { Terminal, RefreshCw } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';

const TITLES: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'System Dashboard', subtitle: 'Agent bridge health & session activity' },
  '/menu-extractor': { title: 'Menu Schema Extractor', subtitle: 'Parse POS DOM → structured JSON' },
  '/order-injector': { title: 'Order Injection Console', subtitle: 'Programmatic POS cart injection via AI agent' },
  '/customer-lookup': { title: 'Customer Identity Lookup', subtitle: 'Phone number → profile token resolution' },
};

export function Header() {
  const location = useLocation();
  const { isOnline, sessionId, newSession } = useAgentStore();
  const page = TITLES[location.pathname] || { title: 'Revenue Pulse', subtitle: '' };

  return (
    <header className="h-12 flex items-center justify-between px-5 border-b border-rp-border bg-rp-panel/80 backdrop-blur-sm sticky top-0 z-10">
      <div className="flex items-center gap-3">
        <Terminal size={14} className="text-rp-cyan" />
        <div>
          <span className="text-sm font-semibold text-rp-text">{page.title}</span>
          <span className="text-rp-muted text-xs ml-2 hidden sm:inline">{page.subtitle}</span>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden md:flex items-center gap-1.5 font-mono text-[10px] text-rp-muted">
          <span>SESSION:</span>
          <span className="text-rp-cyan">{sessionId}</span>
        </div>
        <div className={cn(
          'flex items-center gap-1.5 text-[10px] font-mono px-2 py-1 rounded border',
          isOnline
            ? 'text-rp-green border-rp-green/20 bg-rp-green/5'
            : 'text-rp-red border-rp-red/20 bg-rp-red/5'
        )}>
          <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-rp-green animate-pulse-slow' : 'bg-rp-red')} />
          {isOnline ? 'BRIDGE ONLINE' : 'BRIDGE OFFLINE'}
        </div>
        <button
          onClick={newSession}
          title="New Session"
          className="p-1.5 rounded hover:bg-rp-surface text-rp-muted hover:text-rp-text transition-colors"
        >
          <RefreshCw size={12} />
        </button>
      </div>
    </header>
  );
}
