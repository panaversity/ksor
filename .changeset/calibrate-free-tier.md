---
"@panaversity/ksor": patch
---

`ksor calibrate` names the free-tier path when a quota refuses it, and the
calibration text model moves to `gemini-3.7-flash`.

Walked on a real free-tier key: embedding is free of charge and a first corpus
embeds fine (23 chunks, 0 failed), but the DEFAULT calibration door writes one
probe question per sampled passage with an LLM — and the free tier allows five
generations a minute. So the documented way to turn on the product's headline
feature failed, surfacing the vendor's sentence and nothing else.

Two quotas reach that code and they need opposite answers: the generation cap is
a wall no wait clears (the remedy is `--queries-file`, the zero-LLM door), and
the embedding cap is a per-minute window (the remedy is to wait, and the usual
cause is an ingest immediately before). Both are now named, with why. A 429 this
does not recognise is re-thrown untouched — an invented remedy is worse than the
vendor's own message.

`docs/ingesting.md` documents the zero-LLM door where the reader meets the
command, including how to choose the questions: the floor is set by the weakest
one, so a vague question drags it down and a question the record cannot answer
invalidates the measurement.

The text model moves `gemini-2.5-flash` → `gemini-3.7-flash`. Cheap, unlike the
embedding model: it only writes probe questions, so nothing stored is
re-computed and no floor is invalidated — and the door is recorded beside every
number, which is what stops two measurements being compared as one experiment.
