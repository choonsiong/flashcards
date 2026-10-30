# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
npm install         # once, for the Tailwind CLI
npm run build       # one-off minified build of styles.css
npm run dev         # rebuild styles.css on change
npm run serve       # static server on http://localhost:8000
```

There is no test suite, linter, or bundler. `index.html` can also be opened
directly from disk — the app has no server dependency.

## Critical: styles.css is a committed build artifact

`styles.css` is generated from `src/input.css` by the Tailwind CLI and **is
committed**, because GitHub Pages serves the repo as plain static files with no
build step.

After changing any Tailwind class in `index.html`, `app.js`, or `ui.js`, run
`npm run build` and commit the result. The Pages workflow rebuilds the CSS and
**fails the deploy** if the committed file differs. The build is deterministic,
so a clean tree always passes.

`src/input.css` uses `@import 'tailwindcss' source(none)` with explicit
`@source` directives. Do not remove `source(none)`: Tailwind v4's automatic
project scan otherwise reads prose in `README.md` and emits utilities for words
that merely appear in English text. Any new file containing Tailwind classes
must be added as an `@source` line or its classes will silently not compile.

## Architecture

Five ES modules, loaded natively via `<script type="module">`. No framework.

`store.js`, `filter.js`, `ui.js`, and `theme.js` import nothing — `app.js` is
their only consumer. Keep it that way; the dependency graph is deliberately a
star.

| Module | Responsibility |
| --- | --- |
| `store.js` | Card state, localStorage, validation, import/export. Owns the schema. |
| `filter.js` | Pure search/sort/shuffle. No DOM, no storage. |
| `ui.js` | Toast, bottom sheet, promise-based dialogs, focus trapping. No app logic. |
| `theme.js` | Light/dark/system preference, its persistence, and the `dark` class. |
| `app.js` | View switching, rendering, event wiring. The only module that knows about both data and DOM. |

### Rendering model

`app.js` holds ephemeral view state (`ui` object: current view, query, tag,
expanded card ids, study position). Only the sort preference is persisted.

Every `store.js` mutator ends in `commit()`, which persists and then calls
subscribers **synchronously**. `app.js` subscribes `renderAll`, so the DOM
re-renders during the mutating call, before the next line of the caller runs.

This ordering has already caused one bug. When a change to `ui` view state must
be reflected in the same interaction as a store mutation, set the view state
*before* calling the mutator — or, if it depends on data the mutator creates
(such as a new card's id), call `renderList()` explicitly afterward. See
`submitEditor` in `app.js`, which does both.

Rendering rebuilds subtrees with `replaceChildren`. There is no diffing, so
avoid holding references to card DOM nodes across a render.

### Card text is inserted with `textContent`, never `innerHTML`

Card content is arbitrary user text. All of it reaches the DOM via `textContent`
or `createElement`. Introducing `innerHTML` for card fields would make stored
text executable.

### Night mode is class-based, and applied twice

`src/input.css` redefines the `dark:` variant with `@custom-variant dark
(&:where(.dark, .dark *))`, so dark styling keys off a `dark` class on `<html>`
rather than `prefers-color-scheme`. Without that class nothing is dark — the
media query alone no longer has any effect.

`theme.js` owns the class. The stored preference is `light`, `dark`, or
`system`; `system` mirrors the media query and stays live via a `change`
listener.

Two controls edit it: the header button in the list view (a straight flip to
the opposite of what is on screen, which leaves `system` behind) and the
three-way picker in Data → Appearance. Both render from a `theme.js`
subscription rather than from `renderAll`, because an OS appearance change
while the preference is `system` has to update the header icon as well as the
colours, and no store mutation occurs to trigger a normal re-render.

The inline `<script>` in `index.html`'s `<head>` **deliberately duplicates** the
storage key and the resolution rule, because `app.js` is a module and therefore
deferred — too late to prevent a flash of light theme. Change the two together.
Both also set the single `<meta name="theme-color">`, which for the same reason
cannot use the `media="(prefers-color-scheme: …)"` pair.

### Data format and storage keys

`localStorage['flashcard.data.v1']` holds `{ version, cards[] }`;
`flashcard.sort.v1` holds the sort preference and `flashcard.theme.v1` the
theme. Cards are
`{ id, front, back, tags[], createdAt, updatedAt }` — `front` is the prompt,
`back` is the details.

`SCHEMA_VERSION` in `store.js` gates imports: a file with a higher version is
rejected with an explanation rather than parsed. Bump it only alongside a
migration path in `load()`.

`normalizeCard()` coerces untrusted input for both stored data and imported
files, and returns `null` for unsalvageable entries. Import skips those rather
than failing the whole file, and repairs missing ids and invalid dates. Storage
reads are wrapped in try/catch: Safari private mode throws on access, and quota
errors surface a visible warning instead of losing a write silently.

### Import merge semantics

`importMerge` matches on `id` and keeps whichever side has the newer
`updatedAt`. This makes moving a file between browsers safe in either direction
and idempotent — re-importing the same file must never duplicate cards. Preserve
these properties when touching that function.

## Deployment

`.github/workflows/pages.yml` deploys `main` to GitHub Pages (Settings → Pages →
Source: GitHub Actions). All asset paths are relative, so the app works from a
project subpath like `https://<user>.github.io/flashcard/`. `.nojekyll` stops
Jekyll from processing the tree.

`.gitignore` excludes `flashcards-*.json` so exported personal card data is not
committed to a public repo.

## Releases

`main` is tagged with the next `vX.Y.Z` after each merged pull request.
`.github/workflows/release.yml` turns each pushed tag into a GitHub release with
generated notes, and fails on a tag that is not on `main`. It builds and attaches
nothing, and `pages.yml` runs on pushes to `main` only, so a tag never deploys.
