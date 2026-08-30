# Deploying

Static site, no build step. The repo *is* the deployable artifact: upload it and
it works. Every path is relative, so it runs at a domain root or a subpath, on any
host, unchanged. Moving hosts is a re-upload plus a DNS change — keep it that way.

## Live now

**https://snegurkirill.github.io/kirill-snegur-site/** — GitHub Pages, serving
`main` from the repo root. The repo is public, which is what Pages requires on a
free plan.

Every push to `main` rebuilds automatically; a build takes well under a minute.
No configuration file is involved — Pages serves the repo as-is.

Verified live: both pages, `styles.css`, both signatures, all imagery and all four
font subsets return 200 with correct MIME types. Because the site sits at a
**subpath** (`/kirill-snegur-site/`) rather than a domain root, this is a real test
of the all-relative paths — they hold.

### When a domain arrives

Add a `CNAME` file containing the bare domain, point DNS at GitHub, and enable
"Enforce HTTPS" in the repo's Pages settings. Nothing in the markup changes: the
same relative paths work at a root as at a subpath.

Registrar note for a `.space` from Russia: REG.RU or nic.ru take Mir and roubles.
Check the **renewal** price, not the first-year promotion — new gTLDs like `.space`
are sold cheap for year one and cost substantially more every year after.

## Headers — currently inert

Two files carry the same policy: `.htaccess` for Apache hosts and `_headers` for
Cloudflare Pages / Netlify.

**GitHub Pages reads neither.** Live responses today carry only GitHub's own
`cache-control: max-age=600` and its HSTS. That means the strict CSP written in
both files — `default-src 'none'`, which is possible because the site ships no
JavaScript — is **not currently applied**. Nothing is broken by this; the site has
no scripts to exploit and no forms. But the defence-in-depth is dormant until the
site moves to a host that honours custom headers.

Keep both files. They cost nothing and make the site portable.

## Still open before this is really "launched"

- No favicon and no Open Graph image — links shared to Telegram preview bare.
- No language switcher, so `/ru` is reachable only by typing the URL.
- Body text is `#A9A9A9` on white: 2.35:1, against a WCAG AA minimum of 4.5:1.
- No `sitemap.xml` or `robots.txt` — both want the final domain.
