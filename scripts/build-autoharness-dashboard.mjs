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
// snapshot.json describes the run: which files to read, the totals the listing must add up to,
// the metadata shown on the page, and the old-release counts for the context panel.
const snapshot = JSON.parse(readFileSync(join(inputDir, "snapshot.json"), "utf8"));
const autoharnessText = readFileSync(join(inputDir, snapshot.listFile), "utf8");
const kaniList = JSON.parse(readFileSync(join(inputDir, snapshot.kaniListFile), "utf8"));

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
if (selected !== snapshot.expected.selected || skipped !== snapshot.expected.skipped) {
  throw new Error(`Unexpected totals: selected=${selected}, skipped=${skipped}`);
}

const output = {
  generatedAt: snapshot.generatedAt,
  meta: {
    title: "Rust standard library autoharness baseline",
    kaniCommit: snapshot.meta.kaniCommit,
    kaniVersion: kaniList["kani-version"],
    verifyRustStdBranch: snapshot.meta.verifyRustStdBranch,
    target: snapshot.meta.target,
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
    const previous = snapshot.legacyPrevious[name] ?? null;
    const current = selectedByCrate.get(name) ?? 0;
    return { name, previous, current, change: previous ? current / previous - 1 : null };
  }),
  notes: snapshot.notes,
};

mkdirSync(dirname(outputFile), { recursive: true });
writeFileSync(outputFile, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${outputFile}`);
writeFileSync(functionsOutputFile, `${JSON.stringify({ generatedAt: output.generatedAt, functions })}\n`);
console.log(`Wrote ${functionsOutputFile}`);
