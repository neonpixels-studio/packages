---
"@neon-pixels/fallow-config": patch
---

Treat `@neon-pixels/fallow-config`, `@neon-pixels/prettier-config`, and `@neon-pixels/tsconfig` as used, so `fallow fix` no longer deletes packages that are referenced only from config files. If your `.fallowrc.json` sets its own `ignoreDependencies`, add these three packages to that list, because arrays replace the base's.
