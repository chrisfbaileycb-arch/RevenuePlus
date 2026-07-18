export interface MenuItem {
  item_name: string;
  item_price: number;
  category: string;
  pos_element_selector: string;
  modifiers: string[];
  available: boolean;
}

export interface CartItem {
  item_name: string;
  item_price: number;
  quantity: number;
  selector: string;
}

export interface CustomerProfile {
  phone: string;
  name: string;
  payment_token: string | null;
  last_order: string[];
  loyalty_points: number;
  profile_exists: boolean;
  preferred_items: string[];
}

export interface InjectionResult {
  success: boolean;
  selector: string;
  item_name: string;
  message: string;
  timestamp: string;
  order_id: string;
}

export interface AgentCommand {
  action: 'extract_menu' | 'inject_order' | 'lookup_customer' | 'clear_cart' | 'get_cart' | 'help';
  payload?: Record<string, unknown>;
}

export interface AgentResponse {
  status: 'success' | 'error';
  action: string;
  data?: unknown;
  error?: string;
  timestamp: string;
}

export interface CommandLogEntry {
  id: string;
  input: string;
  output: string;
  type: 'success' | 'error' | 'info' | 'system';
  timestamp: string;
}

export interface AgentStats {
  menuItemsExtracted: number;
  ordersInjected: number;
  customerLookups: number;
  sessionStart: string;
}
