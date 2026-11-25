<div align="center">

<img src="app/opengraph-image.png" alt="NEXOR in 3D letters drawn from text characters" width="100%" />

<h1>plattnericus.dev</h1>

<p><strong>Portfolio of Nexor / Plattnericus, fullstack developer.</strong><br />
A 3D world you fly through by scrolling, drawn entirely in text characters.</p>

<p><a href="https://plattnericus.dev"><strong>plattnericus.dev&nbsp;↗</strong></a></p>

<p>
  <img src="https://img.shields.io/badge/Next.js-16-efeae2?style=flat-square&labelColor=08080a" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-strict-efeae2?style=flat-square&labelColor=08080a" alt="TypeScript strict" />
  <img src="https://img.shields.io/badge/three.js-0.187-efeae2?style=flat-square&labelColor=08080a" alt="three.js" />
  <img src="https://img.shields.io/badge/GSAP-3.15-efeae2?style=flat-square&labelColor=08080a" alt="GSAP" />
  <img src="https://img.shields.io/badge/Lenis-1.3-efeae2?style=flat-square&labelColor=08080a" alt="Lenis" />
  <img src="https://img.shields.io/badge/typeface-Nexor_Grid-d97757?style=flat-square&labelColor=08080a" alt="own typeface: Nexor Grid" />
  <img src="https://img.shields.io/badge/third_parties-0-d97757?style=flat-square&labelColor=08080a" alt="no third parties" />
</p>

<p>
  <a href="#overview">Overview</a> ·
  <a href="#the-page">The page</a> ·
  <a href="#how-it-works">How it works</a> ·
  <a href="#nexor-grid">Nexor Grid</a> ·
  <a href="#performance">Performance</a> ·
  <a href="#seo-accessibility-and-privacy">SEO</a> ·
  <a href="#getting-started">Getting started</a>
</p>

</div>

<br />

## Overview

- **Everything is a character.** The 3D world, every headline, the project films, the loader and the 404 are drawn as glyphs on a monospace grid, every frame. Real text sits behind all of it for screen readers and search engines.
- **One typeface, made for it.** Nexor Grid is generated from code in this repository, and the ASCII renderer traces its 0, 45 and 90 degree edges with `- / | \`.
- **Nothing from elsewhere.** No analytics, no cookies, no CDN, no third-party request from the browser. Even the code excerpts from GitHub are fetched when the site is built.
- **Fast.** Static HTML, 9 KB compressed, first paint after about 0.1 s, 120 fps while flying.

## The page

| | |
| --- | --- |
| **Loader** | As on lenis.dev and the very first plattnericus.dev: on black, the five letters of the name rise out of their slots in a zigzag, in orange. Under the curtain the real 3D wordmark waits with its letters in exactly those places; the curtain shoots up, each letter turns from the orange print into its 3D self as the edge passes, and all of them fly into line, the lower two rising. What lands is the wordmark itself. Server-rendered, so it moves from the first paint. |
| **Hero** | `NEXOR` as solid 3D letters, lit by the cursor, which also cuts glowing channels through them that grow back. Scrolling flies the camera through the O. |
| **About** | "I build things that run.", printed row by row by an ASCII print head, while a build log runs beside it. |
| **Tools** | The camera circles an object that becomes a symbol for each tool: an atom, a wireframe cube, `</>`, containers, a cloud, a network, a padlock. |
| **Principles** | Four lines, one at a time. The last is "Interfaces that pull you in", and the next section does that. |
| **Enter** | The name grows from a speck until the camera is inside the X, then falls away into hyperspace. |
| **Work** | Every project as a colour ASCII film. Hover `source` and the screen prints real code from its repository instead. |
| **All projects** | A terminal listing with a monitor beside it: the site preview under the cursor, or over `code`, a random excerpt of the real code. |
| **Contact** | A giant `@` in 3D, and the address, large and plain, with a copy button. |
| **Footer** | One screen on every device: the links as a file tree, a quote, and the name mirrored in water in characters that ripples under the cursor. |
| **404** | A black hole with a lensed accretion disk that slowly pulls the page in. |

A quote from Linus Torvalds sits between the work and the index, typed out as you scroll; the footer draws another at random. A click anywhere drops a small ripple into the characters. Whatever you find that was hidden, a card slides in at the top right like an advancement in a game: the icon in an inventory slot, how it was found, and a cell for every secret, the new one blinking; with a short chime, synthesised on the spot (no audio file). The last one turns it gold. The cursor is a block that inverts what is under it; it stays above everything, dialogs included, and steps aside only while the page scrolls.

### The shell

Press <kbd>`</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>, or tap `~$` in the bar.

