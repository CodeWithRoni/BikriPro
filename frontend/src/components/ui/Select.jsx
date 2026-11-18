import { Children, Fragment, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cls } from '../../utils/format';

/** Plain text of option children ("Piece", " (pcs)") */
const textOf = (node) => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf(node.props.children);
  return '';
};

/** Read <option> children (arrays, fragments and `cond && <option>` included) into a flat list. */
function readOptions(children, out = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) { readOptions(child.props.children, out); return; }
    if (child.type === 'optgroup') { readOptions(child.props.children, out); return; }
    if (child.type !== 'option') return;
    const label = textOf(child.props.children);
    out.push({
      value: child.props.value !== undefined ? String(child.props.value) : label,
      label,
      disabled: !!child.props.disabled,
      icon: child.props['data-icon'] || null, // lucide icon component
      hint: child.props['data-hint'] ?? null, // small text on the right
      color: child.props['data-color'] || null, // colour dot
    });
  });
  return out;
}

const SEARCH_FROM = 8; // show a search box when the list is this long

/**
 * BikriPro drop-down — a drop-in replacement for <select>.
 *
 *   <Select className="input" value={v} onChange={(e) => set(e.target.value)}>
 *     <option value="">All</option>
 *     <option value="cash" data-icon={Banknote} data-hint="৳ 1,200">Cash</option>
 *   </Select>
 *
 * Same markup as a native select, but the open list is drawn by BikriPro (theme, dark mode,
 * search, check mark, keyboard) instead of by the browser / operating system.
 */
