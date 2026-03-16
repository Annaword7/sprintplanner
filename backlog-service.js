// ═══════════════════════════════════════════════════════════════════════════
// Backlog & Sprint Planning Service
// Handles sorting, filtering, and issue movement between backlog and sprint
// ═══════════════════════════════════════════════════════════════════════════

import { FIELDS } from "../config/fields.js";
import {
  getBacklogIssues,
  getSprintIssues,
  addToSprint,
  removeFromSprint,
  updateAssignee,
  updateQA,
  getScalarField,
  getEnumFieldName,
  getUserFieldLogin,
  getEfforts,
  getEffortLabel,
} from "../api/youtrack-client.js";
import { previewAddIssue } from "./capacity-service.js";

// ── Sort options ─────────────────────────────────────────────────────────

const SORT_FUNCTIONS = {
  totalPriority: (a, b) =>
    (getScalarField(b, FIELDS.TOTAL_PRIORITY) || 0) -
    (getScalarField(a, FIELDS.TOTAL_PRIORITY) || 0),

  businessValue: (a, b) =>
    (getScalarField(b, FIELDS.BUSINESS_VALUE) || 0) -
    (getScalarField(a, FIELDS.BUSINESS_VALUE) || 0),

  totalEffort: (a, b) => getEfforts(b).total - getEfforts(a).total,

  priority: (a, b) => {
    const order = { Critical: 4, Major: 3, Normal: 2, Minor: 1 };
    const pa = order[getEnumFieldName(a, FIELDS.PRIORITY)] || 0;
    const pb = order[getEnumFieldName(b, FIELDS.PRIORITY)] || 0;
    return pb - pa;
  },

  id: (a, b) => a.idReadable.localeCompare(b.idReadable),
};

// ── Filter options ───────────────────────────────────────────────────────

function matchesFilters(issue, filters) {
  if (filters.type && getEnumFieldName(issue, FIELDS.TYPE) !== filters.type) {
    return false;
  }
  if (filters.priority && getEnumFieldName(issue, FIELDS.PRIORITY) !== filters.priority) {
    return false;
  }
  if (filters.category && getEnumFieldName(issue, FIELDS.EXT_CATEGORY) !== filters.category) {
    return false;
  }
  if (filters.assignee && getUserFieldLogin(issue, FIELDS.ASSIGNEE) !== filters.assignee) {
    return false;
  }
  if (filters.qa && getUserFieldLogin(issue, FIELDS.QA) !== filters.qa) {
    return false;
  }
  if (filters.hasEffortType) {
    const efforts = getEfforts(issue);
    switch (filters.hasEffortType) {
      case "backend":  if (!efforts.backend) return false; break;
      case "frontend": if (!efforts.frontend) return false; break;
      case "qa":       if (!efforts.qa) return false; break;
      case "design":   if (!efforts.design) return false; break;
      case "manager":  if (!efforts.manager) return false; break;
    }
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    if (
      !issue.summary.toLowerCase().includes(q) &&
      !issue.idReadable.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Get filtered and sorted backlog
 *
 * @param {Object} options
 * @param {string} options.sortBy - "totalPriority" | "businessValue" | "totalEffort" | "priority" | "id"
 * @param {Object} options.filters - { type, priority, category, assignee, qa, hasEffortType, search }
 *
 * Returns: issues[] with additional computed fields for display
 */
export async function getFilteredBacklog({
  sortBy = "totalPriority",
  filters = {},
} = {}) {
  const issues = await getBacklogIssues();

  const filtered = issues.filter((issue) => matchesFilters(issue, filters));

  const sortFn = SORT_FUNCTIONS[sortBy] || SORT_FUNCTIONS.totalPriority;
  filtered.sort(sortFn);

  // Enrich with display-ready computed fields
  return filtered.map(enrichIssue);
}

/**
 * Get sprint issues with computed fields
 */
export async function getEnrichedSprintIssues(sprintName) {
  const issues = await getSprintIssues(sprintName);
  return issues.map(enrichIssue);
}

/**
 * Move issue from backlog to sprint with capacity preview
 *
 * Returns: {
 *   issue,           // updated issue
 *   capacityImpact,  // affected team members with load changes
 *   warnings,        // members who would be overloaded
 * }
 */
export async function planIssue(issueIdReadable, sprintName) {
  // First, get the issue for preview
  const backlog = await getBacklogIssues();
  const issue = backlog.find((i) => i.idReadable === issueIdReadable);
  if (!issue) throw new Error(`Issue ${issueIdReadable} not found in backlog`);

  // Preview capacity impact
  const capacityImpact = await previewAddIssue(sprintName, issue);
  const warnings = capacityImpact.filter((m) => m.warning);

  // Actually add to sprint
  const updatedIssue = await addToSprint(issueIdReadable, sprintName);

  return {
    issue: enrichIssue(updatedIssue),
    capacityImpact,
    warnings,
  };
}

/**
 * Move issue from sprint back to backlog
 */
export async function unplanIssue(issueIdReadable, sprintName) {
  const updatedIssue = await removeFromSprint(issueIdReadable, sprintName);
  return enrichIssue(updatedIssue);
}

/**
 * Reassign an issue's developer
 */
export async function reassignDeveloper(issueIdReadable, newLogin) {
  const updatedIssue = await updateAssignee(issueIdReadable, newLogin);
  return enrichIssue(updatedIssue);
}

/**
 * Reassign an issue's QA
 */
export async function reassignQA(issueIdReadable, newLogin) {
  const updatedIssue = await updateQA(issueIdReadable, newLogin);
  return enrichIssue(updatedIssue);
}

/**
 * Get sprint effort totals for the header display
 */
export async function getSprintTotals(sprintName) {
  const issues = await getSprintIssues(sprintName);
  const totals = { backend: 0, frontend: 0, qa: 0, design: 0, manager: 0, total: 0 };

  for (const issue of issues) {
    const e = getEfforts(issue);
    totals.backend += e.backend;
    totals.frontend += e.frontend;
    totals.qa += e.qa;
    totals.design += e.design;
    totals.manager += e.manager;
    totals.total += e.total;
  }

  totals.issueCount = issues.length;
  return totals;
}

// ── Enrich issue with display-ready computed fields ──────────────────────

function enrichIssue(issue) {
  return {
    // Original YouTrack data (preserved for API compatibility)
    ...issue,

    // Computed display fields
    _display: {
      priority: getEnumFieldName(issue, FIELDS.PRIORITY),
      type: getEnumFieldName(issue, FIELDS.TYPE),
      state: getEnumFieldName(issue, FIELDS.STATE),
      category: getEnumFieldName(issue, FIELDS.EXT_CATEGORY),
      qaPriority: getEnumFieldName(issue, FIELDS.QA_PRIORITY),
      assigneeLogin: getUserFieldLogin(issue, FIELDS.ASSIGNEE),
      assigneeName: issue.customFields?.find((f) => f.name === FIELDS.ASSIGNEE)?.value?.fullName || null,
      qaLogin: getUserFieldLogin(issue, FIELDS.QA),
      qaName: issue.customFields?.find((f) => f.name === FIELDS.QA)?.value?.fullName || null,
      efforts: getEfforts(issue),
      effortLabel: getEffortLabel(issue),
      totalPriority: getScalarField(issue, FIELDS.TOTAL_PRIORITY),
      businessValue: getScalarField(issue, FIELDS.BUSINESS_VALUE),
      percentDone: getScalarField(issue, FIELDS.PERCENT_DONE) || 0,
      reopenCount: getScalarField(issue, FIELDS.REOPEN_COUNTER) || 0,
    },
  };
}
