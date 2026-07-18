import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity, CheckCircle, XCircle, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp, Clock, Wifi, WifiOff, Bell,
  Plus, Trash2, ToggleLeft, ToggleRight, Zap, Info,
  BellRing,
} from 'lucide-react';
import { useAgentStore } from '@/stores/agentStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Types ────────────────────────────────────────────── */
type HealthLevel = 'healthy' | 'degraded' | 'critical' | 'unknown';
type RuleCondition = 'eq' | 'lt' | 'gt' | 'lte' | 'gte' | 'missing';
type RuleSeverity = 'warn' | 'critical';
type BadgeColor = 'yellow' | 'red' | 'none';

interface AlertRule {
  id: string;
  label: string;
  checkKey: string;
  condition: RuleCondition;
  threshold: number;
  severity: RuleSeverity;
  enabled: boolean;
  actions: {
    logConsole: boolean;
    showToast: boolean;
    badgeColor: BadgeColor;
  };
}

interface CheckResult {
  key: string;
  label: string;
  selector: string;
  count: number;
  status: HealthLevel;
  message: string;
  lastChecked: string | null;
}

interface HealthSnapshot {
  ts: string;
  overall: HealthLevel;
  checks: CheckResult[];
}

/* ── Selector definitions ────────────────────────────── */
const HEALTH_CHECKS: {
  key: string;
  label: string;
  selector: string;
  minCount: number;
  warnCount: number;
}[] = [
  { key: 'container',  label: 'POS Container',       selector: '#pos-simulator',                       minCount: 1, warnCount: 1 },
  { key: 'items',      label: 'Menu Items',           selector: '#pos-simulator [data-item-id]',        minCount: 3, warnCount: 5 },
  { key: 'addButtons', label: 'Add-to-Cart Buttons',  selector: '#pos-simulator .add-to-cart',          minCount: 3, warnCount: 5 },
  { key: 'categories', label: 'Category Groups',      selector: '#pos-simulator [data-category]',       minCount: 2, warnCount: 3 },
  { key: 'prices',     label: 'Price Attributes',     selector: '#pos-simulator [data-item-price]',     minCount: 3, warnCount: 5 },
];

const CHECK_LABELS: Record<string, string> = Object.fromEntries(
  HEALTH_CHECKS.map((c) => [c.key, c.label])
);

/* ── DOM polling ─────────────────────────────────────── */
function runHealthChecks(): CheckResult[] {
  const ts = new Date().toISOString();
  return HEALTH_CHECKS.map(({ key, label, selector, minCount, warnCount }) => {
    let count = 0;
    let status: HealthLevel = 'unknown';
    let message = '';
    try {
      count = document.querySelectorAll(selector).length;
      if (count === 0) {
        status = 'critical';
        message = `Selector "${selector}" matched 0 elements`;
      } else if (count < warnCount) {
        status = 'degraded';
        message = `Only ${count} element${count !== 1 ? 's' : ''} found (expected ≥ ${warnCount})`;
      } else {
        status = 'healthy';
        message = `${count} element${count !== 1 ? 's' : ''} present`;
      }
    } catch (err) {
      status = 'critical';
      message = `Selector error: ${String(err)}`;
    }
    return { key, label, selector, count, status, message, lastChecked: ts };
  });
}

function computeOverall(checks: CheckResult[]): HealthLevel {
  if (checks.some((c) => c.status === 'critical')) return 'critical';
  if (checks.some((c) => c.status === 'degraded')) return 'degraded';
  if (checks.every((c) => c.status === 'healthy')) return 'healthy';
  return 'unknown';
}

/* ── Alert Rules persistence ─────────────────────────── */
const RULES_KEY = 'revenue-pulse:health-alert-rules';

function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY);
    return raw ? (JSON.parse(raw) as AlertRule[]) : [];
  } catch {
    return [];
  }
}

function persistRules(rules: AlertRule[]): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {}
}

