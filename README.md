# Kirill Snegur — site

Static welcome page (business card). Plain HTML + CSS, no build step.

```
index.html
styles.css
assets/           signature.svg, hero portrait, 8 project images
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

**Apercu Pro Regular** (Colophon Foundry), read directly from the Figma text nodes:
20px body / 14px captions, line height AUTO (= 20px at 20px), tracking 0% on the
intro block and the captions, -4% on headings and the afterword. Rendered line
widths match the Figma export within ~1.5px.

It is a **commercial face and is not self-hosted here** — only viewers with it
installed locally see it. A webfont licence plus `@font-face` is needed before
launch; until then remote visitors get the system fallback and run slightly wide.

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
- The intro block has **no tracking**; every other text block runs ~4% tighter.
- On desktop the hero image is 430px wide but the content columns are 410px, so it
  overhangs the grid by 20px on the right.
- Desktop content occupies the left 980px of a 1920px frame — over half the canvas
  is empty, and there is no max-width or centring rule for wider screens.

## Copy

Spelling and grammar were corrected in both this repo and the Figma source on
2026-08-28: `Lenght` → Length, `Raiffesien` → Raiffeisen, `lets` → let's,
`than` → then, `see world as space` → see the world as a space, and
`Kiosk for universal` → Kiosk.

Left as-authored, as voice rather than error: `profound teams`,
`cognitive-pleasant`, `details about experience`.

The same corrections are still **pending in Figma** — `use_figma` runs in a cloud
context that cannot load Apercu Pro, and the Plugin API refuses text edits on nodes
whose font it cannot load.

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
