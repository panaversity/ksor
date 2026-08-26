---
"@panaversity/ksor": patch
---

Teach the record checker about carried pages, so a document may ship the sim it frames.

A record can carry an interactive page beside its document — `<name>.sim.html`, framed click-to-load where the prose puts it, served from the record's own path so it works offline and no third party learns who is reading. The checker had never been told: it refused every one of them `ksor-file-type` ("unexpected file type `.html`"), so `ksor build` exited 1 on any record that used the feature and no adopter could publish a sim at all.

`<name>.sim.html` is now admitted, by that SUFFIX and nothing wider — a bare `.html` or `.htm` is still refused, and now says what shape a carried page has to take instead of only that this one is wrong. The rule that decides it is one file (`lib/sim-rule.ts`), read by the checker, the site's staging and the emitted `pnpm check` alike, and pinned to the site's embed rule by a test, because a marker that drifts between "what the record admits" and "what the site frames" fails silently in both directions.

A sim stays an ASSET, not a study attachment: named freely, many per document, no route, no stable id, no MCP node, no `llms.txt` line and no markdown twin of its own — asserted now rather than assumed. Its governance is inherited by position, through the link in a document that survived every filter: an internal document's sim reaches no public build, a taken-down document's sim is denied with it under node and subtree denials alike, and a sim no document links is never published, so it never becomes a url.
