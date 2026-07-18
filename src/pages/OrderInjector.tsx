import { useState, useRef, useCallback } from 'react';
import { Zap, AlertCircle, ListOrdered, Play, RotateCcw, RefreshCw, CheckCircle, XCircle, Loader, ChevronDown, ChevronUp, Plus, Trash2, Clock } from 'lucide-react';
import { PosSimulator } from '@/components/features/PosSimulator';
import { AgentConsole } from '@/components/features/AgentConsole';
import { OrderLog } from '@/components/features/OrderLog';
import { useAgent } from '@/hooks/useAgent';
import { useAgentStore } from '@/stores/agentStore';
import { injectAIOrder } from '@/lib/orderInjector';
import { MOCK_MENU } from '@/constants/mockData';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Queue Item Types ───────────────────────────────── */
type QueueStatus = 'pending' | 'running' | 'success' | 'failed' | 'retrying';

interface QueueEntry {
  id: string;
  selector: string;
  modifications: string[];
  status: QueueStatus;
  item_name?: string;
  order_id?: string;
  price?: number;
  errorMsg?: string;
  durationMs?: number;
  retries: number;
}

interface QueueSummary {
  totalItems: number;
  successCount: number;
  failCount: number;
  totalPrice: number;
  orderIds: string[];
  durationMs: number;
}

/* ── Helpers ────────────────────────────────────────── */
function buildDefaultQueue(items: typeof MOCK_MENU): QueueEntry[] {
  return items.slice(0, 3).map((item) => ({
    id: `qe-${item.id}`,
    selector: `[data-item-id="${item.id.replace('item-', 'pos-item-')}"]`,
    modifications: [],
    status: 'pending',
    price: item.price,
    item_name: item.name,
    retries: 0,
  }));
}

function selectorToPrice(selector: string): number {
  const match = selector.match(/pos-item-(\d+)/);
  if (match) {
    const idx = parseInt(match[1], 10) - 1;
    return MOCK_MENU[idx]?.price ?? 0;
  }
  return 0;
}

