// Data layer: localStorage persistence, CRUD, import/export.
// Storage shape: { version: 1, cards: [Card] }
// Card: { id, front, back, tags: [string], createdAt, updatedAt }

const STORAGE_KEY = 'flashcard.data.v1';
export const SCHEMA_VERSION = 1;

/** Subscribers notified after any mutation. */
const listeners = new Set();

/** In-memory copy of the data; the single source of truth while running. */
let state = { version: SCHEMA_VERSION, cards: [] };

/** Set when a write to localStorage fails, so the UI can warn instead of silently losing data. */
let storageError = null;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn();
}

export function getStorageError() {
  return storageError;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Coerce an unknown value into a valid Card, or return null if it cannot be
 * salvaged. Used for both stored data and imported files, so a hand-edited or
 * truncated file degrades gracefully instead of breaking the app.
 */
function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const front = typeof raw.front === 'string' ? raw.front.trim() : '';
  const back = typeof raw.back === 'string' ? raw.back.trim() : '';
  if (!front && !back) return null;

  let tags = [];
  if (Array.isArray(raw.tags)) {
    tags = raw.tags.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean);
  } else if (typeof raw.tags === 'string') {
    tags = parseTags(raw.tags);
  }
  tags = dedupeTags(tags);

  const now = new Date().toISOString();
  const createdAt = isIsoDate(raw.createdAt) ? raw.createdAt : now;
  const updatedAt = isIsoDate(raw.updatedAt) ? raw.updatedAt : createdAt;

  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : newId(),
    front,
    back,
    tags,
    createdAt,
    updatedAt,
  };
}

function isIsoDate(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/** "a, b,,c" -> ["a","b","c"] */
export function parseTags(input) {
  if (typeof input !== 'string') return [];
  return dedupeTags(
    input
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  );
}

/** Case-insensitive dedupe, keeping the first spelling seen. */
function dedupeTags(tags) {
  const seen = new Set();
  const out = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/**
 * Validate a parsed JSON payload from an export file.
 * Returns { cards } on success, throws Error with a user-facing message otherwise.
 */
export function validateImportPayload(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('This file does not look like a flashcard export (expected a JSON object).');
  }
  if (!Array.isArray(parsed.cards)) {
    throw new Error('This file is missing a "cards" list, so it cannot be imported.');
  }
  if (parsed.version != null && Number(parsed.version) > SCHEMA_VERSION) {
    throw new Error(
      `This file was created by a newer version of the app (format v${parsed.version}). Please update the app first.`,
    );
  }

  const cards = [];
  let skipped = 0;
  for (const raw of parsed.cards) {
    const card = normalizeCard(raw);
    if (card) cards.push(card);
    else skipped += 1;
  }
  return { cards, skipped };
}

export function load() {
  storageError = null;
  let rawText;
  try {
    rawText = localStorage.getItem(STORAGE_KEY);
  } catch (err) {
    // Safari private mode and some embedded browsers throw on access.
    storageError = 'Storage is unavailable in this browser, so cards cannot be saved. Export your data to keep it.';
    state = { version: SCHEMA_VERSION, cards: [] };
    return;
  }

  if (!rawText) {
    state = { version: SCHEMA_VERSION, cards: [] };
    return;
  }

  try {
    const parsed = JSON.parse(rawText);
    const cards = Array.isArray(parsed?.cards) ? parsed.cards : [];
    state = {
      version: SCHEMA_VERSION,
      cards: cards.map(normalizeCard).filter(Boolean),
    };
  } catch (err) {
    // Keep the corrupt value under a backup key rather than overwriting it, so
    // the data can still be recovered by hand.
    storageError = 'Saved data could not be read and was set aside. Your cards may be missing.';
    try {
      localStorage.setItem(`${STORAGE_KEY}.corrupt.${Date.now()}`, rawText);
    } catch {
      /* best effort only */
    }
    state = { version: SCHEMA_VERSION, cards: [] };
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    storageError = null;
    return true;
  } catch (err) {
    storageError =
      err?.name === 'QuotaExceededError'
        ? 'Storage is full, so the last change was not saved. Delete some cards or export and start fresh.'
        : 'The last change could not be saved to this browser. Export your data to avoid losing it.';
    return false;
  }
}

function commit() {
  persist();
  emit();
}

export function getCards() {
  return state.cards;
}

export function getCard(id) {
  return state.cards.find((c) => c.id === id) ?? null;
}

export function getAllTags() {
  const counts = new Map();
  for (const card of state.cards) {
    for (const tag of card.tags) {
      const key = tag.toLowerCase();
      const entry = counts.get(key);
      if (entry) entry.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => a.tag.localeCompare(b.tag));
}

export function addCard({ front, back, tags }) {
  const now = new Date().toISOString();
  const card = {
    id: newId(),
    front: front.trim(),
    back: back.trim(),
    tags: dedupeTags(tags ?? []),
    createdAt: now,
    updatedAt: now,
  };
  state.cards.unshift(card);
  commit();
  return card;
}

export function updateCard(id, { front, back, tags }) {
  const card = getCard(id);
  if (!card) return null;
  card.front = front.trim();
  card.back = back.trim();
  card.tags = dedupeTags(tags ?? []);
  card.updatedAt = new Date().toISOString();
  commit();
  return card;
}

export function deleteCard(id) {
  const before = state.cards.length;
  state.cards = state.cards.filter((c) => c.id !== id);
  if (state.cards.length === before) return false;
  commit();
  return true;
}

export function deleteAll() {
  state.cards = [];
  commit();
}

/**
 * Replace all cards with the imported set.
 */
export function importReplace(cards) {
  state.cards = cards.slice();
  commit();
  return { added: cards.length, updated: 0, unchanged: 0 };
}

/**
 * Merge imported cards into the existing set. Cards are matched by id; when both
 * sides have the same id the one with the newer updatedAt wins. This is what
 * makes syncing between two browsers work in both directions.
 */
export function importMerge(cards) {
  const byId = new Map(state.cards.map((c) => [c.id, c]));
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const incoming of cards) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      added += 1;
      continue;
    }
    if (Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)) {
      byId.set(incoming.id, incoming);
      updated += 1;
    } else {
      unchanged += 1;
    }
  }

  state.cards = [...byId.values()].sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  commit();
  return { added, updated, unchanged };
}

export function exportPayload() {
  return {
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    cards: state.cards,
  };
}

export function exportFilename() {
  const d = new Date();
  const stamp = [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
  return `flashcards-${stamp}.json`;
}