/* ── Condition evaluation ────────────────────────────── */
function evalCondition(condition: RuleCondition, count: number, threshold: number): boolean {
  switch (condition) {
    case 'missing': return count === 0;
    case 'eq':  return count === threshold;
    case 'lt':  return count < threshold;
    case 'gt':  return count > threshold;
    case 'lte': return count <= threshold;
    case 'gte': return count >= threshold;
    default:    return false;
  }
}

const CONDITION_LABELS: Record<RuleCondition, string> = {
  missing: 'is missing (= 0)',
  eq:      '= (equals)',
  lt:      '< (less than)',
  gt:      '> (greater than)',
  lte:     '≤ (at most)',
  gte:     '≥ (at least)',
};

/* ── Status config ───────────────────────────────────── */
const STATUS: Record<HealthLevel, { label: string; dot: string; text: string; bg: string; border: string }> = {
  healthy:  { label: 'Healthy',  dot: 'bg-rp-green',  text: 'text-rp-green',  bg: 'bg-rp-green/5',  border: 'border-rp-green/20' },
  degraded: { label: 'Degraded', dot: 'bg-rp-yellow', text: 'text-rp-yellow', bg: 'bg-rp-yellow/5', border: 'border-rp-yellow/20' },
  critical: { label: 'Critical', dot: 'bg-rp-red',    text: 'text-rp-red',    bg: 'bg-rp-red/5',    border: 'border-rp-red/20' },
  unknown:  { label: 'Unknown',  dot: 'bg-rp-muted',  text: 'text-rp-muted',  bg: 'bg-rp-surface',  border: 'border-rp-border' },
};

const POLL_INTERVAL_MS = 30_000;

/* ── Blank rule factory ──────────────────────────────── */
function blankRule(): Omit<AlertRule, 'id'> {
  return {
    label: '',
    checkKey: 'items',
    condition: 'lt',
    threshold: 5,
    severity: 'warn',
    enabled: true,
    actions: { logConsole: true, showToast: true, badgeColor: 'yellow' },
  };
}

