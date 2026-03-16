// ═══════════════════════════════════════════════════════════════════════════
// Sprint Metrics Service
// Computes planning and retrospective metrics
// ═══════════════════════════════════════════════════════════════════════════

import { FIELDS } from "../config/fields.js";
import {
  getSprintIssues,
  getSprintHistory,
  getScalarField,
  getEnumFieldName,
  getEfforts,
} from "../api/youtrack-client.js";

/**
 * Get snapshot of current sprint planning state
 *
 * Returns: {
 *   sprintName,
 *   issueCount,
 *   effortBreakdown: { backend, frontend, qa, design, manager, total },
 *   byPriority:  { Critical: n, Major: n, ... },
 *   byType:      { Task: n, Feature: n, ... },
 *   byCategory:  { Development: n, ... },
 * }
 */
export async function getSprintSnapshot(sprintName) {
  const issues = await getSprintIssues(sprintName);

  const effortBreakdown = { backend: 0, frontend: 0, qa: 0, design: 0, manager: 0, total: 0 };
  const byPriority = {};
  const byType = {};
  const byCategory = {};

  for (const issue of issues) {
    // Efforts
    const efforts = getEfforts(issue);
    effortBreakdown.backend += efforts.backend;
    effortBreakdown.frontend += efforts.frontend;
    effortBreakdown.qa += efforts.qa;
    effortBreakdown.design += efforts.design;
    effortBreakdown.manager += efforts.manager;
    effortBreakdown.total += efforts.total;

    // Priority
    const priority = getEnumFieldName(issue, FIELDS.PRIORITY) || "Unknown";
    byPriority[priority] = (byPriority[priority] || 0) + 1;

    // Type
    const type = getEnumFieldName(issue, FIELDS.TYPE) || "Unknown";
    byType[type] = (byType[type] || 0) + 1;

    // Category
    const category = getEnumFieldName(issue, FIELDS.EXT_CATEGORY) || "Unknown";
    byCategory[category] = (byCategory[category] || 0) + 1;
  }

  return {
    sprintName,
    issueCount: issues.length,
    effortBreakdown,
    byPriority,
    byType,
    byCategory,
  };
}

/**
 * Get historical metrics across past sprints
 *
 * Returns: [{
 *   sprintName,
 *   planned,         // issues at sprint start
 *   completed,       // issues resolved by sprint end
 *   reopened,        // issues that were reopened during sprint
 *   carryOver,       // issues that stayed unresolved
 *   completionRate,  // completed / planned (0-1)
 *   reopenRate,      // reopened / planned (0-1)
 *   carryOverRate,   // carryOver / planned (0-1)
 *   totalEffort,     // effort breakdown
 * }]
 */
export async function getHistoricalMetrics() {
  const history = await getSprintHistory();

  return history.map((sprint) => ({
    ...sprint,
    completionRate: sprint.planned > 0
      ? Math.round((sprint.completed / sprint.planned) * 100) : 0,
    reopenRate: sprint.planned > 0
      ? Math.round((sprint.reopened / sprint.planned) * 100) : 0,
    carryOverRate: sprint.planned > 0
      ? Math.round((sprint.carryOver / sprint.planned) * 100) : 0,
  }));
}

/**
 * Get aggregated averages across N last sprints
 *
 * Returns: {
 *   sprintCount,
 *   avgPlanned, avgCompleted, avgReopened, avgCarryOver,
 *   avgCompletionRate, avgReopenRate, avgCarryOverRate,
 *   avgEffort: { backend, frontend, qa, design, manager },
 * }
 */
export async function getAverageMetrics(lastN = 3) {
  const history = await getHistoricalMetrics();
  const sprints = history.slice(-lastN);

  if (sprints.length === 0) {
    return {
      sprintCount: 0,
      avgPlanned: 0, avgCompleted: 0, avgReopened: 0, avgCarryOver: 0,
      avgCompletionRate: 0, avgReopenRate: 0, avgCarryOverRate: 0,
      avgEffort: { backend: 0, frontend: 0, qa: 0, design: 0, manager: 0 },
    };
  }

  const n = sprints.length;
  return {
    sprintCount: n,
    avgPlanned: Math.round(sum(sprints, "planned") / n * 10) / 10,
    avgCompleted: Math.round(sum(sprints, "completed") / n * 10) / 10,
    avgReopened: Math.round(sum(sprints, "reopened") / n * 10) / 10,
    avgCarryOver: Math.round(sum(sprints, "carryOver") / n * 10) / 10,
    avgCompletionRate: Math.round(sum(sprints, "completionRate") / n),
    avgReopenRate: Math.round(sum(sprints, "reopenRate") / n),
    avgCarryOverRate: Math.round(sum(sprints, "carryOverRate") / n),
    avgEffort: {
      backend: Math.round(sprints.reduce((a, s) => a + (s.totalEffort?.backend || 0), 0) / n),
      frontend: Math.round(sprints.reduce((a, s) => a + (s.totalEffort?.frontend || 0), 0) / n),
      qa: Math.round(sprints.reduce((a, s) => a + (s.totalEffort?.qa || 0), 0) / n),
      design: Math.round(sprints.reduce((a, s) => a + (s.totalEffort?.design || 0), 0) / n),
      manager: Math.round(sprints.reduce((a, s) => a + (s.totalEffort?.manager || 0), 0) / n),
    },
  };
}

/**
 * Get reopen statistics from current sprint issues
 * Uses the "• Reopen counter" field
 *
 * Returns: {
 *   totalReopens,
 *   issuesWithReopens: [{ idReadable, summary, reopenCount }],
 * }
 */
export async function getReopenStats(sprintName) {
  const issues = await getSprintIssues(sprintName);

  const issuesWithReopens = [];
  let totalReopens = 0;

  for (const issue of issues) {
    const reopenCount = getScalarField(issue, FIELDS.REOPEN_COUNTER) || 0;
    if (reopenCount > 0) {
      totalReopens += reopenCount;
      issuesWithReopens.push({
        idReadable: issue.idReadable,
        summary: issue.summary,
        reopenCount,
      });
    }
  }

  return {
    totalReopens,
    issuesWithReopens: issuesWithReopens.sort((a, b) => b.reopenCount - a.reopenCount),
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function sum(arr, key) {
  return arr.reduce((a, item) => a + (item[key] || 0), 0);
}
