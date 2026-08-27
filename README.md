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

## Open — needs a decision

1. **Typeface is unknown.** Figma outlines text on SVG export, so the family could
   not be read. `--font` is a system fallback; `--track-intro` / `--track-body`
   are tracking values calibrated so the fallback reproduces the design's measured
   line widths. Drop in the real font and re-check both.
2. **Desktop below the fold is undefined** — the 1920 frame clips it. Rows 2 of each
   block, all captions and the afterword are coded as the obvious continuation of
   the pattern, not from design.
3. **No bottom padding in the design** — the frame ends flush with the last line of
   text. Set to 97px (mobile) / 96px (desktop) here.
4. **No favicon, no OG image.** Basic `<title>`/description/OG tags added.

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

## Copy to check

`Wave Lenght` → Length · `Raiffesien` → Raiffeisen · `lets get in touch` → let's ·
`than dive into your` → then · `Kiosk for universal` reads unfinished.

## Assets

Exported from Figma. Photos re-encoded to JPEG and the hero downscaled to 1290px
(display max is 430 CSS px); UI screenshots kept as PNG. Total 8.7MB → 1.6MB.
