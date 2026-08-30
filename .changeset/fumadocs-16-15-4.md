---
"@panaversity/ksor": patch
---

The scaffold moves to Fumadocs `16.15.4` (`fumadocs-core`, `fumadocs-ui`) and
`fumadocs-mdx` `15.4.0`.

Maintenance, not a fix — no advisory pushed it, and `npm audit` was already
clean. It is taken now because the four behaviours the scaffold cites BY VERSION
were re-verified against the new bytes rather than assumed, and each holds:
`CalloutType` is still the same six values (`fumadocs-ui/dist/components/callout.d.ts`);
`resolveHref` still resolves only the `./` and `../` forms and returns everything
else untouched, which is why the record keeps its own resolver; `remark-code-tab`
still honours `tab-group` on the `CodeBlockTabs` branch only, which is why the
scaffold picks that branch; and the search engine is still ZBSearch, so the
`language` option stays absent. Those citations now name `16.15.4`.

`fumadocs-ui` pins `fumadocs-core` exactly, so the two always move together;
`fumadocs-mdx@15.4.0` requires `fumadocs-core ^16.15.3`, which is what makes this
one change rather than three. Nothing else moves with it — Fumadocs peers Next as
a range (`16.x.x`). The committed pnpm lockfile is regenerated to match.
