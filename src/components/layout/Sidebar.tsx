import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Zap, UserSearch, ChevronRight, Radio, Wifi, Map } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';
import { useShallow } from 'zustand/react/shallow';

const NAV = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'System overview' },
  { path: '/menu-extractor', label: 'Menu Extractor', icon: ScanLine, desc: 'DOM → JSON schema' },
  { path: '/order-injector', label: 'Order Injector', icon: Zap, desc: 'AI order injection' },
  { path: '/customer-lookup', label: 'Customer Lookup', icon: UserSearch, desc: 'Phone → profile' },
  { path: '/webhook-relay', label: 'Webhook Relay', icon: Radio, desc: 'Vapi / Bland bridge' },
  { path: '/websocket', label: 'WebSocket', icon: Wifi, desc: 'Live relay connection' },
  { path: '/selector-mapper', label: 'Selector Mapper', icon: Map, desc: 'HTML → selector map' },
];

export function Sidebar() {
  const { isOnline, sessionId, stats, menuChangeBadge } = useAgentStore(
    useShallow((s) => ({
      isOnline: s.isOnline,
      sessionId: s.sessionId,
      stats: s.stats,
      menuChangeBadge: s.menuChangeBadge,
    }))
  );
  const location = useLocation();

  return (
    <aside className="w-56 flex-shrink-0 bg-rp-panel border-r border-rp-border flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-4 pt-5 pb-4 border-b border-rp-border">
        <div className="flex items-center gap-2.5 mb-1">
          <div className="w-7 h-7 rounded bg-rp-cyan/10 border border-rp-cyan/30 flex items-center justify-center">
            <span className="text-rp-cyan font-mono text-xs font-bold">R+</span>
          </div>
          <div>
            <div className="font-semibold text-rp-text text-sm leading-none">Revenue Pulse</div>
            <div className="text-rp-muted text-[10px] font-mono mt-0.5">Agent Bridge v1.0</div>
          </div>
        </div>
      </div>

      {/* Status */}
      <div className="px-4 py-3 border-b border-rp-border bg-rp-bg/40">
        <div className="flex items-center justify-between">
          <span className="text-rp-muted text-[10px] font-mono uppercase tracking-wider">Bridge Status</span>
          <div className={cn('flex items-center gap-1', isOnline ? 'text-rp-green' : 'text-rp-red')}>
            <span className={cn('w-1.5 h-1.5 rounded-full', isOnline ? 'bg-rp-green animate-pulse-slow' : 'bg-rp-red')} />
            <span className="font-mono text-[10px]">{isOnline ? 'ONLINE' : 'OFFLINE'}</span>
          </div>
        </div>
        <div className="font-mono text-[10px] text-rp-muted mt-1.5 truncate">{sessionId}</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto">
        {NAV.map(({ path, label, icon: Icon, desc }) => {
          const showBadge = path === '/menu-extractor' && menuChangeBadge > 0;
          return (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-2.5 py-2 rounded mb-0.5 group transition-all',
                  isActive
                    ? 'bg-rp-cyan/10 border border-rp-cyan/20 text-rp-cyan'
                    : 'text-rp-muted hover:text-rp-text hover:bg-rp-surface border border-transparent'
                )
              }
            >
              <div className="relative flex-shrink-0">
                <Icon size={14} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2 min-w-[14px] h-[14px] flex items-center justify-center rounded-full bg-rp-yellow text-[8px] font-bold font-mono text-rp-bg px-0.5 leading-none animate-pulse">
                    {menuChangeBadge > 9 ? '9+' : menuChangeBadge}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium leading-none">{label}</div>
                <div className="text-[10px] mt-0.5 font-mono truncate">
                  {showBadge ? (
                    <span className="text-rp-yellow">
                      {menuChangeBadge} change{menuChangeBadge !== 1 ? 's' : ''} detected
                    </span>
                  ) : (
                    <span className="text-rp-muted">{desc}</span>
                  )}
                </div>
              </div>
              <ChevronRight size={10} className="opacity-0 group-hover:opacity-50" />
            </NavLink>
          );
        })}
      </nav>

      {/* Stats Footer */}
      <div className="px-4 py-3 border-t border-rp-border bg-rp-bg/40">
        <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-2">Session Stats</div>
        <div className="space-y-1">
          {[
            { label: 'Items Extracted', value: stats.menuItemsExtracted },
            { label: 'Orders Injected', value: stats.ordersInjected },
            { label: 'Profile Lookups', value: stats.customerLookups },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-center">
              <span className="text-[10px] text-rp-muted">{label}</span>
              <span className="text-[10px] font-mono text-rp-cyan">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