| Command | |
| --- | --- |
| `ls` · `open <n>` | list the projects, open one |
| `cd <section>` | fly to about, tools, work, projects or contact |
| `stack` · `whoami` · `mail` | the short version |
| `warp` | full speed |
| `secrets` | how many you have found |
| `mute` · `unmute` | the chime for a found secret, off or back on |

Tab completes, the arrow keys walk the history. Not every command is on this list.

## How it works

```
scroll ──► camera path (Catmull-Rom between keys pinned to sections)
              │
              ▼
   ray marcher, one fragment shader ──► colour + coverage, 2x2 texels per cell
              │
              ▼
   cell pass, once per character ──► edges - / | \   body " .,:;-=+*%#@"   stars . + *
              │
              ▼
   glyph pass, per pixel: one lookup into its cell, one into the glyph atlas
              │
              ▼
   fixed WebGL canvas behind the DOM

   2D canvases on top, on the same kind of glyph grid:
   headlines · zoom · films · water · 404
   and in pixel art: the seasons' landscapes and their weather
```

**The world.** One fragment shader ray-marches every scene, each at its own depth along `-z`; bounding volumes skip what a ray never reaches. Words become signed distance fields through an exact Euclidean distance transform and are extruded with rounded edges. The tool symbols are distance functions that blend into each other; for the way in, every letter of the wordmark can be moved and scaled on its own. The cursor's cuts are cones subtracted from the letters; clicks add ripples in the ASCII pass.

