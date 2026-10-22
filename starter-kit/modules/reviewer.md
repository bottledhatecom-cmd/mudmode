# mudmode module: reviewer

**Adds:** a read-only reviewer with a PASS / WARN / FAIL verdict for ALL finished work, not only work that goes outside. Its rules replace the *lite* lines in `CORE.md`.

13. Review gate: finished work gets a read-only reviewer who writes a verdict PASS / WARN / FAIL against the job's task card. No ship without PASS; a WARN lists every note; a FAIL blocks unless the owner overrides it in their own words, for that one item.

**Files:** `jobs/<job-name>/TASK-CARD.md` and `jobs/<job-name>/VERDICT-<role>.md`.
