---
"@panaversity/ksor": patch
---

A document page gives its text 16px more room: the horizontal padding drops
from 32px to 24px. The reading measure itself is unchanged — widening it was
tried and reverted, because measuring what the column already is showed it is
wider than the comment beside it claimed, not narrower.
