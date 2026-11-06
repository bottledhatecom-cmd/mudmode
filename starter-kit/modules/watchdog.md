# mudmode module: watchdog

**Adds:** Claude Code hooks that help keep the ask-first list (they stop the risky commands they recognize until a single-use OK token is written; a helper, not a lock), write a handoff before Claude compacts a chat, and load it back at start.

**Files:** `full-kit/tools/claude-hooks/` (install only with the owner's OK, after their test run passes: `full-kit/tools/claude-hooks/README.md`). The hooks run as code, so switching modes never changes what they guard.
**More:** the Full Kit book `full-kit/MUDMODE.md` §1.5, §11 (observers), §15.7, Appendix A.1.
