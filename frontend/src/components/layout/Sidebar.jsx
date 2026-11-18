import { NavLink } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';
import { NAV, canSee } from './nav';
import { toggleSidebar, setMobileNav } from '../../store';
import { cls } from '../../utils/format';

/**
 * Sticky left sidebar.
 * Desktop: width animates 16rem ⇄ 4.75rem with transition-all duration-300 ease-in-out;
 *          the main workspace's left padding animates in step, so it expands smoothly.
 * Mobile/tablet portrait: slides in as an overlay drawer.
 */
export default function Sidebar() {
  const dispatch = useDispatch();
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useSelector((s) => s.ui.mobileNavOpen);
  const role = useSelector((s) => s.auth.user?.role);
  const shopName = useSelector((s) => s.settings.data.shop_name);
  const items = NAV.filter((n) => canSee(role, n.minRole));

  const closeMobile = () => dispatch(setMobileNav(false));

  return (
    <>
      {/* mobile backdrop */}
      <div
        className={cls('fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] transition-opacity duration-300 ease-in-out lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0')}
        onClick={closeMobile}
      />
      <aside
        className={cls(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900',
          'transition-all duration-300 ease-in-out will-change-[width,transform]',
          collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64',
          'w-72',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand + collapse toggle */}
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
          <img src="./icon-192.png" alt="BikriPro" className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
          <div className={cls('min-w-0 flex-1 overflow-hidden transition-all duration-300 ease-in-out', collapsed ? 'lg:w-0 lg:opacity-0' : 'opacity-100')}>
            <p className="truncate text-[15px] font-extrabold leading-tight text-ocean-700 dark:text-ocean-300">BikriPro</p>
            <p className="truncate text-[11px] text-slate-500">{shopName || 'POS & ERP'}</p>
          </div>
          <button type="button" onClick={closeMobile} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Collapse / expand — door/panel icon */}
        <button
          type="button"
          onClick={() => dispatch(toggleSidebar())}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="group absolute -right-3.5 top-[4.4rem] z-50 hidden h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-md transition-all duration-300 ease-in-out hover:scale-110 hover:border-ocean-400 hover:text-ocean-600 dark:border-slate-700 dark:bg-slate-800 lg:flex"
        >
          {collapsed
            ? <PanelLeftOpen className="h-4 w-4 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
            : <PanelLeftClose className="h-4 w-4 transition-transform duration-300 ease-in-out group-hover:-translate-x-0.5" />}
        </button>

        <nav className="flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-2.5 py-3">
          {items.map(({ to, label, short, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={closeMobile}
              title={collapsed ? label : undefined}
              className={({ isActive }) => cls(
                'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-300 ease-in-out',
                isActive
                  ? 'bg-ocean-600 text-white shadow-pop'
                  : 'text-slate-600 hover:bg-ocean-50 hover:text-ocean-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
              )}
            >
              <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
              <span className={cls('whitespace-nowrap transition-all duration-300 ease-in-out', collapsed ? 'lg:w-0 lg:-translate-x-2 lg:opacity-0' : 'opacity-100')}>
                {collapsed ? short || label : label}
              </span>
              {/* tooltip when collapsed */}
              {collapsed && (
                <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 lg:block">
                  {label}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className={cls('shrink-0 border-t border-slate-100 p-3 text-center text-[11px] text-slate-400 transition-all duration-300 ease-in-out dark:border-slate-800', collapsed && 'lg:opacity-0')}>
          BikriPro v1.0
        </div>
      </aside>
    </>
  );
}
