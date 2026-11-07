#!/usr/bin/env node

// Gate for the GitLab SAST and secret-detection reports.
//
// GitLab's analyzer jobs (semgrep-sast, secret_detection) exit 0 whatever
// they find: they only write a JSON report, and outside GitLab Ultimate
// nothing acts on it. This script reads those reports and fails the
// pipeline on findings, the way .npm-audit/audit-gate.mjs does for npm
// audit:
//
//   sast      every finding at or above SAST_LEVEL blocks.
//
//   secrets   every finding blocks, whatever its severity. A leaked
//             credential has to be rotated; how GitLab rates it does not
//             change that.
//
// A finding can be waived in waivers.tsv by its rule id and file, with an
// expiry date and a reason. Past its expiry a waiver stops working. The
// file can be pinned to a commit (file@commit), which is how a secret found
// in git history should be waived: it then covers that one commit, and the
// same rule firing on a later change to the file blocks again.
//
// A report that is missing, will not parse, or says the scan failed fails
// the gate. No report means nothing was scanned, not that nothing was found.
//
// Usage: node .security-gate/report-gate.mjs <kind>=<report.json> [...]
//        where <kind> is "sast" or "secrets"
//
// Environment:
//   SAST_LEVEL     lowest SAST severity that blocks (default: medium)
//   GATE_WAIVERS   waiver file (default: waivers.tsv next to this file)

import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"];
const KINDS = ["sast", "secrets"];

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const SAST_LEVEL = (process.env.SAST_LEVEL || "medium").toLowerCase();
const WAIVERS_FILE = process.env.GATE_WAIVERS || resolve(SCRIPT_DIR, "waivers.tsv");

const today = new Date().toISOString().slice(0, 10);

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(3);
}

// "Unknown", or anything else unrecognised, is treated as worse than
// critical rather than quietly dropping below the threshold.
function rank(severity) {
  const index = SEVERITY_ORDER.indexOf(severity);
  return index === -1 ? SEVERITY_ORDER.length : index;
}

function blocks(kind, finding) {
  return kind === "secrets" || rank(finding.severity) >= rank(SAST_LEVEL);
}

function parseArguments(argv) {
  if (argv.length === 0) {
    fail("usage: report-gate.mjs <sast|secrets>=<report.json> [...]");
  }

  return argv.map((argument) => {
    const separator = argument.indexOf("=");
    const kind = argument.slice(0, separator);
    const path = argument.slice(separator + 1);

    if (separator === -1 || !KINDS.includes(kind) || !path) {
      fail(`"${argument}" is not <kind>=<report.json> with kind one of: ${KINDS.join(", ")}.`);
    }

    return { kind, path };
  });
}

function readReport({ kind, path }) {
  if (!existsSync(path)) {
    fail(`${kind} report ${path} does not exist. Did the scan job run and upload it?`);
  }

  let report;

  try {
    report = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`${kind} report ${path} is not valid JSON: ${error.message}`);
  }

  const status = report.scan?.status;

  if (status && status !== "success") {
    fail(`${kind} report ${path} says the scan status is "${status}".`);
  }

  if (!Array.isArray(report.vulnerabilities)) {
    fail(`${kind} report ${path} has no vulnerabilities array.`);
  }

  const scanner = report.scan?.scanner?.name || report.scan?.analyzer?.name || "unknown scanner";

  const findings = report.vulnerabilities.map((vulnerability) => {
    const location = vulnerability.location || {};

    return {
      // The first identifier is the analyzer's own rule (semgrep_id,
      // gitleaks_rule_id). The others are CWE/OWASP tags, which are too
      // broad to waive by.
      rule: vulnerability.identifiers?.[0]?.value || vulnerability.id || "(no rule id)",
      file: location.file || "(no file)",
      line: location.start_line,
      commit: location.commit?.sha,
      severity: String(vulnerability.severity || "unknown").toLowerCase(),
      title: vulnerability.name || vulnerability.message || vulnerability.description || "(no title)",
    };
  });

  return { scanner, findings };
}

function readWaivers() {
  const waivers = [];

  if (!existsSync(WAIVERS_FILE)) {
    return waivers;
  }

  const lines = readFileSync(WAIVERS_FILE, "utf8").split(/\r?\n/);

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    if (line.trim() === "" || line.trimStart().startsWith("#")) {
      return;
    }

    const [rule, target, expiry, ...rest] = line.split("\t").map((field) => field.trim());
    const reason = rest.join(" ").trim();

    if (!rule || !target || !expiry || !reason) {
      fail(
        `${WAIVERS_FILE}:${lineNumber}: expected ` +
          "<rule id>TAB<file, file@commit or *>TAB<YYYY-MM-DD>TAB<reason>, TAB separated.",
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      fail(`${WAIVERS_FILE}:${lineNumber}: "${expiry}" is not a YYYY-MM-DD expiry date.`);
    }

    // file@commit, with at least 7 hex digits of the commit SHA.
    const pinned = /^(.+)@([0-9a-f]{7,40})$/i.exec(target);
    const file = pinned ? pinned[1] : target;
    const commit = pinned ? pinned[2].toLowerCase() : null;

    waivers.push({ rule, file, commit, target, expiry, reason, lineNumber });
  });

  return waivers;
}

