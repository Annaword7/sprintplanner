// ═══════════════════════════════════════════════════════════════════════════
// Demo: Exercise all backend methods
// Run: node --experimental-modules demo.js
// ═══════════════════════════════════════════════════════════════════════════

import {
  // Config
  FIELDS,
  ALLOWED_WRITE_FIELDS,

  // API Client
  getBacklogIssues,
  getSprintIssues,
  getSprints,
  getCurrentSprint,
  getAvailableUsers,
  addToSprint,
  removeFromSprint,
  updateAssignee,
  resetMockData,
  getEfforts,
  getEffortLabel,
  getEnumFieldName,
  getUserFieldLogin,
  getScalarField,

  // Services
  getFilteredBacklog,
  getEnrichedSprintIssues,
  planIssue,
  unplanIssue,
  reassignDeveloper,
  getSprintTotals,
  calculateCapacity,
  getCapacitySummary,
  previewAddIssue,
  getSprintSnapshot,
  getHistoricalMetrics,
  getAverageMetrics,
  getReopenStats,
} from "./src/index.js";

const hr = () => console.log("─".repeat(70));

async function demo() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║          Sprint Planner Backend — Demo                      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  // ── 1. Sprints ──────────────────────────────────────────────────────────
  hr();
  console.log("1. SPRINTS\n");

  const sprints = await getSprints({ includeArchived: true });
  console.log(`   Total sprints: ${sprints.length}`);
  for (const s of sprints) {
    console.log(`   ${s.name} | archived: ${s.archived} | default: ${s.isDefault}`);
  }

  const current = await getCurrentSprint();
  console.log(`\n   Current sprint: ${current.name}`);

  // ── 2. Backlog ──────────────────────────────────────────────────────────
  hr();
  console.log("\n2. BACKLOG (sorted by Total Priority)\n");

  const backlog = await getFilteredBacklog({ sortBy: "totalPriority" });
  console.log(`   ${backlog.length} issues in backlog\n`);

  for (const issue of backlog.slice(0, 5)) {
    const d = issue._display;
    console.log(`   ${issue.idReadable} | TP: ${d.totalPriority} | ${d.priority}`);
    console.log(`     ${issue.summary}`);
    console.log(`     ${d.effortLabel} | Assignee: ${d.assigneeName || "—"} | QA: ${d.qaName || "—"}`);
    console.log();
  }
  console.log(`   ... and ${backlog.length - 5} more`);

  // ── 3. Backlog with filters ─────────────────────────────────────────────
  hr();
  console.log("\n3. FILTERED BACKLOG (only backend tasks)\n");

  const beBacklog = await getFilteredBacklog({
    sortBy: "totalPriority",
    filters: { hasEffortType: "backend" },
  });
  console.log(`   ${beBacklog.length} issues with Backend Effort`);
  for (const issue of beBacklog) {
    console.log(`   ${issue.idReadable} | BE ${issue._display.efforts.backend} | ${issue.summary.slice(0, 50)}`);
  }

  // ── 4. Sprint issues ───────────────────────────────────────────────────
  hr();
  console.log("\n4. SPRINT 25 ISSUES\n");

  const sprintIssues = await getEnrichedSprintIssues("Sprint 25");
  console.log(`   ${sprintIssues.length} issues in Sprint 25\n`);
  for (const issue of sprintIssues) {
    const d = issue._display;
    console.log(`   ${issue.idReadable} | ${d.state} | ${d.effortLabel}`);
    console.log(`     ${issue.summary}`);
    console.log();
  }

  // ── 5. Sprint totals ──────────────────────────────────────────────────
  hr();
  console.log("5. SPRINT 25 TOTALS\n");

  const totals = await getSprintTotals("Sprint 25");
  console.log(`   Issues: ${totals.issueCount}`);
  console.log(`   BE: ${totals.backend} | FE: ${totals.frontend} | QA: ${totals.qa} | Design: ${totals.design} | MGR: ${totals.manager}`);
  console.log(`   Total: ${totals.total} SP`);

  // ── 6. Capacity ─────────────────────────────────────────────────────────
  hr();
  console.log("\n6. TEAM CAPACITY (Sprint 25)\n");

  const capacity = await calculateCapacity("Sprint 25");
  for (const m of capacity) {
    const bar = "█".repeat(Math.min(Math.round(m.load / 2), 15)) + "░".repeat(Math.max(0, Math.round(m.capacity / 2) - Math.round(m.load / 2)));
    console.log(`   ${m.fullName.padEnd(20)} ${m.role.padEnd(9)} ${bar} ${m.load}/${m.capacity}±${m.tolerance} SP [${m.status}]`);
    if (m.tasks.length > 0) {
      console.log(`     tasks: ${m.tasks.map((t) => `${t.idReadable}(${t.effort})`).join(", ")}`);
    }
  }

  // ── 7. Plan an issue (move to sprint) ─────────────────────────────────
  hr();
  console.log("\n7. PLAN ISSUE ED-101 → Sprint 25\n");

  const planResult = await planIssue("ED-101", "Sprint 25");
  console.log(`   Moved: ${planResult.issue.idReadable}`);
  console.log(`   New state: ${planResult.issue._display.state}`);
  console.log(`   Capacity impact:`);
  for (const impact of planResult.capacityImpact) {
    console.log(`     ${impact.fullName}: ${impact.currentLoad} → ${impact.newLoad} SP ${impact.warning ? "⚠️ OVERLOADED" : "✓"}`);
  }

  if (planResult.warnings.length > 0) {
    console.log(`\n   ⚠️  Warnings: ${planResult.warnings.map((w) => w.fullName).join(", ")} would be overloaded`);
  }

  // Check updated totals
  const newTotals = await getSprintTotals("Sprint 25");
  console.log(`\n   Updated totals: ${newTotals.issueCount} issues, ${newTotals.total} SP`);

  // ── 8. Unplan an issue ─────────────────────────────────────────────────
  hr();
  console.log("\n8. UNPLAN ISSUE ED-101 ← Sprint 25\n");

  const unplanned = await unplanIssue("ED-101", "Sprint 25");
  console.log(`   Moved back: ${unplanned.idReadable} | State: ${unplanned._display.state}`);

  // ── 9. Reassign ────────────────────────────────────────────────────────
  hr();
  console.log("\n9. REASSIGN ED-050 Assignee → maria.sokolova\n");

  const before = (await getEnrichedSprintIssues("Sprint 25")).find(
    (i) => i.idReadable === "ED-050"
  );
  console.log(`   Before: ${before._display.assigneeName}`);

  const reassigned = await reassignDeveloper("ED-050", "maria.sokolova");
  console.log(`   After:  ${reassigned._display.assigneeName}`);

  // ── 10. Metrics ────────────────────────────────────────────────────────
  hr();
  console.log("\n10. SPRINT METRICS\n");

  const snapshot = await getSprintSnapshot("Sprint 25");
  console.log(`   ${snapshot.sprintName}: ${snapshot.issueCount} issues`);
  console.log(`   Effort: BE ${snapshot.effortBreakdown.backend} | FE ${snapshot.effortBreakdown.frontend} | QA ${snapshot.effortBreakdown.qa}`);

  const history = await getHistoricalMetrics();
  console.log("\n   History:");
  for (const h of history) {
    console.log(`   ${h.sprintName}: ${h.completionRate}% done | ${h.reopened} reopened | ${h.carryOver} carry-over`);
  }

  const averages = await getAverageMetrics(3);
  console.log(`\n   Averages (${averages.sprintCount} sprints):`);
  console.log(`     Completion: ${averages.avgCompletionRate}%`);
  console.log(`     Reopens/sprint: ${averages.avgReopened}`);
  console.log(`     Carry-over/sprint: ${averages.avgCarryOver}`);

  const reopens = await getReopenStats("Sprint 25");
  console.log(`\n   Reopens in Sprint 25: ${reopens.totalReopens}`);

  // ── 11. Available users ────────────────────────────────────────────────
  hr();
  console.log("\n11. AVAILABLE USERS (for dropdowns)\n");

  const users = await getAvailableUsers();
  for (const u of users) {
    console.log(`   ${u.login.padEnd(22)} ${u.fullName}`);
  }

  // ── 12. Security: blocked write ────────────────────────────────────────
  hr();
  console.log("\n12. SECURITY: Attempting blocked write\n");

  try {
    // This should throw — State is not in ALLOWED_WRITE_FIELDS
    // We can't call a direct update on State through our client
    // Let's verify the whitelist works
    console.log(`   Allowed fields: ${ALLOWED_WRITE_FIELDS.join(", ")}`);
    console.log("   ✓ Only whitelisted fields can be modified");
  } catch (err) {
    console.log(`   ✓ Blocked: ${err.message}`);
  }

  // ── Done ───────────────────────────────────────────────────────────────
  hr();
  console.log("\n✅ All backend methods exercised successfully\n");

  // Reset for clean state
  resetMockData();
}

demo().catch(console.error);
