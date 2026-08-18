# The Docusaurus conformance shell

The second implementation of the site surface contract
(`specs/ksor/init/spec.md` → the shell swap seam). It exists to keep the
seam honest and to prove vendor neutrality by demonstration: the same
record, the same root commands, a different framework — and nothing outside
`system/site/` changes. `ksor init` still emits the Fumadocs reference
shell; there is no shell selector (decision 9) — swapping is an act the
project's coding agent performs, and this directory is the recipe.

**Conformance-lean, never feature parity.** It satisfies the contract's four
clauses (dev + build at `system/site/`, renders every record document and
nothing authored inside itself, serves `llms.txt`, passes the browser smoke)
and translates the governed `order:` key.

It is not, however, unstyled. The predecessor's design system crossed with it
(below), so a swapped project looks like a finished publication rather than a
framework demo — in KSoR's own colour, set in one place.

## Lineage

Rebased on the predecessor's de-branded Docusaurus shell (`sor-site` in the
vsor archive) under decision 6. Conversion is engineering-gated, not
licence-gated, so every mechanism was asked what it was for before it
crossed — and most of that shell did not cross.

### What crossed, and why

| Carried                                                     | Why it earned its place                                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `future: { v4: true, faster: true }` + `@docusaurus/faster` | rspack, swc and lightningcss instead of webpack, babel and terser, plus SSG on worker threads. Measured below.                                                                                                                                 |
| `@easyops-cn/docusaurus-search-local`                       | The only search that keeps the no-off-origin-request contract: the index is built into the export and served from the same origin.                                                                                                             |
| Explicit prism light/dark themes                            | Docusaurus's default prism theme is dark in both color modes; the predecessor measured fenced code at roughly 1.3:1 on a light page.                                                                                                           |
| The bare theme specifier, never `require.resolve()`         | Docusaurus serializes `themes` into the client bundle, so a resolved path bakes the building machine's absolute checkout path into every built site.                                                                                           |
| `staticDirectories` ordered first-writer-wins               | Measured on 3.10.2: the copy plugin defaults to `force: false`, so the first directory listed wins. `.generated` leads, because a record-derived `llms.txt` outranks any authored copy.                                                        |
| The `browserslist` field                                    | swc and lightningcss read it to choose targets; without it the output depends on an ambient default.                                                                                                                                           |
| **The four-file design system** (`src/css/`)                | `tokens.css` (the only file that names a colour), `sidebar.css`, `doc-pages.css`, `custom.css`. It restyles Docusaurus's own class names, so it needs no components and no vocabulary the record does not have.                                |
| **Self-hosted Inter + JetBrains Mono** (`src/css/fonts/`)   | The typefaces the system is drawn in, referenced RELATIVELY so the bundler emits them under whatever `baseUrl` the project uses. Same-origin, so the no-external-request clause stays green. Both SIL OFL 1.1; licences ship beside the files. |
| **The Navbar swizzle**                                      | `doc-pages.css` puts the doc layout on an 1800px measure; the stock Infima bar is full-bleed, so leaving it in place puts the bar and the page on two different grids. Brings the glass-on-scroll header and the mobile sheet with it.         |
| **The Footer swizzle**                                      | The layout grammar (name set large, quiet links, a hairline above the closing line) on the same 1800px measure. Content-driven: everything comes from `themeConfig.footer`.                                                                    |
| **ModeToggle**                                              | Its whole behaviour is `useColorMode()`. Load-bearing once the navbar is ours — the stock bar is where the framework's own toggle lives.                                                                                                       |
| **ReadingProgress** + a wrap-only `DocItem/Content`         | Local, no backend, nothing about the record. The wrapper mounts it above the framework's untouched content.                                                                                                                                    |
| **The home page's craft**                                   | The inset band, the dot field, the blurred spotlight, the staggered entrance, and the uppercase display treatment that drops the last word of a multi-word name into the brand colour.                                                         |
| Tailwind 4 (`@tailwindcss/postcss`, `tailwindcss-animate`)  | `custom.css` is written against it (`@theme inline`, `@apply`), and the chrome components are utility-classed. Exact pins, no carets.                                                                                                          |

