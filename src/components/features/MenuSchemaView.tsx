import { useState } from 'react';
import { Copy, Check, Download, List, Code } from 'lucide-react';
import { MenuItem } from '@/types/pos';
import { syntaxHighlightJSON, cn } from '@/lib/utils';

interface MenuSchemaViewProps {
  items: MenuItem[];
}

export function MenuSchemaView({ items }: MenuSchemaViewProps) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'json' | 'table'>('json');

  const jsonStr = JSON.stringify(items, null, 2);

  const copy = () => {
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `menu-schema-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = [...new Set(items.map((i) => i.category))];

  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="terminal-header justify-between">
        <div className="flex items-center gap-2">
          <span className="terminal-dot bg-rp-red" />
          <span className="terminal-dot bg-rp-yellow" />
          <span className="terminal-dot bg-rp-green" />
          <span className="text-rp-muted text-[10px] ml-2 font-mono">
            menu-schema.json — {items.length} items
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setView(view === 'json' ? 'table' : 'json')}
            className="flex items-center gap-1 text-[10px] font-mono text-rp-muted hover:text-rp-text px-1.5 py-0.5 rounded hover:bg-rp-surface transition-colors"
          >
            {view === 'json' ? <List size={10} /> : <Code size={10} />}
            {view === 'json' ? 'Table' : 'JSON'}
          </button>
          <button
            onClick={download}
            className="flex items-center gap-1 text-[10px] font-mono text-rp-muted hover:text-rp-text px-1.5 py-0.5 rounded hover:bg-rp-surface transition-colors"
          >
            <Download size={10} />
          </button>
          <button
            onClick={copy}
            className="flex items-center gap-1 text-[10px] font-mono text-rp-muted hover:text-rp-cyan px-1.5 py-0.5 rounded hover:bg-rp-surface transition-colors"
          >
            {copied ? <Check size={10} className="text-rp-green" /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-rp-muted text-xs font-mono mb-2">No schema extracted yet.</div>
            <div className="text-rp-muted/50 text-[10px] font-mono">Run extract_menu to parse the POS DOM</div>
          </div>
        ) : view === 'json' ? (
          <pre
            className="text-[11px] leading-relaxed whitespace-pre-wrap break-words"
            dangerouslySetInnerHTML={{ __html: syntaxHighlightJSON(jsonStr) }}
          />
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => (
              <div key={cat}>
                <div className="text-[10px] font-mono text-rp-cyan uppercase tracking-wider mb-2 border-b border-rp-border pb-1">
                  {cat}
                </div>
                <div className="space-y-1">
                  {items
                    .filter((i) => i.category === cat)
                    .map((item) => (
                      <div key={item.pos_element_selector} className="grid grid-cols-[1fr_auto_auto] gap-3 items-center py-1">
                        <div>
                          <div className="text-[11px] text-rp-text">{item.item_name}</div>
                          <div className="text-[9px] font-mono text-rp-muted">{item.pos_element_selector}</div>
                        </div>
                        <div className="text-[11px] font-mono text-rp-yellow">${item.item_price.toFixed(2)}</div>
                        <div className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', item.available ? 'text-rp-green border-rp-green/20 bg-rp-green/5' : 'text-rp-red border-rp-red/20 bg-rp-red/5')}>
                          {item.available ? 'AVAIL' : '86D'}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
