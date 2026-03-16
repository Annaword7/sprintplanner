// ═══════════════════════════════════════════════════════════════════════════
// Sprint Planner — Public API
// Single entry point for all backend functionality
// ═══════════════════════════════════════════════════════════════════════════

// ── Configuration ────────────────────────────────────────────────────────
export {
  PROJECT,
  FIELDS,
  FIELD_TYPES,
  ALLOWED_WRITE_FIELDS,
  EFFORT_BY_ROLE,
  STATE_VALUES,
  TYPE_VALUES,
  PRIORITY_VALUES,
  QA_PRIORITY_VALUES,
  EXT_CATEGORY_VALUES,
} from "./config/fields.js";

// ── YouTrack API Client (mock-backed, swap-ready) ────────────────────────
export {
  getBacklogIssues,
  getSprintIssues,
  getIssues,
  getIssue,
  getSprints,
  getCurrentSprint,
  getAvailableUsers,
  getTeamCapacity,
  getSprintHistory,
  updateAssignee,
  updateQA,
  addToSprint,
  removeFromSprint,
  resetMockData,
  // Field value extractors
  getFieldValue,
  getScalarField,
  getEnumFieldName,
  getUserFieldLogin,
  getUserFieldName,
  getMultiVersionNames,
  getEfforts,
  getEffortLabel,
} from "./api/youtrack-client.js";

// ── Backlog & Planning Service ───────────────────────────────────────────
export {
  getFilteredBacklog,
  getEnrichedSprintIssues,
  planIssue,
  unplanIssue,
  reassignDeveloper,
  reassignQA,
  getSprintTotals,
} from "./services/backlog-service.js";

// ── Capacity Planning Service ────────────────────────────────────────────
export {
  calculateCapacity,
  getCapacitySummary,
  previewAddIssue,
} from "./services/capacity-service.js";

// ── Sprint Metrics Service ───────────────────────────────────────────────
export {
  getSprintSnapshot,
  getHistoricalMetrics,
  getAverageMetrics,
  getReopenStats,
} from "./services/metrics-service.js";
