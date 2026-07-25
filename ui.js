// Reusable UI primitives: toasts, the bottom sheet, and a promise-based
// confirm/choice dialog. No app logic lives here.

export const $ = (sel) => document.querySelector(sel);

/** Announce a message to screen readers without a visual change. */
export function announce(message) {
  const region = $('#live-region');
  // Clearing first guarantees the change is re-announced even for identical text.
  region.textContent = '';
  requestAnimationFrame(() => {
    region.textContent = message;
  });
}

let toastTimer;
export function toast(message) {
  const el = $('#toast');
  $('#toast-text').textContent = message;
  el.classList.remove('opacity-0');
  el.classList.add('opacity-100');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('opacity-100');
    el.classList.add('opacity-0');
  }, 2600);
  announce(message);
}

// ── Focus trapping ────────────────────────────────────────────────────
// Keeps Tab inside an open dialog, and restores focus to whatever opened it.

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

function visibleFocusable(container) {
  return [...container.querySelectorAll(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Trap Tab/Shift+Tab within `container` and route Escape to `onEscape`.
 * Returns a cleanup function that also restores the previously focused element.
 */
function trapFocus(container, onEscape) {
  const previouslyFocused = document.activeElement;

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onEscape?.();
      return;
    }
    if (event.key !== 'Tab') return;

    const items = visibleFocusable(container);
    if (items.length === 0) return;

    const first = items[0];
    const last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  container.addEventListener('keydown', onKeydown);

  return () => {
    container.removeEventListener('keydown', onKeydown);
    if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
  };
}

// ── Bottom sheet ──────────────────────────────────────────────────────

let releaseSheetFocus = null;

export function openSheet({ onClose } = {}) {
  const sheet = $('#sheet');
  const backdrop = $('#sheet-backdrop');

  backdrop.classList.remove('hidden');
  sheet.classList.remove('hidden');
  // Force a reflow so the transform transition runs from its start value.
  void sheet.offsetHeight;
  sheet.classList.remove('translate-y-full');

  document.body.classList.add('overflow-hidden');
  releaseSheetFocus = trapFocus(sheet, onClose);
}

export function closeSheet() {
  const sheet = $('#sheet');
  const backdrop = $('#sheet-backdrop');

  sheet.classList.add('translate-y-full');
  document.body.classList.remove('overflow-hidden');

  releaseSheetFocus?.();
  releaseSheetFocus = null;

  const finish = () => {
    sheet.classList.add('hidden');
    backdrop.classList.add('hidden');
  };
  sheet.addEventListener('transitionend', finish, { once: true });
  // Fallback in case the transition never fires (reduced motion, hidden tab).
  setTimeout(finish, 300);
}

export function isSheetOpen() {
  return !$('#sheet').classList.contains('hidden');
}

// ── Confirm / choice dialog ───────────────────────────────────────────

const BUTTON_STYLES = {
  primary:
    'min-h-12 rounded-xl bg-indigo-600 px-4 font-medium text-white transition active:scale-95 hover:bg-indigo-700',
  danger:
    'min-h-12 rounded-xl bg-red-600 px-4 font-medium text-white transition active:scale-95 hover:bg-red-700',
  neutral:
    'min-h-12 rounded-xl border border-slate-300 px-4 font-medium transition active:scale-95 dark:border-slate-700',
};

/**
 * Show a modal dialog and resolve with the chosen action's `value`.
 * Dismissing (Escape, backdrop tap) resolves with null.
 *
 * @param {{title: string, body?: string, actions: Array<{label: string, value: any, style?: keyof BUTTON_STYLES}>}} opts
 */
export function confirmDialog({ title, body = '', actions }) {
  return new Promise((resolve) => {
    const backdrop = $('#confirm-backdrop');
    const actionsEl = $('#confirm-actions');

    $('#confirm-title').textContent = title;
    $('#confirm-body').textContent = body;
    $('#confirm-body').classList.toggle('hidden', !body);
    actionsEl.replaceChildren();

    let release = null;

    const settle = (value) => {
      backdrop.classList.add('hidden');
      backdrop.classList.remove('flex');
      backdrop.removeEventListener('click', onBackdropClick);
      document.body.classList.remove('overflow-hidden');
      release?.();
      resolve(value);
    };

    function onBackdropClick(event) {
      if (event.target === backdrop) settle(null);
    }

    for (const action of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = action.label;
      btn.className = BUTTON_STYLES[action.style ?? 'neutral'];
      btn.addEventListener('click', () => settle(action.value));
      actionsEl.append(btn);
    }

    backdrop.classList.remove('hidden');
    backdrop.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    backdrop.addEventListener('click', onBackdropClick);

    release = trapFocus(backdrop, () => settle(null));
    visibleFocusable(actionsEl)[0]?.focus();
  });
}

/** Convenience wrapper for a two-button yes/no confirmation. */
export async function confirmAction({ title, body, confirmLabel = 'Confirm', danger = false }) {
  const result = await confirmDialog({
    title,
    body,
    actions: [
      { label: confirmLabel, value: true, style: danger ? 'danger' : 'primary' },
      { label: 'Cancel', value: null, style: 'neutral' },
    ],
  });
  return result === true;
}
