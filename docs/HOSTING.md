# Hosting Threlmark

Two separate things can be "hosted" on **Threlmark.com**, and they have very different requirements:

1. **The public website** (marketing + legal pages) — easy, static, fits all-inkl shared hosting.
2. **The Threlmark app itself** — Threlmark is local-first; running it as a *public, multi-user* service is a different product. Options below.

---

## 1. The public website (`site/`)

The files in [`../site/`](../site/) are plain static HTML/CSS with **no build step and no third-party requests** (no Google Fonts CDN, no analytics) — deliberately, so it is DSGVO-clean and works on any web host.

**Deploy to all-inkl.com:**
- Upload the contents of `site/` to your web root (e.g. `/html/` or the domain's document root) via FTP/SFTP or the KAS file manager.
- `index.html` becomes the homepage; `privacy.html`, `terms.html`, `contact.html`, `impressum.html` are linked in the footer of every page.
- No server config needed. (Optional: add an `.htaccess` to force HTTPS and pretty-print 404s.)

The site links to **`/app`** for "Open the app" — see below for what lives there.

---

## 2. Can Threlmark.com offer a *hosted* version of the tool?

Short answer: **not as-is on all-inkl shared hosting, and not as a single shared instance** — but there are three sensible paths depending on what you want. The tension is that Threlmark is intentionally **local-first**: one JSON store under `~/.threlmark`, **no authentication**, **no multi-tenancy**. Put that on a public URL unchanged and *every visitor would share and edit one roadmap store* — not what you want.

Also note: all-inkl shared hosting is built for PHP/static sites. Next.js needs a **Node.js runtime** for its API routes (which read/write the disk store). all-inkl's standard packages don't provide a long-running Node process, so the dynamic app can't run there directly. The marketing site can; the app needs a Node host.

### Option A — Static demo (read-only), can live on all-inkl ✅ easiest
Ship a **read-only, sample-data demo** at `/app`: export the UI with seeded JSON baked in, with writes disabled (or writing only to the browser's `localStorage`, exactly like the original Roadmap Lab). Visitors get the full look and feel; nothing persists server-side; no auth needed. This is the lowest-risk way to "show the tool" on Threlmark.com.
- *Effort:* small. Add a demo flag that serves bundled JSON and routes writes to `localStorage`.

### Option B — Personal hosted instance (single user, you) 🔒 recommended if you want it online for yourself
Run the **real** app on a small Node host and put it behind a password so only you use it.
- Host on a VPS (Hetzner, etc.), Fly.io, or a Node-capable container; point `app.threlmark.com` at it.
- Set `THRELMARK_DATA_DIR` to a persistent volume that's backed up.
- Add an auth gate in front (HTTP Basic via reverse proxy, or a single-password middleware). 
- *Effort:* small–medium. No code changes to the core; just deployment + an auth layer.

### Option C — True multi-tenant SaaS 🏗️ a separate build
A public "sign up and get your own roadmaps" service. This is a real product change, not a deploy:
- **Accounts + auth** (the app currently has none).
- **Per-tenant data isolation** — either a data dir per account (`<root>/tenants/<userId>/…`, the contract already namespaces cleanly under a root) or a real database adapter behind the store interface.
- **A Node host** with persistent, backed-up storage and the usual SaaS concerns (rate limits, billing, GDPR data-subject tooling, deletion).
- *Effort:* large. Plan it as its own project; the existing store boundary (`src/lib/*/store.ts`) is the natural seam to swap disk for per-tenant storage.

### Recommendation
- **Now:** publish the static site on all-inkl, and add **Option A** (read-only demo) at `/app` so the "Open the app" button shows the tool.
- **If you want it online for your own use:** do **Option B** on a small Node host.
- **Only build Option C** if you actually want to offer accounts to other people — it's a distinct, larger effort.

---

## Keeping the deployed copy current

You mentioned giving access to Threlmark.com on all-inkl so the latest version can be loaded. Practical setup:
- **Static site:** a deploy step (FTP sync, or a GitHub Action using an FTP/SFTP action) that uploads `site/` on each change.
- **App (Option B):** deploy from git on the Node host (e.g. `git pull && npm ci && npm run build && pm2 restart`), or a container image rebuilt on push.

To wire up automated deploys I'll need the host's credentials (FTP/SFTP host, user, target path — or SSH access for the Node host). Share those and I can add the deploy config.

---

© 2026 Threlmark · Thorsten Meyer · Powered by [Thorsten Meyer AI](https://thorstenmeyerai.com/)