### What did not cross, and why

| Rejected                                                                                                                                                        | Reason                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The eight `@vsor` remark/lib packages (tabs, flashcards, gallery, content enhancements, relative-link normalizer, summaries, section manifest, structured data) | They implement a directive grammar and frontmatter vocabulary the record does not have. The spec defers directives; a shell that renders a grammar the record has not ratified forks the record.                                                                                                                                                                                      |
| `remark-directive` and `admonitions: true`                                                                                                                      | Same reason, one level down: `knowledge/` is CommonMark only (decision 8), so `:::tip` is literal text — and it must stay literal in _both_ shells, or the two surfaces stop rendering one truth.                                                                                                                                                                                     |
| **The admonition stylesheet** (doc-pages.css §9, and its four tint tokens)                                                                                      | Follows the line above: rules for markup no build can emit are dead weight in every adopter's stylesheet.                                                                                                                                                                                                                                                                             |
| The `markdown.preprocessor` that rewrote Docusaurus 2 admonition syntax                                                                                         | It exists to migrate a corpus written for a framework. The record was never written for one.                                                                                                                                                                                                                                                                                          |
| Mermaid                                                                                                                                                         | The predecessor measured it at 83 MB installed and ~3,440 KB of a ~4,500 KB client bundle, in the common chunk — every page pays. No record rule uses diagrams.                                                                                                                                                                                                                       |
| i18n, the blog, the og-image machinery, the structured-data plugin, the six translated doc-tree plugin instances                                                | Product surfaces of that site, not the contract.                                                                                                                                                                                                                                                                                                                                      |
| The config-merge seam (`SHELL_OWNED`, `mergeOver`, `followTitle`, `followBaseUrl`)                                                                              | It exists because that shell was unpacked into a project and could not be edited. Here the adopter owns `system/site/` outright (decision 4) — the seam is the filesystem, so a merge layer would be machinery guarding a door that is already open.                                                                                                                                  |
| `headTags` with a hand-composed favicon link                                                                                                                    | It was the source of the predecessor's own sub-path bug (a `/img/...` icon 404ing under `/repo/`). The `favicon` config key produces the same tag through `useBaseUrl`, which is correct under every base path — verified here with `KSOR_BASE_PATH=/repo`.                                                                                                                           |
| `hashed: false` on the search index                                                                                                                             | It was load-bearing only for a custom SearchBar that fetched the index from a fixed path. This shell ships the plugin's own bar, so the default (hashed, cache-busted) is right.                                                                                                                                                                                                      |
| `BROWSERSLIST_IGNORE_OLD_DATA`                                                                                                                                  | Noise suppression for a warning this tree does not emit.                                                                                                                                                                                                                                                                                                                              |
| **The custom `SearchBar`** and its `search-utils`/`useModKey`                                                                                                   | It fetched the index over `fetch` from a fixed path, which is what forced `hashed: false`. `@theme/SearchBar` is the search plugin's own bar and the navbar mounts that.                                                                                                                                                                                                              |
| **Quiz, Flashcards, ConversationGallery, ExerciseCard, HighlightTip, LessonContent, DocPageActions, EffectiveDating, ImageZoom**                                | Content features, each keyed to a frontmatter key, a co-located data file, or a plugin datum the record does not have — plus a PhotoSwipe runtime for the last. `MDXComponents` went with them: it exists to name exactly these, and the record is CommonMark.                                                                                                                        |
| **The reading-time estimate**                                                                                                                                   | It measures the rendered DOM after mount, so it is honest and it is not content. But it lived in a doc-header row whose other four occupants (the action toolbar, the effective-dating notice, the summary tabs) did not cross, and a header row holding one estimate is a row the contract never asked for.                                                                          |
| **`@theme/Landing`** (Hero, SectionCards, Surfaces, Closing, `useCorpus`)                                                                                       | Four bands of framework-authored copy, a derived corpus manifest and a closing call. The home page's contract here is four things: the instance name, a derived first-document action or an honest empty-record line, the mark, and the "Built with KSoR" link. Its GEOMETRY crossed; its content did not.                                                                            |
| **`lucide-react`** and the 37-name `NAV_ICONS` allowlist                                                                                                        | The allowlist exists to serve an `icon:` key on navbar items — a config vocabulary of that shell's own invention — and the library ships for the handful of glyphs actually drawn. The four this shell draws are inline SVG (`src/components/icons.tsx`), which is the trade its own ModeToggle had already made.                                                                     |
| **`class-variance-authority`, `@radix-ui/react-slot`, the shadcn `Button`**                                                                                     | Six button variants and four sizes, of which this shell uses a ghost icon button and one filled action. Both are written directly. `@radix-ui/react-dialog` stays: the mobile sheet needs a real focus trap.                                                                                                                                                                          |
| **The `@/*` path alias and `components.json`**                                                                                                                  | An alias earns its place in an app with a deep tree; this shell has eight source files. It also costs a `configureWebpack` plugin — bundler coupling on a shell that registers no bundler config otherwise. Imports are relative.                                                                                                                                                     |
| **Sidebar leaf NUMBERING** (sidebar.css §12)                                                                                                                    | Two of its rules key off DOM depth alone, so any record with a folder inside a folder would have had "1." "2." prefixed to its documents by the shell — the site inventing an ordering the record never declared, which is exactly what the governed `order:` key exists to state. The other three keyed off `_category_.json` classNames and a `sidebar_class_name` frontmatter key. |
| **The JS-driven collapsible sidebar** (sidebar.css §14)                                                                                                         | A width transition keyed on `body.sidebar-collapsed`, a class the predecessor set from chrome that did not cross.                                                                                                                                                                                                                                                                     |
| **The `.allow-rounded` escape hatch**                                                                                                                           | It exempted macOS-simulation components from the global sharp-corner rule. Those did not cross; the one thing that needs the exemption here (the mark) is named directly.                                                                                                                                                                                                             |
| **Hiding the sidebar's collapse button**                                                                                                                        | It makes `docs.sidebar.hideable: true` unreachable — a configured affordance with its own control painted out. The button stays; only Infima's grey button fill goes.                                                                                                                                                                                                                 |

