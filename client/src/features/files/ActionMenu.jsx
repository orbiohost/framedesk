import { Check, EllipsisVertical } from 'lucide-react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn.js';

const MENU_WIDTH = 216;
const GAP = 6;
const SHEET_QUERY = '(max-width: 639px)';

function useIsSheet() {
  const [isSheet, setIsSheet] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(SHEET_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia(SHEET_QUERY);
    const onChange = () => setIsSheet(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return isSheet;
}

// Below the trigger, right-aligned; flipped above when there isn't room.
// With `point` (a right-click), the menu opens at the cursor instead.
function placeMenu(trigger, menu, point) {
  const height = menu?.offsetHeight ?? 0;
  if (point) {
    const left = Math.min(window.innerWidth - MENU_WIDTH - 8, Math.max(8, point.x));
    const fitsBelow = point.y + height <= window.innerHeight - 8;
    const top = fitsBelow ? point.y : Math.max(8, point.y - height);
    return { left, top, origin: fitsBelow ? 'top left' : 'bottom left' };
  }
  const rect = trigger.getBoundingClientRect();
  const left = Math.min(window.innerWidth - MENU_WIDTH - 8, Math.max(8, rect.right - MENU_WIDTH));
  const below = rect.bottom + GAP;
  const fitsBelow = below + height <= window.innerHeight - 8;
  const top = fitsBelow ? below : Math.max(8, rect.top - GAP - height);
  return { left, top, origin: fitsBelow ? 'top right' : 'bottom right' };
}

const OPEN_EVENT = 'actionmenu:open';
// An element whose right-click opens the one item menu inside it. Cards and
// rows (`group`) count automatically; others opt in with data-context-menu.
const OWNER = '.group, [data-context-menu]';
const MENU_TRIGGER = '[data-action-menu]';

function ownedTriggers(owner) {
  return [...owner.querySelectorAll(MENU_TRIGGER)].filter(
    (el) => el.parentElement.closest(OWNER) === owner,
  );
}

function findMenuFor(target) {
  for (let owner = target.closest(OWNER); owner; owner = owner.parentElement?.closest(OWNER)) {
    const all = owner.querySelectorAll(MENU_TRIGGER);
    if (all.length === 1) return all[0];
    if (all.length > 1) {
      if (!owner.hasAttribute('data-context-menu')) return null;
      const own = ownedTriggers(owner);
      return own.length === 1 ? own[0] : null;
    }
  }
  return null;
}

/**
 * Replaces the browser's right-click menu across the app: a right-click on a
 * file, folder, project, etc. opens that item's own menu at the cursor.
 * Text fields keep the browser menu so copy and paste still work.
 */
export function installContextMenu() {
  document.addEventListener('contextmenu', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (
      target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
    ) {
      return;
    }
    event.preventDefault();
    const trigger = target && findMenuFor(target);
    trigger?.dispatchEvent(
      new CustomEvent(OPEN_EVENT, { detail: { x: event.clientX, y: event.clientY } }),
    );
  });
}

const TRIGGERS = {
  // Round, sits on a picture (grid cards).
  overlay:
    'h-8 w-8 bg-surface/90 text-ink shadow-sm ring-1 ring-line/60 backdrop-blur hover:bg-surface',
  // Outlined, in a toolbar.
  toolbar:
    'h-9 w-9 border border-line/80 bg-surface text-muted shadow-sm hover:text-ink hover:bg-subtle',
  // Plain, in rows and lists.
  plain: 'h-8 w-8 text-muted hover:bg-subtle hover:text-ink',
};

/**
 * A "⋯" button and its menu: a popover on wide screens, a bottom sheet on phones.
 * items: [{ key, label, icon, onSelect, danger?, divider? }] (divider: a line above).
 * title: heading shown in the sheet (e.g. the file or folder name).
 * revealOnHover: on devices with a mouse, the button only shows while its
 *   `group` is hovered or focused (always shown on touch).
 * trigger: content for the button in place of the "⋯" icon (e.g. a sort
 *   picker); `className` then styles the whole button. Items may set `checked`.
 */
export function ActionMenu({
  label,
  title,
  items,
  variant = 'plain',
  revealOnHover = false,
  trigger,
  className,
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const [point, setPoint] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const isSheet = useIsSheet();

  const close = useCallback((returnFocus = true) => {
    setOpen(false);
    setPosition(null);
    setPoint(null);
    if (returnFocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    if (!open || isSheet) return;
    setPosition(placeMenu(triggerRef.current, menuRef.current, point));
  }, [open, isSheet, point]);

  // A right-click on the item that owns this menu (see installContextMenu).
  useEffect(() => {
    const node = triggerRef.current;
    if (!node) return undefined;
    function onOpen(event) {
      setPosition(null);
      setPoint(event.detail);
      setOpen(true);
    }
    node.addEventListener(OPEN_EVENT, onOpen);
    return () => node.removeEventListener(OPEN_EVENT, onOpen);
  }, [items.length]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      close(false);
    }
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close();
      }
    }
    // The popover is fixed to the trigger; a scroll or resize would strand it.
    const onMove = () => !isSheet && close(false);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [open, isSheet, close]);

  // Focus the first item once the menu is on screen.
  useEffect(() => {
    if (!open) return;
    const first = menuRef.current?.querySelector('[role="menuitem"]');
    first?.focus({ preventScroll: true });
  }, [open, position]);

  if (items.length === 0) return null;

  // Events inside the portal still bubble through React to the row or card
  // that owns this menu; they must not open or trash the file behind it.
  const stop = (event) => event.stopPropagation();

  function onMenuKeyDown(event) {
    event.stopPropagation();
    const entries = [...menuRef.current.querySelectorAll('[role="menuitem"]')];
    const index = entries.indexOf(document.activeElement);
    const moves = { ArrowDown: 1, ArrowUp: -1 };
    if (event.key in moves) {
      event.preventDefault();
      entries[(index + moves[event.key] + entries.length) % entries.length]?.focus();
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      entries[event.key === 'Home' ? 0 : entries.length - 1]?.focus();
    }
    if (event.key === 'Tab') close(false);
  }

  const list = items.map((item) => (
    <div key={item.key ?? item.label}>
      {item.divider && <div className="bg-line/80 mx-2 my-1 h-px" role="separator" />}
      <button
        type="button"
        role="menuitem"
        onClick={(event) => {
          event.stopPropagation();
          close(false);
          item.onSelect();
        }}
        className={cn(
          'flex w-full items-center gap-3 rounded-xl text-left transition-colors focus-visible:ring-0 focus-visible:ring-offset-0',
          isSheet ? 'px-3 py-3 text-[15px]' : 'px-2.5 py-2 text-sm',
          item.danger
            ? 'text-danger hover:bg-danger/10 focus-visible:bg-danger/10'
            : 'hover:bg-subtle focus-visible:bg-subtle',
        )}
      >
        {item.icon && (
          <span
            className={cn(
              'grid shrink-0 place-items-center rounded-lg',
              isSheet ? 'h-9 w-9' : 'h-6 w-6',
              isSheet && (item.danger ? 'bg-danger/10' : 'bg-subtle'),
            )}
          >
            <item.icon className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <span className="flex-1 truncate font-medium">{item.label}</span>
        {item.checked && <Check className="text-accent h-4 w-4 shrink-0" aria-hidden="true" />}
      </button>
    </div>
  ));

  const menu = isSheet ? (
    <div className="fixed inset-0 z-[70]" onClick={stop} onDoubleClick={stop}>
      <div
        className="bg-ink/40 absolute inset-0 animate-[fade-in_180ms_ease-out] backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={() => close(false)}
      />
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label={label}
        onKeyDown={onMenuKeyDown}
        className="bg-surface text-ink absolute inset-x-0 bottom-0 max-h-[80vh] animate-[sheet-up_260ms_cubic-bezier(0.22,1,0.36,1)] overflow-y-auto rounded-t-3xl px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 shadow-2xl"
      >
        <div className="bg-line mx-auto mb-2 h-1.5 w-10 rounded-full" aria-hidden="true" />
        {title && (
          <p className="text-muted truncate px-3 pb-2 text-xs font-semibold uppercase tracking-[0.12em]">
            {title}
          </p>
        )}
        {list}
      </div>
    </div>
  ) : (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={label}
      onKeyDown={onMenuKeyDown}
      onClick={stop}
      onDoubleClick={stop}
      style={{
        width: MENU_WIDTH,
        left: position?.left ?? -9999,
        top: position?.top ?? -9999,
        transformOrigin: position?.origin,
      }}
      className={cn(
        'bg-surface text-ink border-line/80 shadow-lift fixed z-[70] rounded-2xl border p-1.5',
        position ? 'animate-[menu-in_140ms_cubic-bezier(0.22,1,0.36,1)]' : 'invisible',
      )}
    >
      {list}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={trigger ? undefined : label}
        title={label}
        data-action-menu={trigger ? undefined : ''}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(event) => {
          event.stopPropagation();
          if (open) close(false);
          else {
            setPoint(null);
            setOpen(true);
          }
        }}
        onDoubleClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
        className={cn(
          trigger
            ? 'flex shrink-0 items-center rounded-full transition-colors'
            : 'grid shrink-0 place-items-center rounded-full transition-all active:scale-90',
          !trigger && TRIGGERS[variant],
          revealOnHover &&
            '[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus-visible:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100',
          open && !trigger && 'bg-subtle text-ink opacity-100 [@media(hover:hover)]:opacity-100',
          className,
        )}
      >
        {trigger ?? <EllipsisVertical className="h-4 w-4" aria-hidden="true" />}
      </button>
      {open && createPortal(menu, document.body)}
    </>
  );
}
