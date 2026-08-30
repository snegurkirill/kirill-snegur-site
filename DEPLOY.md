# Deploying

Static site, no build step. The repo *is* the deployable artifact: upload it and
it works. Every path is relative, so it runs at a domain root or a subpath, on any
host, unchanged. Moving hosts is a re-upload plus a DNS change — keep it that way.

## Chosen setup

Audience is mainly Russia/CIS, payment is a Russian card, domain is `.space`.
That rules out Cloudflare on both counts: Cloudflare Registrar cannot take a
Russian card, and Cloudflare has a history of Roskomnadzor throttling and
IP-range blocking, which is the wrong risk to carry when your readers are inside
Russia.

**Domain:** REG.RU or nic.ru — both sell `.space`, both take Mir and rubles.
**Hosting:** a Russian provider (Timeweb, Beget, Selectel). Rubles, Mir, reliable
domestic routing, and Apache so `.htaccess` gives real header control.
**DNS:** the registrar's own nameservers. No reason to route DNS through a third
party here.

### Check the renewal price, not the first year

`.space` is a new gTLD sold on steep first-year promotions with a much higher
renewal — a few hundred roubles to start, then commonly ten times that per year.
Look up the *renewal* figure before buying; it is the number you actually pay
every year after this one.

Minor, but worth knowing: some corporate mail filters and firewalls still treat
new gTLDs like `.space` with suspicion. Fine for a portfolio link shared over
Telegram; think twice before using it for email.

## Uploading

Whatever the host, the whole repo goes to the web root — `index.html` at the top,
`ru/` and `assets/` beneath it. Nothing needs compiling.

If the host offers SSH, add your key there and deploy with:

```
rsync -av --delete \
  --exclude '.git' --exclude '.gitignore' --exclude '*.md' \
  ./ user@host:/path/to/www/
```

`--delete` makes the server match the repo exactly, so removed files actually
disappear. Drop it if the web root holds anything not tracked here.

## Headers

Two files, one per host family; each host ignores the other's.

- **`.htaccess`** — Apache shared hosting (Timeweb, Beget, REG.RU). Active setup.
- **`_headers`** — Cloudflare Pages / Netlify. Kept for portability.

Both set the same policy. The CSP is `default-src 'none'` with `self` for images,
styles and fonts: the site has no JavaScript, so scripts are denied outright
rather than merely restricted. Adding an analytics snippet or an embed later will
be blocked until the policy is widened — the failure looks mysterious otherwise.

Two directives in `.htaccess` are commented out on purpose: **HSTS** and the
**HTTPS redirect**. Enable them only once the certificate is live, or the site
redirects into a loop of failed TLS handshakes.

Caching: HTML and CSS revalidate every request, so edits appear immediately.
`/assets/*` is cached a week. Asset filenames are not content-hashed, so a
replaced image can take up to a week to reach someone who already has it — rename
the file to force it through.

Note: **GitHub Pages ignores both files.** If you ever host there, you lose the
CSP and the cache policy entirely.

## Still open before this is really "launched"

- No favicon and no Open Graph image — links shared to Telegram preview bare.
- No language switcher, so `/ru` is reachable only by typing the URL.
- Body text is `#A9A9A9` on white: 2.35:1, against a WCAG AA minimum of 4.5:1.
- No `sitemap.xml` or `robots.txt` — both want the final domain.