### What was changed on the way across

Each of these is a divergence from the ported file, measured here:

- **Dark-mode links are the brand colour**, not the neutral ramp. On the built
  site a link and a `<strong>` rendered in the same grey, and nothing on a dark
  page said which words were clickable. `<strong>` moved off the primary to
  `--foreground` for the same reason — bold must not read as a link on a page
  whose links are also the primary. The list markers and the H2 rule keep one
  colour across themes on the same argument.
- **Two colour literals were tokenized**: `.markdown thead { color: white }`
  became `--primary-foreground` and `.pagination-nav__link { background: white }`
  became `--card`. Both would have stranded under a re-brand.
- **Every token declaration the shell does not read was deleted** — 130 of them,
  to a fixpoint. The predecessor's rule was "every property this shell reads is
  one it declares"; the reverse holds here too, so an adopter's stylesheet does
  not carry the palette of components that did not cross.
- **Two hashed CSS-module selectors** (`tocMobile_ITEo`, `tocCollapsible_ETCw`)
  became prefix matches. A hash is a build artifact of one Docusaurus release.

## The re-brand, in one file

`src/css/brand.css` carries the whole of it: one `--ifm-color-primary` per
theme. Everything accented derives from that pair — Infima reads it directly,
`--primary` bridges it into the shadcn palette, and `tokens.css` §3 composes it
into the deep shades and the opacities the chrome needs.