function waiverMatches(waiver, finding) {
  if (waiver.rule !== finding.rule) {
    return false;
  }

  if (waiver.file !== "*" && waiver.file !== finding.file) {
    return false;
  }

  return !waiver.commit || (finding.commit || "").toLowerCase().startsWith(waiver.commit);
}

// The most specific waiver wins: pinned to a commit, then an exact file,
// then "*". So an expired broad waiver cannot hide a valid narrow one.
function specificity(waiver) {
  return (waiver.commit ? 2 : 0) + (waiver.file === "*" ? 0 : 1);
}

function findWaiver(waivers, finding) {
  return waivers
    .filter((waiver) => waiverMatches(waiver, finding))
    .sort((a, b) => specificity(b) - specificity(a))[0];
}

function describe(finding, indent) {
  const place = finding.line ? `${finding.file}:${finding.line}` : finding.file;
  const lines = [
    `${indent}[${finding.severity}]  ${place}`,
    `${indent}  rule:   ${finding.rule}`,
    `${indent}  title:  ${finding.title}`,
  ];

  if (finding.commit) {
    lines.push(`${indent}  commit: ${finding.commit.slice(0, 12)}`);
  }

  return lines.join("\n");
}

if (!SEVERITY_ORDER.includes(SAST_LEVEL)) {
  fail(`SAST_LEVEL="${SAST_LEVEL}" is not one of: ${SEVERITY_ORDER.join(", ")}.`);
}

const reports = parseArguments(process.argv.slice(2));

console.log(`SAST / secret report gate`);
console.log(`  sast:    blocking at ${SAST_LEVEL} and above`);
console.log(`  secrets: every finding blocks`);
console.log(`  waivers: ${relative(process.cwd(), WAIVERS_FILE) || WAIVERS_FILE}`);

const waivers = readWaivers();
const matchedWaivers = new Set();
const failures = [];
let waivedCount = 0;

for (const entry of reports) {
  const { scanner, findings } = readReport(entry);

  console.log(`\n--- ${entry.kind}: ${entry.path} (${scanner}, ${findings.length} finding(s)) ---`);

  const sorted = [...findings].sort(
    (a, b) => rank(b.severity) - rank(a.severity) || a.file.localeCompare(b.file),
  );

  const blocking = sorted.filter((finding) => blocks(entry.kind, finding));
  const below = sorted.filter((finding) => !blocks(entry.kind, finding));

  if (blocking.length === 0) {
    console.log(`  nothing blocking.`);
  }

  for (const finding of blocking) {
    const waiver = findWaiver(waivers, finding);

    if (waiver) {
      matchedWaivers.add(waiver);
    }

    if (!waiver) {
      failures.push({ kind: entry.kind, finding, why: "not waived in waivers.tsv" });
      console.log(`  BLOCKED`);
      console.log(describe(finding, "  "));
    } else if (waiver.expiry < today) {
      failures.push({
        kind: entry.kind,
        finding,
        why: `waiver expired on ${waiver.expiry} (waivers.tsv:${waiver.lineNumber})`,
      });
      console.log(`  BLOCKED (waiver expired)`);
      console.log(describe(finding, "  "));
    } else {
      waivedCount += 1;
      console.log(`  WAIVED`);
      console.log(describe(finding, "  "));
      console.log(`    waiver: expires ${waiver.expiry} - ${waiver.reason}`);
    }
  }

  if (below.length > 0) {
    console.log(`\n  Below ${SAST_LEVEL}, reported but not blocking:`);

    for (const finding of below) {
      console.log(describe(finding, "    "));
    }
  }
}

const unused = waivers.filter((waiver) => !matchedWaivers.has(waiver));

if (unused.length > 0) {
  console.log(
    "\nNOTICE: waivers that matched nothing in this run. Delete one once its finding\n" +
      "is gone for good; keep those for git history, which only a full-history scan reports:",
  );

  for (const waiver of unused) {
    console.log(`  ${waiver.rule}  ${waiver.target}  (waivers.tsv:${waiver.lineNumber})`);
  }
}

if (failures.length > 0) {
  console.error(`\nFAILED: ${failures.length} finding(s) block this pipeline:`);

  for (const { kind, finding, why } of failures) {
    const place = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    const commit = finding.commit ? ` in commit ${finding.commit.slice(0, 12)}` : "";
    console.error(`  ${kind}: ${finding.rule} at ${place}${commit} - ${why}`);
  }

  console.error(
    "\nFix the code. For a leaked secret, rotate it first: removing it from the\n" +
      "code does not take it out of git history. Only for a false positive, or a\n" +
      "secret that has already been rotated, add a dated entry with a reason to\n" +
      ".security-gate/waivers.tsv. Waive a finding in git history as file@commit.",
  );

  process.exit(1);
}

console.log(
  waivedCount > 0
    ? `\nPASSED: ${waivedCount} waived finding(s), nothing else blocks this pipeline.`
    : `\nPASSED: no SAST or secret finding blocks this pipeline.`,
);
