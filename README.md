# Kirill Snegur — site

Static welcome page (business card). Plain HTML + CSS, no build step.

```
index.html        English
ru/index.html     Russian
styles.css        shared by both
assets/           signatures, hero portrait, 8 project images, 4 font subsets
```

Open `index.html`, or serve locally:

```bash
python3 -m http.server 8787
```

## Ported from

Figma file `— Kirill Snegur • site —>`, page `Page 1`, section **Development** (node `52:351`).

The section holds two frames with identical content:

| frame   | size       | clip content | note                                        |
|---------|------------|--------------|---------------------------------------------|
| Mobile  | 430 × 932  | off          | content overflows the frame to 3117px tall  |
| Desktop | 1920 × 1080| **on**       | everything below the fold is hidden          |

## How the layout works

Every dimension is a Figma design pixel multiplied by `--u`:

- **< 1000px** — `--u: min(100vw / 430, 1.2px)`. The 430px design fills the viewport
  width, so nothing ever re-wraps: line breaks are authored with `<br>` and stay put.
  Above 516px the column stops growing and centres.
- **≥ 1000px** — `--u: 1px`. Real pixels, 128px left margin, the two content blocks
  side by side as 410px columns with a 32px gutter, exactly as the 1920 frame.

Verified against the Figma export: every block lands on its design Y coordinate at
both breakpoints (the second content block sits 3px high — see *Inconsistencies*).

## Typeface

Both faces self-hosted from `assets/` — latin subsets, SIL OFL, 44KB together, so
the page makes no third-party request.

Mirrors the two text styles in the Figma typography library:

| style | spec | CSS |
|---|---|---|
| `Regular-20` | Source Sans 3 Regular, **wght 420**, 20, line-height 100%, tracking -4% | body default |
| `Regular-14` | Source Sans Pro Regular, 14, line-height AUTO, tracking -5% | `figcaption` |

`Source Sans 3` ships as the **variable** file, so wght 420 is a genuine
interpolation, not a browser-synthesised weight (verified: 400 → 201.6px,
420 → 202.2px, 700 → 212.7px for the same string).

The page therefore loads two closely-related families — Source Sans 3 for body,
Source Sans Pro for captions. That is what the styles specify; collapsing the
captions onto Source Sans 3 would drop a 15KB request if you ever want to.

## Russian version — /ru

`ru/index.html` shares `styles.css` and every image with the English page. Only
three things differ: the copy, `lang="ru"`, and the signature — `Handwritten-logo.svg`
is the **Cyrillic** signature ("Кирилл Снегур"), a different drawing from the Latin
one and a different aspect (430x42 vs 430x32). Saved as `assets/signature-ru.svg`,
with its viewBox tightened to the ink so it drops into the same CSS with no overrides.

Ported from `Mobile-ru.pdf` (430 x 3362). Line counts match the design exactly:
lede 4 lines, both headings 3, afterword 4/2/2. Vertical positions drift up to ~9px
by the foot of the page — worth trueing against Figma when the Russian frames exist
there.

Three typos were corrected: `клиенсткий` → клиентский, `платмофрма` → платформа,
and `через в Телеграм` → через Телеграм. Still worth a look: *«в сообщества
совместного развития и бизнеса и личности»* wants a correlative comma —
«— и бизнеса, и личности».

The Russian design drops the email contact and links only Телеграм. Followed as
drawn, but it means the Russian page offers one way to make contact where the
English offers two.

**There is no language switcher in either design**, so /ru is reachable only by
typing the URL. `hreflang` tags cross-link the two for search engines, but a
visible switch is missing.

### Fonts

Latin and Cyrillic ship as separate subsets keyed by `unicode-range`. Verified
cold-cache: the English page downloads only the two Latin files (44KB), and /ru
adds the Cyrillic pair (27KB).

## Line breaking

Line breaks are not hard-coded. Every multi-line block uses `text-wrap: balance`,
so lines are evened out rather than filled greedily to the measure.

One consequence: **Figma does not balance.** It fills each line before wrapping.
So with identical copy, width and font, the code and the Figma frames will now
break lines differently — the code's rag is deliberately the better-looking one.
If exact parity matters more than the rag, drop the `text-wrap: balance` rule.

All text columns share one 410px measure: Hi, both content columns, and the
afterword.

## Open — needs a decision

1. **Desktop below the fold is undefined** — the 1920 frame clips it. Rows 2 of each
   block, all captions and the afterword are coded as the obvious continuation of
   the pattern, not from design.
2. **No bottom padding in the design** — the frame ends flush with the last line of
   text. Set to 97px (mobile) / 96px (desktop) here.
3. **No favicon, no OG image.** Basic `<title>`/description/OG tags added.

## Inconsistencies found in the design

- Image → caption gap is **12px on the first row of a block and 5px on the second**,
  in both blocks. Reproduced via `.project--row2`; delete that rule to normalise.
- Heading → grid gap is **19px in block A, 22px in block B**. Normalised to 19px,
  which puts block B 3px above its Figma position.
- The intro text is inset 10px from the page edge while the signature, portrait
  and project grid are not — on desktop it sits at x=138 against everything else
  at x=128. Reproduced as-is.
- On desktop the hero image is 430px wide but the content columns are 410px, so it
  overhangs the grid by 20px on the right.
- Desktop content occupies the left 980px of a 1920px frame — over half the canvas
  is empty, and there is no max-width or centring rule for wider screens.

## Copy

Hi and Afterword copy was supplied on 2026-08-28; the Afterword is now three
paragraphs. No corrections were needed to the latest version.

Line breaks are not hard-coded. Text wraps naturally inside the fixed 410px
measure, which is exactly what Figma does with the same width and font, so the
two stay in step as copy changes.

## Divergence between the repo and Figma

This port was built from node `52:351`, which is **not** the live Development page.
The Development page (`60:142`) holds the current `Mobile` (`60:143`) and `Desktop`
(`60:185`) frames, and they already differ:

- Mobile's kiosk caption there is already `Kiosk`; `52:351` still says
  `Kiosk for universal`.
- Mobile has the **afterword twice** — `60:183` at y=2976 and `60:184` at y=3212,
  identical text. Only one is coded here.
- Desktop's eighth caption reads `Sila Vetra Sea&City` instead of the kiosk name —
  a copy-paste error. Not reproduced here.
- Desktop's first caption has a trailing space: `"[ Wave Lenght ] AstroTour "`.

## Assets

Exported from Figma. Photos re-encoded to JPEG and the hero downscaled to 1290px
(display max is 430 CSS px); UI screenshots kept as PNG. Total 8.7MB → 1.6MB.
