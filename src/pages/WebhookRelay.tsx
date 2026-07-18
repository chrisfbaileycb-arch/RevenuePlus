
import { useState, useRef, useEffect } from 'react';
import { Radio, Play, CheckCircle, XCircle, ChevronRight, Copy, RotateCcw, Zap, Phone, Server, Globe } from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { dispatchCommand } from '@/lib/agentBridge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { MOCK_MENU } from '@/constants/mockData';

/* ── Types ───────────────────────────────────────────── */
interface RelayConfig {
  relayUrl: string;
  apiKey: string;
  provider: 'vapi' | 'bland' | 'retell' | 'custom';
}

interface RelayEvent {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  label: string;
  payload: string;
  status: 'pending' | 'success' | 'error';
  timestamp: string;
  latencyMs?: number;
}

/* ── Sample webhook payloads ─────────────────────────── */
const SAMPLE_PAYLOADS: Record<RelayConfig['provider'], object> = {
  vapi: {
    message: {
      type: 'function-call',
      functionCall: {
        name: 'inject_order',
        parameters: {
          selector: '[data-item-id="item-001"]',
          modifications: [],
          customer_phone: '5550101',
        },
      },
    },
  },
  bland: {
    call_id: 'bland-' + Math.random().toString(36).slice(2, 10),
    action: 'inject_order',
    data: {
      selector: '[data-item-id="item-001"]',
      modifications: [],
      customer_phone: '5550101',
    },
  },
  retell: {
    event: 'agent_action',
    call_id: 'retell-' + Math.random().toString(36).slice(2, 10),
    action_name: 'inject_order',
    parameters: {
      selector: '[data-item-id="item-001"]',
      modifications: [],
    },
  },
  custom: {
    source: 'revenuePulse-agent',
    command: {
      action: 'inject_order',
      payload: {
        selector: '[data-item-id="item-001"]',
        modifications: [],
      },
    },
  },
};

/* ── Call flow steps ─────────────────────────────────── */
const CALL_FLOW_STEPS = [
  { id: 1, icon: Phone,  label: 'Customer Calls',      desc: 'AI voice agent answers the phone call via Vapi / Bland / Retell' },
  { id: 2, icon: Globe,  label: 'AI Parses Intent',    desc: 'Voice AI transcribes order, maps items to menu selectors' },
  { id: 3, icon: Server, label: 'Webhook POST Fired',  desc: 'AI agent sends POST /api/inject-order to your relay server' },
  { id: 4, icon: Radio,  label: 'Relay Dispatches',    desc: 'Relay server calls window.revenuePulse.injectOrder(selector)' },
  { id: 5, icon: Zap,    label: 'POS Cart Updated',    desc: 'DOM event fires on the POS interface — order in cart, no API key' },
];

