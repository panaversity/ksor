---
"@panaversity/ksor": patch
---

`search` hits and `read` replies now carry `generated` in their `governance` block — the act that stamped the document's current text, with its actor and instant. Without it an agent could not tell whether the latest `verified` act describes the text it was handed or an earlier revision; `approval.at` cannot answer that, because re-approving unchanged text moves it without the content changing. The field is `null` when the record holds none and is required on the wire, so an agent never has to distinguish "absent" from "empty".
