import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wifi, WifiOff, Send, RotateCcw, Trash2, ChevronDown, ChevronUp,
  ArrowDownLeft, ArrowUpRight, Activity, AlertCircle, CheckCircle,
  XCircle, Loader, Copy, Plug, Unplug, Terminal
} from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { dispatchCommand } from '@/lib/agentBridge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { AgentCommand } from '@/types/pos';

/* ── Types ────────────────────────────────────────────── */
type ConnStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';

interface WsMessage {
  id: string;
  direction: 'inbound' | 'outbound' | 'system';
  raw: string;
  parsed?: AgentCommand;
  result?: string;
  status: 'pending' | 'dispatched' | 'success' | 'error' | 'sent' | 'info';
  timestamp: string;
  latencyMs?: number;
  action?: string;
}

interface ConnConfig {
  url: string;
  token: string;
  autoReconnect: boolean;
  reconnectIntervalMs: number;
}

/* ── Manual command presets ──────────────────────────── */
const COMMAND_PRESETS: { label: string; command: AgentCommand }[] = [
  {
    label: 'Extract Menu',
    command: { action: 'extract_menu', payload: {} },
  },
  {
    label: 'Inject Order (item-001)',
    command: {
      action: 'inject_order',
      payload: { selector: '[data-item-id="pos-item-001"]', modifications: [] },
    },
  },
  {
    label: 'Inject Order (item-006)',
    command: {
      action: 'inject_order',
      payload: { selector: '[data-item-id="pos-item-006"]', modifications: ['extra-pepperoni'] },
    },
  },
  {
    label: 'Lookup Customer (5550101)',
    command: { action: 'lookup_customer', payload: { phone: '5550101' } },
  },
  {
    label: 'Lookup Customer (5550202)',
    command: { action: 'lookup_customer', payload: { phone: '5550202' } },
  },
  {
    label: 'Get Cart',
    command: { action: 'get_cart', payload: {} },
  },
  {
    label: 'Clear Cart',
    command: { action: 'clear_cart', payload: {} },
  },
  {
    label: 'Help',
    command: { action: 'help', payload: {} },
  },
];

