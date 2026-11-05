# Living Archive

A thesis archive that looks and behaves like a macOS Finder window.

- Opens as a **messy pile**: everything overlapping, unsorted, draggable.
- The **group button** (top right, the ▦▦▦ ⌄ icon) sorts by **Name, Kind, Application, Category, Date Added**. Items glide into place. **None** throws them back into a new pile.
- **Four views**: Icons, List, Columns, Gallery (the segmented control, or ⌘1–⌘4).
- **Sidebar**: Images / Links / Sources, plus Are.na / Cosmos / Pinterest / Uploads.
- **Quick Look**: double-click or press Space on any item.
- **Updates itself**: a GitHub Action pulls your Are.na channels, Pinterest boards and Cosmos clusters every 3 hours and republishes the site.

No frameworks and no build step. It's plain HTML, CSS and JS, hosted free on GitHub Pages.

---

## 1. Put it on GitHub (about 5 minutes)

1. Create a new **public** repository on GitHub, e.g. `living-archive`.
2. Upload every file and folder from this project, including the hidden `.github` folder. (On GitHub, use **Add file → Upload files**, or `git push` from your computer.)
3. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
4. Go to **Settings → Actions → General → Workflow permissions** and choose **Read and write permissions**.
5. Go to the **Actions** tab, open **Sync archive & deploy**, and click **Run workflow**.

When it finishes, your site is live at `https://<your-username>.github.io/living-archive/`.

Until your accounts are connected, the site shows **sample items**, so you can check the design.

---

## 2. Connect your accounts

Everything is configured in **`config.json`**. Edit it on GitHub (pencil icon) and commit; the site rebuilds automatically.

### Are.na (fully automatic)

Are.na has a free public API, so no key is needed for public or closed channels.

1. Open your channel, e.g. `https://www.are.na/your-name/thesis-images`.
2. The **slug** is the last part of the URL: `thesis-images`.
3. Add it to `config.json`:

```json
"arena": {
  "liveRefreshInBrowser": true,
  "channels": [
    { "slug": "thesis-images",  "category": "auto" },
    { "slug": "thesis-reading", "category": "sources" }
  ]
}
```

`"category": "auto"` sorts each block by type:

| Are.na block | Goes to |
|---|---|
| Image | Images |
| Link, Media/video | Links |
| Text, Attachment (PDF) | Sources |

You can also force a whole channel into one category with `"images"`, `"links"` or `"sources"`. One option is to keep a separate Are.na channel per category.

`liveRefreshInBrowser: true` makes the page check Are.na whenever someone opens it. Anything you've just added drops onto the pile straight away, without waiting for the 3-hour sync.

**Private channels:** create a personal access token at <https://dev.are.na>. Then in your repo go to **Settings → Secrets and variables → Actions → New repository secret** and add it with the name `ARENA_TOKEN`. Note that private channels only update on the scheduled sync, not live in the browser.

### Pinterest (automatic, best-effort)

Pinterest publishes an RSS feed for every **public** board, and the sync reads it.

```json
"pinterest": {
  "boards": [
    { "url": "https://www.pinterest.com/your-username/thesis-moodboard/", "category": "images" }
  ]
}
```

- The board must be public; secret boards have no feed.
- To pull **all** your public pins, use just your profile URL: `https://www.pinterest.com/your-username/`.
- The feed only lists your ~25 newest pins. The archive keeps every pin it has seen before, so it grows over time.
- Pinterest sometimes blocks automated requests from GitHub's servers. If pins stop arriving, the Action log will show a ⚠ warning. In that case, save the images into `uploads/pinterest/` instead (see below).

### Cosmos (two options)

Cosmos doesn't offer an official public API, so you have two options:

**Option A — free:** save images from Cosmos and upload them to `uploads/cosmos/` in the repo. They get the purple **Cosmos** tag and show up on the next sync.

**Option B — automatic, paid:** [ScrapeCreators](https://scrapecreators.com/cosmos-api) offers an unofficial Cosmos API. It includes 100 free calls, then roughly $10 per 5,000. With the sync every 3 hours, one cluster uses about 8 calls a day.

1. Sign up and copy your API key.
2. In your repo go to **Settings → Secrets and variables → Actions**, and add a secret named `SCRAPECREATORS_API_KEY`.
3. List your **public** clusters:

```json
"cosmos": {
  "clusters": [
    { "url": "https://www.cosmos.so/your-username/thesis", "category": "images" }
  ]
}
```

If there's no key, the sync skips this step, so it's safe to leave clusters listed.

---

## 3. Adding things by hand

**Upload files:** drop images or PDFs into `uploads/` on GitHub (**Add file → Upload files**).

- `uploads/cosmos/…`, `uploads/pinterest/…` and `uploads/arena/…` get tagged with that app.
- A folder named `images`, `links` or `sources` anywhere in the path forces the category, e.g. `uploads/sources/interview.pdf`.

**Add links, quotes and citations:** edit `data/manual.json`:

```json
[
  { "title": "The Carrier Bag Theory of Fiction", "category": "sources", "kind": "text",
    "citation": "Le Guin, U. K. (1986)…", "url": "https://…", "date": "2026-11-05" },
  { "title": "Studio visit", "category": "links", "url": "https://…", "app": "cosmos" }
]
```

(Delete the two `_example` entries, or remove their `"_example": true` line.)

---

## 4. Customise

| What | Where |
|---|---|
| Folder title in the toolbar | `config.json` → `site.folderName` |
| Sort or view when the page opens | `config.json` → `site.defaultSort` (`none`, `name`, `kind`, `app`, `category`, `date`) / `site.defaultView` (`icon`, `list`, `columns`, `gallery`) |
| Sync frequency | `.github/workflows/update-archive.yml` → `cron` |
| Tag colours per app | `lib/sources.js` → `APPS` |
| How messy the pile is | `app.js` → `scatter()` (the `0.36` spread values) |
| Speed of the sort animation | `styles.css` → `.item { transition: transform 0.95s … }` |

Dark mode follows the visitor's system setting.

---

## 5. Run it locally (optional)

```bash
node scripts/build-archive.mjs   # pull everything into data/archive.json (Node 18+)
python3 -m http.server 8000      # then open http://localhost:8000
```

---

## Prompt for Claude Code on GitHub

To have Claude change the site later, open this repo in Claude Code and start with:

> This repo is a static "living archive" site styled as a macOS Finder window (no framework, no build step). `index.html` + `styles.css` + `app.js` are the front end; `lib/sources.js` normalises Are.na blocks and is shared by the browser and `scripts/build-archive.mjs`, which a GitHub Action (`.github/workflows/update-archive.yml`) runs every 3 hours to write `data/archive.json` from Are.na, Pinterest RSS, Cosmos (via ScrapeCreators if `SCRAPECREATORS_API_KEY` is set), `uploads/` and `data/manual.json`. Items have `{id, app, kind, category, title, filename, image, thumb, url, permalink, text, description, collection, added_at}`. The icon view positions every item absolutely with CSS transforms, so the "None" pile and the sorted grid animate between each other; keep that mechanism. Keep the Finder look (system font, hairline borders, sidebar vibrancy, traffic lights). Now: **[describe your change here]**.
