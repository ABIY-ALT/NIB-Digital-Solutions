#!/usr/bin/env node

// npm audit gate for the dependency_scan job.
//
// `npm audit --audit-level=high` fails on every high finding, with no way
// to tell apart something shipped to users from a lint-only package that
// has no published fix. This wrapper keeps the gate blocking and splits
// the dependency surface in two:
//
//   production tree   every finding at or above AUDIT_LEVEL fails the
//                     job. Waivers are ignored here.
//
//   devDependencies   the same findings fail, unless the advisory is
//                     listed in waivers.tsv with an expiry date that has
//                     not passed.
//
// Each workspace needs its dependencies installed first, so that npm has
// a lockfile and a tree to audit.
//
// Usage: node .npm-audit/audit-gate.mjs <workspace-dir> [<workspace-dir>...]
//
// All workspaces share one waiver file, so they are audited in a single
// run: a waiver for one of them is not dead weight just because another
// does not need it.
//
// Environment:
//   AUDIT_LEVEL     lowest severity that blocks (default: high)
//   AUDIT_WAIVERS   waiver file (default: waivers.tsv next to this file)

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITY_ORDER = ["info", "low", "moderate", "high", "critical"];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const AUDIT_LEVEL = process.env.AUDIT_LEVEL || "high";
const WAIVERS_FILE = process.env.AUDIT_WAIVERS || resolve(SCRIPT_DIR, "waivers.tsv");

const today = new Date().toISOString().slice(0, 10);

const workspaces = (process.argv.length > 2 ? process.argv.slice(2) : [process.cwd()]).map(
  (argument) => resolve(argument),
);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(3);
}

// An unrecognised severity is treated as worse than critical rather than
// quietly dropping below the threshold.
function rank(severity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function blocks(advisory) {
  return rank(advisory.severity) >= rank(AUDIT_LEVEL);
}

function runAudit(workspace, { omitDev }) {
  const args = ["audit", "--json"];

  if (omitDev) {
    args.push("--omit=dev");
  }

  const command = `npm ${args.join(" ")}`;

  const options = {
    cwd: workspace,
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  };

  // CI runs this on Linux, where npm is a plain executable. On Windows npm
  // is a .cmd shim, which node refuses to spawn directly and which cannot
  // take an argument array through `shell: true` without a deprecation
  // warning, so the command goes to cmd.exe as one string instead.
  const result =
    process.platform === "win32"
      ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options)
      : spawnSync("npm", args, options);

  if (result.error) {
    fail(`could not run ${command} in ${workspace}: ${result.error.message}`);
  }

  // npm audit exits non-zero whenever it reports a finding, so the exit
  // code says nothing by itself. Output that will not parse is the real
  // failure, and it must not be mistaken for a clean scan.
  let report;

  try {
    report = JSON.parse(result.stdout);
  } catch {
    console.error((result.stdout || "").slice(0, 4000));
    console.error(result.stderr || "");
    fail(`${command} produced no audit report in ${workspace} (exit code ${result.status}).`);
  }

  if (report.error) {
    fail(
      `${command} failed in ${workspace}: ` +
        `${report.error.summary || JSON.stringify(report.error)}`,
    );
  }

  return report;
}

// One finding per advisory, not per affected package: a single advisory
// deep in the tree is reported against every package between it and the
// root, and all of those clear together.
function collectAdvisories(report) {
  const advisories = new Map();

  for (const entry of Object.values(report.vulnerabilities || {})) {
    for (const via of entry.via || []) {
      // A string `via` points at another vulnerable package in the same
      // chain. Only object entries carry the advisory itself.
      if (typeof via !== "object") {
        continue;
      }

      const match = /\/advisories\/(GHSA-[\w-]+)/.exec(via.url || "");
      const id = match ? match[1] : `npm-source-${via.source}`;
      const known = advisories.get(id);

      if (known) {
        known.packages.add(via.name);
        continue;
      }

      advisories.set(id, {
        id,
        title: via.title || "(no title)",
        url: via.url || "",
        severity: via.severity || "unknown",
        range: via.range || "",
        packages: new Set([via.name]),
      });
    }
  }

  return advisories;
}

// Walk `effects` from the vulnerable package out to the dependencies this
// package.json lists itself, so the report names something actionable.
function directDependents(report, packageNames) {
  const vulnerabilities = report.vulnerabilities || {};
  const queue = [...packageNames];
  const seen = new Set();
  const direct = new Set();

  while (queue.length > 0) {
    const name = queue.shift();

    if (seen.has(name)) {
      continue;
    }

    seen.add(name);

    const entry = vulnerabilities[name];

    if (!entry) {
      continue;
    }

    if (entry.isDirect) {
      direct.add(name);
    }

    for (const effect of entry.effects || []) {
      queue.push(effect);
    }
  }

  return [...direct].sort();
}

