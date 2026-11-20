import {
  ShoppingCart, LayoutDashboard, Receipt, Undo2, PackagePlus, PackageMinus, Users, Truck,
  HandCoins, Wallet, Landmark, ReceiptText, Coins, BadgePercent, ClipboardCheck, UsersRound, Lightbulb, Package, TrendingUp,
  FileBarChart, Settings, History, Barcode, Tags, Globe, BookOpen, Store, Crown, ShoppingBag, Boxes, Calculator, ChartColumn, ShieldCheck,
} from 'lucide-react';

/**
 * Side menu, grouped by kind of work.
 * - PINNED items always sit at the top (one tap away at the till).
 * - GROUPS fold open / shut; the group holding the current page opens by itself.
 * minRole: lowest role that sees the item (cashier < manager < admin).
 * A group the user can see no item of is hidden.
 */
export const PINNED = [
  { to: '/pos', label: 'Point of Sale (POS)', short: 'POS', icon: ShoppingCart, minRole: 'cashier' },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, minRole: 'cashier' },
  { to: '/owner', label: 'Owner Dashboard', short: 'Owner', icon: Crown, minRole: 'admin' },
];

export const GROUPS = [
  {
    id: 'sales', label: 'Sales', icon: ShoppingBag,
    items: [
      { to: '/sales', label: 'Sales', icon: Receipt, minRole: 'cashier' },
      { to: '/online-orders', label: 'Online Orders', icon: Globe, minRole: 'cashier' },
      { to: '/sales-return', label: 'Sales Return', icon: Undo2, minRole: 'manager' },
      { to: '/customers', label: 'Customers', icon: Users, minRole: 'cashier' },
      { to: '/collection', label: 'Due Collection', icon: HandCoins, minRole: 'cashier' },
      { to: '/offers', label: 'Offers & Discounts', icon: BadgePercent, minRole: 'manager' },
    ],
  },
  {
    id: 'purchase', label: 'Purchase', icon: PackagePlus,
    items: [
      { to: '/purchase', label: 'Purchase & Orders', icon: PackagePlus, minRole: 'manager' },
      { to: '/purchase-return', label: 'Purchase Return', icon: PackageMinus, minRole: 'manager' },
      { to: '/suppliers', label: 'Suppliers', icon: Truck, minRole: 'manager' },
      { to: '/payment', label: 'Supplier Payment', icon: Wallet, minRole: 'manager' },
    ],
  },
  {
    id: 'inventory', label: 'Inventory', icon: Boxes,
    items: [
      { to: '/products', label: 'Products', icon: Package, minRole: 'manager' },
      { to: '/stock-control', label: 'Stock Control', icon: ClipboardCheck, minRole: 'manager' },
      { to: '/branches', label: 'Branches & Transfers', icon: Store, minRole: 'manager' },
      { to: '/price-manager', label: 'Price Manager', icon: Tags, minRole: 'manager' },
      { to: '/barcode', label: 'Barcode Labels', icon: Barcode, minRole: 'cashier' },
    ],
  },
  {
    id: 'finance', label: 'Finance', icon: Calculator,
    items: [
      { to: '/day-closing', label: 'Day Closing', icon: Coins, minRole: 'cashier' },
      { to: '/accounts', label: 'Cash, Bank & MFS', icon: Landmark, minRole: 'manager' },
      { to: '/expenses', label: 'Expenses', icon: ReceiptText, minRole: 'manager' },
      { to: '/accounting', label: 'Accounting', icon: BookOpen, minRole: 'manager' },
    ],
  },
  {
    id: 'reports', label: 'Reports', icon: ChartColumn,
    items: [
      { to: '/profit', label: 'Profit', icon: TrendingUp, minRole: 'manager' },
      { to: '/reports', label: 'Report Hub', icon: FileBarChart, minRole: 'manager' },
      { to: '/insights', label: 'Smart Reports', icon: Lightbulb, minRole: 'manager' },
    ],
  },
  {
    id: 'admin', label: 'Administration', icon: ShieldCheck,
    items: [
      { to: '/staff', label: 'Staff', icon: UsersRound, minRole: 'manager' },
      { to: '/activity', label: 'Activity Log', icon: History, minRole: 'manager' },
      { to: '/settings', label: 'Shop Setup', icon: Settings, minRole: 'admin' },
    ],
  },
];

/** Flat list of every page (routes, page titles). */
export const NAV = [...PINNED, ...GROUPS.flatMap((g) => g.items.map((i) => ({ ...i, group: g.id })))];

export const RANK = { cashier: 1, manager: 2, admin: 3 };
export const canSee = (role, minRole) => (RANK[role] || 0) >= RANK[minRole];

/** True when the path is this page or one of its sub-pages ("/sales" does not match "/sales-return"). */
export const isActivePath = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);