function delay(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

/* ── Component ──────────────────────────────────────── */
export default function OrderInjector() {
  const { menuSchema, orderLog, runInjectOrder, runExtractMenu } = useAgent();
  const { addCommandLog } = useAgentStore();

  // ── Quick inject ──────────────────────────────────────
  const quickItems = menuSchema.length > 0
    ? menuSchema.filter((i) => i.available).slice(0, 6)
    : MOCK_MENU.filter((i) => i.available).slice(0, 6).map((i) => ({
        item_name: i.name,
        item_price: i.price,
        pos_element_selector: `[data-item-id="${i.id.replace('item-', 'pos-item-')}"]`,
        available: i.available,
        category: i.category,
        modifiers: i.modifiers,
      }));

  const quickInject = (selector: string) => {
    if (menuSchema.length === 0) runExtractMenu();
    runInjectOrder(selector);
  };

  // ── Queue state ───────────────────────────────────────
  const [queueOpen, setQueueOpen] = useState(true);
  const [queue, setQueue] = useState<QueueEntry[]>(() =>
    buildDefaultQueue(MOCK_MENU.filter((i) => i.available))
  );
  const [delayMs, setDelayMs] = useState(800);
  const [maxRetries, setMaxRetries] = useState(2);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<QueueSummary | null>(null);
  const [selectorInput, setSelectorInput] = useState('');
  const abortRef = useRef(false);

  // ── Queue manipulation ────────────────────────────────
  const addFromInput = () => {
    const parts = selectorInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) {
      toast.error('Enter at least one selector');
      return;
    }
    const newEntries: QueueEntry[] = parts.map((sel) => {
      const matchedItem = MOCK_MENU.find((m) =>
        sel.includes(m.id) || sel.includes(m.id.replace('item-', 'pos-item-'))
      );
      return {
        id: `qe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        selector: sel,
        modifications: [],
        status: 'pending',
        price: matchedItem?.price ?? selectorToPrice(sel),
        item_name: matchedItem?.name,
        retries: 0,
      };
    });
    setQueue((prev) => [...prev, ...newEntries]);
    setSelectorInput('');
    setSummary(null);
  };

  const removeEntry = (id: string) => setQueue((prev) => prev.filter((e) => e.id !== id));

  const resetQueue = () => {
    setQueue(buildDefaultQueue(MOCK_MENU.filter((i) => i.available)));
    setSummary(null);
  };

  const retryEntry = useCallback(
    async (id: string) => {
      setQueue((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: 'retrying', errorMsg: undefined } : e))
      );
      await delay(300);
      const entry = queue.find((e) => e.id === id);
      if (!entry) return;

      const t0 = Date.now();
      const result = injectAIOrder(entry.selector, entry.modifications);
      const dur = Date.now() - t0;

      setQueue((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: result.success ? 'success' : 'failed',
                order_id: result.success ? result.order_id : undefined,
                item_name: result.item_name !== 'UNKNOWN' ? result.item_name : e.item_name,
                errorMsg: result.success ? undefined : result.message,
                durationMs: dur,
                retries: e.retries + 1,
              }
            : e
        )
      );

      addCommandLog({
        input: `queue.retry ${entry.selector}`,
        output: result.success
          ? `✓ Retry success — ${result.item_name} [${result.order_id}]`
          : `✗ Retry failed — ${result.message}`,
        type: result.success ? 'success' : 'error',
        timestamp: new Date().toISOString(),
      });
    },
    [queue, addCommandLog]
  );

  // ── Run queue ─────────────────────────────────────────
  const runQueue = async () => {
    if (running || !queue.length) return;
    abortRef.current = false;
    setRunning(true);
    setSummary(null);
    if (menuSchema.length === 0) runExtractMenu();

    // Reset all to pending
    setQueue((prev) => prev.map((e) => ({ ...e, status: 'pending', errorMsg: undefined, order_id: undefined, durationMs: undefined })));
    await delay(100);

    const results: { success: boolean; orderId?: string; price: number }[] = [];
    const wallStart = Date.now();

    addCommandLog({
      input: `queue.run — ${queue.length} items, delay ${delayMs}ms, max-retries ${maxRetries}`,
      output: `▶ Starting order queue...`,
      type: 'info',
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < queue.length; i++) {
      if (abortRef.current) break;

      const entry = queue[i];
      setQueue((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'running' } : e)));
      await delay(120);

      let result = injectAIOrder(entry.selector, entry.modifications);
      let attempts = 1;

      // Retry logic
      while (!result.success && attempts <= maxRetries) {
        setQueue((prev) => prev.map((e) => (e.id === entry.id ? { ...e, status: 'retrying', retries: attempts } : e)));
        await delay(delayMs * 0.6);
        result = injectAIOrder(entry.selector, entry.modifications);
        attempts++;
      }

      const dur = Date.now() - wallStart;
      const itemPrice = entry.price ?? selectorToPrice(entry.selector);

      setQueue((prev) =>
        prev.map((e) =>
          e.id === entry.id
            ? {
                ...e,
                status: result.success ? 'success' : 'failed',
                order_id: result.success ? result.order_id : undefined,
                item_name: result.item_name !== 'UNKNOWN' ? result.item_name : e.item_name,
                errorMsg: result.success ? undefined : result.message,
                durationMs: dur,
                retries: attempts - 1,
                price: itemPrice,
              }
            : e
        )
      );

      results.push({ success: result.success, orderId: result.order_id, price: itemPrice });

      addCommandLog({
        input: `queue[${i + 1}/${queue.length}] inject ${entry.selector}`,
        output: result.success
          ? `✓ ${result.item_name} → ${result.order_id}`
          : `✗ Failed (${attempts - 1} retries): ${result.message}`,
        type: result.success ? 'success' : 'error',
        timestamp: new Date().toISOString(),
      });

      if (i < queue.length - 1 && !abortRef.current) await delay(delayMs);
    }

    const totalDuration = Date.now() - wallStart;
    const successes = results.filter((r) => r.success);
    const finalSummary: QueueSummary = {
      totalItems: queue.length,
      successCount: successes.length,
      failCount: results.length - successes.length,
      totalPrice: successes.reduce((acc, r) => acc + r.price, 0),
      orderIds: successes.map((r) => r.orderId!).filter(Boolean),
      durationMs: totalDuration,
    };

    setSummary(finalSummary);
    setRunning(false);

    addCommandLog({
      input: '',
      output: `■ Queue complete — ${finalSummary.successCount}/${finalSummary.totalItems} success · $${finalSummary.totalPrice.toFixed(2)} · ${(totalDuration / 1000).toFixed(1)}s`,
      type: finalSummary.failCount === 0 ? 'success' : 'info',
      timestamp: new Date().toISOString(),
    });

    if (finalSummary.failCount === 0) {
      toast.success(`Queue complete — ${finalSummary.successCount} items injected`);
    } else {
      toast(`Queue done: ${finalSummary.successCount} ok, ${finalSummary.failCount} failed`);
    }
  };

  const stopQueue = () => {
    abortRef.current = true;
    setRunning(false);
    toast('Queue stopped');
  };

  /* ── Status icon helper ── */
  const StatusIcon = ({ status }: { status: QueueStatus }) => {
    if (status === 'pending') return <span className="w-3 h-3 rounded-full border border-rp-border flex-shrink-0" />;
    if (status === 'running') return <Loader size={11} className="text-rp-cyan animate-spin flex-shrink-0" />;
    if (status === 'retrying') return <RefreshCw size={11} className="text-rp-yellow animate-spin flex-shrink-0" />;
    if (status === 'success') return <CheckCircle size={11} className="text-rp-green flex-shrink-0" />;
    return <XCircle size={11} className="text-rp-red flex-shrink-0" />;
  };

  return (
    <div className="p-5 space-y-4 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-rp-text">Module 2 — Programmatic Order Injection</h2>
        <p className="text-[11px] text-rp-muted font-mono mt-0.5">
          AI agent calls <span className="text-rp-cyan">window.injectAIOrder(selector)</span> — no human input, DOM events fired directly on POS cart
        </p>
      </div>

      <div className="flex items-start gap-2 px-3 py-2.5 rounded border border-rp-border bg-rp-surface text-[10px] font-mono text-rp-muted">
        <AlertCircle size={11} className="text-rp-cyan mt-0.5 flex-shrink-0" />
        <span>
          The injector fires a <span className="text-rp-yellow">MouseEvent('click')</span> on the{' '}
          <span className="text-rp-cyan">.add-to-cart</span> button inside the target selector. No API key needed —
          it operates directly on the wrapped POS DOM.
        </span>
      </div>

      {/* Quick inject buttons */}
      <div>
        <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-2">
          Single Inject — click to fire one item:
        </div>
        <div className="flex flex-wrap gap-2">
          {quickItems.map((item) => (
            <button
              key={item.pos_element_selector}
              onClick={() => quickInject(item.pos_element_selector)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-rp-border hover:border-rp-green/40 bg-rp-surface hover:bg-rp-green/5 text-[10px] font-mono text-rp-muted hover:text-rp-green transition-all"
            >
              <Zap size={9} />
              <span>{item.item_name}</span>
              <span className="text-rp-yellow">${item.item_price.toFixed(2)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* POS + Console grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider px-1">
            POS Interface (injection target)
          </div>
          <PosSimulator compact />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider px-1">Agent Console</div>
            <div className="h-64"><AgentConsole /></div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider px-1">
              Injection Log ({orderLog.length})
            </div>
            <OrderLog results={orderLog} maxHeight="max-h-48" />
          </div>
        </div>
      </div>

      {/* ══ ORDER QUEUE MANAGER ═══════════════════════════════ */}
      <div className="terminal-panel">
        {/* Queue header bar */}
        <button
          onClick={() => setQueueOpen((o) => !o)}
          className="terminal-header w-full flex items-center gap-2 hover:bg-rp-surface/60 transition-colors cursor-pointer"
        >
          <ListOrdered size={11} className="text-rp-cyan" />
          <span className="text-rp-cyan text-[10px] font-mono font-semibold">
            order-queue-manager — batch AI injection
          </span>
          <span className="ml-2 px-1.5 py-0.5 rounded bg-rp-cyan/10 text-rp-cyan text-[9px] font-mono">
            {queue.length} items
          </span>
          {summary && (
            <span className="ml-1 px-1.5 py-0.5 rounded bg-rp-green/10 text-rp-green text-[9px] font-mono">
              last: {summary.successCount}/{summary.totalItems} ok
            </span>
          )}
          <span className="ml-auto text-rp-muted">
            {queueOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        </button>

        {queueOpen && (
          <div className="p-4 space-y-4">
            {/* ── Config row ── */}
            <div className="flex flex-wrap items-end gap-4">
              {/* Delay config */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1">
                  Delay between items (ms)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={3000}
                    step={100}
                    value={delayMs}
                    onChange={(e) => setDelayMs(Number(e.target.value))}
                    className="w-28 accent-rp-cyan"
                    disabled={running}
                  />
                  <span className="text-rp-cyan font-mono text-[11px] w-12">{delayMs}ms</span>
                </div>
              </div>
              {/* Max retries */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1">
                  Max retries per item
                </label>
                <div className="flex items-center gap-1">
                  {[0, 1, 2, 3].map((n) => (
                    <button
                      key={n}
                      onClick={() => setMaxRetries(n)}
                      disabled={running}
                      className={cn(
                        'w-7 h-7 rounded border text-[10px] font-mono transition-all',
                        maxRetries === n
                          ? 'bg-rp-cyan/10 border-rp-cyan/40 text-rp-cyan'
                          : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text'
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              {/* Run / Stop */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={resetQueue}
                  disabled={running}
                  title="Reset queue to defaults"
                  className="p-2 rounded border border-rp-border bg-rp-surface text-rp-muted hover:text-rp-text text-xs font-mono transition-all disabled:opacity-40"
                >
                  <RotateCcw size={12} />
                </button>
                {running ? (
                  <button
                    onClick={stopQueue}
                    className="flex items-center gap-2 px-4 py-2 rounded border border-rp-red/40 bg-rp-red/10 text-rp-red text-xs font-mono hover:bg-rp-red/20 transition-all"
                  >
                    <span className="w-2 h-2 rounded-sm bg-rp-red" />
                    Stop Queue
                  </button>
                ) : (
                  <button
                    onClick={runQueue}
                    disabled={!queue.length}
                    className="flex items-center gap-2 px-4 py-2 rounded border border-rp-cyan/40 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all disabled:opacity-40"
                  >
                    <Play size={12} />
                    Run Queue ({queue.length})
                  </button>
                )}
              </div>
            </div>

            {/* ── Add selector input ── */}
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1">
                  Add selectors (comma-separated)
                </label>
                <input
                  value={selectorInput}
                  onChange={(e) => setSelectorInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addFromInput()}
                  placeholder='[data-item-id="pos-item-001"], [data-item-id="pos-item-006"], #pos-item-009'
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                  disabled={running}
                />
              </div>
              <button
                onClick={addFromInput}
                disabled={running}
                className="self-end flex items-center gap-1.5 px-3 py-2 rounded border border-rp-border bg-rp-surface text-rp-muted hover:text-rp-text text-xs font-mono transition-all disabled:opacity-40"
              >
                <Plus size={11} /> Add
              </button>
            </div>

            {/* ── Quick-add from schema ── */}
            {(menuSchema.length > 0 || MOCK_MENU.length > 0) && (
              <div>
                <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  Quick-add from menu schema:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(menuSchema.length > 0 ? menuSchema : MOCK_MENU.map((m) => ({
                    item_name: m.name,
                    item_price: m.price,
                    pos_element_selector: `[data-item-id="${m.id.replace('item-', 'pos-item-')}"]`,
                    available: m.available,
                    category: m.category,
                    modifiers: m.modifiers,
                  }))).filter((i) => i.available).map((item) => (
                    <button
                      key={item.pos_element_selector}
                      disabled={running}
                      onClick={() => {
                        const already = queue.some((e) => e.selector === item.pos_element_selector);
                        if (already) { toast('Already in queue'); return; }
                        const mockItem = MOCK_MENU.find((m) =>
                          item.pos_element_selector.includes(m.id) ||
                          item.pos_element_selector.includes(m.id.replace('item-', 'pos-item-'))
                        );
                        setQueue((prev) => [
                          ...prev,
                          {
                            id: `qe-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            selector: item.pos_element_selector,
                            modifications: [],
                            status: 'pending',
                            item_name: item.item_name,
                            price: mockItem?.price ?? item.item_price,
                            retries: 0,
                          },
                        ]);
                        setSummary(null);
                      }}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-mono transition-all',
                        queue.some((e) => e.selector === item.pos_element_selector)
                          ? 'border-rp-cyan/20 bg-rp-cyan/5 text-rp-cyan/50 cursor-default'
                          : 'border-rp-border bg-rp-surface text-rp-muted hover:text-rp-text hover:border-rp-cyan/20 disabled:opacity-40'
                      )}
                    >
                      <Plus size={8} />
                      {item.item_name}
                      <span className="text-rp-yellow ml-0.5">${item.item_price.toFixed(2)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── Queue table ── */}
            {queue.length > 0 && (
              <div className="rounded border border-rp-border overflow-hidden">
                {/* Table header */}
                <div className="grid grid-cols-[20px_1fr_120px_80px_70px_60px_36px] gap-2 px-3 py-2 bg-rp-surface border-b border-rp-border text-[9px] font-mono text-rp-muted uppercase tracking-wider">
                  <span>#</span>
                  <span>Selector / Item</span>
                  <span>Order ID</span>
                  <span>Price</span>
                  <span>Status</span>
                  <span>Retries</span>
                  <span />
                </div>

                {/* Table rows */}
                <div className="divide-y divide-rp-border/50">
                  {queue.map((entry, idx) => (
                    <div
                      key={entry.id}
                      className={cn(
                        'grid grid-cols-[20px_1fr_120px_80px_70px_60px_36px] gap-2 px-3 py-2 items-center transition-all text-[10px] font-mono',
                        entry.status === 'running' && 'bg-rp-cyan/5',
                        entry.status === 'retrying' && 'bg-rp-yellow/5',
                        entry.status === 'success' && 'bg-rp-green/3',
                        entry.status === 'failed' && 'bg-rp-red/5',
                      )}
                    >
                      {/* Index */}
                      <span className="text-rp-muted">{idx + 1}</span>

                      {/* Selector + name */}
                      <div className="min-w-0">
                        {entry.item_name && (
                          <div className="text-rp-text truncate leading-none mb-0.5">{entry.item_name}</div>
                        )}
                        <div className="text-rp-muted truncate text-[9px]">{entry.selector}</div>
                        {entry.errorMsg && (
                          <div className="text-rp-red text-[9px] truncate mt-0.5">{entry.errorMsg.replace('[INJECTION FAILED] ', '')}</div>
                        )}
                      </div>

                      {/* Order ID */}
                      <span className={cn(entry.order_id ? 'text-rp-green' : 'text-rp-muted/40', 'truncate')}>
                        {entry.order_id || '—'}
                      </span>

                      {/* Price */}
                      <span className={cn(entry.price ? 'text-rp-yellow' : 'text-rp-muted/40')}>
                        {entry.price ? `$${entry.price.toFixed(2)}` : '—'}
                      </span>

                      {/* Status */}
                      <div className="flex items-center gap-1.5">
                        <StatusIcon status={entry.status} />
                        <span
                          className={cn(
                            'capitalize',
                            entry.status === 'success' && 'text-rp-green',
                            entry.status === 'failed' && 'text-rp-red',
                            entry.status === 'running' && 'text-rp-cyan',
                            entry.status === 'retrying' && 'text-rp-yellow',
                            entry.status === 'pending' && 'text-rp-muted',
                          )}
                        >
                          {entry.status}
                        </span>
                      </div>

                      {/* Retries */}
                      <span className={cn(entry.retries > 0 ? 'text-rp-yellow' : 'text-rp-muted/40')}>
                        {entry.retries > 0 ? `×${entry.retries}` : '—'}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        {entry.status === 'failed' && !running && (
                          <button
                            onClick={() => retryEntry(entry.id)}
                            title="Retry this item"
                            className="p-1 rounded hover:bg-rp-yellow/10 text-rp-yellow hover:text-rp-yellow transition-colors"
                          >
                            <RefreshCw size={10} />
                          </button>
                        )}
                        {!running && (
                          <button
                            onClick={() => removeEntry(entry.id)}
                            title="Remove from queue"
                            className="p-1 rounded hover:bg-rp-red/10 text-rp-muted hover:text-rp-red transition-colors"
                          >
                            <Trash2 size={10} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Order Summary ── */}
            {summary && (
              <div
                className={cn(
                  'rounded border p-4 space-y-3 animate-fade-in',
                  summary.failCount === 0
                    ? 'border-rp-green/30 bg-rp-green/5'
                    : 'border-rp-yellow/30 bg-rp-yellow/5'
                )}
              >
                {/* Summary header */}
                <div className="flex items-center gap-2">
                  {summary.failCount === 0 ? (
                    <CheckCircle size={13} className="text-rp-green" />
                  ) : (
                    <AlertCircle size={13} className="text-rp-yellow" />
                  )}
                  <span className="text-xs font-semibold font-mono text-rp-text">
                    Queue Complete — Order Summary
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-rp-muted">
                    <Clock size={9} />
                    {(summary.durationMs / 1000).toFixed(2)}s total
                  </span>
                </div>

                {/* Key metrics */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Items', value: summary.totalItems, color: 'text-rp-cyan' },
                    { label: 'Success', value: summary.successCount, color: 'text-rp-green' },
                    { label: 'Failed', value: summary.failCount, color: summary.failCount > 0 ? 'text-rp-red' : 'text-rp-muted' },
                    { label: 'Total', value: `$${summary.totalPrice.toFixed(2)}`, color: 'text-rp-yellow' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="rounded border border-rp-border bg-rp-surface px-3 py-2 text-center">
                      <div className={cn('text-base font-bold font-mono leading-none', color)}>{value}</div>
                      <div className="text-[9px] text-rp-muted font-mono mt-1 uppercase tracking-wider">{label}</div>
                    </div>
                  ))}
                </div>

                {/* Order IDs */}
                {summary.orderIds.length > 0 && (
                  <div>
                    <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                      Confirmed Order IDs
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.orderIds.map((id) => (
                        <code
                          key={id}
                          className="px-2 py-0.5 rounded bg-rp-surface border border-rp-green/20 text-rp-green text-[10px] font-mono"
                        >
                          {id}
                        </code>
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed selectors hint */}
                {summary.failCount > 0 && (
                  <div className="text-[10px] font-mono text-rp-yellow">
                    ⚠ {summary.failCount} item{summary.failCount > 1 ? 's' : ''} failed — click the{' '}
                    <RefreshCw size={9} className="inline" /> retry button on each row to re-attempt.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
