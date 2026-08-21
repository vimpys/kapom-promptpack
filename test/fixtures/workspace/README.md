# Test workspace

The Extension Host opens this folder while `npm run test:ext` runs.

Tests write what they need into `sandbox/` at setup and remove it afterwards,
so nothing that looks like a credential is ever committed.
