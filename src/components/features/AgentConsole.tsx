import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Terminal, Trash2, ChevronRight } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { MOCK_MENU } from '@/constants/mockData';
import { formatTimestamp, cn } from '@/lib/utils';

const COMMANDS = ['extract_menu', 'inject_order', 'lookup_customer', 'clear_cart', 'help', 'clear'];

export function AgentConsole() {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { commandLog, clearCommandLog, runExtractMenu, runInjectOrder, runLookupCustomer, runClearCart } = useAgent();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [commandLog]);

  const execute = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    setHistory((h) => [trimmed, ...h].slice(0, 50));
    setHistoryIdx(-1);

    const [cmd, ...args] = trimmed.split(' ');

    switch (cmd.toLowerCase()) {
      case 'extract_menu':
        runExtractMenu();
        break;
      case 'inject_order': {
        const selector = args[0];
        if (!selector) {
          useAgent;
          break;
        }
        const modsIdx = args.indexOf('--mods');
        const mods = modsIdx >= 0 ? args.slice(modsIdx + 1) : undefined;
        runInjectOrder(selector, mods);
        break;
      }
      case 'lookup_customer': {
        const phone = args[0];
        if (phone) runLookupCustomer(phone);
        break;
      }
      case 'clear_cart':
        runClearCart();
        break;
      case 'clear':
        clearCommandLog();
        break;
      case 'help':
        // help output is handled by addCommandLog below
        break;
      default:
        break;
    }
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      execute(input);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] || '');
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? '' : history[idx]);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const match = COMMANDS.find((c) => c.startsWith(input.toLowerCase()));
      if (match) setInput(match + ' ');
    }
  };

  const getLogColor = (type: string) => {
    switch (type) {
      case 'success': return 'text-rp-green';
      case 'error': return 'text-rp-red';
      case 'info': return 'text-rp-cyan';
      case 'system': return 'text-rp-yellow';
      default: return 'text-rp-muted';
    }
  };

  // Suggest quick commands
  const quickCmds = [
    { label: 'Extract Menu', cmd: 'extract_menu' },
    { label: 'Inject: Classic Burger', cmd: 'inject_order #pos-item-001' },
    { label: 'Lookup: 555-0101', cmd: 'lookup_customer 5550101' },
    { label: 'Clear Cart', cmd: 'clear_cart' },
  ];

  return (
    <div className="terminal-panel flex flex-col h-full">
      <div className="terminal-header justify-between">
        <div className="flex items-center gap-2">
          <span className="terminal-dot bg-rp-red" />
          <span className="terminal-dot bg-rp-yellow" />
          <span className="terminal-dot bg-rp-green" />
          <span className="text-rp-muted text-[10px] ml-2 font-mono">agent-console — revenue-pulse</span>
        </div>
        <button onClick={clearCommandLog} className="text-rp-muted hover:text-rp-text transition-colors" title="Clear console">
          <Trash2 size={11} />
        </button>
      </div>

      {/* Output */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-0.5 cursor-text min-h-0"
        onClick={() => inputRef.current?.focus()}
      >
        {commandLog.map((entry) => (
          <div key={entry.id} className="animate-fade-in">
            {entry.input && (
              <div className="flex items-center gap-1.5">
                <span className="text-rp-cyan text-[10px] font-mono">❯</span>
                <span className="text-rp-text text-[11px] font-mono">{entry.input}</span>
                <span className="text-rp-muted text-[9px] font-mono ml-auto">{formatTimestamp(entry.timestamp)}</span>
              </div>
            )}
            <div className={cn('text-[11px] font-mono pl-3.5 leading-relaxed', getLogColor(entry.type))}>
              {entry.output}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Quick commands */}
      <div className="px-3 py-2 border-t border-rp-border flex gap-1.5 flex-wrap">
        {quickCmds.map(({ label, cmd }) => (
          <button
            key={cmd}
            onClick={() => execute(cmd)}
            className="text-[9px] font-mono px-2 py-0.5 rounded border border-rp-border text-rp-muted hover:text-rp-cyan hover:border-rp-cyan/30 transition-colors"
          >
            {label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-rp-border bg-rp-bg/40">
        <ChevronRight size={12} className="text-rp-cyan flex-shrink-0" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="extract_menu | inject_order #pos-item-001 | lookup_customer 5550101"
          className="flex-1 bg-transparent font-mono text-[11px] text-rp-text placeholder:text-rp-muted/40 outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <span className="w-1.5 h-3 bg-rp-cyan animate-blink rounded-sm" />
      </div>
    </div>
  );
}
