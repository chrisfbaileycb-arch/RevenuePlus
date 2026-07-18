import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine, Zap, UserSearch, Activity, ArrowRight, Wifi, Download, FileJson, BookOpen, Package } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { OrderLog } from '@/components/features/OrderLog';
import { PosHealthMonitor } from '@/components/features/PosHealthMonitor';
import { formatTimestamp, cn } from '@/lib/utils';
import { downloadIntegrationBundle, downloadReadme, downloadStarterConfig } from '@/lib/bundleGenerator';
import { toast } from 'sonner';

export default function Dashboard() {
  const { isOnline, setOnline, stats, menuSchema, orderLog, commandLog, sessionId } = useAgentStore();
  const [bundleDownloading, setBundleDownloading] = useState(false);

  const handleDownloadBundle = () => {
    setBundleDownloading(true);
    try {
      downloadIntegrationBundle();
      toast.success('revenue-pulse-agent.js downloaded — ' + (menuSchema.length || 0) + ' menu items embedded');
    } catch (e) {
      toast.error('Bundle generation failed: ' + String(e));
    } finally {
      setTimeout(() => setBundleDownloading(false), 1200);
    }
  };

  const handleDownloadReadme = () => {
    downloadReadme();
    toast.success('REVENUE_PULSE_README.md downloaded');
  };

  const handleDownloadConfig = () => {
    downloadStarterConfig();
    toast.success('restaurant-config.json starter template downloaded');
  };

  useEffect(() => {
    setOnline(true);
  }, [setOnline]);

  const uptime = (() => {
    const diff = Date.now() - new Date(stats.sessionStart).getTime();
    const m = Math.floor(diff / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return `${m}m ${s}s`;
  })();

  const statCards = [
    {
      label: 'Menu Items Extracted',
      value: stats.menuItemsExtracted,
      icon: ScanLine,
      color: 'text-rp-cyan',
      bg: 'bg-rp-cyan/5 border-rp-cyan/20',
      href: '/menu-extractor',
      hint: stats.menuItemsExtracted === 0 ? 'Run extract_menu →' : `${stats.menuItemsExtracted} items in schema`,
    },
    {
      label: 'Orders Injected',
      value: stats.ordersInjected,
      icon: Zap,
      color: 'text-rp-green',
      bg: 'bg-rp-green/5 border-rp-green/20',
      href: '/order-injector',
      hint: 'Programmatic POS cart injections',
    },
    {
      label: 'Customer Lookups',
      value: stats.customerLookups,
      icon: UserSearch,
      color: 'text-rp-purple',
      bg: 'bg-[#bc8cff]/5 border-[#bc8cff]/20',
      href: '/customer-lookup',
      hint: 'Phone → profile resolutions',
    },
  ];

  const recentActivity = commandLog
    .filter((e) => e.input || e.type === 'system')
    .slice(-6)
    .reverse();

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      {/* Bridge status banner */}
      <div className={cn(
        'flex items-center justify-between px-4 py-3 rounded-lg border',
        isOnline ? 'bg-rp-green/5 border-rp-green/20' : 'bg-rp-red/5 border-rp-red/20'
      )}>
        <div className="flex items-center gap-3">
          <Wifi size={15} className={isOnline ? 'text-rp-green' : 'text-rp-red'} />
          <div>
            <div className={cn('text-sm font-semibold', isOnline ? 'text-rp-green' : 'text-rp-red')}>
              Agent Bridge {isOnline ? 'Online' : 'Offline'}
            </div>
            <div className="text-[10px] font-mono text-rp-muted">
              {isOnline
                ? 'window.revenuePulse and window.injectAIOrder() are globally accessible'
                : 'Bridge not initialized'}
            </div>
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="font-mono text-[10px] text-rp-muted">SESSION</div>
          <div className="font-mono text-[11px] text-rp-cyan">{sessionId}</div>
          <div className="font-mono text-[10px] text-rp-muted">Uptime: {uptime}</div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {statCards.map(({ label, value, icon: Icon, color, bg, href, hint }) => (
          <Link
            key={label}
            to={href}
            className={cn('rounded-lg border p-4 flex flex-col gap-2 hover:scale-[1.01] transition-transform', bg)}
          >
            <div className="flex items-center justify-between">
              <Icon size={15} className={color} />
              <ArrowRight size={11} className="text-rp-muted" />
            </div>
            <div className={cn('text-3xl font-mono font-bold', color)}>{value}</div>
            <div>
              <div className="text-xs font-semibold text-rp-text">{label}</div>
              <div className="text-[10px] font-mono text-rp-muted mt-0.5">{hint}</div>
            </div>
          </Link>
        ))}
      </div>

      {/* Global API reference */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <span className="text-rp-muted text-[10px] font-mono">global-api-reference — window.revenuePulse</span>
        </div>
        <div className="p-3 space-y-1.5">
          {[
            { call: 'window.revenuePulse.extractMenu()', returns: 'MenuItem[]', desc: 'Parse POS DOM → JSON schema' },
            { call: 'window.injectAIOrder("#pos-item-001")', returns: 'InjectionResult', desc: 'Add item to POS cart programmatically' },
            { call: 'window.revenuePulse.lookupCustomer("5550101")', returns: 'CustomerProfile', desc: 'Resolve phone → profile + token' },
            { call: 'window.revenuePulse.clearCart()', returns: 'boolean', desc: 'Reset POS cart state' },
          ].map(({ call, returns, desc }) => (
            <div key={call} className="grid grid-cols-[auto_auto_1fr] gap-3 items-center py-0.5">
              <code className="text-[10px] font-mono text-rp-cyan">{call}</code>
              <span className="text-[9px] font-mono text-rp-yellow border border-rp-yellow/20 px-1 py-0.5 rounded">→ {returns}</span>
              <span className="text-[10px] text-rp-muted">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Activity */}
        <div className="terminal-panel">
          <div className="terminal-header">
            <Activity size={11} className="text-rp-muted" />
            <span className="text-rp-muted text-[10px] font-mono">recent-activity</span>
          </div>
          <div className="p-3 space-y-1.5">
            {recentActivity.length === 0 ? (
              <div className="text-rp-muted text-[10px] font-mono text-center py-4">
                No activity yet. Try the console on any page.
              </div>
            ) : (
              recentActivity.map((entry) => (
                <div key={entry.id} className="flex items-center gap-2">
                  <span className="text-[9px] font-mono text-rp-muted">{formatTimestamp(entry.timestamp)}</span>
                  <span className={cn(
                    'text-[10px] font-mono truncate',
                    entry.type === 'success' ? 'text-rp-green' :
                    entry.type === 'error' ? 'text-rp-red' :
                    entry.type === 'system' ? 'text-rp-yellow' : 'text-rp-muted'
                  )}>
                    {entry.input || entry.output}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Injections */}
        <OrderLog results={orderLog.slice(0, 5)} maxHeight="max-h-48" />
      </div>

      {/* ── POS Health Monitor ──────────────────────────────── */}
      <PosHealthMonitor />

      {/* ── Integration Bundle Download ─────────────────────── */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <Package size={11} className="text-rp-cyan" />
          <span className="text-rp-cyan text-[10px] font-mono font-semibold">Integration Bundle — V1.0 Deployment Package</span>
          <span className="ml-auto text-[9px] font-mono text-rp-muted">revenue-pulse-agent.js + restaurant-config.json + README</span>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[10px] font-mono text-rp-muted leading-relaxed">
            Download the self-contained agent bridge. Drop <span className="text-rp-cyan">revenue-pulse-agent.js</span> into any POS page (or run as a bookmarklet). Load your restaurant config JSON. Your AI voice agent is live — no POS API key required.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {/* Primary: JS Bundle */}
            <button
              onClick={handleDownloadBundle}
              disabled={bundleDownloading}
              className="flex items-center gap-2 px-3 py-2.5 rounded border border-rp-cyan/40 bg-rp-cyan/10 text-rp-cyan hover:bg-rp-cyan/20 text-xs font-mono font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download size={12} className={bundleDownloading ? 'animate-bounce' : ''} />
              <div className="text-left">
                <div>{bundleDownloading ? 'Generating...' : 'revenue-pulse-agent.js'}</div>
                <div className="text-[9px] text-rp-cyan/60 font-normal">
                  {menuSchema.length > 0 ? menuSchema.length + ' items embedded' : 'Full agent bridge'}
                </div>
              </div>
            </button>

            {/* Starter config JSON */}
            <button
              onClick={handleDownloadConfig}
              className="flex items-center gap-2 px-3 py-2.5 rounded border border-rp-border hover:border-rp-yellow/30 bg-rp-surface hover:bg-rp-yellow/5 text-rp-muted hover:text-rp-yellow text-xs font-mono transition-all"
            >
              <FileJson size={12} />
              <div className="text-left">
                <div>restaurant-config.json</div>
                <div className="text-[9px] font-normal opacity-60">Onboarding config template</div>
              </div>
            </button>

            {/* README */}
            <button
              onClick={handleDownloadReadme}
              className="flex items-center gap-2 px-3 py-2.5 rounded border border-rp-border hover:border-rp-green/30 bg-rp-surface hover:bg-rp-green/5 text-rp-muted hover:text-rp-green text-xs font-mono transition-all"
            >
              <BookOpen size={12} />
              <div className="text-left">
                <div>REVENUE_PULSE_README.md</div>
                <div className="text-[9px] font-normal opacity-60">3 webhooks + env vars</div>
              </div>
            </button>
          </div>

          {/* Webhook reference strip */}
          <div className="border-t border-rp-border pt-3">
            <div className="text-[9px] font-mono text-rp-muted uppercase tracking-wider mb-2">Three Required Webhooks (relay server)</div>
            <div className="space-y-1">
              {[
                { method: 'POST', path: '/api/inject-order',    color: 'text-rp-green',  desc: 'AI agent fires this to add item to POS cart' },
                { method: 'GET',  path: '/api/customer-lookup', color: 'text-rp-cyan',   desc: 'Resolves caller phone → saved profile + token' },
                { method: 'GET',  path: '/api/menu-schema',     color: 'text-rp-yellow', desc: 'Returns full menu JSON for agent pre-call load' },
              ].map(({ method, path, color, desc }) => (
                <div key={path} className="flex items-center gap-3">
                  <span className={cn('text-[9px] font-mono font-bold w-8 flex-shrink-0', color)}>{method}</span>
                  <code className="text-[10px] font-mono text-rp-text">{path}</code>
                  <span className="text-[9px] text-rp-muted hidden sm:block">{desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Onboarding config quick reference */}
          <div className="border-t border-rp-border pt-3">
            <div className="text-[9px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">Onboarding Config — minimum required fields</div>
            <pre className="text-[9px] font-mono text-rp-muted leading-relaxed bg-rp-bg rounded p-2 overflow-x-auto">
{`window.revenuePulse.init({
  store_name: "Mario's Pizza",        // display name
  store_id:   "marios-001",           // unique slug
  pos_selector_map: {
    container:  "#pos-root",          // POS menu wrapper
    item:       "[data-item-id]",     // each menu item node
    nameAttr:   "data-item-name",     // item name attribute
    priceAttr:  "data-item-price",    // item price attribute
    addButton:  ".add-to-cart"        // add-to-cart trigger
  }
});`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
