// ═══════════════════════════════════════════════════════════════════════════
// YouTrack API Client
//
// Currently: returns mock data in exact YouTrack API format
// To switch to real API: replace method bodies with fetch() calls
// The public interface stays identical — no frontend changes needed
// ═══════════════════════════════════════════════════════════════════════════

import {
  PROJECT,
  FIELDS,
  FIELD_TYPES,
  ALLOWED_WRITE_FIELDS,
  ISSUES_QUERY_FIELDS,
  SPRINT_QUERY_FIELDS,
} from "../config/fields.js";

import {
  MOCK_ISSUES,
  MOCK_USERS,
  MOCK_SPRINTS,
  MOCK_SPRINT_HISTORY,
  MOCK_TEAM_CAPACITY,
} from "../mock/mock-data.js";

// ── Internal state (simulates YouTrack DB) ───────────────────────────────
let _issues = structuredClone(MOCK_ISSUES);
let _sprints = structuredClone(MOCK_SPRINTS);

// ── Simulated network delay ──────────────────────────────────────────────
const MOCK_DELAY_MS = 150;
const delay = (ms = MOCK_DELAY_MS) => new Promise((r) => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════════
// READ OPERATIONS
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get issues from backlog (State = Backlog, not in target sprint)
 *
 * Real API equivalent:
 *   GET /api/issues
 *     ?query=project:ED State:Backlog
 *     &fields={ISSUES_QUERY_FIELDS}
 *     &$top=100
 */
export async function getBacklogIssues() {
  await delay();
  return _issues.filter((issue) => {
    const state = getFieldValue(issue, FIELDS.STATE);
    const sprints = getFieldValue(issue, FIELDS.EXT_SPRINT);
    return state?.name === "Backlog" && (!sprints || sprints.length === 0);
  });
}

/**
 * Get issues assigned to a specific sprint
 *
 * Real API equivalent:
 *   GET /api/issues
 *     ?query=project:ED EXT Sprint:{sprintName}
 *     &fields={ISSUES_QUERY_FIELDS}
 *     &$top=100
 */
export async function getSprintIssues(sprintName) {
  await delay();
  return _issues.filter((issue) => {
    const sprints = getFieldValue(issue, FIELDS.EXT_SPRINT);
    return sprints?.some((s) => s.name === sprintName);
  });
}

/**
 * Get all issues matching a custom query
 *
 * Real API equivalent:
 *   GET /api/issues
 *     ?query={query}
 *     &fields={ISSUES_QUERY_FIELDS}
 *     &$top={top}&$skip={skip}
 */
export async function getIssues({ query = "", top = 100, skip = 0 } = {}) {
  await delay();
  // In real API, query is YouTrack search syntax
  // For mock, we return all issues with simple filtering
  let result = [..._issues];
  if (query) {
    const q = query.toLowerCase();
    result = result.filter(
      (i) =>
        i.summary.toLowerCase().includes(q) ||
        i.idReadable.toLowerCase().includes(q)
    );
  }
  return result.slice(skip, skip + top);
}

/**
 * Get a single issue by idReadable (e.g. "ED-101")
 *
 * Real API equivalent:
 *   GET /api/issues/{idReadable}
 *     ?fields={ISSUES_QUERY_FIELDS}
 */
export async function getIssue(idReadable) {
  await delay();
  const issue = _issues.find((i) => i.idReadable === idReadable);
  if (!issue) throw new Error(`Issue ${idReadable} not found`);
  return issue;
}

/**
 * Get list of all sprints for the agile board
 *
 * Real API equivalent:
 *   GET /api/agiles/{agileID}/sprints
 *     ?fields={SPRINT_QUERY_FIELDS}
 */
export async function getSprints({ includeArchived = false } = {}) {
  await delay();
  let result = [..._sprints];
  if (!includeArchived) {
    result = result.filter((s) => !s.archived);
  }
  return result;
}

/**
 * Get the current (default) sprint
 *
 * Real API equivalent:
 *   GET /api/agiles/{agileID}/sprints/current
 *     ?fields={SPRINT_QUERY_FIELDS}
 */
export async function getCurrentSprint() {
  await delay();
  return _sprints.find((s) => s.isDefault) || _sprints[_sprints.length - 1];
}

/**
 * Get available users for Assignee/QA fields (the bundle)
 *
 * Real API equivalent:
 *   GET /api/admin/projects/{projectID}/customFields/{fieldID}
 *     ?fields=bundle(aggregatedUsers(id,login,fullName,name))
 */
export async function getAvailableUsers() {
  await delay();
  return [...MOCK_USERS];
}

/**
 * Get team capacity configuration
 * (This is app-level config, not stored in YouTrack)
 */
export async function getTeamCapacity() {
  await delay();
  return [...MOCK_TEAM_CAPACITY];
}

/**
 * Get historical sprint metrics
 *
 * Real API: computed from activities endpoint
 *   GET /api/issues/{issueID}/activities
 *     ?categories=CustomFieldCategory
 *     &fields=author(name),timestamp,added(name),removed(name)
 */
export async function getSprintHistory() {
  await delay();
  return [...MOCK_SPRINT_HISTORY];
}

// ══════════════════════════════════════════════════════════════════════════
// WRITE OPERATIONS (whitelisted fields only)
// ══════════════════════════════════════════════════════════════════════════

/**
 * Update Assignee for an issue
 *
 * Real API equivalent:
 *   POST /api/issues/{issueID}
 *     ?fields=customFields(name,value(login,fullName))
 *   Body: {
 *     "customFields": [{
 *       "name": "Assignee",
 *       "$type": "SingleUserIssueCustomField",
 *       "value": { "login": "{login}" }
 *     }]
 *   }
 */
export async function updateAssignee(issueIdReadable, userLogin) {
  assertWriteAllowed(FIELDS.ASSIGNEE);
  await delay();

  const issue = _issues.find((i) => i.idReadable === issueIdReadable);
  if (!issue) throw new Error(`Issue ${issueIdReadable} not found`);

  const user = MOCK_USERS.find((u) => u.login === userLogin);
  if (!user && userLogin !== null) throw new Error(`User ${userLogin} not found`);

  const field = issue.customFields.find((f) => f.name === FIELDS.ASSIGNEE);
  if (field) {
    field.value = userLogin ? { ...user } : null;
  }

  console.log(`[MOCK WRITE] ${issueIdReadable}: Assignee → ${userLogin}`);
  return issue;
}

/**
 * Update QA for an issue
 *
 * Real API equivalent:
 *   POST /api/issues/{issueID}
 *     ?fields=customFields(name,value(login,fullName))
 *   Body: {
 *     "customFields": [{
 *       "name": "QA",
 *       "$type": "SingleUserIssueCustomField",
 *       "value": { "login": "{login}" }
 *     }]
 *   }
 */
export async function updateQA(issueIdReadable, userLogin) {
  assertWriteAllowed(FIELDS.QA);
  await delay();

  const issue = _issues.find((i) => i.idReadable === issueIdReadable);
  if (!issue) throw new Error(`Issue ${issueIdReadable} not found`);

  const user = MOCK_USERS.find((u) => u.login === userLogin);
  if (!user && userLogin !== null) throw new Error(`User ${userLogin} not found`);

  const field = issue.customFields.find((f) => f.name === FIELDS.QA);
  if (field) {
    field.value = userLogin ? { ...user } : null;
  }

  console.log(`[MOCK WRITE] ${issueIdReadable}: QA → ${userLogin}`);
  return issue;
}

/**
 * Add an issue to a sprint (EXT Sprint is multi-version, so we ADD)
 *
 * Real API equivalent:
 *   POST /api/issues/{issueID}
 *     ?fields=customFields(name,value(id,name))
 *   Body: {
 *     "customFields": [{
 *       "name": "EXT Sprint",
 *       "$type": "MultiVersionIssueCustomField",
 *       "value": [
 *         ...existingValues,
 *         { "name": "{sprintName}" }
 *       ]
 *     }]
 *   }
 */
export async function addToSprint(issueIdReadable, sprintName) {
  assertWriteAllowed(FIELDS.EXT_SPRINT);
  await delay();

  const issue = _issues.find((i) => i.idReadable === issueIdReadable);
  if (!issue) throw new Error(`Issue ${issueIdReadable} not found`);

  const sprint = _sprints.find((s) => s.name === sprintName);
  if (!sprint) throw new Error(`Sprint ${sprintName} not found`);

  const field = issue.customFields.find((f) => f.name === FIELDS.EXT_SPRINT);
  if (field) {
    const alreadyIn = field.value?.some((v) => v.name === sprintName);
    if (!alreadyIn) {
      field.value = [
        ...(field.value || []),
        { id: sprint.id, name: sprintName, $type: "VersionBundleElement" },
      ];
    }
  }

  // Also update State from Backlog → Open when adding to sprint
  const stateField = issue.customFields.find((f) => f.name === FIELDS.STATE);
  if (stateField?.value?.name === "Backlog") {
    stateField.value = { name: "Open", isResolved: false, $type: "StateBundleElement" };
  }

  console.log(`[MOCK WRITE] ${issueIdReadable}: added to ${sprintName}`);
  return issue;
}

/**
 * Remove an issue from a sprint
 *
 * Real API: same as addToSprint but without the target sprint in the value array
 */
export async function removeFromSprint(issueIdReadable, sprintName) {
  assertWriteAllowed(FIELDS.EXT_SPRINT);
  await delay();

  const issue = _issues.find((i) => i.idReadable === issueIdReadable);
  if (!issue) throw new Error(`Issue ${issueIdReadable} not found`);

  const field = issue.customFields.find((f) => f.name === FIELDS.EXT_SPRINT);
  if (field) {
    field.value = (field.value || []).filter((v) => v.name !== sprintName);
  }

  // If removed from all sprints, revert to Backlog
  if (!field.value || field.value.length === 0) {
    const stateField = issue.customFields.find((f) => f.name === FIELDS.STATE);
    if (stateField && !stateField.value?.isResolved) {
      stateField.value = { name: "Backlog", isResolved: false, $type: "StateBundleElement" };
    }
  }

  console.log(`[MOCK WRITE] ${issueIdReadable}: removed from ${sprintName}`);
  return issue;
}

// ══════════════════════════════════════════════════════════════════════════
// UTILITY: Extract field values from YouTrack issue format
// ══════════════════════════════════════════════════════════════════════════

/**
 * Get the value of a custom field from an issue
 * Works with real YouTrack response format and mock data identically
 */
export function getFieldValue(issue, fieldName) {
  const field = issue.customFields?.find((f) => f.name === fieldName);
  return field?.value ?? null;
}

/**
 * Extract a simple scalar (integer, float, string) field value
 */
export function getScalarField(issue, fieldName) {
  return getFieldValue(issue, fieldName);
}

/**
 * Extract enum field value name (e.g. Priority → "Critical")
 */
export function getEnumFieldName(issue, fieldName) {
  const val = getFieldValue(issue, fieldName);
  return val?.name ?? null;
}

/**
 * Extract user field login (e.g. Assignee → "alex.kuznetsov")
 */
export function getUserFieldLogin(issue, fieldName) {
  const val = getFieldValue(issue, fieldName);
  return val?.login ?? null;
}

/**
 * Extract user field full name (e.g. Assignee → "Алексей Кузнецов")
 */
export function getUserFieldName(issue, fieldName) {
  const val = getFieldValue(issue, fieldName);
  return val?.fullName ?? val?.name ?? null;
}

/**
 * Extract multi-version field value names (e.g. EXT Sprint → ["Sprint 25"])
 */
export function getMultiVersionNames(issue, fieldName) {
  const val = getFieldValue(issue, fieldName);
  return Array.isArray(val) ? val.map((v) => v.name) : [];
}

/**
 * Get all effort values for an issue (for capacity planning)
 * Returns: { backend, frontend, qa, design, manager, total }
 */
export function getEfforts(issue) {
  const be = getScalarField(issue, FIELDS.BACKEND_EFFORT) || 0;
  const fe = getScalarField(issue, FIELDS.FRONTEND_EFFORT) || 0;
  const qa = getScalarField(issue, FIELDS.QA_EFFORT) || 0;
  const design = getScalarField(issue, FIELDS.DESIGN_EFFORT) || 0;
  const mgr = getScalarField(issue, FIELDS.MANAGER_EFFORT) || 0;
  return {
    backend: be,
    frontend: fe,
    qa,
    design,
    manager: mgr,
    total: be + fe + qa + design + mgr,
  };
}

/**
 * Build a human-readable effort label for display
 * e.g. "BE 8 + QA 5" or "FE 5 + Design 3 + QA 3" or "MGR 4"
 */
export function getEffortLabel(issue) {
  const e = getEfforts(issue);
  const parts = [];
  if (e.backend) parts.push(`BE ${e.backend}`);
  if (e.frontend) parts.push(`FE ${e.frontend}`);
  if (e.design) parts.push(`Design ${e.design}`);
  if (e.qa) parts.push(`QA ${e.qa}`);
  if (e.manager) parts.push(`MGR ${e.manager}`);
  return parts.join(" + ") || "—";
}

// ══════════════════════════════════════════════════════════════════════════
// INTERNAL: Safety
// ══════════════════════════════════════════════════════════════════════════

function assertWriteAllowed(fieldName) {
  if (!ALLOWED_WRITE_FIELDS.includes(fieldName)) {
    throw new Error(
      `BLOCKED: Write to field "${fieldName}" is not in the whitelist. ` +
      `Allowed fields: ${ALLOWED_WRITE_FIELDS.join(", ")}`
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════
// RESET (for testing / dev)
// ══════════════════════════════════════════════════════════════════════════

export function resetMockData() {
  _issues = structuredClone(MOCK_ISSUES);
  _sprints = structuredClone(MOCK_SPRINTS);
  console.log("[MOCK] Data reset to initial state");
}
