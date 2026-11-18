# Dependency security posture

Last reviewed: 2026-11-18

## Production runtime

The production Docker image copies only the application server and compiled frontend assets. It does not include the Vite development server or development dependencies. CI runs `npm audit --omit=dev` and now fails if the production dependency tree contains any high or critical vulnerability.

## Build-only dependency exception

The build toolchain uses Vite 6.4.6 and `@vitejs/plugin-react` 5.2.0 as development dependencies. The current npm audit feed reports a high-severity transitive `picomatch` ReDoS advisory (GHSA-fc5q-39xc-vjpf) through Vite's build dependency tree. The advisory currently lists no patched `picomatch` release. Downgrading Vite to 6.2.7 removes that transitive report but introduces multiple direct Vite advisories affecting versions through 6.4.3, so the older downgrade is not safer.

Mitigations:
- Do not expose the Vite development server to the public network; the Vite config binds it to localhost.
- The Render production Docker image does not copy `node_modules` or run Vite; it serves only compiled assets through the Node application server.
- Keep the production dependency audit as a blocking CI gate.
- Re-evaluate the `picomatch` advisory when a patched release is published and update the toolchain immediately.

This is a documented development-tooling risk, not a claim that the dependency tree is vulnerability-free.