function readWaivers() {
  const waivers = new Map();

  if (!existsSync(WAIVERS_FILE)) {
    return waivers;
  }

  const lines = readFileSync(WAIVERS_FILE, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }

    const [id, expiry, ...rest] = line.split("\t");
    const reason = rest.join("\t").trim();

    if (!id || !id.trim() || !expiry || !reason) {
      fail(
        `${WAIVERS_FILE}:${lineNumber}: expected ` +
          "<advisory id>TAB<YYYY-MM-DD>TAB<reason>, TAB separated.",
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry.trim())) {
      fail(`${WAIVERS_FILE}:${lineNumber}: "${expiry}" is not a YYYY-MM-DD expiry date.`);
    }

    waivers.set(id.trim(), { expiry: expiry.trim(), reason, lineNumber });
  });

  return waivers;
}

function describe({ advisory, report }, indent) {
  const packages = [...advisory.packages].sort().join(", ");
  const dependents = directDependents(report, advisory.packages);

  const lines = [
    `${indent}${advisory.id}  [${advisory.severity}]  ${advisory.title}`,
    `${indent}  package:  ${packages} ${advisory.range}`.trimEnd(),
  ];

  if (dependents.length > 0) {
    lines.push(`${indent}  via:      ${dependents.join(", ")}`);
  }

  if (advisory.url) {
    lines.push(`${indent}  advisory: ${advisory.url}`);
  }

  return lines.join("\n");
}

if (!SEVERITY_ORDER.includes(AUDIT_LEVEL)) {
  fail(`AUDIT_LEVEL="${AUDIT_LEVEL}" is not one of: ${SEVERITY_ORDER.join(", ")}.`);
}

console.log(`npm audit gate: blocking at ${AUDIT_LEVEL} and above`);
console.log(`waivers: ${relative(process.cwd(), WAIVERS_FILE) || WAIVERS_FILE}`);

const waivers = readWaivers();
const matchedWaivers = new Set();
const failures = [];
const accepted = [];

for (const workspace of workspaces) {
  const name = basename(workspace);

  console.log(`\n--- ${name} ---`);

  const report = runAudit(workspace, { omitDev: false });
  const productionReport = runAudit(workspace, { omitDev: true });

  const productionBlocking = new Set(
    [...collectAdvisories(productionReport).values()].filter(blocks).map(({ id }) => id),
  );

  const blocking = [...collectAdvisories(report).values()]
    .filter(blocks)
    .sort((a, b) => rank(b.severity) - rank(a.severity) || a.id.localeCompare(b.id));

  if (blocking.length === 0) {
    console.log(`  nothing at ${AUDIT_LEVEL} or above.`);
    continue;
  }

  for (const advisory of blocking) {
    const waiver = waivers.get(advisory.id);
    const finding = { workspace: name, advisory, report };

    // Counted as matched here rather than where a waiver is honoured, so
    // that a waiver on a production advisory is not also reported as dead
    // weight.
    if (waiver) {
      matchedWaivers.add(advisory.id);
    }

    if (productionBlocking.has(advisory.id)) {
      failures.push({
        ...finding,
        why: waiver
          ? `reaches the production tree, so the waiver on waivers.tsv:${waiver.lineNumber} does not apply`
          : "reaches the production tree, so no waiver applies",
      });
    } else if (!waiver) {
      failures.push({ ...finding, why: "devDependencies only, but not waived in waivers.tsv" });
    } else if (waiver.expiry < today) {
      failures.push({
        ...finding,
        why: `waiver expired on ${waiver.expiry} (waivers.tsv:${waiver.lineNumber})`,
      });
    } else {
      accepted.push({ ...finding, waiver });

      console.log(`  WAIVED`);
      console.log(describe(finding, "  "));
      console.log(`    waiver:   expires ${waiver.expiry} - ${waiver.reason}`);
    }
  }

  const blocked = failures.filter((finding) => finding.workspace === name);

  for (const finding of blocked) {
    console.log(`  BLOCKED`);
    console.log(describe(finding, "  "));
    console.log(`    reason:   ${finding.why}`);
  }
}

const unused = [...waivers].filter(([id]) => !matchedWaivers.has(id));

if (unused.length > 0) {
  console.log("\nNOTICE: waivers that matched nothing and can be deleted:");

  for (const [id, waiver] of unused) {
    console.log(`  ${id} (waivers.tsv:${waiver.lineNumber})`);
  }
}

if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} advisory(ies) block this pipeline:`);

  for (const finding of failures) {
    console.error(`  ${finding.workspace}: ${finding.advisory.id} - ${finding.why}`);
  }

  console.error(
    "\nUpgrade the dependency, or - only for a devDependency with no fix -\n" +
      "add a dated entry with a reason to .npm-audit/waivers.tsv.",
  );

  process.exit(1);
}

if (accepted.length > 0) {
  console.log(
    `\nPASSED: ${accepted.length} waived advisory(ies), ` +
      `nothing else at ${AUDIT_LEVEL} or above.`,
  );
} else {
  console.log(`\nPASSED: nothing at ${AUDIT_LEVEL} or above blocks this pipeline.`);
}