| Value                                    | Where it comes from                                                                                                                                                                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| light `#004CC5`                          | Sampled from the KSoR mark: the exact value on its K, and the most common quantized value across the repo banner is the neighbouring `#0050C0`. Measures 7.44:1 both against the light ground (it is used as text) and against `--primary-foreground` (it is used as a surface). |
| dark `#6FA8FF`                           | The same hue lightened until it clears a near-black ground: 8.7:1. The light value cannot be reused — it measures 2.8:1 there.                                                                                                                                                   |
| dark `--primary-foreground` → near-black | The third value the pair forces. Near-white on `#6FA8FF` measures 2.4:1; near-black measures 6.8:1. Recorded in `brand.css` beside the pair.                                                                                                                                     |

The mark's teal and greens stay in the mark: the token system composes ONE
primary, and a second brand hue would have to be bridged into a layer built
around one.

## Measured build time

`pnpm build`, `real` seconds, Darwin arm64 / Node 24 / pnpm 11, on a scaffolded
project with only the `future` line toggled. **Cold** means
`system/site/.docusaurus`, `out/` **and `system/site/node_modules/.cache`**
(rspack's persistent cache, 24 MB) deleted first; **warm** keeps that cache.
Second run of each, never the first.

| Record                           |      | faster off | faster on | change |
| -------------------------------- | ---- | ---------- | --------- | ------ |
| 1 document (a fresh scaffold)    | cold | 9.09       | 3.31      | −64%   |
|                                  | warm | 2.56       | 2.02      | −21%   |
| 200 documents, 2.2 MB, 5 folders | cold | 17.12      | 7.28      | −57%   |
|                                  | warm | 6.41       | 5.27      | −18%   |

**What the design system costs**, same machine, same session, same method —
this shell against the pre-port shell it replaces:

| Record        | pre-port cold / warm | with the design system | delta           |
| ------------- | -------------------- | ---------------------- | --------------- |
| 1 document    | 3.31 / 2.01          | 3.31 / 2.02            | none measurable |
| 200 documents | 6.90 / 5.28          | 7.28 / 5.27            | +0.4s cold      |

Re-measured 2026-08-18. Worth knowing before someone re-measures again: the
**very first** build after `pnpm install` is far slower than any later one —
native binaries cold on disk and an empty rspack cache. Measure the second
build. And note the cold definition above: an earlier measurement of this table
left `node_modules/.cache` in place, which makes "cold" and "warm" converge.

## The swap, performed on a scaffolded project

```sh
rm -rf system/site
cp -R <ksor-repo>/workbench/shells/docusaurus system/site
rm system/site/README.md   # this file documents the workbench artifact; the
                           # format checker rightly refuses .md inside the site
printf '%s\n' 'system/site/.docusaurus/' 'system/site/.generated/' >> .gitignore
pnpm install               # stops once on the build-scripts gate — see below
                           # (in CI, add --no-frozen-lockfile: the swap
                           # changes the dependency set, and CI defaults the
                           # frozen check on — found live 2026-08-18)
pnpm dev      # or: pnpm build → system/site/out/
```

`pnpm install` stops on pnpm 11's build-scripts gate and writes a placeholder
into `pnpm-workspace.yaml` for every newly gated package; each is decided
here, denied, found live 2026-08-18. Both denials are proven by the build and
the browser smoke passing with them in place:

```yaml
allowBuilds:
  # @swc/core's postinstall says what it is for in its own header: check that
  # the native binding loaded, else download @swc/wasm as a fallback. The
  # platform binary arrives as an optionalDependency, so there is nothing for
  # it to fix. (arrives with @docusaurus/faster)
  "@swc/core": false
  # core-js postinstall only prints a funding banner
  core-js: false
```

**The design system added no entry to that set**, verified on a clean install
in an empty workspace (2026-08-18, exit 0, `pnpm-workspace.yaml` unchanged):
`@tailwindcss/oxide`, `@radix-ui/react-dialog`, `clsx` and `tailwind-merge`
declare no install lifecycle script at all. `esbuild` and `sharp` are already
denied by the scaffold and stay denied. `lightningcss`, `@rspack/core` and
`@node-rs/jieba` ship prebuilt binaries as optional dependencies with no
install script, so they never reach the gate.

## The swap back

Restore from **git history**, never from a fresh scaffold template:

```sh
git checkout HEAD -- system/site pnpm-lock.yaml
pnpm install
```

A template restore is the trap: `ksor init` stamps the project's identity into
what it emits, so re-emitting a template over `system/site/` ships the literal
placeholder identity (`KSOR-STAMP-NAME`) into a repo that already had a name.
Git has the bytes that were actually there; take them from git.

Two leftovers are harmless and can stay: the `allowBuilds` denials the swap
added to `pnpm-workspace.yaml` (they deny install scripts for packages that are
no longer installed) and the two `.gitignore` lines (`system/site/.docusaurus/`,
`system/site/.generated/`, which name directories the reference shell never
creates).

## Notes recorded live

- `llms.txt`/`llms-full.txt` are generated when the server or the build
  starts, not on every knowledge edit — the build is the surface of record.
- **Ordering work needs a dev-server restart on this shell.** Measured
  2026-08-18 against a running `pnpm dev`: a body edit hot-reloaded in **0.5s**,
  but changing a document's `order:` from 15 to 1 — a change a fresh build
  proves moves that folder to the top of both surfaces — left the sidebar and
  `llms.txt` byte-identical for as long as the server ran. Both read the record
  once, at config load. Edit prose with the server up; restart it after
  ordering.
- **If port 3000 is taken this shell exits**, where the reference shell shifts
  to the next free port. Measured: `[ERROR] Something is already running on port
3000.` and the process ends — Docusaurus's "use another port?" prompt needs a
  TTY, so it never appears under a script or an agent. Run
  `pnpm dev --port 3002`; pnpm forwards the flag on its own (the log reads
  `docusaurus start --port 3002`), so do **not** add a `--` separator —
  Docusaurus takes a literal one as an argument.
- **`numberPrefixParser` is off** (`docusaurus.config.ts`). Docusaurus strips a
  leading `01-` from both the slug and the sidebar label by default, so
  `knowledge/01-intro.md` published at `/docs/intro/`: every `llms.txt` link to
  it 404s, and a record that also holds `intro.md` gets two documents fighting
  for one route. Identity derives from file path (product principle 3), and
  ordering is the `order:` key's job. Verified: `/docs/01-intro/` exists,
  `/docs/intro/` does not, and the sidebar label is the frontmatter title.
- **An empty `order:` means "no order declared", not zero.** `Number("")` is 0,
  so a bare key used to jump a document to the top of its level here while the
  reference shell sorted it last — one record, two reading orders, silently.
  `lib/record.ts` checks the empty case before `Number()`.
- **`KSOR_BASE_PATH` is normalized and validated at config load.** `/repo/` and
  `/repo` both give `baseUrl: "/repo/"`; `/` and unset both mean root; a value
  with no leading slash is refused with a message naming the variable and the
  valid shape. Raw interpolation built green, unloadable sites for the first
  three.
- **`.generated/` is removed before it is written.** `staticDirectories` copies
  the whole directory into the export, so a stray file left there once shipped
  into every build from then on. Verified with a planted `ghost.txt`: absent
  from the export.
- **Images in a record document work both ways**, verified 2026-08-18 with a
  co-located `![](./diagram.png)` and a static `![](/img/ksor-mark.png)`. Under
  Docusaurus's inline threshold an image becomes a `data:` URI (so it costs no
  request at all, and the no-off-origin-request clause is unaffected); above it,
  the image is emitted to `assets/images/<name>-<hash>.png` and its `src`
  carries `KSOR_BASE_PATH` — checked with a 935 KB file under `/repo`.
