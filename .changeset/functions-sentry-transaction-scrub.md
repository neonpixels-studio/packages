---
"@neon-pixels/netlify-functions": minor
---

`initFunctionSentry` and `scheduledFunction` accept `beforeSendTransaction` and `maxValueLength`, and `initFunctionSentry` logs an error when tracing is on with `beforeSend` but no `beforeSendTransaction`.