export default function WebhookRelay() {
  const { addCommandLog } = useAgentStore();

  const [config, setConfig] = useState<RelayConfig>({
    relayUrl: 'https://your-relay.example.com',
    apiKey: '',
    provider: 'vapi',
  });
  const [savedConfig, setSavedConfig] = useState(false);
  const [testing, setTesting] = useState(false);
  const [events, setEvents] = useState<RelayEvent[]>([]);
  const [selectedItem, setSelectedItem] = useState(MOCK_MENU[0]?.id || '');
  const [activeStep, setActiveStep] = useState<number | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [events]);

  const addEvent = (ev: Omit<RelayEvent, 'id' | 'timestamp'>) => {
    setEvents((prev) => [
      ...prev,
      { ...ev, id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString() },
    ]);
  };

  const copyPayload = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const handleSaveConfig = () => {
    if (!config.relayUrl || config.relayUrl === 'https://your-relay.example.com') {
      toast.error('Enter a valid relay server URL first');
      return;
    }
    setSavedConfig(true);
    toast.success('Relay config saved — ready to test');
    addCommandLog({
      input: `relay.configure ${config.provider} ${config.relayUrl}`,
      output: `✓ Relay configured: ${config.provider.toUpperCase()} → ${config.relayUrl}`,
      type: 'success',
      timestamp: new Date().toISOString(),
    });
  };

  const handleLiveTest = async () => {
    if (testing) return;
    setTesting(true);
    setEvents([]);
    setActiveStep(null);

    const item = MOCK_MENU.find((m) => m.id === selectedItem) || MOCK_MENU[0];
    const selector = `[data-item-id="${item.id.replace('menu-', 'item-')}"]`;
    const payload = {
      ...SAMPLE_PAYLOADS[config.provider],
    };

    // Update selector in payload to match selection
    const payloadStr = JSON.stringify(payload, null, 2).replace(
      '[data-item-id="item-001"]',
      selector
    );

    // Animate through the call flow
    const steps = [
      async () => {
        setActiveStep(1);
        addEvent({ direction: 'inbound', label: 'INCOMING CALL', payload: `Customer places order: "${item.name}"`, status: 'success' });
        await delay(500);
      },
      async () => {
        setActiveStep(2);
        addEvent({
          direction: 'internal',
          label: 'AI INTENT PARSE',
          payload: `Matched: "${item.name}" → ${selector}`,
          status: 'success',
        });
        await delay(600);
      },
      async () => {
        setActiveStep(3);
        const t0 = Date.now();
        addEvent({
          direction: 'outbound',
          label: `POST ${config.relayUrl}/api/inject-order`,
          payload: payloadStr,
          status: 'pending',
        });
        await delay(700);
        const latency = Date.now() - t0;
        setEvents((prev) =>
          prev.map((e) =>
            e.label.startsWith('POST') && e.status === 'pending'
              ? { ...e, status: 'success', latencyMs: latency }
              : e
          )
        );
      },
      async () => {
        setActiveStep(4);
        addEvent({
          direction: 'inbound',
          label: 'RELAY DISPATCH',
          payload: `window.revenuePulse.injectOrder("${selector}")`, // Removed the extra comma here
          status: 'pending',
        });
        await delay(400);

        // Actually fire the bridge command
        const result = dispatchCommand({
          action: 'inject_order',
          payload: { selector, modifications: [] },
        });

        addCommandLog({
          input: `relay.test inject_order ${selector}`,
          output: result.status === 'success'
            ? `✓ Live test success — "${item.name}" injected via relay simulation`
            : `✗ Injection failed: ${result.error}`,
          type: result.status === 'success' ? 'success' : 'error',
          timestamp: new Date().toISOString(),
        });

        setEvents((prev) =>
          prev.map((e) =>
            e.label === 'RELAY DISPATCH' && e.status === 'pending'
              ? { ...e, status: result.status === 'success' ? 'success' : 'error' }
              : e
          )
        );
      },
      async () => {
        setActiveStep(5);
        addEvent({
          direction: 'internal',
          label: 'POS DOM UPDATE',
          payload: `MouseEvent("click") fired on ${selector} → item added to cart`,
          status: 'success',
        });
        await delay(300);
        setActiveStep(null);
      },
    ];

    for (const step of steps) {
      await step();
    }

    setTesting(false);
    toast.success(`Live relay test complete — "${item.name}" injected into POS cart`);
  };

  const handleReset = () => {
    setEvents([]);
    setActiveStep(null);
    addCommandLog({
      input: 'relay.reset',
      output: '✓ Relay event log cleared',
      type: 'system',
      timestamp: new Date().toISOString(),
    });
  };

  const currentPayload = JSON.stringify(SAMPLE_PAYLOADS[config.provider], null, 2);

  return (
    <div className="p-5 space-y-5 max-w-5xl">
      {/* Header */}
      <div>
        <h2 className="text-sm font-semibold text-rp-text">Module 4 — Vapi / Bland.ai Webhook Relay</h2>
        <p className="text-[11px] text-rp-muted font-mono mt-0.5">
          Configure your AI voice agent relay server — test the full{' '}
          <span className="text-rp-cyan">phone call → POST webhook → window.injectAIOrder()</span> pipeline in real time
        </p>
      </div>

      {/* ── Call Flow Diagram ─────────────────────── */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <Radio size={11} className="text-rp-cyan" />
          <span className="text-rp-cyan text-[10px] font-mono">call-flow — end-to-end order pipeline</span>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-0 overflow-x-auto pb-2">
            {CALL_FLOW_STEPS.map((step, idx) => (
              <div key={step.id} className="flex items-center min-w-0">
                <div
                  className={cn(
                    'flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-lg border transition-all min-w-[100px]',
                    activeStep === step.id
                      ? 'bg-rp-cyan/10 border-rp-cyan/40 scale-105'
                      : activeStep !== null && activeStep > step.id
                      ? 'bg-rp-green/5 border-rp-green/20'
                      : 'bg-rp-surface border-rp-border'
                  )}
                >
                  <step.icon
                    size={14}
                    className={cn(
                      'transition-colors',
                      activeStep === step.id
                        ? 'text-rp-cyan animate-pulse'
                        : activeStep !== null && activeStep > step.id
                        ? 'text-rp-green'
                        : 'text-rp-muted'
                    )}
                  />
                  <div className="text-center">
                    <div
                      className={cn(
                        'text-[10px] font-semibold leading-none',
                        activeStep === step.id
                          ? 'text-rp-cyan'
                          : activeStep !== null && activeStep > step.id
                          ? 'text-rp-green'
                          : 'text-rp-text'
                      )}
                    >
                      {step.label}
                    </div>
                    <div className="text-[9px] text-rp-muted mt-0.5 leading-snug max-w-[90px]">{step.desc}</div>
                  </div>
                </div>
                {idx < CALL_FLOW_STEPS.length - 1 && (
                  <ChevronRight
                    size={12}
                    className={cn(
                      'mx-1 flex-shrink-0 transition-colors',
                      activeStep !== null && activeStep > step.id ? 'text-rp-green' : 'text-rp-border'
                    )}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ── Left: Relay Config Form ────────────────── */}
        <div className="space-y-3">
          <div className="terminal-panel">
            <div className="terminal-header">
              <Server size={11} className="text-rp-muted" />
              <span className="text-rp-muted text-[10px] font-mono">relay-configuration</span>
            </div>
            <div className="p-4 space-y-3">
              {/* Provider selector */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  AI Voice Provider
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {(['vapi', 'bland', 'retell', 'custom'] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setConfig((c) => ({ ...c, provider: p }))}
                      className={cn(
                        'px-2 py-1.5 rounded border text-[10px] font-mono uppercase tracking-wider transition-all',
                        config.provider === p
                          ? 'bg-rp-cyan/10 border-rp-cyan/40 text-rp-cyan'
                          : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text hover:border-rp-muted/30'
                      )}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Relay URL */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  Relay Server URL
                </label>
                <input
                  type="url"
                  value={config.relayUrl}
                  onChange={(e) => setConfig((c) => ({ ...c, relayUrl: e.target.value }))}
                  placeholder="https://your-relay.example.com"
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                />
                <div className="text-[9px] font-mono text-rp-muted mt-1">
                  Your relay server that receives Vapi/Bland webhook POSTs and calls window.injectAIOrder()
                </div>
              </div>

              {/* API Key */}
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  API Key / Bearer Token
                </label>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(e) => setConfig((c) => ({ ...c, apiKey: e.target.value }))}
                  placeholder="rp_live_••••••••••••••••"
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                />
                <div className="text-[9px] font-mono text-rp-muted mt-1">
                  Passed as <span className="text-rp-yellow">Authorization: Bearer &lt;key&gt;</span> on all relay requests
                </div>
              </div>

              <button
                onClick={handleSaveConfig}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all"
              >
                <CheckCircle size={11} />
                Save Relay Config
              </button>

              {savedConfig && (
                <div className="flex items-center gap-2 px-3 py-2 rounded bg-rp-green/5 border border-rp-green/20 text-rp-green text-[10px] font-mono animate-fade-in">
                  <CheckCircle size={10} />
                  Configured: {config.provider.toUpperCase()} relay at {config.relayUrl}
                </div>
              )}
            </div>
          </div>

          {/* Live test controls */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <Zap size={11} className="text-rp-green" />
              <span className="text-rp-green text-[10px] font-mono">live-test — fire inject_order webhook</span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                  Select Menu Item to Order
                </label>
                <select
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                >
                  {MOCK_MENU.filter((m) => m.available).map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} — ${item.price.toFixed(2)} [{item.category}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleLiveTest}
                  disabled={testing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-green/30 bg-rp-green/10 text-rp-green text-xs font-mono hover:bg-rp-green/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play size={11} className={testing ? 'animate-pulse' : ''} />
                  {testing ? 'Running test...' : 'Run Live Test'}
                </button>
                <button
                  onClick={handleReset}
                  disabled={testing}
                  className="px-3 py-2.5 rounded border border-rp-border bg-rp-surface text-rp-muted hover:text-rp-text text-xs font-mono transition-all disabled:opacity-50"
                >
                  <RotateCcw size={11} />
                </button>
              </div>

              <div className="text-[9px] font-mono text-rp-muted leading-relaxed">
                Simulates the full call flow locally — animates each step, calls{' '}
                <span className="text-rp-cyan">window.revenuePulse.injectOrder()</span> directly, and shows the live{' '}
                <span className="text-rp-green">InjectionResult</span> in the event log.
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Payload preview + Event log ──── */}
        <div className="space-y-3">
          {/* Webhook payload preview */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <Globe size={11} className="text-rp-muted" />
              <span className="text-rp-muted text-[10px] font-mono">
                {config.provider.toUpperCase()} webhook payload — POST /api/inject-order
              </span>
              <button
                onClick={() => copyPayload(currentPayload)}
                className="ml-auto flex items-center gap-1 text-[9px] font-mono text-rp-muted hover:text-rp-cyan transition-colors"
              >
                <Copy size={9} />
                copy
              </button>
            </div>
            <pre className="p-3 text-[10px] font-mono text-rp-muted leading-relaxed overflow-x-auto max-h-48">
              <code>{currentPayload}</code>
            </pre>
          </div>

          {/* Three webhook reference */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <Server size={11} className="text-rp-muted" />
              <span className="text-rp-muted text-[10px] font-mono">required relay endpoints</span>
            </div>
            <div className="p-3 space-y-2">
              {[
                {
                  method: 'POST',
                  path: '/api/inject-order',
                  color: 'text-rp-green',
                  border: 'border-rp-green/20 bg-rp-green/5',
                  desc: 'AI fires this with selector + mods → relay calls window.injectAIOrder()',
                  body: '{ "selector": "[data-item-id=\\"item-001\\"]", "modifications": [] }',
                },
                {
                  method: 'GET',
                  path: '/api/customer-lookup?phone=5550101',
                  color: 'text-rp-cyan',
                  border: 'border-rp-cyan/20 bg-rp-cyan/5',
                  desc: 'AI calls this pre-order → relay runs window.revenuePulse.lookupCustomer(phone)',
                  body: '→ { "profile_exists": true, "payment_token": "tok_xxx", "name": "Jane" }',
                },
                {
                  method: 'GET',
                  path: '/api/menu-schema',
                  color: 'text-rp-yellow',
                  border: 'border-rp-yellow/20 bg-rp-yellow/5',
                  desc: 'AI loads this at call start → relay returns window.revenuePulse.extractMenu()',
                  body: '→ [{ "item_name": "...", "item_price": 9.99, "pos_element_selector": "..." }]',
                },
              ].map(({ method, path, color, border, desc, body }) => (
                <div key={path} className={cn('rounded border p-2.5 space-y-1', border)}>
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[9px] font-mono font-bold w-8 flex-shrink-0', color)}>{method}</span>
                    <code className={cn('text-[10px] font-mono', color)}>{path}</code>
                  </div>
                  <div className="text-[9px] text-rp-muted pl-10">{desc}</div>
                  <pre className={cn('text-[9px] font-mono pl-10 leading-relaxed', color + '/70')}>{body}</pre>
                </div>
              ))}
            </div>
          </div>

          {/* Event log */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <Radio size={11} className={events.length > 0 ? 'text-rp-cyan animate-pulse' : 'text-rp-muted'} />
              <span className="text-rp-muted text-[10px] font-mono">relay-event-log</span>
              {events.length > 0 && (
                <span className="ml-auto text-[9px] font-mono text-rp-muted">{events.length} events</span>
              )}
            </div>
            <div
              ref={logRef}
              className="h-48 overflow-y-auto p-3 space-y-1.5 font-mono text-[10px]"
            >
              {events.length === 0 ? (
                <div className="text-rp-muted text-center py-8">
                  Run the live test to see events here.
                </div>
              ) : (
                events.map((ev) => (
                  <div key={ev.id} className="flex flex-col gap-0.5 animate-slide-in">
                    <div className="flex items-center gap-2">
                      {ev.status === 'success' ? (
                        <CheckCircle size={9} className="text-rp-green flex-shrink-0" />
                      ) : ev.status === 'error' ? (
                        <XCircle size={9} className="text-rp-red flex-shrink-0" />
                      ) : (
                        <span className="w-[9px] h-[9px] rounded-full border border-rp-yellow flex-shrink-0 animate-pulse" />
                      )}
                      <span
                        className={cn(
                          'font-semibold text-[9px] uppercase tracking-wider',
                          ev.direction === 'inbound'
                            ? 'text-rp-cyan'
                            : ev.direction === 'outbound'
                            ? 'text-rp-yellow'
                            : 'text-rp-purple'
                        )}
                      >
                        [{ev.direction.toUpperCase()}]
                      </span>
                      <span className="text-rp-text truncate">{ev.label}</span>
                      {ev.latencyMs && (
                        <span className="text-rp-muted ml-auto flex-shrink-0">{ev.latencyMs}ms</span>
                      )}
                    </div>
                    <div className="pl-5 text-rp-muted leading-relaxed break-all">
                      {ev.payload.length > 120 ? (
                        <details>
                          <summary className="cursor-pointer hover:text-rp-text">
                            {ev.payload.slice(0, 80)}… <span className="text-rp-cyan">[expand]</span>
                          </summary>
                          <pre className="mt-1 whitespace-pre-wrap">{ev.payload}</pre>
                        </details>
                      ) : (
                        ev.payload
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Relay server code snippet */}
      <div className="terminal-panel">
        <div className="terminal-header">
          <Server size={11} className="text-rp-muted" />
          <span className="text-rp-muted text-[10px] font-mono">relay-server-template — Node.js / Express</span>
          <button
            onClick={() => copyPayload(RELAY_SERVER_SNIPPET)}
            className="ml-auto flex items-center gap-1 text-[9px] font-mono text-rp-muted hover:text-rp-cyan transition-colors"
          >
            <Copy size={9} />
            copy snippet
          </button>
        </div>
        <pre className="p-4 text-[10px] font-mono text-rp-muted leading-relaxed overflow-x-auto max-h-64">
          <code>{RELAY_SERVER_SNIPPET}</code>
        </pre>
      </div>
    </div>
  );
}

/* ── Relay server code template ──────────────────────── */
const RELAY_SERVER_SNIPPET = `// revenue-pulse-relay.js — Node.js / Express relay server
// Receives webhooks from Vapi / Bland / Retell, dispatches to Revenue Pulse bridge

const express = require('express');
const app = express();
app.use(express.json());

const API_KEY = process.env.RP_API_KEY || 'rp_live_your_key_here';
const POS_PAGE_ORIGIN = process.env.POS_PAGE_ORIGIN || 'https://your-pos-page.com';

// ── Auth middleware ──
function auth(req, res, next) {
  const key = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// ── Webhook 1: POST /api/inject-order ──
// Called by AI agent to add item to POS cart (no POS API key needed)
app.post('/api/inject-order', auth, (req, res) => {
  const { selector, modifications = [], customer_phone } = req.body;
  if (!selector) return res.status(400).json({ error: 'selector required' });

  // Relay to the POS page via postMessage (page must have revenue-plus-agent.js loaded)
  broadcastToPos({ source: 'revenuePulse-agent', command: { action: 'inject_order', payload: { selector, modifications } } });

  res.json({ status: 'dispatched', selector, ts: new Date().toISOString() });
});

// ── Webhook 2: GET /api/customer-lookup ──
// Called by AI to resolve caller phone → saved profile
app.get('/api/customer-lookup', auth, (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone required' });

  // Option A: relay to live POS page DOM
  broadcastToPos({ source: 'revenuePulse-agent', command: { action: 'lookup_customer', payload: { phone } } });

  // Option B: query your own customer DB here
  res.json({ status: 'dispatched', phone, ts: new Date().toISOString() });
});

// ── Webhook 3: GET /api/menu-schema ──
// AI loads this at call start so it knows which selectors to use
app.get('/api/menu-schema', auth, (req, res) => {
  // Cache menu schema in-memory; refresh on demand
  if (cachedSchema.length) return res.json({ items: cachedSchema, cached: true });

  broadcastToPos({ source: 'revenuePulse-agent', command: { action: 'extract_menu', payload: {} } });
  res.json({ status: 'extraction_triggered', items: cachedSchema });
});

// ── Listen for Revenue Pulse bridge responses ──
// (Wire this via WebSocket or SSE between relay and POS page)
let cachedSchema = [];
function broadcastToPos(message) {
  // Your WebSocket / SSE implementation sends message to the POS browser tab
  console.log('[Relay] → POS:', JSON.stringify(message));
}

app.listen(3001, () => console.log('[Revenue Pulse Relay] Running on :3001'));
`;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
