import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [inputArg, outputArg, functionsOutputArg] = process.argv.slice(2);

if (!inputArg || !outputArg) {
  console.error("Usage: node scripts/build-autoharness-dashboard.mjs <baseline-folder> <dashboard-json> [functions-json]");
  process.exit(1);
}

const inputDir = resolve(inputArg);
const outputFile = resolve(outputArg);
const functionsOutputFile = functionsOutputArg
  ? resolve(functionsOutputArg)
  : join(dirname(outputFile), "autoharness-functions.json");
const autoharnessText = readFileSync(join(inputDir, "autoharness-list-b07abe8a7.txt"), "utf8");
const kaniList = JSON.parse(readFileSync(join(inputDir, "kani-list-b07abe8a7.json"), "utf8"));

const selectedByCrate = new Map();
const skippedByCrate = new Map();
const skippedByReason = new Map();
const functions = [];
let section = "selected";

function increment(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function skipCategory(reason) {
  if (reason.startsWith("Missing Arbitrary implementation")) return "Missing Arbitrary";
  if (reason.startsWith("Generic Function: no candidate type")) return "Generic: no candidate type";
  if (reason.startsWith("Generic Function: non-usize const generic")) return "Non-usize const generic";
  if (reason.startsWith("Requires --bounded-arguments")) return "Requires bounded arguments";
  if (reason.includes("does not have a body")) return "No function body";
  return "Other";
}

for (const line of autoharnessText.split("\n")) {
  if (line.startsWith("Kani did not generate automatic harnesses")) {
    section = "skipped";
    continue;
  }
  if (!line.startsWith("|")) continue;

  const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
  const crate = cells[0];
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(crate) || crate === "Crate") continue;

  if (section === "selected" && cells.length >= 2) {
    increment(selectedByCrate, crate);
    functions.push({ crate, function: cells[1], status: "generated", reason: null });
  } else if (section === "skipped" && cells.length >= 3) {
    increment(skippedByCrate, crate);
    increment(skippedByReason, skipCategory(cells[2]));
    functions.push({ crate, function: cells[1], status: "skipped", reason: skipCategory(cells[2]), detail: cells[2] });
  }
}

const primaryCrates = ["core", "alloc", "std"];
const depSelected = [...selectedByCrate].filter(([name]) => !primaryCrates.includes(name)).reduce((sum, [, value]) => sum + value, 0);
const depSkipped = [...skippedByCrate].filter(([name]) => !primaryCrates.includes(name)).reduce((sum, [, value]) => sum + value, 0);
const crates = [
  ...primaryCrates.map((name) => ({
    name,
    selected: selectedByCrate.get(name) ?? 0,
    skipped: skippedByCrate.get(name) ?? 0,
  })),
  { name: "dependencies", selected: depSelected, skipped: depSkipped },
].map((crate) => ({
  ...crate,
  total: crate.selected + crate.skipped,
  coverage: crate.selected / (crate.selected + crate.skipped),
}));

const selected = crates.reduce((sum, crate) => sum + crate.selected, 0);
const skipped = crates.reduce((sum, crate) => sum + crate.skipped, 0);
if (selected !== 25165 || skipped !== 13777) {
  throw new Error(`Unexpected totals: selected=${selected}, skipped=${skipped}`);
}

function readLegacySelected(crate) {
  const markdown = readFileSync(join(inputDir, `${crate}_autoharness_data.md`), "utf8");
  const match = markdown.match(/Functions with Automatic Harnesses[\s\S]*?\| Total\s+\|\s*([0-9,]+)/);
  return match ? Number(match[1].replaceAll(",", "")) : null;
}

const output = {
  generatedAt: "2026-09-16",
  meta: {
    title: "Rust standard library autoharness baseline",
    kaniCommit: "b07abe8a7",
    kaniVersion: kaniList["kani-version"],
    verifyRustStdBranch: "sync-2026-08-21-aarch64-fixes",
    target: "aarch64-apple-darwin",
  },
  summary: {
    automaticHarnesses: selected,
    skipped,
    candidateFunctions: selected + skipped,
    coverage: selected / (selected + skipped),
  },
  crates,
  skipReasons: [...skippedByReason]
    .map(([reason, count]) => ({ reason, count, share: count / skipped }))
    .sort((a, b) => b.count - a.count),
  legacyComparison: primaryCrates.map((name) => {
    const previous = readLegacySelected(name);
    const current = selectedByCrate.get(name) ?? 0;
    return { name, previous, current, change: previous ? current / previous - 1 : null };
  }),
  notes: [
    "Current baseline uses Kani b07abe8a7 with local compatibility patches and verify-rust-std sync-2026-08-21 fixes.",
    "The older Kani 0.67.0 snapshot uses a different library snapshot and target context, so its delta is contextual rather than a contribution measurement.",
    "Semester progress should compare two runs produced at the same time with the same Kani and rustc: upstream baseline versus the version containing the team's changes.",
  ],
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputFile}`);
writeFileSync(functionsOutputFile, `${JSON.stringify({ generatedAt: output.generatedAt, functions })}\n`);
console.log(`Wrote ${functionsOutputFile}`);
