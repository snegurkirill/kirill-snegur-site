# Deploying

Static site, no build step. Host is **Cloudflare Pages**, chosen because it serves
a **private** repo on the free plan (GitHub Pages needs a paid plan for that) and
has no bandwidth cap.

Nothing here is host-specific except `_headers`. Every path in the site is
relative, so it runs unchanged on any static host, at a domain root or a subpath.

## 1. Connect the repo

Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
Authorise the Cloudflare Pages GitHub app and grant it access to
`snegurkirill/kirill-snegur-site` (private repos need the app installed explicitly).

Build settings — the site is already the deployable artifact:

| field | value |
|---|---|
| Framework preset | **None** |
| Build command | *(leave empty)* |
| Build output directory | `/` |
| Root directory | *(leave empty)* |

Every push to `main` redeploys. Pull requests get their own preview URL.

The first deploy lands on `<project>.pages.dev` — check it there before attaching
the domain.

## 2. The domain

Cheapest sane route is **Cloudflare Registrar**: domains are sold at wholesale
cost with no markup and no first-year-cheap-then-expensive trick, and DNS is then
configured automatically. Register under the same account, then:

Pages project → **Custom domains** → **Set up a domain** → enter the apex
(`example.com`). Cloudflare adds the DNS record and issues the certificate itself.
Add `www.example.com` too and let it redirect to the apex.

If the domain is registered elsewhere, either point its nameservers at Cloudflare,
or add a `CNAME` from your host to `<project>.pages.dev`. Apex domains cannot take
a plain CNAME, so nameserver delegation is the simpler path.

HTTPS is automatic. Allow a few minutes for the certificate.

## 3. `_headers`

Applied by Cloudflare Pages, not by the local `python3 -m http.server`, so these
only take effect once deployed.

- **CSP** is `default-src 'none'` with `self` for images, styles and fonts. The
  site has no JavaScript at all, so scripts are blocked outright. If you ever add
  a script or an embed, this will block it until you widen the policy.
- **HSTS** is 180 days, no `preload`. Raise it once you're confident; adding
  `preload` is effectively irreversible for a long time, so leave it off for now.
- **Caching**: HTML and CSS revalidate on every request; `/assets/*` is cached for
  a week. Asset filenames are not content-hashed, so a replaced image can take up
  to a week to reach someone who already has it. Rename the file to force it
  through immediately.

## Still open before this is really "launched"

- No favicon and no Open Graph image — links shared to Telegram or Slack will
  preview without a picture.
- No language switcher, so `/ru` is reachable only by typing the URL.
- Body text is `#A9A9A9` on white: 2.35:1, below the WCAG AA minimum of 4.5:1.
- No `sitemap.xml` or `robots.txt` — both want the final domain, so they are worth
  adding once it exists.
