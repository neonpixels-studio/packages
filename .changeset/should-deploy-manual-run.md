---
"@neon-pixels/scripts": minor
---

`np-should-deploy` now always deploys on a manual run (`workflow_dispatch`), without calling Netlify, so a rebuild after a Netlify environment change is no longer skipped.