export default function Select({
  value, onChange, children, className = '', disabled = false, name, id,
  'aria-label': ariaLabel, title, searchable, placeholder,
}) {
  const options = useMemo(() => readOptions(children), [children]);
  const current = options.find((o) => o.value === String(value ?? ''));
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const listRef = useRef(null);
  const searchRef = useRef(null);
  const typed = useRef({ text: '', at: 0 });
  const uid = useId();
  const listId = `${uid}-list`;

  const withSearch = searchable ?? options.length >= SEARCH_FROM;
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? options.filter((o) => o.label.toLowerCase().includes(s)) : options;
  }, [options, q]);

  // ----- position the floating list under (or above) the button -----
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const want = Math.min(320, (withSearch ? 52 : 0) + options.length * 38 + 12);
    const below = vh - r.bottom - 8;
    const above = r.top - 8;
    const up = below < Math.min(want, 220) && above > below;
    const width = Math.min(Math.max(r.width, 200), vw - 16);
    const left = Math.min(Math.max(8, r.left), vw - width - 8);
    setPos({ left, width, up, top: up ? undefined : r.bottom + 6, bottom: up ? vh - r.top + 6 : undefined, max: Math.max(160, Math.min(want, up ? above - 6 : below - 6)) });
  };

  useLayoutEffect(() => { if (open) place(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onMove = (e) => { if (!popRef.current?.contains(e.target)) place(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown, { passive: true });
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Open with the current value highlighted straight away (no waiting for an effect),
  // so fast keyboard users and barcode-speed typing never act on a stale highlight.
  const openList = (initialQuery = '') => {
    setQ(initialQuery);
    const list = initialQuery ? options.filter((o) => o.label.toLowerCase().includes(initialQuery.toLowerCase())) : options;
    const cur = list.findIndex((o) => o.value === String(value ?? ''));
    setActive(cur >= 0 ? cur : list.findIndex((o) => !o.disabled));
    setOpen(true);
  };
  // Move focus into the search box once it exists
  useLayoutEffect(() => { if (open && withSearch) searchRef.current?.focus(); }, [open, withSearch]);

  const onSearch = (text) => {
    setQ(text);
    const s2 = text.trim().toLowerCase();
    const list = s2 ? options.filter((o) => o.label.toLowerCase().includes(s2)) : options;
    setActive(list.findIndex((o) => !o.disabled));
  };

  // Keep the highlighted row visible
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = (refocus = true) => { setOpen(false); setQ(''); if (refocus) btnRef.current?.focus(); };
  const choose = (o) => {
    if (!o || o.disabled) return;
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value, name }, currentTarget: { value: o.value, name } });
    close();
  };
  const step = (dir) => {
    if (!shown.length) return;
    let i = active;
    for (let n = 0; n < shown.length; n += 1) {
      i = (i + dir + shown.length) % shown.length;
      if (!shown[i].disabled) break;
    }
    setActive(i);
  };

  const onKey = (e) => {
    if (disabled) return;
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      else if (withSearch && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); openList(e.key); } // start typing = search
      return;
    }
    // Typing while focus is still on the button goes into the search box
    if (withSearch && e.target === btnRef.current && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault(); onSearch(q + e.key); searchRef.current?.focus(); return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); step(1); break;
      case 'ArrowUp': e.preventDefault(); step(-1); break;
      case 'Home': if (!withSearch) { e.preventDefault(); setActive(0); } break;
      case 'End': if (!withSearch) { e.preventDefault(); setActive(shown.length - 1); } break;
      case 'Enter': e.preventDefault(); choose(shown[active]); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break; // don't close a surrounding modal
      case 'Tab': close(false); break;
      case ' ': if (!withSearch) { e.preventDefault(); choose(shown[active]); } break;
      default:
        // Type-ahead when there is no search box: jump to the first option starting with the typed text
        if (!withSearch && e.key.length === 1) {
          const now = Date.now();
          typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : '') + e.key.toLowerCase(), at: now };
          const i = shown.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text));
          if (i >= 0) setActive(i);
        }
    }
  };

  const Icon = current?.icon;
  const isBlank = !current || current.value === '';

  return (
    <>
      <button
        ref={btnRef} type="button" id={id} title={title} disabled={disabled}
        role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-label={ariaLabel}
        aria-activedescendant={open && active >= 0 ? `${uid}-o${active}` : undefined}
        onClick={() => (open ? close() : openList())} onKeyDown={onKey}
        className={cls(className, 'relative flex items-center gap-2 pr-9 text-left disabled:cursor-not-allowed disabled:opacity-60', open && 'border-ocean-500 ring-4 ring-ocean-500/15')}
      >
        {Icon && <Icon className="h-4 w-4 shrink-0 text-slate-400" />}
        {current?.color && <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: current.color }} />}
        <span className={cls('min-w-0 flex-1 truncate', isBlank && 'text-slate-500 dark:text-slate-400')}>{current ? current.label : (placeholder || '—')}</span>
        <ChevronDown className={cls('pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-transform duration-200', open && 'rotate-180 text-ocean-500')} />
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className={cls('fixed z-[80] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white text-sm shadow-xl ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/5',
            pos.up ? 'origin-bottom animate-[bpPopUp_.14s_ease-out]' : 'origin-top animate-[bpPop_.14s_ease-out]')}
          style={{ left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, maxHeight: pos.max }}
        >
          {withSearch && (
            <div className="border-b border-slate-100 p-2 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  ref={searchRef} value={q} onChange={(e) => onSearch(e.target.value)} onKeyDown={onKey}
                  placeholder="Search…" aria-label="Search options" aria-controls={listId}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-ocean-500 focus:outline-none focus:ring-2 focus:ring-ocean-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>
          )}
          <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="flex-1 overflow-y-auto overscroll-contain p-1">
            {shown.length === 0 && <li className="px-3 py-6 text-center text-xs text-slate-400">No match</li>}
            {shown.map((o, i) => {
              const sel = o.value === String(value ?? '');
              const OIcon = o.icon;
              return (
                <li
                  key={`${o.value}-${i}`} id={`${uid}-o${i}`} data-index={i} role="option" aria-selected={sel} aria-disabled={o.disabled || undefined}
                  onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => !o.disabled && setActive(i)} onClick={() => choose(o)}
                  className={cls('flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
                    o.disabled && 'cursor-not-allowed opacity-40',
                    i === active && !o.disabled && 'bg-ocean-50 text-ocean-800 dark:bg-ocean-900/40 dark:text-ocean-100',
                    sel && 'font-semibold text-ocean-700 dark:text-ocean-300',
                    !sel && i !== active && 'text-slate-700 dark:text-slate-200')}
                >
                  {OIcon && <OIcon className={cls('h-4 w-4 shrink-0', sel ? 'text-ocean-500' : 'text-slate-400')} />}
                  {o.color && <span className="h-3 w-3 shrink-0 rounded-full border border-black/10" style={{ background: o.color }} />}
                  <span className={cls('min-w-0 flex-1 truncate', o.value === '' && !sel && 'text-slate-500 dark:text-slate-400')}>{o.label}</span>
                  {o.hint !== null && o.hint !== undefined && <span className="shrink-0 text-xs font-medium text-slate-400">{o.hint}</span>}
                  <Check className={cls('h-4 w-4 shrink-0 text-ocean-600 dark:text-ocean-400', !sel && 'invisible')} />
                </li>
              );
            })}
          </ul>
        </div>,
        document.body,
      )}
    </>
  );
}
