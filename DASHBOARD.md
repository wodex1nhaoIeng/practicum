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
node scripts/build-autoharness-dashboard.mjs /path/to/baseline-2026-08-31 ui/public/data/autoharness-dashboard.json
```

This writes both JSON files. The current importer is specific to this baseline,
including its expected totals, file names, date and version metadata.
It reads these files from the supplied input folder:

- `autoharness-list-b07abe8a7.txt`: generated/skipped functions and reasons.
- `kani-list-b07abe8a7.json`: Kani version metadata.
- `core_autoharness_data.md`, `alloc_autoharness_data.md`, `std_autoharness_data.md`:
  old-release reference counts.

The raw input folder is not required for deployment. For a new snapshot, update
the importer's inputs and metadata deliberately; do not overwrite these labels
with a different run. Cross-version comparison is not implemented yet.

## Publish

GitHub Pages source must be GitHub Actions. Pushing `main` builds the UI with
`NUXT_APP_BASE_URL=/practicum/` and deploys `ui/.output/public`.
Legacy Rust verification workflows are manual-only so publishing data does not
rebuild Kani. The original upstream routes are retained as legacy pages.