**The characters.** Headlines are set in Nexor Grid and rasterised into cells, about fourteen rows to a line of type: outlines get - / | \ _, the inside of every stroke only dense characters (* # % @), so the letters read as solid, and a bevel lights them through their colour; with eight different reveals and a magnifier under the cursor. Films are sampled six times per cell: the background (the frame's most common brightness) stays empty, flat areas print as density, and edges get the character whose shape matches best. The footer's water is the wave equation on the character grid, with the name mirrored in it.

**The data.** Everything about the site lives in [`lib/site.ts`](lib/site.ts). At build time, [`lib/snippets.ts`](lib/snippets.ts) collects real functions from every project's repositories (generated code, tests, anything credential-like and anything not in English are skipped) into `/code.json`, refreshed daily.

## Nexor Grid

The display face is generated by [`scripts/nexor-grid/build.py`](scripts/nexor-grid/build.py), using only the Python standard library, straight to `app/fonts/NexorGrid.woff`: 64 glyphs, about 4 KB. Each glyph is a pattern on a 5 x 7 grid of modules, and three rules turn the grid into outlines:

1. An exposed outer corner is cut at 45 degrees.
2. An inner corner gets a small 45 degree fillet.
3. Two modules that only touch at a corner are joined by a 45 degree stroke.

```bash
python3 scripts/nexor-grid/build.py     # the font
python3 scripts/nexor-grid/modules.py   # its module grids, for the loader's letters
```

## Performance

| | |
| --- | --- |
| First contentful paint | about 0.1 s |
| Page HTML | 45 KB, 9 KB compressed |
| Frame rate | 120 fps on a 120 Hz display, worst frame about 10 ms |
| Routes | all prerendered, `/code.json` revalidated daily |

Up to 1920 x 1080 every size is set in pixels; on larger screens one design unit (`--u` in the stylesheet) grows with the tighter of width and height, so a 2560 or 4K screen shows the same layout, only larger, and an ultrawide does not blow the type up. On touch screens every link has a hit area of at least 24 px that takes no extra room. On phones the world uses a finer character grid, the start camera frames the wordmark to the screen's width, small text is set larger, and the bar keeps only the name, the shell and the progress. Measured on the production build in Chrome on the development machine. One shared GSAP ticker drives Lenis, the world and every canvas; canvases draw only while visible. Which character a cell shows is decided once per cell (about 11,000 on a laptop screen), not once per pixel, so a retina display costs barely more than a standard one. Films are converted to characters only when the video shows a new frame, not at the display's refresh rate. Layout is read only when the page has moved. The world's shaders compile in parallel, off the thread that draws the page (`KHR_parallel_shader_compile`), from the moment the page mounts, so a refresh never stalls the loader's letters; its distance fields are built in separate short tasks. Behind the loader's closed curtain the world rests, and the 3D letters follow the clock of the printed letters' own CSS transition, so the two cannot drift apart. The hidden parts (shell, cinema, specimen, screensaver, seasons, the typed tricks) are separate chunks, loaded once the loader is gone and the browser is idle. Project films load one ahead. `prefers-reduced-motion` gets a calm, static page.

## SEO, accessibility and privacy

| | |
| --- | --- |
| Markup | static HTML for every section, real text behind every ASCII headline, one `h1`, a skip link |
| Structured data | JSON-LD: ProfilePage with its Person, WebSite, and an ItemList of the projects with their repositories |
| Generated | `sitemap.xml`, `robots.txt`, web manifest, Open Graph and Twitter images, `llms.txt`, `/.well-known/security.txt` (RFC 9116) |
| Headers | Content-Security-Policy (same origin only), HSTS, `nosniff`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy |
| Privacy | no cookies, no analytics, no third-party requests; fonts are self-hosted; only the names of found secrets are kept, in `localStorage` ([`/privacy`](app/privacy/page.tsx)) |

## Getting started

```bash
npm install
npm run dev
```

| Script | |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build (writes the secrets list in this README first) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, and a check that this README is up to date |
| `npm run check` | all of the above |

Append `?skip` to the URL to skip the intro.

### Configuration

The address is never hard-coded outside [`lib/site.ts`](lib/site.ts), and these override it:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | canonical URL for metadata, sitemap, JSON-LD, `llms.txt` and `security.txt` |
| `VERCEL_PROJECT_PRODUCTION_URL` | used when the variable above is not set (Vercel sets it) |
| `NEXT_PUBLIC_CONTACT_EMAIL` | contact address |
| `GOOGLE_SITE_VERIFICATION` | Search Console verification tag |

### Adding a project

Add an entry to `projects` in `lib/site.ts`: `source` for the repository, optionally `code` for the first excerpt (a file and a line to start at) and `codeFrom` for more repositories to draw excerpts from. Add a clip to `public/clips/`:

```bash
ffmpeg -i in.mp4 -vf "scale=384:288:flags=lanczos,fps=30" -an \
  -c:v libx264 -preset veryslow -crf 26 -pix_fmt yuv420p -movflags +faststart out.mp4
```

### Structure

```
app/                      page, layout and metadata, 404, privacy, code.json, generated text files
components/               one file per section, the loader, the shell and the hidden parts
lib/site.ts               all content and configuration
lib/snippets.ts           code excerpts from GitHub
lib/ascii/                glyph grid, headlines, loader letters, films, water, zoom, black hole
lib/world/                renderer, shaders, text SDFs, camera path, starfield
scripts/nexor-grid/       the typeface generator
scripts/readme-secrets.mjs  keeps the end of this README current
```

## Stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, static), React 19, TypeScript |
| Motion | GSAP 3 with ScrollTrigger, Lenis on the GSAP ticker |
| Rendering | three.js shader materials and render targets, Canvas 2D for the glyph grids |
| Type | Nexor Grid (own, generated) and Geist Mono (SIL Open Font License) |

<br />

<div align="center">
  <sub>Built by <a href="https://github.com/Plattnericus">Nexor / Plattnericus</a></sub>
</div>

<br />

<!-- secrets:start (written by scripts/readme-secrets.mjs from lib/secret-notes.json) -->
<details>
<summary><sub>&nbsp;.&nbsp;</sub></summary>

<br />

You looked. There are 28. `secrets` in the shell counts the ones you have, and a card shows up in the corner whenever you find another. Open one at a time:

<details>
<summary><code>01</code> Season</summary>

Type `season` anywhere on the page, on any page of the site. A picker opens with the four seasons, each a small living landscape in pixel art (a cabin with smoke in winter, a pond with butterflies in spring, a lake under the sunset in summer, a cabin among pumpkins in autumn); pick one with a click or 1 to 4. Its weather (snow, blossom, fireflies or falling leaves) drifts over every page with the scroll, settles on the name, the headlines and the frames, and stays until you reload. Typing `winter`, `spring`, `summer` or `autumn` switches it on straight away, 0 in the picker switches it off. On a phone, tap the last line of the footer five times. It works in the shell too.

</details>
<details>
<summary><code>02</code> Konami</summary>

↑ ↑ ↓ ↓ ← → ← → B A. Opens the seasons.

</details>
<details>
<summary><code>03</code> Mirror</summary>

`mirror` in the shell. Your camera as live ASCII art, mirrored. It only starts after the browser asks. Nothing leaves the tab.

</details>
<details>
<summary><code>04</code> Reel</summary>

`reel` in the shell. Every project clip full screen, with cuts through static. The arrow keys skip.

</details>
<details>
<summary><code>05</code> Drop</summary>

Drag any picture or video onto the page. It turns into characters. It is read locally and never uploaded. Wheel or `+`/`-` changes the resolution, `c` toggles colour.

</details>
<details>
<summary><code>06</code> Singularity</summary>

`cd /dev/null`

</details>
<details>
<summary><code>07</code> Sudo</summary>

Try `sudo`.

</details>
<details>
<summary><code>08</code> Specimen</summary>

Type `nexor` anywhere, or `fc-list` in the shell. The site's own typeface, as a specimen you can type into.

</details>
<details>
<summary><code>09</code> Screensaver</summary>

Leave the page alone for 45 seconds.

</details>
<details>
<summary><code>10</code> Dotfile</summary>

`ls -a` in the shell, then read what you find.

</details>
<details>
<summary><code>11</code> Gravity</summary>

Click the name in the footer. The letters fall into the water; click again and they stand back up.

</details>
<details>
<summary><code>12</code> Jump</summary>

Press and hold on empty space. A ring of characters fills around the cursor while the stars are pulled in; when it closes, the page jumps to the next section through hyperspace.

</details>
<details>
<summary><code>13</code> Neofetch</summary>

`neofetch` in the shell.

</details>
<details>
<summary><code>14</code> Source</summary>

Read the code of every project: hover each `code` link in All projects (or `source` in Work).

</details>
<details>
<summary><code>15</code> Fortune</summary>

`fortune` in the shell.

</details>
<details>
<summary><code>16</code> Console</summary>

Open the browser console and do what it says.

</details>
<details>
<summary><code>17</code> Lightspeed</summary>

Fling the page: cover two and a half screen heights within half a second.

</details>
<details>
<summary><code>18</code> Snake</summary>

`snake` in the shell. Eat five. Arrows or WASD, swipe on phones, `q` quits.

</details>
<details>
<summary><code>19</code> Sculptor</summary>

Carve all twelve cuts into the name on the start screen at once: draw quickly back and forth through the letters.

</details>
<details>
<summary><code>20</code> Whirl</summary>

On the start screen, circle the name with the cursor three times in a row. It spins once on its axis.

</details>
<details>
<summary><code>21</code> Stone</summary>

Skip a stone across the water under the name in the footer: a fast, flat swipe over a good part of its width.

</details>
<details>
<summary><code>22</code> Vim</summary>

`vim` in the shell. Then get out again.

</details>
<details>
<summary><code>23</code> Coffee</summary>

`coffee` in the shell (or `brew coffee`).

</details>
<details>
<summary><code>24</code> Hello</summary>

Type `hello` anywhere on the page. The bar at the top says hello back.

</details>
<details>
<summary><code>25</code> Wave</summary>

Type `wave` while the name is on screen. Its 3D letters hop, one after the other.

</details>
<details>
<summary><code>26</code> Roll</summary>

Type `roll` anywhere on the page. The camera does a barrel roll through the world.

</details>
<details>
<summary><code>27</code> Lights</summary>

Type `lights`. The page goes dark and a torch follows the cursor. Type it again, or press esc, and the lights come back.

</details>
<details>
<summary><code>28</code> Zen</summary>

Type `zen`. All the text fades away and only the world is left to scroll through. Type it again, or press esc, to come back.

</details>

</details>
<!-- secrets:end -->
