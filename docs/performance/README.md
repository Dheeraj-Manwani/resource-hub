# Historical Phase 5 measurements

The JSON files preserve the before/after component measurements used in the
main optimistic UI and memory report. The temporary profiling scripts were
removed at the user's request; these captures are historical evidence, not a
currently runnable benchmark.

These are component JavaScript heap measurements, not browser tab-hover memory
or a signed-in production profile. They cannot be compared directly with the
reported 301 MB tab reading.

Real authenticated browser coverage now lives in `tests/e2e`. Run
`pnpm run test:e2e:headed` for the visible desktop walkthrough; see
`tests/e2e/README.md` for setup, isolation, and coverage.
