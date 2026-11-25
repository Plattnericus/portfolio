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
  <a href="#getting-started">Getting started</a> ·
  <a href="#secrets">Secrets</a>
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

A quote from Linus Torvalds sits between the work and the index, typed out as you scroll; the footer always sorts its letters into its own line, "Make it work first. Beautiful software that doesn't run is just a screenshot." (`fortune` in the shell draws any of them). A click anywhere drops a small ripple into the characters. Whatever you find that was hidden ([Secrets](#secrets), with spoiler warnings), a card slides in at the top right like an advancement in a game: the icon in an inventory slot, how it was found, and a cell for every secret, the new one blinking; with a short chime, synthesised on the spot (no audio file). The last one turns it gold. The cursor is a block that inverts what is under it; it stays above everything, dialogs included, and steps aside only while the page scrolls.

### The shell

Press <kbd>`</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd>, or tap `~$` in the bar.

| Command | |
| --- | --- |
| `ls` · `cd <dir>` · `cat <file>` | look around: every project is a folder with its `README.md` (`ls -a`, `ls -l`, `pwd` and `tree` work too) |
| `open <name>` | open a project; alone, inside its folder |
| `cd <section>` | fly to about, tools, work, projects or contact |
| `stack` · `whoami` · `mail` | the short version |
| `warp` | full speed |
| `secrets` | how many you have found |
| `mute` · `unmute` | the chime for a found secret, off or back on |
| `history` · `clear` · `exit` | what you typed, a clean screen, the way out |

It behaves like a terminal: the prompt follows the output and shows the folder you are in, the cursor is a blinking block (hollow when the shell is not focused), long lines wrap, the output scrolls with the wheel, a finger, <kbd>PgUp</kbd>/<kbd>PgDn</kbd> or its scrollbar, and the window bar shows its size in columns and rows. On a phone it sits on top of the keyboard. The file system is read-only and made from [`lib/site.ts`](lib/site.ts) ([`lib/shell-fs.ts`](lib/shell-fs.ts)). Not every command is on the list above.

| Key | |
| --- | --- |
| <kbd>Tab</kbd> | complete as far as it is sure, list the rest |
| <kbd>↑</kbd> <kbd>↓</kbd> | walk the history; the line you were typing comes back |
| <kbd>Ctrl</kbd> + <kbd>C</kbd> | cancel the line (copies when something is selected) |
| <kbd>Ctrl</kbd> + <kbd>L</kbd> | clear the screen |
| <kbd>Ctrl</kbd> + <kbd>A</kbd> / <kbd>E</kbd> | start / end of the line |
| <kbd>Ctrl</kbd> + <kbd>U</kbd> | delete to the start of the line |
| <kbd>Ctrl</kbd> + <kbd>D</kbd> | exit, on an empty line |
| <kbd>PgUp</kbd> <kbd>PgDn</kbd> | scroll the output |
| <kbd>Esc</kbd> | close |

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
| Without a GPU | the world draws only when something changes; total blocking time 0 ms |
| Lighthouse 13 | 100 in every category, desktop and mobile (production build, measured locally with software WebGL as PageSpeed Insights uses) |
| Routes | all prerendered, `/code.json` revalidated daily |

Up to 1920 x 1080 every size is set in pixels; on larger screens one design unit (`--u` in the stylesheet) grows with the tighter of width and height, so a 2560 or 4K screen shows the same layout, only larger, and an ultrawide does not blow the type up. On touch screens every link has a hit area of at least 24 px that takes no extra room. On phones the world uses a finer character grid, the start camera frames the wordmark to the screen's width, small text is set larger, and the bar keeps only the name, the shell and the progress. Measured on the production build in Chrome on the development machine. One shared GSAP ticker drives Lenis, the world and every canvas; canvases draw only while visible. Which character a cell shows is decided once per cell (about 11,000 on a laptop screen), not once per pixel, so a retina display costs barely more than a standard one. Films are converted to characters only when the video shows a new frame, not at the display's refresh rate. Layout is read only when the page has moved. The world's shaders compile in parallel, off the thread that draws the page (`KHR_parallel_shader_compile`), from the moment the page mounts, so a refresh never stalls the loader's letters; its distance fields are built in separate short tasks. Behind the loader's closed curtain the world rests, and the 3D letters follow the clock of the printed letters' own CSS transition, so the two cannot drift apart. The hidden parts (shell, cinema, specimen, screensaver, seasons, the typed tricks) are separate chunks, loaded once the loader is gone and the browser is idle. Project films load one ahead; a clip that fails to load is asked for again, and while a new one buffers the monitor keeps the last frame instead of dropping to static. `prefers-reduced-motion` gets a calm, static page.

**Without a GPU.** Where WebGL runs in software (SwiftShader, llvmpipe, a VM; PageSpeed Insights' lab runs behave the same) the browser copies every frame of the canvas back on the page's main thread, which alone kept that thread fully busy. So there the world is drawn at a device pixel ratio of 1 and only in frames where something on it changes (the camera, the cursor, an effect still running), and the loader's letters wait in their places instead of flying in. Its shaders are compiled while the fonts load, the first frame goes into the offscreen targets pass by pass and then onto a hidden canvas, each step waiting on a GPU fence instead of blocking, and the distance fields are built in short tasks. A reload always starts at the top: the browser's own scroll restoration is switched off in the `<head>`, before anything is laid out.

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
| `npm run build` | production build (writes the Secrets section of this README first) |
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
scripts/readme-secrets.mjs  keeps the Secrets section of this README current
```

## Stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, static), React 19, TypeScript |
| Motion | GSAP 3 with ScrollTrigger, Lenis on the GSAP ticker |
| Rendering | three.js shader materials and render targets, Canvas 2D for the glyph grids |
| Type | Nexor Grid (own, generated) and Geist Mono (SIL Open Font License) |

<!-- secrets:start (written by scripts/readme-secrets.mjs from lib/secret-notes.json) -->
## Secrets

> [!WARNING]
> **Spoilers ahead.** The site hides 28 secrets, and finding them yourself is the fun part. Everything below gives them away, one layer at a time: first where to look, then hints, then the full solutions. Open only as much as you want to know.

`secrets` in the shell counts the ones you have found, and a card slides in at the top right for each new one. Only their names are kept, in your browser's `localStorage`.

| Where | How | Secrets |
| --- | --- | ---: |
| **Shell** | typed into the shell: <kbd>`</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>K</kbd> | 10 |
| **Typed anywhere** | typed on the page itself, no field needed | 8 |
| **Mouse and touch** | clicked, held, dragged, swiped or scrolled | 8 |
| **Elsewhere** | outside the page, or by doing nothing at all | 2 |
| **Total** | | **28** |

### Hints

A nudge for each, without the answer and without the name, which for most of them would be the answer. The numbers match the solutions.

<details>
<summary><b>Show the hints</b></summary>

<br />

| # | Where | Hint |
| ---: | --- | --- |
| 01 | Typed anywhere | There are four of them a year. Type the word for them. |
| 02 | Typed anywhere | A cheat code older than most of the web. Arrows, then two letters. |
| 03 | Shell | Ask the shell to show you yourself. |
| 04 | Shell | Ask the shell for all the films at once. |
| 05 | Mouse and touch | The page takes more than clicks. Bring a picture. |
| 06 | Shell | Go somewhere nothing comes back from. |
| 07 | Shell | Ask for more rights than you have. |
| 08 | Typed anywhere | The typeface has a name. Say it. |
| 09 | Elsewhere | Do nothing for a while. |
| 10 | Shell | Some files do not show up in a plain listing. |
| 11 | Mouse and touch | The name at the very bottom is not glued down. |
| 12 | Mouse and touch | Press on empty space, and do not let go. |
| 13 | Shell | Ask for the system info, the way people post it in screenshots. |
| 14 | Mouse and touch | Every code link has something to show. See all of them. |
| 15 | Shell | Ask the shell what the future holds. |
| 16 | Elsewhere | Developers open a certain panel first. |
| 17 | Mouse and touch | Scroll faster. Much faster. |
| 18 | Shell | The game every old phone came with. |
| 19 | Mouse and touch | On the start screen the cursor carves. Carve everything at once. |
| 20 | Mouse and touch | On the start screen, draw circles around the name. |
| 21 | Mouse and touch | The water in the footer is flat enough to skip something across. |
| 22 | Shell | Open the editor everyone struggles to leave. |
| 23 | Shell | Ask for what keeps developers running. |
| 24 | Typed anywhere | Be polite. Greet the page. |
| 25 | Typed anywhere | While the name is on screen, greet it from far away. |
| 26 | Typed anywhere | Do a barrel ... |
| 27 | Typed anywhere | Type what you switch off before a film. |
| 28 | Typed anywhere | Type the word for a calm, empty mind. |

</details>

### Solutions

> [!CAUTION]
> **Full spoilers.** Each list below gives away every secret in it, step by step.

<details>
<summary><b>Shell</b> &nbsp;·&nbsp; 10 secrets</summary>

<br />

| # | Secret | How |
| ---: | --- | --- |
| 03 | **Mirror** | In the shell, type `mirror` and allow the camera when the browser asks. It shows your camera as live, mirrored ASCII art; nothing leaves the tab. Esc closes it. |
| 04 | **Reel** | In the shell, type `reel`. Every project clip plays full screen, cut together with static. ← and → skip, Esc closes. |
| 06 | **Singularity** | In the shell, type `cd /dev/null`. |
| 07 | **Sudo** | In the shell, type `sudo` (with anything after it) or `rm -rf`. |
| 10 | **Dotfile** | In the shell, `ls -a` lists a hidden file, `.plan`. Read it with `cat .plan`. |
| 13 | **Neofetch** | In the shell, type `neofetch`. |
| 15 | **Fortune** | In the shell, type `fortune`. |
| 18 | **Snake** | In the shell, type `snake` and eat five `*`. Arrow keys or WASD, swipes on a phone; Q quits. |
| 22 | **Vim** | In the shell, type `vim`, then leave with `:q` (or `:wq`, `:x`, `:qa`). |
| 23 | **Coffee** | In the shell, type `coffee` (or `brew coffee`). |

</details>

<details>
<summary><b>Typed anywhere</b> &nbsp;·&nbsp; 8 secrets</summary>

<br />

| # | Secret | How |
| ---: | --- | --- |
| 01 | **Season** | Type `season` anywhere on the page (outside text fields) and pick a season in the picker with a click or 1 to 4. Typing `winter`, `spring`, `summer` or `autumn` switches one on directly; so does `season` in the shell, or five taps on the footer's last line on a phone. The weather stays until you reload; 0 in the picker turns it off. |
| 02 | **Konami** | Anywhere on the page (outside text fields), press ↑ ↑ ↓ ↓ ← → ← → B A. Upper or lower case both work. The season picker opens. |
| 08 | **Specimen** | Type `nexor` anywhere on the page (outside text fields), or `fc-list` in the shell. The site's own typeface opens as a specimen you can type into. Esc closes it. |
| 24 | **Hello** | Type `hello` anywhere on the page (outside text fields). The bar at the top says hello back. |
| 25 | **Wave** | Type `wave` anywhere on the page while the big name is on screen. Its 3D letters hop, one after another. |
| 26 | **Roll** | Type `roll` anywhere on the page. The camera does a barrel roll through the world. |
| 27 | **Lights** | Type `lights` anywhere on the page. The page goes dark and a torch follows the cursor; type `lights` again or press Esc to turn them back on. |
| 28 | **Zen** | Type `zen` anywhere on the page. All text fades out and only the world is left; type `zen` again or press Esc to come back. |

</details>

<details>
<summary><b>Mouse and touch</b> &nbsp;·&nbsp; 8 secrets</summary>

<br />

| # | Secret | How |
| ---: | --- | --- |
| 05 | **Drop** | Drag a picture or video file from your computer onto the page and let go. It is turned into characters right in the browser, never uploaded. Mouse wheel or + and - change the resolution, C toggles colour, Esc closes. |
| 11 | **Gravity** | Scroll to the very bottom and click the large name above the water. Its letters fall in; click again and they stand back up. |
| 12 | **Jump** | With a mouse: press and hold on empty space (not on text, links or buttons) for about a second without moving. A ring fills around the cursor; when it closes, the page jumps to the next section. |
| 14 | **Source** | On a computer, in one visit: hover the `code` link of every project in All projects (a moment each is enough). Hovering `source` in Work counts too. |
| 17 | **Lightspeed** | Scroll very fast: two and a half screen heights within half a second, with a hard flick of the mouse wheel or trackpad, or a fast swipe on a phone. |
| 19 | **Sculptor** | With a mouse, on the start screen: sweep the cursor quickly back and forth through the big name until it is cut open in twelve places at once. Cuts heal after about two seconds. |
| 20 | **Whirl** | With a mouse, on the start screen: circle the cursor around the big name three full times within six seconds. It spins once on its axis. |
| 21 | **Stone** | Scroll to the very bottom and swipe the cursor or a finger quickly and level across at least a third of the water under the name. A stone skips across it. |

</details>

<details>
<summary><b>Elsewhere</b> &nbsp;·&nbsp; 2 secrets</summary>

<br />

| # | Secret | How |
| ---: | --- | --- |
| 09 | **Screensaver** | Leave the page alone for 45 seconds with its tab in front: no mouse, keys, scrolling or touches. |
| 16 | **Console** | Open the browser's developer console (F12, or ⌥⌘J on a Mac). The banner asks you to call `nexor()`: type `nexor()` and press Enter. |

</details>
<!-- secrets:end -->

<br />

<div align="center">
  <sub>Built by <a href="https://github.com/Plattnericus">Nexor / Plattnericus</a></sub>
</div>

<br />
