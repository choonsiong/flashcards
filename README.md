# Flashcards

A mobile-first web app for remembering things. Each card has a **prompt** (a word or
sentence) and **details** (what you want to recall). Cards live in your browser's
local storage, and can be exported to a file and imported into another browser.

No accounts, no server, no tracking. Just static files.

## Features

- Add, edit and delete cards; optional comma-separated tags
- Live search across prompts, details and tags
- Study mode: tap to reveal, shuffle, filter by tag, arrow-key navigation on desktop
- Export to JSON, import with **merge** or **replace**
- Works offline once loaded; installable to your home screen
- Light and dark themes, following your system setting

## Running locally

Open `index.html` directly in a browser, or serve the folder:

```sh
npm run serve       # http://localhost:8000
```

## Editing the styles

Styles are built with the Tailwind CSS CLI. The compiled `styles.css` is committed
so that GitHub Pages serves a plain static file with no build step.

```sh
npm install         # once
npm run dev         # rebuild styles.css on change
npm run build       # one-off minified build
```

If you change Tailwind classes in `index.html`, `app.js` or `ui.js`, run
`npm run build` and commit the updated `styles.css`. The deploy workflow fails
if you forget.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Push to `main`. The workflow in `.github/workflows/pages.yml` builds and deploys.

The app uses only relative paths, so it works from a project subpath such as
`https://<user>.github.io/flashcard/`.

## Moving data between browsers

Open **Data → Export cards** to download a `flashcards-YYYY-MM-DD.json` file, then
in the other browser choose **Data → Choose file…**:

- **Merge** keeps both sets. When the same card exists on both sides, the version
  edited more recently wins, so you can move a file in either direction safely.
  Importing the same file twice changes nothing.
- **Replace** deletes the current cards first. You'll be asked to confirm.

## File layout

| File | Purpose |
| --- | --- |
| `index.html` | Markup for all views |
| `app.js` | View switching, rendering, event handling |
| `store.js` | Data model, localStorage, import/export |
| `filter.js` | Search, sort and shuffle helpers |
| `ui.js` | Toasts, bottom sheet, modal dialogs |
| `src/input.css` | Tailwind source |
| `styles.css` | Built CSS (committed) |

## Data format

```json
{
  "version": 1,
  "exportedAt": "2026-07-25T10:00:00.000Z",
  "cards": [
    {
      "id": "uuid",
      "front": "efímero",
      "back": "(adj.) ephemeral, fleeting.",
      "tags": ["spanish"],
      "createdAt": "2026-07-25T09:00:00.000Z",
      "updatedAt": "2026-07-25T09:00:00.000Z"
    }
  ]
}
```

Unreadable entries are skipped on import rather than failing the whole file, and a
file from a newer app version is rejected with an explanation.

## Notes

Cards are stored per browser, per device — clearing site data removes them, so
export occasionally if the cards matter. If storage is unavailable (Safari private
browsing) or full, a warning appears instead of silently losing a change.