/* ── Component ────────────────────────────────────────── */
export function PosHealthMonitor() {
  const { addCommandLog } = useAgentStore();

  const [open, setOpen] = useState(true);
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [overall, setOverall] = useState<HealthLevel>('unknown');
  const [lastPollTs, setLastPollTs] = useState<string | null>(null);
  const [nextPollIn, setNextPollIn] = useState(POLL_INTERVAL_MS / 1000);
  const [polling, setPolling] = useState(true);
  const [manualPolling, setManualPolling] = useState(false);
  const [history, setHistory] = useState<HealthSnapshot[]>([]);

  /* Alert Rules state */
  const [rules, setRules] = useState<AlertRule[]>(() => loadRules());
  const [rulesOpen, setRulesOpen] = useState(false);
  const [addingRule, setAddingRule] = useState(false);
  const [newRule, setNewRule] = useState<Omit<AlertRule, 'id'>>(blankRule());
  const [triggeredRuleIds, setTriggeredRuleIds] = useState<Set<string>>(new Set());
  /* Badge color override from rule actions */
  const [ruleBadgeOverride, setRuleBadgeOverride] = useState<BadgeColor>('none');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* Keep rules ref for use inside poll (avoids stale closure) */
  const rulesRef = useRef<AlertRule[]>(rules);
  useEffect(() => { rulesRef.current = rules; }, [rules]);

  /* ── Evaluate alert rules against check results ── */
  const evaluateRules = useCallback(
    (checkResults: CheckResult[], ts: string) => {
      const active = rulesRef.current.filter((r) => r.enabled);
      if (!active.length) {
        setTriggeredRuleIds(new Set());
        setRuleBadgeOverride('none');
        return;
      }

      const triggered = new Set<string>();
      let worstBadge: BadgeColor = 'none';

      for (const rule of active) {
        const check = checkResults.find((c) => c.key === rule.checkKey);
        if (!check) continue;
        const fired = evalCondition(rule.condition, check.count, rule.threshold);
        if (!fired) continue;

        triggered.add(rule.id);

        const checkLabel = CHECK_LABELS[rule.checkKey] ?? rule.checkKey;
        const condLabel =
          rule.condition === 'missing'
            ? 'is missing'
            : `${rule.condition} ${rule.threshold}`;
        const ruleLabel = rule.label || `${checkLabel} ${condLabel}`;
        const severityTag = rule.severity === 'critical' ? '[CRITICAL]' : '[WARN]';

        if (rule.actions.logConsole) {
          addCommandLog({
            input: `pos-health.rule "${ruleLabel}"`,
            output: `${severityTag} ${checkLabel}: count=${check.count} — rule fired (${condLabel})`,
            type: rule.severity === 'critical' ? 'error' : 'info',
            timestamp: ts,
          });
        }

        if (rule.actions.showToast) {
          const fn = rule.severity === 'critical' ? toast.error : toast.warning;
          fn(`${severityTag} ${ruleLabel}`, {
            description: `${checkLabel}: ${check.count} element${check.count !== 1 ? 's' : ''} (rule: ${condLabel})`,
            duration: 5000,
          });
        }

        if (rule.actions.badgeColor !== 'none') {
          if (rule.actions.badgeColor === 'red' || worstBadge === 'none') {
            worstBadge = rule.actions.badgeColor;
          }
        }
      }

      setTriggeredRuleIds(triggered);
      setRuleBadgeOverride(worstBadge);
    },
    [addCommandLog]
  );

  /* ── Run a single poll ── */
  const poll = useCallback(
    (manual = false) => {
      if (manual) setManualPolling(true);
      const results = runHealthChecks();
      const newOverall = computeOverall(results);
      const ts = new Date().toISOString();

      setChecks(results);
      setOverall(newOverall);
      setLastPollTs(ts);
      setNextPollIn(POLL_INTERVAL_MS / 1000);
      setHistory((prev) => [{ ts, overall: newOverall, checks: results }, ...prev].slice(0, 20));

      const failures = results.filter((c) => c.status !== 'healthy');
      if (failures.length > 0) {
        failures.forEach((f) => {
          addCommandLog({
            input: `pos-health.check ${f.selector}`,
            output: `[${f.status.toUpperCase()}] ${f.label}: ${f.message}`,
            type: f.status === 'critical' ? 'error' : 'info',
            timestamp: ts,
          });
        });
      } else {
        addCommandLog({
          input: 'pos-health.poll',
          output: `✓ POS Health: All ${results.length} selectors healthy`,
          type: 'success',
          timestamp: ts,
        });
      }

      evaluateRules(results, ts);
      if (manual) setTimeout(() => setManualPolling(false), 600);
    },
    [addCommandLog, evaluateRules]
  );

  /* ── Auto-poll every 30 seconds ── */
  useEffect(() => {
    if (!polling) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      return;
    }
    poll();
    countdownRef.current = setInterval(() => {
      setNextPollIn((n) => Math.max(0, n - 1));
    }, 1000);
    timerRef.current = setInterval(() => poll(), POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [polling, poll]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  /* ── Rule CRUD ── */
  const saveNewRule = () => {
    const rule: AlertRule = {
      ...newRule,
      id: `rule-${Date.now().toString(36)}`,
      label:
        newRule.label.trim() ||
        `${CHECK_LABELS[newRule.checkKey] ?? newRule.checkKey} ${newRule.condition === 'missing' ? 'is missing' : `${newRule.condition} ${newRule.threshold}`}`,
    };
    const updated = [...rules, rule];
    setRules(updated);
    persistRules(updated);
    setNewRule(blankRule());
    setAddingRule(false);
    toast.success(`Alert rule added: "${rule.label}"`);
  };

  const deleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    persistRules(updated);
    setTriggeredRuleIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  };

  const toggleRule = (id: string) => {
    const updated = rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
    setRules(updated);
    persistRules(updated);
  };

  /* ── Derived display values ── */
  const cfg = STATUS[overall];
  const badgeOverrideClass =
    ruleBadgeOverride === 'red'
      ? 'text-rp-red border-rp-red/30 bg-rp-red/10'
      : ruleBadgeOverride === 'yellow'
      ? 'text-rp-yellow border-rp-yellow/30 bg-rp-yellow/10'
      : '';

  const issueCount = checks.filter((c) => c.status !== 'healthy' && c.status !== 'unknown').length;

  const formatTs = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  return (
    <div className={cn('terminal-panel', overall !== 'unknown' && cfg.border)}>
      {/* ── Panel Header ── */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="terminal-header w-full flex items-center gap-2 hover:bg-rp-surface/60 transition-colors cursor-pointer"
      >
        <div className="relative flex-shrink-0">
          <Activity size={11} className={overall === 'unknown' ? 'text-rp-muted' : cfg.text} />
          {overall === 'healthy' && polling && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-rp-green animate-ping opacity-60" />
          )}
        </div>

        <span className={cn('text-[10px] font-mono font-semibold', cfg.text)}>
          pos-health-monitor
        </span>

        {/* Overall status badge */}
        <span className={cn(
          'flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold uppercase tracking-wider',
          ruleBadgeOverride !== 'none' ? badgeOverrideClass : `${cfg.bg} ${cfg.border} ${cfg.text}`
        )}>
          <span className={cn(
            'w-1.5 h-1.5 rounded-full',
            ruleBadgeOverride === 'red' ? 'bg-rp-red animate-pulse' :
            ruleBadgeOverride === 'yellow' ? 'bg-rp-yellow animate-pulse' :
            cfg.dot,
            overall === 'healthy' && polling && ruleBadgeOverride === 'none' && 'animate-pulse'
          )} />
          {cfg.label}
        </span>

        {/* Issue count */}
        {issueCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-rp-red/10 border border-rp-red/20 text-rp-red text-[9px] font-mono">
            {issueCount} issue{issueCount !== 1 ? 's' : ''}
          </span>
        )}

        {/* Triggered rules badge */}
        {triggeredRuleIds.size > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rp-yellow/10 border border-rp-yellow/30 text-rp-yellow text-[9px] font-mono">
            <BellRing size={8} />
            {triggeredRuleIds.size} rule{triggeredRuleIds.size !== 1 ? 's' : ''} fired
          </span>
        )}

        {polling && lastPollTs && (
          <span className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-rp-muted ml-2">
            <Clock size={8} />
            next poll in {nextPollIn}s
          </span>
        )}
        {lastPollTs && (
          <span className="hidden md:block text-[9px] font-mono text-rp-muted ml-auto mr-2">
            last: {formatTs(lastPollTs)}
          </span>
        )}
        <span className="text-rp-muted flex-shrink-0">
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-4">
          {/* ── Controls row ── */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setPolling((p) => !p)}
                className={cn(
                  'w-8 h-4 rounded-full border relative cursor-pointer transition-all',
                  polling ? 'bg-rp-cyan/20 border-rp-cyan/40' : 'bg-rp-surface border-rp-border'
                )}
              >
                <span className={cn(
                  'absolute top-0.5 w-3 h-3 rounded-full transition-all',
                  polling ? 'left-4 bg-rp-cyan' : 'left-0.5 bg-rp-muted'
                )} />
              </div>
              <span className="text-[10px] font-mono text-rp-muted">
                {polling ? (
                  <span className="flex items-center gap-1 text-rp-cyan"><Wifi size={9} /> Auto-polling (30s)</span>
                ) : (
                  <span className="flex items-center gap-1"><WifiOff size={9} /> Polling paused</span>
                )}
              </span>
            </label>

            <button
              onClick={() => poll(true)}
              disabled={manualPolling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rp-cyan/30 bg-rp-cyan/5 text-rp-cyan text-[10px] font-mono hover:bg-rp-cyan/15 transition-all disabled:opacity-50"
            >
              <RefreshCw size={9} className={manualPolling ? 'animate-spin' : ''} />
              {manualPolling ? 'Checking…' : 'Check Now'}
            </button>
          </div>

          {/* ── Check grid ── */}
          {checks.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-[10px] font-mono text-rp-muted">
              No data yet — enable polling or click Check Now.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {checks.map((check) => {
                const s = STATUS[check.status];
                const hasTriggeredRule = rules.some(
                  (r) => r.enabled && r.checkKey === check.key && triggeredRuleIds.has(r.id)
                );
                return (
                  <div
                    key={check.key}
                    className={cn(
                      'rounded border p-3 space-y-1.5 transition-all',
                      s.bg, s.border,
                      hasTriggeredRule && 'ring-1 ring-rp-yellow/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {check.status === 'healthy'  && <CheckCircle   size={11} className="text-rp-green flex-shrink-0" />}
                        {check.status === 'degraded' && <AlertTriangle  size={11} className="text-rp-yellow flex-shrink-0" />}
                        {check.status === 'critical' && <XCircle        size={11} className="text-rp-red flex-shrink-0" />}
                        {check.status === 'unknown'  && <Activity       size={11} className="text-rp-muted flex-shrink-0" />}
                        <span className="text-[10px] font-mono font-semibold text-rp-text">{check.label}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {hasTriggeredRule && (
                          <BellRing size={9} className="text-rp-yellow animate-pulse" title="Alert rule fired" />
                        )}
                        <span className={cn('text-base font-bold font-mono leading-none', check.count === 0 ? 'text-rp-red' : s.text)}>
                          {check.count}
                        </span>
                      </div>
                    </div>
                    <div className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-mono uppercase tracking-wider', s.bg, s.border, s.text)}>
                      <span className={cn('w-1 h-1 rounded-full', s.dot)} />
                      {s.label}
                    </div>
                    <code className="block text-[9px] font-mono text-rp-muted truncate" title={check.selector}>{check.selector}</code>
                    <div className={cn('text-[9px] font-mono leading-relaxed', s.text)}>{check.message}</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Alert Rules Panel ────────────────────────────────── */}
          <div className="rounded border border-rp-border bg-rp-bg overflow-hidden">
            {/* Sub-header */}
            <button
              onClick={() => setRulesOpen((o) => !o)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-rp-surface/60 transition-colors border-b border-rp-border"
            >
              <Bell size={10} className={triggeredRuleIds.size > 0 ? 'text-rp-yellow' : 'text-rp-muted'} />
              <span className="text-[10px] font-mono font-semibold text-rp-text">Alert Rules</span>
              <span className="px-1.5 py-0.5 rounded bg-rp-surface border border-rp-border text-rp-muted text-[9px] font-mono">
                {rules.length} rule{rules.length !== 1 ? 's' : ''} · {rules.filter((r) => r.enabled).length} active
              </span>
              {triggeredRuleIds.size > 0 && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-rp-yellow/10 border border-rp-yellow/30 text-rp-yellow text-[9px] font-mono">
                  <BellRing size={8} />
                  {triggeredRuleIds.size} firing
                </span>
              )}
              <span className="ml-auto text-rp-muted">{rulesOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}</span>
            </button>

            {rulesOpen && (
              <div className="p-3 space-y-3">

                {/* ── Existing rules list ── */}
                {rules.length === 0 ? (
                  <div className="flex items-center gap-2 px-3 py-3 rounded border border-rp-border bg-rp-surface text-[10px] font-mono text-rp-muted">
                    <Info size={10} className="flex-shrink-0" />
                    No alert rules defined. Add a rule to get notified when selector counts cross a threshold.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {rules.map((rule) => {
                      const isFiring = triggeredRuleIds.has(rule.id);
                      const checkLabel = CHECK_LABELS[rule.checkKey] ?? rule.checkKey;
                      const condStr = rule.condition === 'missing' ? 'is missing' : `${rule.condition} ${rule.threshold}`;
                      return (
                        <div
                          key={rule.id}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded border text-[10px] font-mono transition-all',
                            !rule.enabled && 'opacity-50',
                            isFiring
                              ? rule.severity === 'critical'
                                ? 'border-rp-red/40 bg-rp-red/5'
                                : 'border-rp-yellow/40 bg-rp-yellow/5'
                              : 'border-rp-border bg-rp-surface'
                          )}
                        >
                          {/* Firing indicator */}
                          <div className="flex-shrink-0 w-4 text-center">
                            {isFiring ? (
                              <BellRing size={10} className={cn(rule.severity === 'critical' ? 'text-rp-red' : 'text-rp-yellow', 'animate-pulse')} />
                            ) : (
                              <Bell size={10} className="text-rp-muted/30" />
                            )}
                          </div>

                          {/* Rule description */}
                          <div className="flex-1 min-w-0">
                            <div className="text-rp-text font-semibold truncate">{rule.label}</div>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5">
                              <span className="text-rp-muted">
                                {checkLabel} <span className="text-rp-cyan">{condStr}</span>
                              </span>
                              <span className={cn(
                                'px-1.5 py-0 rounded border text-[9px] uppercase tracking-wider',
                                rule.severity === 'critical'
                                  ? 'border-rp-red/30 bg-rp-red/10 text-rp-red'
                                  : 'border-rp-yellow/30 bg-rp-yellow/10 text-rp-yellow'
                              )}>
                                {rule.severity}
                              </span>
                              {/* Actions chips */}
                              <div className="flex items-center gap-1">
                                {rule.actions.logConsole && (
                                  <span className="px-1 py-0 rounded border border-rp-border text-rp-muted text-[8px]">log</span>
                                )}
                                {rule.actions.showToast && (
                                  <span className="px-1 py-0 rounded border border-rp-border text-rp-muted text-[8px]">toast</span>
                                )}
                                {rule.actions.badgeColor !== 'none' && (
                                  <span className={cn(
                                    'px-1 py-0 rounded border text-[8px]',
                                    rule.actions.badgeColor === 'red'
                                      ? 'border-rp-red/30 text-rp-red'
                                      : 'border-rp-yellow/30 text-rp-yellow'
                                  )}>
                                    badge:{rule.actions.badgeColor}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Enable/Disable toggle */}
                          <button
                            onClick={() => toggleRule(rule.id)}
                            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
                            className={cn(
                              'flex-shrink-0 transition-colors',
                              rule.enabled ? 'text-rp-green' : 'text-rp-muted hover:text-rp-text'
                            )}
                          >
                            {rule.enabled ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="flex-shrink-0 text-rp-muted hover:text-rp-red transition-colors"
                            title="Delete rule"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── Add Rule form ── */}
                {addingRule ? (
                  <div className="space-y-3 p-3 rounded border border-rp-cyan/20 bg-rp-cyan/5">
                    <div className="text-[10px] font-mono text-rp-cyan font-semibold">New Alert Rule</div>

                    {/* Label */}
                    <div>
                      <label className="block text-[9px] font-mono text-rp-muted mb-1">Rule Label (optional)</label>
                      <input
                        type="text"
                        value={newRule.label}
                        onChange={(e) => setNewRule((r) => ({ ...r, label: e.target.value }))}
                        placeholder="e.g. Low menu item count warning"
                        className="w-full bg-rp-bg border border-rp-border rounded px-2.5 py-1.5 text-[10px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 transition-all"
                      />
                    </div>

                    {/* Check + Condition + Threshold row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[9px] font-mono text-rp-muted mb-1">Check Target</label>
                        <select
                          value={newRule.checkKey}
                          onChange={(e) => setNewRule((r) => ({ ...r, checkKey: e.target.value }))}
                          className="w-full bg-rp-bg border border-rp-border rounded px-2 py-1.5 text-[10px] font-mono text-rp-text focus:outline-none focus:border-rp-cyan/40 transition-all"
                        >
                          {HEALTH_CHECKS.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-rp-muted mb-1">Condition</label>
                        <select
                          value={newRule.condition}
                          onChange={(e) => setNewRule((r) => ({ ...r, condition: e.target.value as RuleCondition }))}
                          className="w-full bg-rp-bg border border-rp-border rounded px-2 py-1.5 text-[10px] font-mono text-rp-text focus:outline-none focus:border-rp-cyan/40 transition-all"
                        >
                          {(Object.entries(CONDITION_LABELS) as [RuleCondition, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-rp-muted mb-1">
                          Threshold {newRule.condition === 'missing' && <span className="text-rp-muted/50">(ignored)</span>}
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={newRule.threshold}
                          onChange={(e) => setNewRule((r) => ({ ...r, threshold: Number(e.target.value) }))}
                          disabled={newRule.condition === 'missing'}
                          className="w-full bg-rp-bg border border-rp-border rounded px-2.5 py-1.5 text-[10px] font-mono text-rp-text focus:outline-none focus:border-rp-cyan/40 transition-all disabled:opacity-40"
                        />
                      </div>
                    </div>

                    {/* Severity + Actions row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-mono text-rp-muted mb-1">Severity</label>
                        <div className="flex items-center gap-2">
                          {(['warn', 'critical'] as RuleSeverity[]).map((s) => (
                            <button
                              key={s}
                              onClick={() => setNewRule((r) => ({ ...r, severity: s }))}
                              className={cn(
                                'flex-1 py-1.5 rounded border text-[10px] font-mono font-semibold uppercase tracking-wider transition-all',
                                newRule.severity === s
                                  ? s === 'critical'
                                    ? 'bg-rp-red/20 border-rp-red/40 text-rp-red'
                                    : 'bg-rp-yellow/20 border-rp-yellow/40 text-rp-yellow'
                                  : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text'
                              )}
                            >
                              {s}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[9px] font-mono text-rp-muted mb-1.5">Badge Color Override</label>
                        <div className="flex items-center gap-2">
                          {([['none', 'None'], ['yellow', 'Yellow'], ['red', 'Red']] as [BadgeColor, string][]).map(([val, lbl]) => (
                            <button
                              key={val}
                              onClick={() => setNewRule((r) => ({ ...r, actions: { ...r.actions, badgeColor: val } }))}
                              className={cn(
                                'flex-1 py-1.5 rounded border text-[9px] font-mono transition-all',
                                newRule.actions.badgeColor === val
                                  ? val === 'red'
                                    ? 'bg-rp-red/20 border-rp-red/40 text-rp-red'
                                    : val === 'yellow'
                                    ? 'bg-rp-yellow/20 border-rp-yellow/40 text-rp-yellow'
                                    : 'bg-rp-surface border-rp-cyan/30 text-rp-cyan'
                                  : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text'
                              )}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Action toggles */}
                    <div>
                      <label className="block text-[9px] font-mono text-rp-muted mb-1.5">Actions</label>
                      <div className="flex items-center gap-3 flex-wrap">
                        {[
                          { key: 'logConsole', label: 'Log to Agent Console' },
                          { key: 'showToast',  label: 'Show Toast Notification' },
                        ].map(({ key, label }) => (
                          <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                            <div
                              onClick={() =>
                                setNewRule((r) => ({
                                  ...r,
                                  actions: {
                                    ...r.actions,
                                    [key]: !r.actions[key as keyof typeof r.actions],
                                  },
                                }))
                              }
                              className={cn(
                                'w-7 h-3.5 rounded-full border relative cursor-pointer transition-all',
                                (newRule.actions as Record<string, unknown>)[key]
                                  ? 'bg-rp-cyan/20 border-rp-cyan/40'
                                  : 'bg-rp-surface border-rp-border'
                              )}
                            >
                              <span className={cn(
                                'absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all',
                                (newRule.actions as Record<string, unknown>)[key]
                                  ? 'left-3.5 bg-rp-cyan'
                                  : 'left-0.5 bg-rp-muted'
                              )} />
                            </div>
                            <span className="text-[10px] font-mono text-rp-muted">{label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Rule preview */}
                    <div className="px-3 py-2 rounded bg-rp-surface border border-rp-border text-[9px] font-mono text-rp-muted">
                      <span className="text-rp-cyan">WHEN</span>{' '}
                      <span className="text-rp-text">{CHECK_LABELS[newRule.checkKey]}</span>{' '}
                      <span className="text-rp-yellow">
                        {newRule.condition === 'missing' ? 'is missing' : `${newRule.condition} ${newRule.threshold}`}
                      </span>{' '}
                      <span className="text-rp-cyan">→</span>{' '}
                      <span className={newRule.severity === 'critical' ? 'text-rp-red' : 'text-rp-yellow'}>
                        [{newRule.severity.toUpperCase()}]
                      </span>{' '}
                      {newRule.actions.logConsole && <span className="mr-1">log</span>}
                      {newRule.actions.showToast && <span className="mr-1">toast</span>}
                      {newRule.actions.badgeColor !== 'none' && (
                        <span>badge:{newRule.actions.badgeColor}</span>
                      )}
                    </div>

                    {/* Form buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={saveNewRule}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rp-green/30 bg-rp-green/10 text-rp-green text-[10px] font-mono hover:bg-rp-green/20 transition-all"
                      >
                        <Zap size={9} /> Add Rule
                      </button>
                      <button
                        onClick={() => { setAddingRule(false); setNewRule(blankRule()); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rp-border text-rp-muted text-[10px] font-mono hover:text-rp-text transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingRule(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-dashed border-rp-border text-rp-muted text-[10px] font-mono hover:border-rp-cyan/30 hover:text-rp-cyan transition-all w-full justify-center"
                  >
                    <Plus size={10} /> Add Alert Rule
                  </button>
                )}

                <div className="text-[9px] font-mono text-rp-muted/60 leading-relaxed">
                  Rules are evaluated on every poll cycle. Conditions check element counts returned by the health selector.
                  Rules persist across sessions in <code className="text-rp-cyan">localStorage</code>.
                </div>
              </div>
            )}
          </div>

          {/* ── Poll history strip ── */}
          {history.length > 1 && (
            <div className="space-y-1.5">
              <div className="text-[9px] font-mono text-rp-muted uppercase tracking-wider">
                Poll History (last {Math.min(history.length, 20)})
              </div>
              <div className="flex items-end gap-1 h-8">
                {history.slice(0, 20).reverse().map((snap, idx) => (
                  <div
                    key={snap.ts + idx}
                    title={`${formatTs(snap.ts)} — ${snap.overall}`}
                    className={cn(
                      'flex-1 rounded-sm transition-all cursor-default',
                      snap.overall === 'healthy'  ? 'bg-rp-green h-full' :
                      snap.overall === 'degraded' ? 'bg-rp-yellow h-3/5' :
                      snap.overall === 'critical' ? 'bg-rp-red h-2/5' :
                      'bg-rp-border h-1/4'
                    )}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-mono text-rp-muted">
                <span>oldest</span><span>latest</span>
              </div>
            </div>
          )}

          {/* ── Summary footer ── */}
          {lastPollTs && (
            <div className="flex items-center justify-between pt-1 border-t border-rp-border text-[9px] font-mono text-rp-muted">
              <span>
                Monitoring <span className="text-rp-cyan">#pos-simulator</span> · {HEALTH_CHECKS.length} selectors · {rules.filter((r) => r.enabled).length} alert rule{rules.filter((r) => r.enabled).length !== 1 ? 's' : ''} active
              </span>
              <span>
                Last: <span className="text-rp-cyan">{formatTs(lastPollTs)}</span>
                {polling && <span> · Next in <span className="text-rp-cyan">{nextPollIn}s</span></span>}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
