import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import Dashboard from '@/pages/Dashboard';
import MenuExtractor from '@/pages/MenuExtractor';
import OrderInjector from '@/pages/OrderInjector';
import CustomerLookup from '@/pages/CustomerLookup';
import WebhookRelay from '@/pages/WebhookRelay';
import WebSocketManager from '@/pages/WebSocketManager';
import SelectorMapper from '@/pages/SelectorMapper';
import NotFound from '@/pages/NotFound';
import { initAgentBridge, destroyAgentBridge } from '@/lib/agentBridge';
import { useAgentStore } from '@/stores/agentStore';

function AppShell() {
  const { setOnline, addCommandLog } = useAgentStore();

  useEffect(() => {
    // Initialize the agent bridge on mount
    initAgentBridge();
    setOnline(true);

    addCommandLog({
      input: '',
      output: '✓ Revenue Pulse Agent Bridge initialized — window.revenuePulse and window.injectAIOrder() are ready.',
      type: 'system',
      timestamp: new Date().toISOString(),
    });

    return () => {
      destroyAgentBridge();
      setOnline(false);
    };
  }, [setOnline, addCommandLog]);

  return (
    <div className="flex h-screen bg-rp-bg overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/menu-extractor" element={<MenuExtractor />} />
            <Route path="/order-injector" element={<OrderInjector />} />
            <Route path="/customer-lookup" element={<CustomerLookup />} />
            <Route path="/webhook-relay" element={<WebhookRelay />} />
            <Route path="/websocket" element={<WebSocketManager />} />
            <Route path="/selector-mapper" element={<SelectorMapper />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
      <Toaster
        theme="dark"
        toastOptions={{
          style: {
            background: '#0d1117',
            border: '1px solid #21262d',
            color: '#e6edf3',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '11px',
          },
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
