// Pure helpers for searching, filtering and ordering cards.
// Kept free of DOM and storage so they can be reasoned about (and tested) alone.

/**
 * Case-insensitive substring match across front, back and tags.
 * Multiple whitespace-separated terms must all match (AND), which makes
 * narrowing a large list feel predictable.
 */
export function matchesQuery(card, query) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const haystack = `${card.front}\n${card.back}\n${card.tags.join(' ')}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function hasTag(card, tag) {
  if (!tag) return true;
  const needle = tag.toLowerCase();
  return card.tags.some((t) => t.toLowerCase() === needle);
}

export function filterCards(cards, { query = '', tag = '' } = {}) {
  return cards.filter((card) => hasTag(card, tag) && matchesQuery(card, query));
}

export const SORTS = {
  newest: { label: 'Newest first', compare: (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) },
  oldest: { label: 'Oldest first', compare: (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) },
  updated: { label: 'Recently edited', compare: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) },
  alpha: { label: 'A → Z', compare: (a, b) => a.front.localeCompare(b.front) },
};

export function sortCards(cards, key) {
  const sort = SORTS[key] ?? SORTS.newest;
  return cards.slice().sort(sort.compare);
}

/** Fisher-Yates shuffle on a copy. */
export function shuffled(cards) {
  const out = cards.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