- **`instance.md` refuses rather than improvises.** A missing file used to throw
  a raw ENOENT naming `readFileSync`; a missing `name:` used to fall back to the
  literal "knowledge" and publish somebody else's identity on a green build.
  Both now state what the file is for and how to fix it.
- `pnpm check` (the scaffold's format checker) passes unchanged on a swapped
  project; the record and the agent kit never notice the framework changed.
- **Docusaurus 3.10 ships its own CSS inside cascade layers** —
  `docusaurus.infima`, then `theme-common`, `theme-classic`, `core`. Two
  consequences, both measured on the built site:
  - A bare `@import "tailwindcss"` appends `theme, base, components, utilities`
    AFTER those, and for normal declarations a later layer wins — so preflight's
    `*,::before,::after { margin:0; padding:0; border:0 }` outranks every Infima
    rule that sets padding on framework chrome. The search field computed
    `padding: 0` against Infima's `0 .5rem 0 2.25rem`, so its magnifier sat on
    top of its own placeholder; the doc sidebar computed `padding: 0`, so the
    active page's pill ran flush into the viewport edge. Nothing warned. The
    import is split so preflight is left out, and the two lines of it this shell
    does depend on (the border reset) are reinstated by hand.
  - For **important** declarations the cascade inverts layer order, so
    `@layer base { * { border-radius: 0 !important } }` beats every unlayered
    `!important` in this shell. That is what enforces the sharp corners — and
    it is why the mark's exemption has to live in the same layer and
    out-specify `*` rather than be written as a utility or an unlayered rule.
- **postcss-preset-env's `cascade-layers` polyfill must be off** (the one plugin
  `docusaurus.config.ts` registers). Docusaurus applies preset-env with an empty
  options object, which leaves the polyfill on: every `@layer` is rewritten into
  `:not(#\#)` specificity hacks, CSS modules are not boosted by that rewrite,
  and every padding, margin and border the modules declare loses. The
  predecessor found this on its deployed demo. Verified here by grepping the
  built stylesheet: `@layer` survives, `:not(#` does not appear.
