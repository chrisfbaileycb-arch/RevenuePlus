import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { InjectionResult } from '@/types/pos';
import { formatTimestamp, cn } from '@/lib/utils';

interface OrderLogProps {
  results: InjectionResult[];
  maxHeight?: string;
}

export function OrderLog({ results, maxHeight = 'max-h-64' }: OrderLogProps) {
  if (results.length === 0) {
    return (
      <div className="terminal-panel p-4 text-center">
        <div className="text-rp-muted text-xs font-mono">No injections recorded this session.</div>
        <div className="text-rp-muted/50 text-[10px] font-mono mt-1">
          Use inject_order [selector] to log an injection
        </div>
      </div>
    );
  }

  return (
    <div className={cn('terminal-panel overflow-y-auto', maxHeight)}>
      <div className="terminal-header sticky top-0">
        <span className="text-rp-muted text-[10px] font-mono">injection-log — {results.length} records</span>
      </div>
      <div className="divide-y divide-rp-border">
        {results.map((r) => (
          <div key={r.order_id} className="flex items-start gap-3 px-3 py-2.5 hover:bg-rp-surface/50 transition-colors animate-slide-in">
            <div className="mt-0.5 flex-shrink-0">
              {r.success ? (
                <CheckCircle size={13} className="text-rp-green" />
              ) : (
                <XCircle size={13} className="text-rp-red" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className={cn('text-[11px] font-semibold', r.success ? 'text-rp-text' : 'text-rp-red')}>
                  {r.item_name}
                </span>
                <span className="text-[9px] font-mono text-rp-muted flex-shrink-0">
                  {formatTimestamp(r.timestamp)}
                </span>
              </div>
              <div className="text-[9px] font-mono text-rp-muted mt-0.5">{r.selector}</div>
              <div className="text-[10px] font-mono text-rp-muted mt-0.5">{r.message}</div>
              <div className="text-[9px] font-mono text-rp-purple mt-0.5">{r.order_id}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
