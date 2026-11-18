import {
  ShoppingCart, LayoutDashboard, Receipt, Undo2, PackagePlus, PackageMinus, Users, Truck,
  HandCoins, Wallet, Landmark, ReceiptText, Coins, BadgePercent, ClipboardCheck, Package, TrendingUp, FileBarChart, Settings, History, Barcode, Tags,
} from 'lucide-react';

/**
 * Side menu — STRICT ORDER as specified.
 * minRole: lowest role that sees the item (cashier < manager < admin).
 */
export const NAV = [
  { to: '/pos', label: 'Point of Sale (POS)', short: 'POS', icon: ShoppingCart, minRole: 'cashier' },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'cashier' },
  { to: '/sales', label: 'Sales', icon: Receipt, minRole: 'cashier' },
  { to: '/sales-return', label: 'Sales Return', icon: Undo2, minRole: 'manager' },
  { to: '/purchase', label: 'Purchase', icon: PackagePlus, minRole: 'manager' },
  { to: '/purchase-return', label: 'Purchase Return', icon: PackageMinus, minRole: 'manager' },
  { to: '/customers', label: 'Customers', icon: Users, minRole: 'cashier' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, minRole: 'manager' },
  { to: '/payment', label: 'Payment', icon: Wallet, minRole: 'manager' },
  { to: '/collection', label: 'Collection', icon: HandCoins, minRole: 'cashier' },
  { to: '/day-closing', label: 'Day Closing', icon: Coins, minRole: 'cashier' },
  { to: '/products', label: 'Products', icon: Package, minRole: 'manager' },
  { to: '/stock-control', label: 'Stock Control', icon: ClipboardCheck, minRole: 'manager' },
  { to: '/offers', label: 'Offers', icon: BadgePercent, minRole: 'manager' },
  { to: '/accounts', label: 'Cash, Bank & MFS', short: 'Accounts', icon: Landmark, minRole: 'manager' },
  { to: '/expenses', label: 'Expenses', icon: ReceiptText, minRole: 'manager' },
  { to: '/profit', label: 'Profit', icon: TrendingUp, minRole: 'manager' },
  { to: '/reports', label: 'Report Hub', icon: FileBarChart, minRole: 'manager' },
  { to: '/activity', label: 'Activity Log', icon: History, minRole: 'manager' },
  { to: '/barcode', label: 'Barcode Labels', icon: Barcode, minRole: 'cashier' },
  { to: '/price-manager', label: 'Price Manager', icon: Tags, minRole: 'manager' },
  { to: '/settings', label: 'Shop Setup', icon: Settings, minRole: 'admin' },
];

export const RANK = { cashier: 1, manager: 2, admin: 3 };
export const canSee = (role, minRole) => (RANK[role] || 0) >= RANK[minRole];
