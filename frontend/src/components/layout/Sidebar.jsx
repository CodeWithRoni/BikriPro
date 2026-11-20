import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { PanelLeftClose, PanelLeftOpen, X, ChevronDown } from 'lucide-react';
import { PINNED, GROUPS, canSee, isActivePath } from './nav';
import { toggleSidebar, setMobileNav } from '../../store';
import { cls } from '../../utils/format';

const OPEN_KEY = 'bp_nav_group';
const EASE = 'transition-all duration-300 ease-in-out';

/**
 * Sticky left sidebar with grouped menu.
 * Desktop: width animates 16rem ⇄ 4.75rem; the workspace padding animates in step.
 *   Expanded  → pinned items, then groups that fold open / shut (one open at a time).
 *   Collapsed → icon rail; hovering a group icon opens a fly-out panel with its pages.
 * Mobile/tablet portrait: slides in as an overlay drawer, always expanded.
 */
export default function Sidebar() {
  const dispatch = useDispatch();
  const { pathname } = useLocation();
  const collapsed = useSelector((s) => s.ui.sidebarCollapsed);
  const mobileOpen = useSelector((s) => s.ui.mobileNavOpen);
  const role = useSelector((s) => s.auth.user?.role);
  const shopName = useSelector((s) => s.settings.data.shop_name);

  const pinned = PINNED.filter((n) => canSee(role, n.minRole));
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => canSee(role, n.minRole)) })).filter((g) => g.items.length);
  const activeGroup = groups.find((g) => g.items.some((i) => isActivePath(pathname, i.to)))?.id;

  // Which group is unfolded (expanded mode). Follows the current page.
  const [open, setOpen] = useState(() => localStorage.getItem(OPEN_KEY) || activeGroup || null);
  useEffect(() => { if (activeGroup) setOpen(activeGroup); }, [activeGroup]);
  useEffect(() => { try { if (open) localStorage.setItem(OPEN_KEY, open); else localStorage.removeItem(OPEN_KEY); } catch { /* ignore */ } }, [open]);

  // Fly-out for the collapsed rail (fixed-positioned so the scrolling menu can't clip it)
  const [fly, setFly] = useState(null); // { id, top, left }
  const timer = useRef(null);
  const showFly = (id, el, rows = 0) => {
    clearTimeout(timer.current);
    const r = el.getBoundingClientRect();
    const height = rows ? rows * 36 + 40 : 40; // keep the panel on screen near the bottom
    setFly({ id, top: Math.max(8, Math.min(r.top, window.innerHeight - height - 8)), left: r.right + 10 });
  };
  const hideFly = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setFly(null), 140); };
  useEffect(() => setFly(null), [pathname, collapsed]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const rail = collapsed; // desktop icon-only mode (CSS keeps mobile drawer expanded)
  const closeMobile = () => dispatch(setMobileNav(false));
  const flyGroup = fly && groups.find((g) => g.id === fly.id);
  const flyPinned = fly && pinned.find((p) => p.to === fly.id);

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
          EASE, 'will-change-[width,transform]',
          collapsed ? 'lg:w-[4.75rem]' : 'lg:w-64',
          'w-72',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-100 px-3 dark:border-slate-800">
          <img src="./icon-192.png" alt="BikriPro" className="h-10 w-10 shrink-0 rounded-xl shadow-sm" />
          <div className={cls('min-w-0 flex-1 overflow-hidden', EASE, collapsed ? 'lg:w-0 lg:opacity-0' : 'opacity-100')}>
            <p className="truncate text-[15px] font-extrabold leading-tight text-ocean-700 dark:text-ocean-300">BikriPro</p>
            <p className="truncate text-[11px] text-slate-500">{shopName || 'POS & ERP'}</p>
          </div>
          <button type="button" onClick={closeMobile} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Collapse / expand */}
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

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-3" aria-label="Main menu">
          {/* Pinned */}
          <div className="space-y-0.5">
            {pinned.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={closeMobile}
                aria-label={label}
                onMouseEnter={(e) => rail && showFly(to, e.currentTarget)}
                onMouseLeave={() => rail && hideFly()}
                className={({ isActive }) => cls(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium', EASE,
                  isActive
                    ? 'bg-ocean-600 text-white shadow-pop'
                    : 'text-slate-600 hover:bg-ocean-50 hover:text-ocean-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                )}
              >
                <Icon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                <Label rail={rail}>{label}</Label>
              </NavLink>
            ))}
          </div>

          <div className="mx-2 my-3 h-px bg-slate-100 dark:bg-slate-800" />

          {/* Groups */}
          <div className="space-y-1">
            {groups.map((g) => {
              const isOpen = open === g.id;
              const hasActive = activeGroup === g.id;
              const GIcon = g.icon;
              return (
                <div key={g.id}>
                  <button
                    type="button"
                    aria-expanded={rail ? undefined : isOpen}
                    aria-label={g.label}
                    onClick={(e) => (rail && window.matchMedia('(min-width: 1024px)').matches ? showFly(g.id, e.currentTarget, g.items.length) : setOpen(isOpen ? null : g.id))}
                    onMouseEnter={(e) => rail && showFly(g.id, e.currentTarget, g.items.length)}
                    onMouseLeave={() => rail && hideFly()}
                    className={cls(
                      'group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm', EASE,
                      hasActive
                        ? cls('font-semibold text-ocean-700 dark:text-ocean-300', rail && 'lg:bg-ocean-50 dark:lg:bg-ocean-900/30')
                        : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white',
                      fly?.id === g.id && 'bg-slate-50 dark:bg-slate-800'
                    )}
                  >
                    <GIcon className="h-[1.15rem] w-[1.15rem] shrink-0" />
                    <Label rail={rail} className="flex-1">{g.label}</Label>
                    {hasActive && !isOpen && <span className={cls('h-1.5 w-1.5 shrink-0 rounded-full bg-ocean-500', rail && 'lg:hidden')} />}
                    <ChevronDown className={cls('h-4 w-4 shrink-0 text-slate-400', EASE, isOpen && 'rotate-180', rail && 'lg:hidden')} />
                  </button>

                  {/* Items — height animates via grid rows 0fr ⇄ 1fr */}
                  <div className={cls('grid', EASE, isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0', rail && 'lg:hidden')}>
                    <div className="overflow-hidden">
                      <div className="relative ml-[1.35rem] mt-0.5 space-y-0.5 border-l border-slate-200 py-0.5 pl-3 dark:border-slate-700">
                        {g.items.map(({ to, label, icon: Icon }) => (
                          <NavLink
                            key={to}
                            to={to}
                            onClick={closeMobile}
                            tabIndex={isOpen ? undefined : -1}
                            className={({ isActive }) => cls(
                              'relative flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px]', EASE,
                              isActive
                                ? 'bg-ocean-50 font-semibold text-ocean-700 before:absolute before:-left-[13px] before:top-1.5 before:bottom-1.5 before:w-[2px] before:rounded-full before:bg-ocean-600 dark:bg-ocean-900/30 dark:text-ocean-200'
                                : 'font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                            )}
                          >
                            <Icon className="h-4 w-4 shrink-0 opacity-80" />
                            <span className="truncate">{label}</span>
                          </NavLink>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </nav>

        <div className={cls('shrink-0 border-t border-slate-100 p-3 text-center text-[11px] text-slate-400 dark:border-slate-800', EASE, collapsed && 'lg:opacity-0')}>
          BikriPro v1.0
        </div>
      </aside>

      {/* Collapsed rail: fly-out panel (group pages) or name tip (pinned item) */}
      {rail && fly && (flyGroup || flyPinned) && (
        <div
          className="fixed z-[60] hidden animate-[flyIn_150ms_ease-out] lg:block"
          style={{ top: fly.top, left: fly.left }}
          onMouseEnter={() => clearTimeout(timer.current)}
          onMouseLeave={hideFly}
        >
          {flyPinned ? (
            <span className="block whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-lg" style={{ marginTop: 6 }}>{flyPinned.label}</span>
          ) : (
            <div className="w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{flyGroup.label}</p>
              {flyGroup.items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={() => setFly(null)}
                  className={({ isActive }) => cls(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors',
                    isActive ? 'bg-ocean-50 font-semibold text-ocean-700 dark:bg-ocean-900/30 dark:text-ocean-200' : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0 opacity-80" />
                  {label}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

/** Menu text that fades, shrinks and slides away in the collapsed rail (desktop only). */
function Label({ rail, className, children }) {
  return (
    <span className={cls('whitespace-nowrap', EASE, rail ? 'lg:w-0 lg:-translate-x-2 lg:opacity-0' : 'opacity-100', className)}>
      {children}
    </span>
  );
}