/* ── Helpers ──────────────────────────────────────────── */
function genId() {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}
function now() {
  return new Date().toISOString();
}
function tsLabel(iso: string) {
  const d = new Date(iso);
  return d.toTimeString().slice(0, 8) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/* ── Component ────────────────────────────────────────── */
export default function WebSocketManager() {
  const { addCommandLog } = useAgentStore();

  /* Config */
  const [config, setConfig] = useState<ConnConfig>({
    url: 'ws://localhost:3001/ws',
    token: '',
    autoReconnect: true,
    reconnectIntervalMs: 3000,
  });

  /* Connection state */
  const [status, setStatus] = useState<ConnStatus>('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortReconnect = useRef(false);

  /* Messages */
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const logRef = useRef<HTMLDivElement>(null);

  /* Manual sender */
  const [manualOpen, setManualOpen] = useState(true);
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customPayload, setCustomPayload] = useState(
    () => JSON.stringify(COMMAND_PRESETS[0].command, null, 2)
  );
  const [payloadError, setPayloadError] = useState('');
  const [sending, setSending] = useState(false);

  /* Stats */
  const [statsOpen, setStatsOpen] = useState(true);
  const stats = {
    total: messages.filter((m) => m.direction !== 'system').length,
    inbound: messages.filter((m) => m.direction === 'inbound').length,
    outbound: messages.filter((m) => m.direction === 'outbound').length,
    errors: messages.filter((m) => m.status === 'error').length,
  };

  /* Auto-scroll log */
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages]);

  /* Cleanup on unmount */
  useEffect(() => {
    return () => {
      abortReconnect.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, []);

  /* ── Add message helper ── */
  const addMsg = useCallback((msg: Omit<WsMessage, 'id' | 'timestamp'> & { timestamp?: string }) => {
    setMessages((prev) =>
      [...prev, { id: genId(), timestamp: msg.timestamp ?? now(), ...msg }].slice(-200)
    );
  }, []);

  /* ── WebSocket connect ── */
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    abortReconnect.current = false;
    setStatus('connecting');
    addMsg({ direction: 'system', raw: `Connecting to ${config.url}…`, status: 'info' });

    let ws: WebSocket;
    try {
      ws = new WebSocket(config.url, config.token ? ['revenue-pulse', config.token] : ['revenue-pulse']);
    } catch (err) {
      setStatus('error');
      addMsg({ direction: 'system', raw: `Failed to create WebSocket: ${String(err)}`, status: 'error' });
      return;
    }

    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('connected');
      setReconnectAttempts(0);
      addMsg({ direction: 'system', raw: `Connected to ${config.url}`, status: 'success' });

      // Announce ourselves
      const hello = JSON.stringify({
        type: 'handshake',
        client: 'revenue-pulse-bridge',
        version: '1.0',
        token: config.token || undefined,
        ts: now(),
      });
      ws.send(hello);
      addMsg({ direction: 'outbound', raw: hello, status: 'sent', action: 'handshake' });

      addCommandLog({
        input: `ws.connect ${config.url}`,
        output: `✓ WebSocket connected — Revenue Pulse bridge online`,
        type: 'success',
        timestamp: now(),
      });
    };

    ws.onmessage = (event) => {
      const raw = typeof event.data === 'string' ? event.data : '[binary]';
      const t0 = Date.now();
      let parsed: AgentCommand | undefined;
      let parseError = '';

      try {
        parsed = JSON.parse(raw) as AgentCommand;
      } catch {
        parseError = 'Invalid JSON — could not parse command';
      }

      const msgId = genId();
      const ts = now();

      // Record inbound message immediately as 'pending'
      setMessages((prev) =>
        [...prev, { id: msgId, direction: 'inbound', raw, parsed, status: parseError ? 'error' : 'pending', timestamp: ts }].slice(-200)
      );

      if (parseError || !parsed?.action) {
        setMessages((prev) =>
          prev.map((m) => m.id === msgId ? { ...m, status: 'error', result: parseError || 'Missing action field' } : m)
        );
        return;
      }

      // Auto-dispatch through agent bridge
      const dispatchResult = dispatchCommand(parsed);
      const latencyMs = Date.now() - t0;
      const resultStr = JSON.stringify(dispatchResult, null, 2);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                status: dispatchResult.status === 'success' ? 'success' : 'error',
                result: resultStr,
                latencyMs,
                action: parsed?.action,
              }
            : m
        )
      );

      // Stream result back to relay
      if (ws.readyState === WebSocket.OPEN) {
        const response = JSON.stringify({
          type: 'bridge_response',
          correlation_id: (parsed as any).correlation_id,
          action: parsed.action,
          result: dispatchResult,
          ts: now(),
        });
        ws.send(response);
        addMsg({ direction: 'outbound', raw: response, status: 'sent', action: `${parsed.action}:response` });
      }

      addCommandLog({
        input: `ws.inbound ${parsed.action}`,
        output: dispatchResult.status === 'success'
          ? `✓ Auto-dispatched ${parsed.action} — result streamed back (${latencyMs}ms)`
          : `✗ Dispatch failed: ${dispatchResult.error}`,
        type: dispatchResult.status === 'success' ? 'success' : 'error',
        timestamp: ts,
      });
    };

    ws.onerror = () => {
      setStatus('error');
      addMsg({ direction: 'system', raw: 'WebSocket error — check URL and relay server', status: 'error' });
    };

    ws.onclose = (ev) => {
      wsRef.current = null;
      const wasConnected = status === 'connected';
      addMsg({
        direction: 'system',
        raw: `Disconnected (code ${ev.code}${ev.reason ? ': ' + ev.reason : ''})`,
        status: 'info',
      });

      if (!abortReconnect.current && config.autoReconnect && wasConnected) {
        setStatus('reconnecting');
        setReconnectAttempts((n) => n + 1);
        reconnectTimer.current = setTimeout(() => {
          if (!abortReconnect.current) connect();
        }, config.reconnectIntervalMs);
      } else {
        setStatus('disconnected');
      }

      addCommandLog({
        input: 'ws.disconnect',
        output: `WebSocket closed (code ${ev.code})${config.autoReconnect && wasConnected ? ' — scheduling reconnect' : ''}`,
        type: 'info',
        timestamp: now(),
      });
    };
  }, [config, addMsg, addCommandLog, status]);

  /* ── Disconnect ── */
  const disconnect = useCallback(() => {
    abortReconnect.current = true;
    if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    wsRef.current?.close(1000, 'Client disconnected');
    wsRef.current = null;
    setStatus('disconnected');
    setReconnectAttempts(0);
    addMsg({ direction: 'system', raw: 'Disconnected by user.', status: 'info' });
  }, [addMsg]);

  /* ── Manual send ── */
  const handleSend = useCallback(async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      toast.error('Not connected — connect to a relay server first');
      return;
    }

    let parsed: AgentCommand;
    try {
      parsed = JSON.parse(customPayload) as AgentCommand;
      setPayloadError('');
    } catch {
      setPayloadError('Invalid JSON — fix the payload before sending');
      return;
    }

    setSending(true);
    const raw = JSON.stringify({ ...parsed, correlation_id: `manual-${Date.now().toString(36)}` });

    wsRef.current.send(raw);
    addMsg({ direction: 'outbound', raw, status: 'sent', action: parsed.action });

    addCommandLog({
      input: `ws.send ${parsed.action}`,
      output: `→ Manual command sent: ${parsed.action}`,
      type: 'info',
      timestamp: now(),
    });

    await new Promise((r) => setTimeout(r, 200));
    setSending(false);
    toast.success(`Sent: ${parsed.action}`);
  }, [customPayload, addMsg, addCommandLog]);

  /* ── Preset picker ── */
  const applyPreset = (idx: number) => {
    setSelectedPreset(idx);
    setCustomPayload(JSON.stringify(COMMAND_PRESETS[idx].command, null, 2));
    setPayloadError('');
  };

  /* ── Validate custom payload ── */
  const validatePayload = (val: string) => {
    setCustomPayload(val);
    try { JSON.parse(val); setPayloadError(''); }
    catch { setPayloadError('Invalid JSON'); }
  };

  /* ── Copy helper ── */
  const copyText = (text: string) =>
    navigator.clipboard.writeText(text).then(() => toast.success('Copied'));

  /* ── Clear log ── */
  const clearLog = () => {
    setMessages([]);
    addCommandLog({ input: 'ws.clear', output: '✓ Message log cleared', type: 'system', timestamp: now() });
  };

  /* ── Status indicator ── */
  const StatusDot = () => {
    const map: Record<ConnStatus, { color: string; pulse: boolean; label: string }> = {
      connected:     { color: 'bg-rp-green',  pulse: true,  label: 'CONNECTED' },
      connecting:    { color: 'bg-rp-yellow', pulse: true,  label: 'CONNECTING' },
      reconnecting:  { color: 'bg-rp-yellow', pulse: true,  label: `RECONNECTING (${reconnectAttempts})` },
      error:         { color: 'bg-rp-red',    pulse: false, label: 'ERROR' },
      disconnected:  { color: 'bg-rp-muted',  pulse: false, label: 'DISCONNECTED' },
    };
    const s = map[status];
    return (
      <div className="flex items-center gap-1.5">
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', s.color, s.pulse && 'animate-pulse')} />
        <span className={cn(
          'text-[10px] font-mono font-semibold',
          status === 'connected'    && 'text-rp-green',
          status === 'connecting'   && 'text-rp-yellow',
          status === 'reconnecting' && 'text-rp-yellow',
          status === 'error'        && 'text-rp-red',
          status === 'disconnected' && 'text-rp-muted',
        )}>{s.label}</span>
      </div>
    );
  };

  /* ── Direction badge ── */
  const DirBadge = ({ dir }: { dir: WsMessage['direction'] }) => (
    <span className={cn(
      'flex items-center gap-0.5 text-[9px] font-mono font-bold uppercase tracking-wider flex-shrink-0 w-16',
      dir === 'inbound'  && 'text-rp-cyan',
      dir === 'outbound' && 'text-rp-yellow',
      dir === 'system'   && 'text-rp-purple',
    )}>
      {dir === 'inbound'  && <ArrowDownLeft  size={8} />}
      {dir === 'outbound' && <ArrowUpRight   size={8} />}
      {dir === 'system'   && <Activity       size={8} />}
      {dir}
    </span>
  );

  /* ── Status icon for message ── */
  const MsgStatusIcon = ({ s }: { s: WsMessage['status'] }) => {
    if (s === 'pending')    return <Loader       size={9} className="text-rp-yellow animate-spin flex-shrink-0" />;
    if (s === 'success')    return <CheckCircle  size={9} className="text-rp-green flex-shrink-0" />;
    if (s === 'error')      return <XCircle      size={9} className="text-rp-red flex-shrink-0" />;
    if (s === 'dispatched') return <Activity     size={9} className="text-rp-cyan flex-shrink-0" />;
    if (s === 'sent')       return <ArrowUpRight size={9} className="text-rp-yellow flex-shrink-0" />;
    return                         <Activity     size={9} className="text-rp-muted flex-shrink-0" />;
  };

  return (
    <div className="p-5 space-y-4 max-w-6xl">
      {/* Page header */}
      <div>
        <h2 className="text-sm font-semibold text-rp-text">Module 5 — WebSocket Connection Manager</h2>
        <p className="text-[11px] text-rp-muted font-mono mt-0.5">
          Real-time relay bridge —{' '}
          <span className="text-rp-cyan">ws://relay → auto-dispatch → bridge → ws://relay</span>
          {' '}round-trip with no API key
        </p>
      </div>

      {/* ── Top bar: status + stats ───────────────────── */}
      <div
        className="terminal-panel cursor-pointer"
        onClick={() => setStatsOpen((o) => !o)}
      >
        <div className="terminal-header select-none">
          <Wifi size={11} className={cn(
            status === 'connected' ? 'text-rp-green' :
            status === 'disconnected' ? 'text-rp-muted' : 'text-rp-yellow'
          )} />
          <span className="text-rp-muted text-[10px] font-mono">websocket-manager</span>
          <div className="ml-3">
            <StatusDot />
          </div>
          {status === 'connected' && (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-rp-green/10 border border-rp-green/20 text-rp-green text-[9px] font-mono">
              LIVE
            </span>
          )}
          <span className="ml-auto text-rp-muted">
            {statsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </span>
        </div>
        {statsOpen && (
          <div className="grid grid-cols-4 gap-px bg-rp-border">
            {[
              { label: 'Total Messages', value: stats.total,    color: 'text-rp-text' },
              { label: 'Inbound',        value: stats.inbound,  color: 'text-rp-cyan' },
              { label: 'Outbound',       value: stats.outbound, color: 'text-rp-yellow' },
              { label: 'Errors',         value: stats.errors,   color: stats.errors > 0 ? 'text-rp-red' : 'text-rp-muted' },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-rp-surface px-4 py-2.5 text-center">
                <div className={cn('text-lg font-bold font-mono leading-none', color)}>{value}</div>
                <div className="text-[9px] text-rp-muted font-mono mt-1 uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Main grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-4">

        {/* ── LEFT COLUMN ── Config + Manual Sender ─── */}
        <div className="space-y-3">

          {/* Connection config */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <Plug size={11} className="text-rp-muted" />
              <span className="text-rp-muted text-[10px] font-mono">connection-config</span>
            </div>
            <div className="p-4 space-y-3">

              {/* WebSocket URL */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  WebSocket URL
                </label>
                <input
                  type="text"
                  value={config.url}
                  onChange={(e) => setConfig((c) => ({ ...c, url: e.target.value }))}
                  disabled={status === 'connected'}
                  placeholder="ws://localhost:3001/ws"
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="text-[9px] font-mono text-rp-muted mt-1">
                  Your relay server WebSocket endpoint — the bridge listens on this socket
                </div>
              </div>

              {/* Auth token */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  Auth Token
                </label>
                <input
                  type="password"
                  value={config.token}
                  onChange={(e) => setConfig((c) => ({ ...c, token: e.target.value }))}
                  disabled={status === 'connected'}
                  placeholder="rp_live_••••••••••••••••"
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <div className="text-[9px] font-mono text-rp-muted mt-1">
                  Passed as WebSocket sub-protocol token — used by relay to authenticate this bridge
                </div>
              </div>

              {/* Auto-reconnect + interval */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setConfig((c) => ({ ...c, autoReconnect: !c.autoReconnect }))}
                    className={cn(
                      'w-8 h-4 rounded-full border transition-all relative cursor-pointer',
                      config.autoReconnect
                        ? 'bg-rp-cyan/20 border-rp-cyan/40'
                        : 'bg-rp-surface border-rp-border'
                    )}
                  >
                    <span className={cn(
                      'absolute top-0.5 w-3 h-3 rounded-full transition-all',
                      config.autoReconnect ? 'left-4 bg-rp-cyan' : 'left-0.5 bg-rp-muted'
                    )} />
                  </div>
                  <span className="text-[10px] font-mono text-rp-muted">Auto-reconnect</span>
                </label>
                {config.autoReconnect && (
                  <div className="flex items-center gap-1.5 text-[10px] font-mono text-rp-muted">
                    <span>every</span>
                    <select
                      value={config.reconnectIntervalMs}
                      onChange={(e) => setConfig((c) => ({ ...c, reconnectIntervalMs: Number(e.target.value) }))}
                      className="bg-rp-bg border border-rp-border rounded px-1.5 py-0.5 text-rp-cyan text-[10px] font-mono focus:outline-none"
                    >
                      {[1000, 2000, 3000, 5000, 10000].map((ms) => (
                        <option key={ms} value={ms}>{ms / 1000}s</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Connect / Disconnect buttons */}
              <div className="flex gap-2 pt-1">
                {status === 'connected' || status === 'connecting' || status === 'reconnecting' ? (
                  <button
                    onClick={disconnect}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-red/30 bg-rp-red/10 text-rp-red text-xs font-mono hover:bg-rp-red/20 transition-all"
                  >
                    <Unplug size={11} />
                    Disconnect
                  </button>
                ) : (
                  <button
                    onClick={connect}
                    disabled={!config.url}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all disabled:opacity-40"
                  >
                    <Plug size={11} />
                    Connect
                  </button>
                )}
                <button
                  onClick={clearLog}
                  title="Clear message log"
                  className="px-3 py-2.5 rounded border border-rp-border bg-rp-surface text-rp-muted hover:text-rp-text text-xs font-mono transition-all"
                >
                  <Trash2 size={11} />
                </button>
              </div>

              {/* Relay server note */}
              {status === 'disconnected' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded border border-rp-border bg-rp-surface text-[9px] font-mono text-rp-muted">
                  <AlertCircle size={9} className="text-rp-yellow mt-0.5 flex-shrink-0" />
                  <span>
                    Use the <span className="text-rp-cyan">revenue-pulse-relay.js</span> template from the{' '}
                    <span className="text-rp-yellow">Webhook Relay</span> page — add{' '}
                    <span className="text-rp-cyan">wss://</span> support to the relay server and point this form at it.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Manual command sender */}
          <div className="terminal-panel">
            <button
              className="terminal-header w-full flex items-center gap-2 hover:bg-rp-surface/60 transition-colors cursor-pointer"
              onClick={() => setManualOpen((o) => !o)}
            >
              <Terminal size={11} className="text-rp-green" />
              <span className="text-rp-green text-[10px] font-mono">manual-sender — test round-trip</span>
              <span className="ml-auto text-rp-muted">
                {manualOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </span>
            </button>

            {manualOpen && (
              <div className="p-4 space-y-3">
                {/* Preset buttons */}
                <div>
                  <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                    Command Presets
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {COMMAND_PRESETS.map((p, idx) => (
                      <button
                        key={idx}
                        onClick={() => applyPreset(idx)}
                        className={cn(
                          'px-2 py-1 rounded border text-[9px] font-mono transition-all',
                          selectedPreset === idx
                            ? 'bg-rp-green/10 border-rp-green/30 text-rp-green'
                            : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text hover:border-rp-muted/30'
                        )}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Payload editor */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-mono text-rp-muted uppercase tracking-wider">
                      Payload (JSON)
                    </label>
                    <button
                      onClick={() => copyText(customPayload)}
                      className="flex items-center gap-1 text-[9px] font-mono text-rp-muted hover:text-rp-cyan transition-colors"
                    >
                      <Copy size={8} /> copy
                    </button>
                  </div>
                  <textarea
                    value={customPayload}
                    onChange={(e) => validatePayload(e.target.value)}
                    rows={8}
                    spellCheck={false}
                    className={cn(
                      'w-full bg-rp-bg border rounded px-3 py-2.5 text-[10px] font-mono text-rp-text resize-none focus:outline-none focus:ring-1 transition-all leading-relaxed',
                      payloadError
                        ? 'border-rp-red/40 focus:border-rp-red/60 focus:ring-rp-red/20'
                        : 'border-rp-border focus:border-rp-cyan/40 focus:ring-rp-cyan/20'
                    )}
                  />
                  {payloadError && (
                    <div className="flex items-center gap-1.5 text-[9px] font-mono text-rp-red mt-1">
                      <XCircle size={9} /> {payloadError}
                    </div>
                  )}
                </div>

                {/* Send button */}
                <button
                  onClick={handleSend}
                  disabled={!!payloadError || sending || status !== 'connected'}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-green/30 bg-rp-green/10 text-rp-green text-xs font-mono hover:bg-rp-green/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? (
                    <Loader size={11} className="animate-spin" />
                  ) : (
                    <Send size={11} />
                  )}
                  {sending ? 'Sending…' : status !== 'connected' ? 'Connect first' : 'Send Command'}
                </button>

                <div className="text-[9px] font-mono text-rp-muted leading-relaxed">
                  The bridge auto-dispatches inbound commands and streams results back via the same socket.
                  Use the manual sender to simulate what the relay server sends to this bridge.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN ── Message log ─────────────── */}
        <div className="terminal-panel flex flex-col min-h-[600px]">
          {/* Log header */}
          <div className="terminal-header flex-shrink-0">
            <Activity size={11} className={cn(status === 'connected' ? 'text-rp-green animate-pulse' : 'text-rp-muted')} />
            <span className="text-rp-muted text-[10px] font-mono">live-message-log</span>
            <span className="ml-2 text-[9px] font-mono text-rp-muted">
              {messages.length} messages
            </span>
            <div className="ml-auto flex items-center gap-3">
              <div className="flex items-center gap-2 text-[9px] font-mono">
                <span className="flex items-center gap-1 text-rp-cyan"><ArrowDownLeft size={8} />inbound</span>
                <span className="flex items-center gap-1 text-rp-yellow"><ArrowUpRight size={8} />outbound</span>
                <span className="flex items-center gap-1 text-rp-purple"><Activity size={8} />system</span>
              </div>
              <button
                onClick={clearLog}
                className="flex items-center gap-1 text-[9px] font-mono text-rp-muted hover:text-rp-text transition-colors"
              >
                <RotateCcw size={8} /> clear
              </button>
            </div>
          </div>

          {/* Scrollable log */}
          <div
            ref={logRef}
            className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-[10px]"
          >
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-rp-muted space-y-2 py-16">
                <WifiOff size={24} className="text-rp-muted/30" />
                <div className="text-center space-y-1">
                  <div className="text-xs">No messages yet.</div>
                  <div className="text-[10px] text-rp-muted/60">
                    {status === 'connected' ? 'Waiting for incoming commands from relay…' : 'Connect to a relay server to start receiving commands.'}
                  </div>
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageRow key={msg.id} msg={msg} onCopy={copyText} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Protocol reference ─────────────────────────── */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <Activity size={11} className="text-rp-muted" />
          <span className="text-rp-muted text-[10px] font-mono">ws-protocol-reference — message schemas</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-rp-border">
          {[
            {
              label: 'INBOUND — relay → bridge',
              color: 'text-rp-cyan',
              border: 'border-rp-cyan/20',
              schema: `{\n  "action": "inject_order",\n  "correlation_id": "req-abc123",\n  "payload": {\n    "selector": "[data-item-id=\\"pos-item-001\\"]",\n    "modifications": []\n  }\n}`,
            },
            {
              label: 'OUTBOUND — bridge → relay',
              color: 'text-rp-yellow',
              border: 'border-rp-yellow/20',
              schema: `{\n  "type": "bridge_response",\n  "correlation_id": "req-abc123",\n  "action": "inject_order",\n  "result": {\n    "status": "success",\n    "data": { ... }\n  },\n  "ts": "2026-07-18T..."\n}`,
            },
            {
              label: 'HANDSHAKE — on connect',
              color: 'text-rp-purple',
              border: 'border-rp-purple/20',
              schema: `{\n  "type": "handshake",\n  "client": "revenue-pulse-bridge",\n  "version": "1.0",\n  "token": "rp_live_...",\n  "ts": "2026-07-18T..."\n}`,
            },
          ].map(({ label, color, border, schema }) => (
            <div key={label} className={cn('bg-rp-surface p-3 space-y-1.5')}>
              <div className={cn('text-[9px] font-mono font-bold uppercase tracking-wider', color)}>{label}</div>
              <pre className={cn('text-[9px] font-mono leading-relaxed overflow-x-auto', color + '/60')}>
                <code>{schema}</code>
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Message row sub-component ────────────────────────── */
function MessageRow({ msg, onCopy }: { msg: WsMessage; onCopy: (t: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetail = !!msg.result || msg.raw.length > 100;
  const preview = msg.raw.length > 90 ? msg.raw.slice(0, 90) + '…' : msg.raw;

  return (
    <div
      className={cn(
        'rounded border transition-all',
        msg.direction === 'inbound'  && msg.status === 'success' && 'border-rp-cyan/10 bg-rp-cyan/[0.03]',
        msg.direction === 'inbound'  && msg.status === 'error'   && 'border-rp-red/10  bg-rp-red/[0.03]',
        msg.direction === 'inbound'  && msg.status === 'pending' && 'border-rp-yellow/10 bg-rp-yellow/[0.03]',
        msg.direction === 'outbound' && 'border-rp-yellow/10 bg-rp-yellow/[0.02]',
        msg.direction === 'system'   && 'border-rp-border bg-transparent',
      )}
    >
      <div className="flex items-start gap-2 px-2.5 py-1.5">
        {/* Dir badge */}
        <span className={cn(
          'flex items-center gap-0.5 text-[9px] font-mono font-bold uppercase tracking-wider flex-shrink-0 w-14 mt-0.5',
          msg.direction === 'inbound'  && 'text-rp-cyan',
          msg.direction === 'outbound' && 'text-rp-yellow',
          msg.direction === 'system'   && 'text-rp-purple',
        )}>
          {msg.direction === 'inbound'  && <ArrowDownLeft  size={7} />}
          {msg.direction === 'outbound' && <ArrowUpRight   size={7} />}
          {msg.direction === 'system'   && <Activity       size={7} />}
          {msg.direction}
        </span>

        {/* Status icon */}
        <div className="flex-shrink-0 mt-0.5">
          {msg.status === 'pending'    && <Loader       size={9} className="text-rp-yellow animate-spin" />}
          {msg.status === 'success'    && <CheckCircle  size={9} className="text-rp-green" />}
          {msg.status === 'error'      && <XCircle      size={9} className="text-rp-red" />}
          {msg.status === 'sent'       && <ArrowUpRight size={9} className="text-rp-yellow" />}
          {msg.status === 'info'       && <Activity     size={9} className="text-rp-muted" />}
          {msg.status === 'dispatched' && <Activity     size={9} className="text-rp-cyan" />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {msg.action && (
              <span className={cn(
                'text-[9px] font-mono font-semibold px-1 py-0.5 rounded',
                msg.direction === 'inbound'  ? 'bg-rp-cyan/10 text-rp-cyan' :
                msg.direction === 'outbound' ? 'bg-rp-yellow/10 text-rp-yellow' :
                'bg-rp-purple/10 text-rp-purple'
              )}>{msg.action}</span>
            )}
            <span className="text-rp-text truncate flex-1">{preview}</span>
            {msg.latencyMs !== undefined && (
              <span className="text-[9px] font-mono text-rp-muted flex-shrink-0">{msg.latencyMs}ms</span>
            )}
          </div>
          {expanded && (
            <div className="mt-1.5 space-y-1.5 animate-fade-in">
              <pre className="text-[9px] font-mono text-rp-muted leading-relaxed whitespace-pre-wrap break-all bg-rp-bg rounded p-2 border border-rp-border overflow-x-auto">
                {msg.raw.length < 2000 ? msg.raw : msg.raw.slice(0, 2000) + '\n… (truncated)'}
              </pre>
              {msg.result && (
                <div>
                  <div className="text-[9px] font-mono text-rp-green mb-1 uppercase tracking-wider">
                    Bridge Result:
                  </div>
                  <pre className="text-[9px] font-mono text-rp-green/70 leading-relaxed whitespace-pre-wrap break-all bg-rp-bg rounded p-2 border border-rp-green/20 overflow-x-auto max-h-48">
                    {msg.result}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <span className="text-[9px] font-mono text-rp-muted flex-shrink-0 mt-0.5">{tsLabel(msg.timestamp)}</span>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => onCopy(msg.raw)}
            className="p-1 rounded hover:bg-rp-surface text-rp-muted hover:text-rp-cyan transition-colors"
            title="Copy raw message"
          >
            <Copy size={8} />
          </button>
          {hasDetail && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="p-1 rounded hover:bg-rp-surface text-rp-muted hover:text-rp-text transition-colors"
              title={expanded ? 'Collapse' : 'Expand'}
            >
              {expanded ? <ChevronUp size={8} /> : <ChevronDown size={8} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
