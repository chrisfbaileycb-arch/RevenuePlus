import { Link } from 'react-router-dom';
import { Terminal } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center p-8">
      <Terminal size={32} className="text-rp-cyan mb-4" />
      <div className="font-mono text-rp-red text-2xl font-bold mb-2">404</div>
      <div className="font-mono text-rp-muted text-sm mb-1">Route not found in agent bridge</div>
      <div className="font-mono text-rp-muted/50 text-xs mb-6">The requested path does not exist in this session.</div>
      <Link
        to="/"
        className="flex items-center gap-2 px-4 py-2 rounded border border-rp-cyan/40 bg-rp-cyan/10 text-rp-cyan text-xs font-mono hover:bg-rp-cyan/20 transition-colors"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
