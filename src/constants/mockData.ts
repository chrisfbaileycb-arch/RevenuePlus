import { CustomerProfile } from '@/types/pos';

export interface MockMenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
  modifiers: string[];
  available: boolean;
}

export const MOCK_MENU: MockMenuItem[] = [
  // Burgers
  { id: 'item-001', name: 'Classic Smash Burger', price: 12.99, category: 'Burgers', modifiers: ['no-onion', 'extra-sauce', 'add-bacon'], available: true },
  { id: 'item-002', name: 'Double Stack Burger', price: 15.99, category: 'Burgers', modifiers: ['no-onion', 'extra-cheese', 'add-avocado'], available: true },
  { id: 'item-003', name: 'Mushroom Swiss Burger', price: 14.49, category: 'Burgers', modifiers: ['no-mushroom', 'extra-swiss'], available: true },
  { id: 'item-004', name: 'BBQ Bacon Burger', price: 16.99, category: 'Burgers', modifiers: ['no-bacon', 'extra-bbq', 'no-onion'], available: true },
  // Pizzas
  { id: 'item-005', name: 'Margherita Pizza', price: 13.99, category: 'Pizza', modifiers: ['thin-crust', 'thick-crust', 'extra-cheese'], available: true },
  { id: 'item-006', name: 'Pepperoni Pizza', price: 15.99, category: 'Pizza', modifiers: ['extra-pepperoni', 'thin-crust', 'no-sauce'], available: true },
  { id: 'item-007', name: 'BBQ Chicken Pizza', price: 16.49, category: 'Pizza', modifiers: ['extra-chicken', 'no-onion', 'extra-bbq'], available: true },
  { id: 'item-008', name: 'Veggie Supreme', price: 14.99, category: 'Pizza', modifiers: ['extra-veggies', 'thin-crust'], available: false },
  // Drinks
  { id: 'item-009', name: 'Fountain Soda', price: 2.99, category: 'Drinks', modifiers: ['no-ice', 'extra-ice', 'lemon'], available: true },
  { id: 'item-010', name: 'Craft Lemonade', price: 3.99, category: 'Drinks', modifiers: ['no-sugar', 'extra-lemon', 'mint'], available: true },
  { id: 'item-011', name: 'Iced Coffee', price: 4.49, category: 'Drinks', modifiers: ['oat-milk', 'extra-shot', 'no-sugar'], available: true },
  { id: 'item-012', name: 'Bottled Water', price: 1.99, category: 'Drinks', modifiers: [], available: true },
  // Sides
  { id: 'item-013', name: 'Crispy Fries', price: 4.99, category: 'Sides', modifiers: ['extra-salt', 'no-salt', 'seasoned'], available: true },
  { id: 'item-014', name: 'Onion Rings', price: 5.49, category: 'Sides', modifiers: ['ranch', 'ketchup'], available: true },
  { id: 'item-015', name: 'Side Salad', price: 5.99, category: 'Sides', modifiers: ['ranch', 'italian', 'no-dressing'], available: true },
  { id: 'item-016', name: 'Mac & Cheese Bites', price: 6.49, category: 'Sides', modifiers: ['extra-sauce'], available: true },
];

export const MOCK_CUSTOMERS: CustomerProfile[] = [
  {
    phone: '5550101',
    name: 'Marcus T.',
    payment_token: 'tok_visa_4242_saved',
    last_order: ['Double Stack Burger', 'Crispy Fries', 'Iced Coffee'],
    loyalty_points: 340,
    profile_exists: true,
    preferred_items: ['#pos-item-002', '#pos-item-013', '#pos-item-011'],
  },
  {
    phone: '5550202',
    name: 'Sarah K.',
    payment_token: 'tok_mc_5555_saved',
    last_order: ['Margherita Pizza', 'Side Salad', 'Craft Lemonade'],
    loyalty_points: 120,
    profile_exists: true,
    preferred_items: ['#pos-item-005', '#pos-item-015', '#pos-item-010'],
  },
  {
    phone: '5550303',
    name: 'James R.',
    payment_token: null,
    last_order: ['BBQ Bacon Burger', 'Onion Rings'],
    loyalty_points: 0,
    profile_exists: true,
    preferred_items: ['#pos-item-004', '#pos-item-014'],
  },
];

export const CATEGORIES = ['All', 'Burgers', 'Pizza', 'Drinks', 'Sides'];
