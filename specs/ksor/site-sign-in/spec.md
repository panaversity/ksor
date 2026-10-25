---
status: ratified
claim: The human surface reports sign-in outcomes accurately and preserves the reader's identity across the callback.
---

# Site sign-in callback

The static site's existing PKCE flow remains an identity display feature. It does not restrict access to published files.

The callback consumes its saved state and redeems its authorization code once per page load. Repeating the callback with the same parameters, including React's development effect replay, awaits the same result. Starting a new sign-in clears the previous result.

Network failures, malformed responses, invalid saved state and unavailable browser storage resolve to a failure with a recovery instruction. A session is reported as established only when it was stored successfully. Display claims are decoded as UTF-8; they remain unverified and are never used for access control.

Acceptance:

- Effect cleanup followed by replay produces one token exchange and one redirect.
- Repeating a settled callback returns its original result without another exchange.
- A mismatched state performs no token exchange.
- Failed fetches, malformed token responses and blocked storage return a failure rather than rejecting or reporting success.
- Urdu, accented Latin characters and emoji survive identity-token decoding unchanged.

Provider-specific behavior, refresh tokens and changes to the site's access model are outside this change.
