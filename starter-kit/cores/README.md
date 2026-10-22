# cores: the two versions of `CORE.md` (never edit these; edit `../CORE.md`)

- `CORE-FULL.md`: the combined core for **full mode**, the 25 rules of mudmode 1.2.3 word for word (the v1.2.3 `CORE.md`; only its Version line changed). Full mode loads only this core, no module file.
- `CORE-LITE.md`: the one-page safety core for **lite mode** (13 rules word for word plus short lite forms; the modules you turn on add the rest).
- `MODULES-ON-FULL.md`: what `../MODULES-ON.md` says in full mode.

Switching ("mudmode full" / "mudmode lite", or setup `--mode`) backs up `../CORE.md` and `../MODULES-ON.md`, then copies the right version in. Nothing is ever deleted: both cores and every module stay on disk. Steps: `../modules/README.md`.
