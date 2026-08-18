---
"@panaversity/ksor": patch
---

The record can now declare its audience. A governed `visibility:` key
(one value, orthogonal to `status:`) against an `audiences:` model in
instance.md; per-audience **staged** builds enforce it — a build below a
document's tier carries no trace of it: no page, no search entry, no
llms.txt line, no sidebar title, no asset bytes, and nothing about the
filter itself in the client bundle. Non-public builds name themselves.
Seven checker rules guard the model, including the cross-audience link
no single build can catch. Absent `audiences:`, nothing changes —
purely additive. Evidence and the measured build-time-vs-per-request
decision: the ksor repository's research/visibility.md and issue #10.
