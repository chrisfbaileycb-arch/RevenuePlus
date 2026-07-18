import { useState, useCallback, useRef } from 'react';
import {
  Map, ChevronRight, CheckCircle, XCircle, AlertCircle, Copy,
  RotateCcw, Code2, Search, FileJson, ChevronDown, ChevronUp,
  Loader, Info, Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/* ── Types ────────────────────────────────────────────── */
interface SelectorField {
  key: keyof SelectorMap;
  label: string;
  placeholder: string;
  hint: string;
  required: boolean;
}

interface SelectorMap {
  container: string;
  item: string;
  nameAttr: string;
  priceAttr: string;
  addButton: string;
}

interface TestResult {
  key: keyof SelectorMap;
  matches: number;
  samples: string[];
  valid: boolean;
  error?: string;
}

interface ExtractedItem {
  item_name: string;
  item_price: string;
  pos_element_selector: string;
  add_button_selector: string;
}

const WIZARD_STEPS = [
  { id: 1, label: 'Paste HTML',     desc: 'Source from any POS page' },
  { id: 2, label: 'Map Selectors',  desc: 'Define DOM selector paths' },
  { id: 3, label: 'Export Config',  desc: 'Copy pos_selector_map JSON' },
];

const SELECTOR_FIELDS: SelectorField[] = [
  {
    key: 'container',
    label: 'Menu Container',
    placeholder: '#menu-wrapper, .pos-menu, [data-menu]',
    hint: 'Root element wrapping all menu items',
    required: true,
  },
  {
    key: 'item',
    label: 'Menu Item',
    placeholder: '.menu-item, [data-item], li.product',
    hint: 'Selector for each individual menu item inside the container',
    required: true,
  },
  {
    key: 'nameAttr',
    label: 'Item Name',
    placeholder: '.item-name, [data-name], h3.title',
    hint: 'Element containing the item name text, OR attribute name like data-item-name',
    required: true,
  },
  {
    key: 'priceAttr',
    label: 'Item Price',
    placeholder: '.price, [data-price], span.cost',
    hint: 'Element containing the price text, OR attribute like data-price',
    required: true,
  },
  {
    key: 'addButton',
    label: 'Add-to-Cart Button',
    placeholder: '.add-to-cart, button[data-add], [data-action="add"]',
    hint: 'Button that adds the item to the POS cart — this is what injectAIOrder() fires',
    required: false,
  },
];

const SAMPLE_HTML = `<!-- Sample POS HTML — paste your own below -->
<div id="menu-wrapper">
  <div class="menu-item" data-item-id="item-001" data-item-name="Classic Smash Burger" data-price="12.99">
    <span class="item-name">Classic Smash Burger</span>
    <span class="price">$12.99</span>
    <button class="add-to-cart" data-action="add">Add</button>
  </div>
  <div class="menu-item" data-item-id="item-002" data-item-name="Double Stack Burger" data-price="15.99">
    <span class="item-name">Double Stack Burger</span>
    <span class="price">$15.99</span>
    <button class="add-to-cart" data-action="add">Add</button>
  </div>
  <div class="menu-item" data-item-id="item-003" data-item-name="Pepperoni Pizza" data-price="15.99">
    <span class="item-name">Pepperoni Pizza</span>
    <span class="price">$15.99</span>
    <button class="add-to-cart" data-action="add">Add</button>
  </div>
</div>`;

const DEFAULT_SELECTORS: SelectorMap = {
  container: '',
  item: '',
  nameAttr: '',
  priceAttr: '',
  addButton: '',
};

/* ── Helpers ──────────────────────────────────────────── */
function parseHTML(html: string): Document | null {
  try {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  } catch {
    return null;
  }
}

function resolveText(el: Element, selector: string): string {
  // First try as a CSS selector relative to the element
  try {
    const child = el.querySelector(selector);
    if (child) return child.textContent?.trim() || '';
  } catch {}
  // Then try as a data attribute name
  const attrVal = el.getAttribute(selector);
  if (attrVal) return attrVal;
  // Then try as a class/id shorthand on the element itself
  if (el.matches(selector)) return el.textContent?.trim() || '';
  return '';
}

function testSelector(doc: Document, field: SelectorField, selectors: SelectorMap): TestResult {
  const { key } = field;
  const sel = selectors[key].trim();

  if (!sel) {
    return { key, matches: 0, samples: [], valid: false, error: 'No selector entered' };
  }

  try {
    if (key === 'container') {
      const els = doc.querySelectorAll(sel);
      const samples = Array.from(els).slice(0, 3).map((el) =>
        `<${el.tagName.toLowerCase()}${el.id ? ' id="' + el.id + '"' : ''}${el.className ? ' class="' + String(el.className).trim().split(' ').slice(0, 2).join(' ') + '"' : ''}>`
      );
      return { key, matches: els.length, samples, valid: els.length > 0 };
    }

    if (key === 'item') {
      const container = selectors.container
        ? doc.querySelector(selectors.container)
        : doc.body;
      const els = (container || doc.body).querySelectorAll(sel);
      const samples = Array.from(els).slice(0, 3).map((el) =>
        el.getAttribute('data-item-id') ||
        el.getAttribute('data-item-name') ||
        el.textContent?.trim().slice(0, 40) ||
        el.tagName.toLowerCase()
      );
      return { key, matches: els.length, samples, valid: els.length > 0 };
    }

    if (key === 'nameAttr' || key === 'priceAttr') {
      const container = selectors.container
        ? doc.querySelector(selectors.container)
        : doc.body;
      const items = (container || doc.body).querySelectorAll(
        selectors.item || '*'
      );

      const resolved: string[] = [];
      items.forEach((item) => {
        const val = resolveText(item, sel);
        if (val) resolved.push(val);
      });

      // Also try a direct querySelector across whole doc
      let directCount = 0;
      try { directCount = doc.querySelectorAll(sel).length; } catch {}

      const count = Math.max(resolved.length, directCount);
      return { key, matches: count, samples: resolved.slice(0, 3), valid: count > 0 };
    }

    if (key === 'addButton') {
      const container = selectors.container
        ? doc.querySelector(selectors.container)
        : doc.body;
      const items = (container || doc.body).querySelectorAll(
        selectors.item || '*'
      );

      let found = 0;
      const samples: string[] = [];
      items.forEach((item) => {
        try {
          const btn = item.querySelector(sel);
          if (btn) {
            found++;
            const label = btn.textContent?.trim() || btn.getAttribute('data-action') || btn.tagName;
            if (samples.length < 3) samples.push(label);
          }
        } catch {}
      });

      // Fallback: search globally
      if (found === 0) {
        try {
          const all = doc.querySelectorAll(sel);
          found = all.length;
          all.forEach((el) => {
            if (samples.length < 3) samples.push(el.textContent?.trim() || el.tagName);
          });
        } catch {}
      }

      return { key, matches: found, samples, valid: found > 0 };
    }

    return { key, matches: 0, samples: [], valid: false };
  } catch (err) {
    return { key, matches: 0, samples: [], valid: false, error: `Invalid selector: ${String(err)}` };
  }
}

function extractItems(doc: Document, selectors: SelectorMap): ExtractedItem[] {
  const items: ExtractedItem[] = [];

  try {
    const container = selectors.container
      ? doc.querySelector(selectors.container)
      : doc.body;
    if (!container) return items;

    const itemEls = container.querySelectorAll(selectors.item);
    itemEls.forEach((el, idx) => {
      const name = resolveText(el, selectors.nameAttr) || `Item ${idx + 1}`;
      const price = resolveText(el, selectors.priceAttr) || '0.00';
      const id =
        el.getAttribute('data-item-id') ||
        el.getAttribute('id') ||
        `item-${idx + 1}`;
      const itemSel = `[data-item-id="${id}"], .${Array.from(el.classList)[0] || 'menu-item'}:nth-child(${idx + 1})`;
      const addBtnSel = selectors.addButton
        ? `[data-item-id="${id}"] ${selectors.addButton}`
        : `[data-item-id="${id}"] button`;

      items.push({
        item_name: name,
        item_price: price.replace(/[^0-9.]/g, ''),
        pos_element_selector: itemSel,
        add_button_selector: addBtnSel,
      });
    });
  } catch {}

  return items;
}

/* ── Component ────────────────────────────────────────── */
export default function SelectorMapper() {
  const [step, setStep] = useState(1);
  const [html, setHtml] = useState('');
  const [useSample, setUseSample] = useState(false);
  const [selectors, setSelectors] = useState<SelectorMap>(DEFAULT_SELECTORS);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [testing, setTesting] = useState(false);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [storeName, setStoreName] = useState('My Restaurant');
  const [storeId, setStoreId] = useState('store-001');
  const [menuUrl, setMenuUrl] = useState('');
  const [htmlOpen, setHtmlOpen] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeHtml = useSample ? SAMPLE_HTML : html;

  /* ── Load sample ── */
  const loadSample = () => {
    setUseSample(true);
    setHtml(SAMPLE_HTML);
    toast.success('Sample POS HTML loaded');
  };

  /* ── Run all tests ── */
  const runTests = useCallback(async () => {
    if (!activeHtml.trim()) {
      toast.error('Paste HTML first (Step 1)');
      return;
    }
    setTesting(true);
    await new Promise((r) => setTimeout(r, 80));

    const doc = parseHTML(activeHtml);
    if (!doc) {
      toast.error('Failed to parse HTML');
      setTesting(false);
      return;
    }

    const results: Record<string, TestResult> = {};
    for (const field of SELECTOR_FIELDS) {
      results[field.key] = testSelector(doc, field, selectors);
    }
    setTestResults(results);

    // Extract items for preview
    if (selectors.container && selectors.item) {
      const items = extractItems(doc, selectors);
      setExtractedItems(items);
    } else {
      setExtractedItems([]);
    }

    setTesting(false);

    const valid = SELECTOR_FIELDS.filter((f) => f.required).every(
      (f) => results[f.key]?.valid
    );
    if (valid) {
      toast.success('All required selectors matched — ready to export');
    } else {
      toast('Some selectors need attention');
    }
  }, [activeHtml, selectors]);

  /* ── Selector change ── */
  const setSelector = (key: keyof SelectorMap, val: string) => {
    setSelectors((prev) => ({ ...prev, [key]: val }));
    // Clear test result for this field
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /* ── Generate output JSON ── */
  const posConfig = {
    store_name: storeName,
    store_id: storeId,
    menu_url: menuUrl || undefined,
    pos_selector_map: {
      container: selectors.container || '#menu-wrapper',
      item: selectors.item || '.menu-item',
      name_selector: selectors.nameAttr || '.item-name',
      price_selector: selectors.priceAttr || '.price',
      add_button: selectors.addButton || '.add-to-cart',
    },
    extracted_items: extractedItems.length > 0 ? extractedItems : undefined,
  };
  const outputJson = JSON.stringify(posConfig, null, 2);

  const copyOutput = () => {
    navigator.clipboard.writeText(outputJson).then(() =>
      toast.success('pos_selector_map copied to clipboard')
    );
  };

  const downloadOutput = () => {
    const blob = new Blob([outputJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(storeName || 'restaurant').toLowerCase().replace(/\s+/g, '-')}-config.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Config downloaded');
  };

  /* ── Validation ── */
  const requiredFields = SELECTOR_FIELDS.filter((f) => f.required);
  const allRequiredValid = requiredFields.every((f) => testResults[f.key]?.valid);
  const anyTested = Object.keys(testResults).length > 0;

  return (
    <div className="p-5 space-y-4 max-w-5xl">
      {/* Page header */}
      <div>
        <h2 className="text-sm font-semibold text-rp-text">POS Selector Mapper</h2>
        <p className="text-[11px] text-rp-muted font-mono mt-0.5">
          Paste raw HTML from any POS system →{' '}
          <span className="text-rp-cyan">define selector paths</span> →{' '}
          export a <span className="text-rp-yellow">pos_selector_map</span> block
          ready for <code className="text-rp-green">restaurant-config.json</code>
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {WIZARD_STEPS.map((s, idx) => (
          <div key={s.id} className="flex items-center">
            <button
              onClick={() => setStep(s.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded border transition-all',
                step === s.id
                  ? 'bg-rp-cyan/10 border-rp-cyan/40 text-rp-cyan'
                  : s.id < step
                  ? 'bg-rp-green/5 border-rp-green/20 text-rp-green'
                  : 'bg-rp-surface border-rp-border text-rp-muted hover:text-rp-text'
              )}
            >
              <span
                className={cn(
                  'w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-mono font-bold flex-shrink-0',
                  step === s.id
                    ? 'border-rp-cyan text-rp-cyan'
                    : s.id < step
                    ? 'border-rp-green bg-rp-green/20 text-rp-green'
                    : 'border-rp-border text-rp-muted'
                )}
              >
                {s.id < step ? <CheckCircle size={10} /> : s.id}
              </span>
              <div className="hidden sm:block text-left">
                <div className="text-[10px] font-semibold leading-none">{s.label}</div>
                <div className="text-[9px] opacity-70 mt-0.5 font-mono">{s.desc}</div>
              </div>
            </button>
            {idx < WIZARD_STEPS.length - 1 && (
              <ChevronRight size={12} className="mx-1 text-rp-border flex-shrink-0" />
            )}
          </div>
        ))}
      </div>

      {/* ═══ STEP 1: Paste HTML ════════════════════════ */}
      {step === 1 && (
        <div className="space-y-3">
          <div className="terminal-panel">
            <button
              className="terminal-header w-full flex items-center gap-2 hover:bg-rp-surface/60 transition-colors cursor-pointer"
              onClick={() => setHtmlOpen((o) => !o)}
            >
              <Code2 size={11} className="text-rp-cyan" />
              <span className="text-rp-cyan text-[10px] font-mono">step-1 — paste POS page HTML</span>
              {activeHtml.trim() && (
                <span className="ml-2 px-1.5 py-0.5 rounded bg-rp-green/10 border border-rp-green/20 text-rp-green text-[9px] font-mono">
                  {activeHtml.trim().split('\n').length} lines
                </span>
              )}
              <span className="ml-auto text-rp-muted">
                {htmlOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </span>
            </button>

            {htmlOpen && (
              <div className="p-4 space-y-3">
                {/* Instructions */}
                <div className="flex items-start gap-2 px-3 py-2.5 rounded border border-rp-border bg-rp-surface text-[10px] font-mono text-rp-muted">
                  <Info size={10} className="text-rp-cyan mt-0.5 flex-shrink-0" />
                  <span>
                    Open your POS system in a browser, right-click the menu section, and select{' '}
                    <span className="text-rp-yellow">Inspect → Copy outerHTML</span> of the root menu
                    container. Paste it below. Or use the sample to explore.
                  </span>
                </div>

                {/* Buttons row */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={loadSample}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rp-cyan/30 bg-rp-cyan/5 text-rp-cyan text-[10px] font-mono hover:bg-rp-cyan/10 transition-all"
                  >
                    <Zap size={10} />
                    Load Sample HTML
                  </button>
                  {(html.trim() || useSample) && (
                    <button
                      onClick={() => { setHtml(''); setUseSample(false); setTestResults({}); setExtractedItems([]); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rp-border bg-rp-surface text-rp-muted text-[10px] font-mono hover:text-rp-text transition-all"
                    >
                      <RotateCcw size={9} />
                      Clear
                    </button>
                  )}
                  {activeHtml.trim() && (
                    <span className="ml-auto text-[9px] font-mono text-rp-muted">
                      {activeHtml.length.toLocaleString()} chars · ~{Math.round(activeHtml.length / 1024)}KB
                    </span>
                  )}
                </div>

                {/* HTML textarea */}
                <textarea
                  ref={textareaRef}
                  value={useSample ? SAMPLE_HTML : html}
                  onChange={(e) => { setHtml(e.target.value); setUseSample(false); }}
                  rows={16}
                  spellCheck={false}
                  placeholder="Paste raw HTML from any POS page here…"
                  className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2.5 text-[10px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all resize-y leading-relaxed"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => {
                if (!activeHtml.trim()) { toast.error('Paste HTML or load sample first'); return; }
                setStep(2);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all"
            >
              Next: Map Selectors
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 2: Map Selectors ═════════════════════ */}
      {step === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
            {/* Left: Selector fields */}
            <div className="terminal-panel">
              <div className="terminal-header">
                <Search size={11} className="text-rp-cyan" />
                <span className="text-rp-cyan text-[10px] font-mono">step-2 — define selector map</span>
                <button
                  onClick={runTests}
                  disabled={testing}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded border border-rp-green/30 bg-rp-green/10 text-rp-green text-[9px] font-mono hover:bg-rp-green/20 transition-all disabled:opacity-50"
                >
                  {testing ? <Loader size={9} className="animate-spin" /> : <Search size={9} />}
                  {testing ? 'Testing…' : 'Test All'}
                </button>
              </div>

              <div className="p-4 space-y-4">
                {SELECTOR_FIELDS.map((field) => {
                  const result = testResults[field.key];
                  return (
                    <div key={field.key} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <label className="text-[10px] font-mono font-semibold text-rp-text uppercase tracking-wider">
                          {field.label}
                          {field.required && <span className="text-rp-red ml-1">*</span>}
                        </label>
                        {result && (
                          <div className={cn(
                            'flex items-center gap-1 text-[9px] font-mono ml-auto',
                            result.valid ? 'text-rp-green' : 'text-rp-red'
                          )}>
                            {result.valid
                              ? <><CheckCircle size={9} /> {result.matches} match{result.matches !== 1 ? 'es' : ''}</>
                              : <><XCircle size={9} /> {result.error || 'No matches'}</>
                            }
                          </div>
                        )}
                      </div>

                      <div className="relative">
                        <input
                          type="text"
                          value={selectors[field.key]}
                          onChange={(e) => setSelector(field.key, e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && runTests()}
                          placeholder={field.placeholder}
                          className={cn(
                            'w-full bg-rp-bg border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:ring-1 transition-all pr-8',
                            result?.valid
                              ? 'border-rp-green/40 focus:border-rp-green/60 focus:ring-rp-green/20'
                              : result && !result.valid
                              ? 'border-rp-red/40 focus:border-rp-red/60 focus:ring-rp-red/20'
                              : 'border-rp-border focus:border-rp-cyan/40 focus:ring-rp-cyan/20'
                          )}
                        />
                        {result && (
                          <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                            {result.valid
                              ? <CheckCircle size={11} className="text-rp-green" />
                              : <XCircle size={11} className="text-rp-red" />
                            }
                          </div>
                        )}
                      </div>

                      <div className="text-[9px] font-mono text-rp-muted">{field.hint}</div>

                      {/* Sample matches */}
                      {result?.valid && result.samples.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {result.samples.map((s, i) => (
                            <code
                              key={i}
                              className="px-1.5 py-0.5 rounded bg-rp-green/5 border border-rp-green/20 text-rp-green text-[9px] font-mono max-w-[200px] truncate"
                              title={s}
                            >
                              {s}
                            </code>
                          ))}
                          {result.matches > result.samples.length && (
                            <span className="text-[9px] font-mono text-rp-muted">
                              +{result.matches - result.samples.length} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Test button (bottom) */}
                <button
                  onClick={runTests}
                  disabled={testing}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all disabled:opacity-50"
                >
                  {testing ? <Loader size={11} className="animate-spin" /> : <Search size={11} />}
                  {testing ? 'Running tests against pasted HTML…' : 'Test All Selectors'}
                </button>
              </div>
            </div>

            {/* Right: Live DOM preview */}
            <div className="space-y-3">
              {/* Overall status */}
              {anyTested && (
                <div className={cn(
                  'terminal-panel',
                  allRequiredValid ? 'border-rp-green/30' : 'border-rp-yellow/30'
                )}>
                  <div className="terminal-header">
                    {allRequiredValid
                      ? <CheckCircle size={11} className="text-rp-green" />
                      : <AlertCircle size={11} className="text-rp-yellow" />
                    }
                    <span className={cn('text-[10px] font-mono', allRequiredValid ? 'text-rp-green' : 'text-rp-yellow')}>
                      {allRequiredValid ? 'All required selectors valid' : 'Some selectors need fixing'}
                    </span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {SELECTOR_FIELDS.map((f) => {
                      const r = testResults[f.key];
                      if (!r) return null;
                      return (
                        <div key={f.key} className="flex items-center justify-between text-[10px] font-mono">
                          <span className={cn(
                            r.valid ? 'text-rp-text' : 'text-rp-muted'
                          )}>{f.label}</span>
                          <span className={cn(
                            'flex items-center gap-1',
                            r.valid ? 'text-rp-green' : 'text-rp-red'
                          )}>
                            {r.valid ? <CheckCircle size={9} /> : <XCircle size={9} />}
                            {r.valid ? `${r.matches}×` : r.error || '0×'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Extracted items preview */}
              {extractedItems.length > 0 && (
                <div className="terminal-panel">
                  <div className="terminal-header">
                    <FileJson size={11} className="text-rp-yellow" />
                    <span className="text-rp-yellow text-[10px] font-mono">
                      extracted — {extractedItems.length} item{extractedItems.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="p-3 space-y-1.5 max-h-60 overflow-y-auto">
                    {extractedItems.map((item, idx) => (
                      <div key={idx} className="rounded border border-rp-border bg-rp-bg px-2.5 py-2 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-mono text-rp-text truncate">{item.item_name}</span>
                          <span className="text-[10px] font-mono text-rp-yellow ml-2 flex-shrink-0">
                            ${item.item_price || '?'}
                          </span>
                        </div>
                        <div className="text-[9px] font-mono text-rp-muted truncate">{item.pos_element_selector}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tip box */}
              {!anyTested && (
                <div className="rounded border border-rp-border bg-rp-surface p-4 space-y-2">
                  <div className="text-[10px] font-mono text-rp-muted uppercase tracking-wider">Tips</div>
                  <div className="space-y-1.5 text-[9px] font-mono text-rp-muted leading-relaxed">
                    <div><span className="text-rp-cyan">Container:</span> Wrap all items — use #id or .class</div>
                    <div><span className="text-rp-cyan">Item:</span> Repeating element per menu item</div>
                    <div><span className="text-rp-cyan">Name/Price:</span> CSS selector or data-attr name</div>
                    <div><span className="text-rp-cyan">Add Button:</span> .class or [attr] of cart button</div>
                    <div className="mt-2 text-rp-muted/60">
                      Press <span className="text-rp-yellow">Test All</span> to validate against your HTML.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Nav buttons */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2.5 rounded border border-rp-border bg-rp-surface text-rp-muted text-xs font-mono hover:text-rp-text transition-all"
            >
              ← Back
            </button>
            <button
              onClick={() => {
                if (!anyTested) { toast.error('Run tests first'); return; }
                if (!allRequiredValid) { toast.error('Fix required selectors before exporting'); return; }
                setStep(3);
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all"
            >
              Next: Export Config
              <ChevronRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ STEP 3: Export Config ═════════════════════ */}
      {step === 3 && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left: Store metadata */}
            <div className="terminal-panel">
              <div className="terminal-header">
                <Map size={11} className="text-rp-cyan" />
                <span className="text-rp-cyan text-[10px] font-mono">step-3 — store metadata</span>
              </div>
              <div className="p-4 space-y-3">
                <div>
                  <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                    Store Name <span className="text-rp-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="My Restaurant"
                    className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                    Store ID
                  </label>
                  <input
                    type="text"
                    value={storeId}
                    onChange={(e) => setStoreId(e.target.value)}
                    placeholder="store-001"
                    className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-mono text-rp-muted uppercase tracking-wider mb-1.5">
                    POS Menu URL <span className="text-rp-muted">(optional)</span>
                  </label>
                  <input
                    type="url"
                    value={menuUrl}
                    onChange={(e) => setMenuUrl(e.target.value)}
                    placeholder="https://pos.example.com/menu"
                    className="w-full bg-rp-bg border border-rp-border rounded px-3 py-2 text-[11px] font-mono text-rp-text placeholder:text-rp-muted/40 focus:outline-none focus:border-rp-cyan/40 focus:ring-1 focus:ring-rp-cyan/20 transition-all"
                  />
                </div>

                {/* Selector summary */}
                <div className="rounded border border-rp-border bg-rp-bg p-3 space-y-1.5">
                  <div className="text-[9px] font-mono text-rp-muted uppercase tracking-wider mb-2">
                    Confirmed Selector Map
                  </div>
                  {SELECTOR_FIELDS.map((f) => (
                    <div key={f.key} className="flex items-start gap-2 text-[10px] font-mono">
                      <span className="text-rp-muted w-20 flex-shrink-0">{f.label}:</span>
                      <code className={cn(
                        'break-all',
                        selectors[f.key] ? 'text-rp-cyan' : 'text-rp-muted/40 italic'
                      )}>
                        {selectors[f.key] || '(not set)'}
                      </code>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: JSON output */}
            <div className="terminal-panel">
              <div className="terminal-header">
                <FileJson size={11} className="text-rp-yellow" />
                <span className="text-rp-yellow text-[10px] font-mono">
                  restaurant-config.json — ready to paste
                </span>
                <button
                  onClick={copyOutput}
                  className="ml-auto flex items-center gap-1 text-[9px] font-mono text-rp-muted hover:text-rp-cyan transition-colors"
                >
                  <Copy size={9} />
                  copy
                </button>
              </div>
              <pre className="p-4 text-[10px] font-mono text-rp-muted leading-relaxed overflow-auto max-h-[420px]">
                <code className="text-rp-green/80">{outputJson}</code>
              </pre>
            </div>
          </div>

          {/* Action buttons */}
          <div className="terminal-panel">
            <div className="terminal-header">
              <CheckCircle size={11} className="text-rp-green" />
              <span className="text-rp-green text-[10px] font-mono">export — deploy to Revenue Pulse</span>
            </div>
            <div className="p-4 flex flex-wrap gap-3">
              <button
                onClick={copyOutput}
                className="flex items-center gap-2 px-5 py-2.5 rounded border border-rp-cyan/30 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-all"
              >
                <Copy size={11} />
                Copy pos_selector_map JSON
              </button>
              <button
                onClick={downloadOutput}
                className="flex items-center gap-2 px-5 py-2.5 rounded border border-rp-green/30 bg-rp-green/10 text-rp-green text-xs font-mono hover:bg-rp-green/20 transition-all"
              >
                <FileJson size={11} />
                Download restaurant-config.json
              </button>
              <button
                onClick={() => { setStep(1); setSelectors(DEFAULT_SELECTORS); setTestResults({}); setExtractedItems([]); setHtml(''); setUseSample(false); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded border border-rp-border bg-rp-surface text-rp-muted text-xs font-mono hover:text-rp-text transition-all"
              >
                <RotateCcw size={11} />
                Start Over
              </button>
            </div>
            <div className="px-4 pb-4 text-[9px] font-mono text-rp-muted leading-relaxed">
              Pass this JSON to{' '}
              <code className="text-rp-cyan">window.revenuePulse.init(config)</code> or drop it into your relay
              server as the onboarding config. The{' '}
              <code className="text-rp-yellow">pos_selector_map</code> block is consumed by the{' '}
              <code className="text-rp-cyan">menuExtractor</code> and{' '}
              <code className="text-rp-cyan">orderInjector</code> modules at runtime.
            </div>
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2.5 rounded border border-rp-border bg-rp-surface text-rp-muted text-xs font-mono hover:text-rp-text transition-all"
            >
              ← Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
