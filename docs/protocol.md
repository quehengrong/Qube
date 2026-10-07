# Qube protocol v2

Transport remains pinned TLS WebSocket `/bridge`, one paired phone. The pairing QR uses version 1 because its credential format is unchanged. A current phone sends `hello {version:1, capabilities:["v2"], token}`; desktop negotiates v2 from the capabilities list and publishes `protocol:2`. Legacy clients retain baseline operations. New phones show upgrade guidance before invoking features against an old desktop.

All envelopes use `{id:UUID,type,payload}`. `packages/protocol/src/index.ts` validates client input. Do not log QR credentials or recorded audio.

| Message | Direction | Purpose |
| --- | --- | --- |
| hello / ping | phone → desktop | Pairing authentication / liveness |
| wake | phone → desktop | Pin foreground window when recording begins |
| text / audio | phone → desktop | Route command or append dictation |
| select-session | phone → desktop | Select live target and advance draft revision |
| draft-update / draft-submit | phone → desktop | Compare revision; update or explicitly send |
| feature | phone → desktop | Allowlisted draft, context, helper, scene, metrics and history operations |
| reminder-result | phone → desktop | Acknowledge user-confirmed phone reminder persistence |
| local-result | phone → desktop | Acknowledge local notes/timer/profile actions using original request ID |
| phone-events | phone → desktop | Merge up to 100 phone history events by immutable ID |
| state | desktop → phone | Current capabilities, sessions, draft, attachments, scene, helper, metrics and history |
| agent-event | desktop → phone | Structured status change requiring attention |
| local-command | desktop → phone | Phone-owned notes, timers, quiet mode and page changes |
| wake-config | desktop → phone | Candidate phrase/tokens; phone validates and requires a successful wake test |
| result / error / transcript | desktop → phone | Operation feedback / recognized text |
| reminder-proposal / reminder-action | desktop → phone | Confirmation proposal / open reminders |

## State and persistence

Drafts are per session, with text, revision, target, mode, connection confirmation, attachments and bounded undo/redo history. Only a current revision and explicitly selected connected session can submit. Attachment metadata includes ID, name, preview, size and digest. Files are verified before submission and converted to the target environment's path.

Desktop SQLite stores draft snapshots, uncertain submission IDs, history and durable note-to-task receipts. A submission ID is checkpointed before transport; uncertain sends never automatically replay. Old JSON drafts are imported only when no SQLite draft snapshot exists. Saved drafts can be explicitly recovered into a new empty target draft after restart.

Phone Room v2 migrates v1 reminders without deletion, adding importance and a companion table for notes, timers, local receipts and history. Phone data is authoritative. Receipt handling is allowed while the desktop awaits local completion, avoiding a request/ack deadlock. A scene does not claim phone-side success before acknowledgement. Missing acknowledgements are recorded as unknown.

Codex state comes from app-server JSON-RPC. Claude state comes from narrowly filtered official hook events scoped to the launched session. A completed turn does not prove the entire user task is complete. Compatibility PTYs expose unknown status rather than infer completion from output silence.

## Failure behavior

A connection loss disables submission but retains content. Busy commands are not queued for later execution. Helpers are separate, cancellable, time limited sessions. Revision/target changes invalidate pending rewrite proposals. Existing phone timers are never silently replaced. A failed required scene step stops dependencies; optional failures produce partial status.

Only trusted local renderer IPC may answer Codex approval cards; phone notifications do not authorize execution. Unknown approval types can be declined but not silently accepted. Claude approvals remain in its interactive terminal.
