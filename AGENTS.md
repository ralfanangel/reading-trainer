# AGENTS.md

## Cursor Cloud specific instructions

### Repository layout (important, non-obvious)

The default `main` branch contains **only `README.md`** — there is no buildable code on `main`.
All runnable/source code lives on other branches:

- `gh-pages` — a **web PWA** version of "Reading Trainer" (static HTML/CSS/JS). This is the only
  implementation that runs in a Linux Cloud Agent.
- `scaffold/initial-swiftui` — a **SwiftUI** iPad/macOS-Catalyst scaffold. This requires **macOS +
  Xcode** and **cannot be built or run in a Linux Cloud Agent** (there is no `swift` toolchain, and
  no committed `.xcodeproj`/`Package.swift`). Treat it as read/edit-only here.

There is **no package manager, lockfile, `node_modules`, database, or backend** anywhere in the
repo. The web app is fully static and offline-first (state is stored in `localStorage`).

### Running the web PWA (the runnable product on Linux)

The web app is a static site with **zero install/build steps**. It must be served over HTTP (not
`file://`) so the service worker can register. To run it without leaving your current branch, use a
git worktree so `main`/your feature branch stays checked out in `/workspace`:

```bash
git fetch origin gh-pages
git worktree add /tmp/rt-web gh-pages      # skip if /tmp/rt-web already exists
cd /tmp/rt-web
python3 -m http.server 8000                # any static server works
```

Then open `http://localhost:8000/index.html`. Core flow: enter a name → Start → the game shows
`Find: <animal>` → tap the matching animal tile → `Correct!` + points/treasure + `Next`.

Clean up the worktree with `git worktree remove /tmp/rt-web` when done.

### Lint / test / build

- **No linter, no automated tests, and no build system** are configured on any branch. "Building"
  the web app just means serving the static files; validation is manual in the browser.
- The SwiftUI scaffold would build via Xcode on macOS only (not possible here).

### Known pre-existing bugs in the `gh-pages` demo (as of this writing)

The web demo does **not** work out of the box — the game cannot be completed without fixes. These
are application defects, independent of environment setup:

- CSS cascade: `.hidden { display:none }` is declared before `.modal { display:flex }`, so the
  `Starter Test` and `Phonics Lessons` modals (`class="modal hidden"`) render on load and block
  clicks. (Fix: order the rules so `.hidden`/`.modal.hidden` wins, e.g. `.modal.hidden{display:none}`.)
- `app.js` calls `showMessage()` and `clearMessage()` which are **never defined**, throwing a
  `ReferenceError` that stops `startRound()`.
- `sw-boot.js` is **not referenced** by `index.html`, so its logic never loads.

When manually demonstrating the game, you can work around the above at runtime in the browser
console (e.g. `document.querySelectorAll('.modal').forEach(m => m.style.display='none')` and
defining the missing functions) without editing files.
