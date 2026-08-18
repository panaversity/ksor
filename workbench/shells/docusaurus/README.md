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

## Lineage

Rebased on the predecessor's de-branded Docusaurus shell (`sor-site` in the
vsor archive) under decision 6. Conversion is engineering-gated, not
licence-gated, so every mechanism was asked what it was for before it
crossed — and most of that shell did not cross.

### What crossed, and why

| Carried                                                     | Why it earned its place                                                                                                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `future: { v4: true, faster: true }` + `@docusaurus/faster` | rspack, swc and lightningcss instead of webpack, babel and terser, plus SSG on worker threads. Measured below.                                                                          |
| `@easyops-cn/docusaurus-search-local`                       | The only search that keeps the no-off-origin-request contract: the index is built into the export and served from the same origin.                                                      |
| Explicit prism light/dark themes                            | Docusaurus's default prism theme is dark in both color modes; the predecessor measured fenced code at roughly 1.3:1 on a light page.                                                    |
| The bare theme specifier, never `require.resolve()`         | Docusaurus serializes `themes` into the client bundle, so a resolved path bakes the building machine's absolute checkout path into every built site.                                    |
| `staticDirectories` ordered first-writer-wins               | Measured on 3.10.2: the copy plugin defaults to `force: false`, so the first directory listed wins. `.generated` leads, because a record-derived `llms.txt` outranks any authored copy. |
| The `browserslist` field                                    | swc and lightningcss read it to choose targets; without it the output depends on an ambient default.                                                                                    |

### What did not cross, and why

| Rejected                                                                                                                                                        | Reason                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The eight `@vsor` remark/lib packages (tabs, flashcards, gallery, content enhancements, relative-link normalizer, summaries, section manifest, structured data) | They implement a directive grammar and frontmatter vocabulary the record does not have. The spec defers directives; a shell that renders a grammar the record has not ratified forks the record.                                                            |
| `remark-directive` and `admonitions: true`                                                                                                                      | Same reason, one level down: `knowledge/` is CommonMark only (decision 8), so `:::tip` is literal text — and it must stay literal in _both_ shells, or the two surfaces stop rendering one truth.                                                           |
| The `markdown.preprocessor` that rewrote Docusaurus 2 admonition syntax                                                                                         | It exists to migrate a corpus written for a framework. The record was never written for one.                                                                                                                                                                |
| Mermaid                                                                                                                                                         | The predecessor measured it at 83 MB installed and ~3,440 KB of a ~4,500 KB client bundle, in the common chunk — every page pays. No record rule uses diagrams.                                                                                             |
| i18n, the blog, the og-image machinery, the six translated doc-tree plugin instances                                                                            | Product surfaces of that site, not the contract.                                                                                                                                                                                                            |
| The config-merge seam (`SHELL_OWNED`, `mergeOver`, `followTitle`, `followBaseUrl`)                                                                              | It exists because that shell was unpacked into a project and could not be edited. Here the adopter owns `system/site/` outright (decision 4) — the seam is the filesystem, so a merge layer would be machinery guarding a door that is already open.        |
| `headTags` with a hand-composed favicon link                                                                                                                    | It was the source of the predecessor's own sub-path bug (a `/img/...` icon 404ing under `/repo/`). The `favicon` config key produces the same tag through `useBaseUrl`, which is correct under every base path — verified here with `KSOR_BASE_PATH=/repo`. |
| `hashed: false` on the search index                                                                                                                             | It was load-bearing only for a custom SearchBar that fetched the index from a fixed path. This shell ships the plugin's own bar, so the default (hashed, cache-busted) is right.                                                                            |
| `BROWSERSLIST_IGNORE_OLD_DATA`                                                                                                                                  | Noise suppression for a warning this tree does not emit.                                                                                                                                                                                                    |

## Measured build time

`pnpm build`, `real` seconds, Darwin arm64 / Node 24 / pnpm 11, same project
and same `node_modules` with only the `future` line toggled. **Cold** means
`system/site/.docusaurus` and `out/` deleted first; **warm** means built
again over them.

| Record                           |      | faster off | faster on | change |
| -------------------------------- | ---- | ---------- | --------- | ------ |
| 1 document (a fresh scaffold)    | cold | 7.55       | 5.56      | −26%   |
|                                  | warm | 5.20       | 3.30      | −37%   |
| 200 documents, 1.5 MB, 5 folders | cold | 31.57      | 16.97     | −46%   |
|                                  | warm | 8.91       | 5.95      | −33%   |

Found live 2026-08-18, and worth knowing before someone re-measures: the
**very first** build after `pnpm install` cost 17.2s on the one-document
project — native binaries cold on disk and an empty rspack persistent cache.
Every build after that, on the same machine, matched the table. Measure the
second build, not the first.

## The swap, performed on a scaffolded project

```sh
rm -rf system/site
cp -R <ksor-repo>/workbench/shells/docusaurus system/site
rm system/site/README.md   # this file documents the workbench artifact; the
                           # format checker rightly refuses .md inside the site
printf '%s\n' 'system/site/.docusaurus/' 'system/site/.generated/' >> .gitignore
pnpm install               # stops once on the build-scripts gate — see below
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

`esbuild` and `sharp` are already denied by the scaffold and stay denied.
`lightningcss`, `@rspack/core` and `@node-rs/jieba` ship prebuilt binaries as
optional dependencies with no install script at all, so they never reach the
gate.

## Notes recorded live

- `llms.txt`/`llms-full.txt` are generated when the server or the build
  starts, not on every knowledge edit — the build is the surface of record.
- `pnpm check` (the scaffold's format checker) passes unchanged on a swapped
  project; the record and the agent kit never notice the framework changed.
- `swcHtmlMinimizer` (part of `faster`) strips attribute quotes from the
  export: links read `href=/repo/docs/example/`, unquoted. Anything asserting
  on shipped HTML must be quote-agnostic.
- Infima sets `--ifm-background-color: transparent` in light mode and
  `#1b1b1d` in dark, so a light page's background is the browser canvas, not a
  painted color. Measuring "the two themes differ" reads the _dark_ value.
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
