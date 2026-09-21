# Practicum autoharness dashboard

Website: https://wodex1nhaoIeng.github.io/practicum/

This UI builds on https://github.com/os-checker/distributed-verification.
It displays generated automatic harnesses, skipped functions, and skip reasons.
Generated does not mean verification passed. New snapshot comparisons are deferred.

## View locally

Requires Node.js 22 and npm. No Rust/Kani build or original data folder is required
to view the checked-in snapshot.

```sh
git clone https://github.com/wodex1nhaoIeng/practicum.git
cd practicum/ui
npm ci
npm run dev
```

Open the localhost URL printed by Nuxt.

## Data and conversion

The UI reads these checked-in files (relative to this repository):

- `ui/public/data/autoharness-dashboard.json`: summary and per-crate totals.
- `ui/public/data/autoharness-functions.json`: per-function generated/skipped list.

They are also accessible online beneath `/practicum/data/`.
The browser does not read anyone's Desktop or Google Drive.

The conversion script is `scripts/build-autoharness-dashboard.mjs`.
From the repository root:

```sh
node scripts/build-autoharness-dashboard.mjs /path/to/baseline-2026-09-17 ui/public/data/autoharness-dashboard.json
```

This writes both JSON files. The importer reads a `snapshot.json` in the input folder that
names the run's files and carries its metadata, so a new snapshot is a new input folder rather
than an edit to the script:

- `snapshot.json`: `generatedAt`, `listFile`, `kaniListFile`, the `expected` totals the listing
  must add up to, `meta` (Kani commit, verify-rust-std branch, target), `legacyPrevious`
  (old-release counts for the tool-update panel), `improvement` (per-crate counts of the
  baseline's bounded run and of the measured run with the team's changes; `null` renders as
  pending) and `notes`.
- the listing file, the text output of `kani autoharness --list --std`: generated and skipped
  functions with the skip reasons.
- the `kani list` JSON file, for the Kani version.

The raw input folder is not required for deployment and is not checked in. The current snapshot
is the 2026-09-17 x86_64 Linux run (Kani 02abb5b0d, verify-rust-std sync-2026-08-21); the
previous one, 2026-09-16 on aarch64 (Kani b07abe8a7), is in the history at bb9236d. For a new
snapshot, write its `snapshot.json` deliberately; do not reuse another run's labels.
Cross-version comparison is not implemented yet.

## Publish

GitHub Pages source must be GitHub Actions. Pushing `main` builds the UI with
`NUXT_APP_BASE_URL=/practicum/` and deploys `ui/.output/public`.
Legacy Rust verification workflows are manual-only so publishing data does not
rebuild Kani. The original upstream routes are retained as legacy pages.
