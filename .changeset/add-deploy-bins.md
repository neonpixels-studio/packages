---
"@neon-pixels/scripts": minor
---

Add the `np-should-deploy` and `np-verify-netlify-deploy` bins for scheduled Netlify production deploys: skip when the live deploy is already the latest commit, then verify the triggered deploy finished on the expected commit.
