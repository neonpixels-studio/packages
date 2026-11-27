---
"@neon-pixels/scripts": minor
---

`np-sync-templates` adds a `.husky/post-checkout` hook that runs `npm install` when a branch switch changes `package.json` or `package-lock.json`. `post-merge` only fires on merges and merge-style pulls, so checking out a branch with new dependencies left `node_modules` stale. Run `np-sync-templates` after upgrading: until you do, `np-sync-templates --check` reports the new file as missing.