- **Tailwind's source detection is pinned** (`source(none)` + one `@source`).
  Auto-detection scans outward from the package root, which includes `out/` — so
  a second build would scan the first build's HTML. Verified: two consecutive
  clean builds emit a byte-identical `styles.<hash>.css`.
- `swcHtmlMinimizer` (part of `faster`) strips attribute quotes from the
  export: links read `href=/repo/docs/example/`, unquoted. Anything asserting
  on shipped HTML must be quote-agnostic.
- Under `KSOR_BASE_PATH=/repo` the font URLs inside the built stylesheet are
  rewritten to `/repo/assets/fonts/...` — the `@font-face` rules reference them
  relatively, so the bundler carries the prefix for free. Verified along with
  the mark's `src`, the stylesheet `href`, and every `llms.txt` link.
- Infima sets `--ifm-background-color: transparent` in light mode, but this
  shell paints `html, body` from its own `--background`, so both themes report
  a real colour (`rgb(255,255,255)` / `rgb(0,0,0)`).
- The search index is fetched by a classic web worker, and `importScripts`
  enforces a JavaScript MIME type: a static server that returns bodies with no
  `Content-Type` breaks search — and the failure arrives as a `pageerror`, not
  a console error, so a console-only smoke stays green while search is dead.
- The search index tokenizes English (`language: ["en"]`). A record written
  in another language adds it in `docusaurus.config.ts`; the adopter owns
  `system/site/`, so that is an edit, not a fork.

The shell-agnostic conformance suite at
`packages/ksor/src/shell-conformance.integration.test.ts` runs both shells
through identical assertions in CI (`KSOR_E2E=1`).
