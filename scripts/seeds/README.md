# The seed registry

Every seed drawn for a read since v0.31. `scripts/seeds-next.mjs` treats each of these seeds as spent, together with
the historical list inside it, which covers everything through v0.31.

- **One draw a directory.** A draw is written to `<name>/SEEDS`, one seed a line. Some older files hold the twelve on
  one line; the reader splits on whitespace.
- **What the reader counts.** It reads every file whose name starts with `SEEDS`. Other files, like this one, are
  ignored.
- **Where these came from.** The files up to `athena-kraken-read-12` were copied on 2026-09-19 from the bench archive
  (`FishAI-bench\tools\seeds\`), unchanged. They were archived there from the session scratchpad on 2026-09-18.
- **Never edit or delete a file here.** A seed stays spent even if its read was abandoned.

Draw with `node scripts/seeds-next.mjs <label>` from the repository root, and commit the new file with the read that
uses it.
