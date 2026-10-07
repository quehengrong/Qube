# Qube protocol v1

Transport: pinned TLS WebSocket `/bridge`, one paired phone. QR JSON carries `version`, `url`, `token`, certificate SHA-256 `fingerprint`. Android checks certificate validity and exact fingerprint; it does not globally trust arbitrary certificates. Desktop rejects browser-origin upgrades, caps message size and requires authenticated hello within five seconds.

All messages use `{id: UUID, type, payload}`. Client validation is defined in `packages/protocol/src/index.ts`. Never log pairing payloads or recorded audio. Re-pairing revokes existing connections.

| Client message | Payload | Result |
|---|---|---|
| hello | token, version=1 | state snapshot |
| audio | sampleRate=16000, base64 PCM16 LE mono ≤60s | transcript and execution/draft update |
| text | text | same routing as transcribed speech |
| select-session | sessionId | incremented draft revision |
| draft-update | text, revision | state or error on stale revision |
| draft-submit | sessionId, revision | one attempt at terminal delivery |
| reminder-result | ok, message; id from proposal | speech feedback |
| ping | {} | pong |

Desktop publishes `state`, `result`, `error`, `transcript`, `reminder-proposal`, `reminder-action`. State contains connection/face status, live sessions and the draft (text, revision, target, mode, connection confirmation). It never contains credentials.

Phone owns reminders in Room. A proposal is not a saved reminder. Only after user confirmation, local validation, database persistence and successful alarm scheduling does the phone acknowledge success. A desktop pending proposal never causes an alarm by itself.

Desktop deduplicates request IDs within its bounded process history. Failed or uncertain terminal writes are not automatically retried. Phone does not queue disconnected control operations. Restarting desktop restores draft text only; session binding is deliberately reset.

Production control requires the exact installed Windows/client version to pass device acceptance. Protocol success does not imply that an unobservable UI operation succeeded.
