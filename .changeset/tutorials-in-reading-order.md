---
"@panaversity/ksor": patch
---

The tutorials are numbered in reading order, and the package README lists all
three.

The introduction is now `00`, hello world `01`, and _Make it yours_ stays `02`
— so the two hands-on tutorials that follow each other are no longer separated
by the 1,800-line introduction, and every existing cross-reference ("tutorial
2", "tutorial 4") stays true. The introduction's title drops "Tutorial 1"; it is
the introduction. A one-line pointer stays at the old `00-hello-world.md` for
one release, because the README that shipped in 0.0.56 links it.

Both READMEs gain a three-row table keyed on who each tutorial is for, and a
test now holds every link into `docs/tutorials/` — relative or GitHub URL —
to a file that exists.
