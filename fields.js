// ═══════════════════════════════════════════════════════════════════════════
// YouTrack Field Configuration — Extranet Delivery Project
// All field names, types, and $type values match the real YouTrack schema
// ═══════════════════════════════════════════════════════════════════════════

export const PROJECT = {
  id: "0-42",
  name: "Extranet Delivery",
  shortName: "ED",
};

// ── Custom Field Names (exact match to YouTrack) ─────────────────────────
export const FIELDS = {
  STATE: "State",
  TYPE: "Type",
  PRIORITY: "Priority",
  EXT_SPRINT: "EXT Sprint",
  ASSIGNEE: "Assignee",
  QA: "QA",
  QA_PRIORITY: "QA Priority",
  EXT_CATEGORY: "EXT Category",
  EXT_ENVIRONMENT: "EXT Environment",
  EXT_SERVICE: "EXT Service",
  EXT_PROJECT: "EXT Project",
  EXT_TEAM: "EXT Team",
  BACKEND_EFFORT: "Backend Effort",
  FRONTEND_EFFORT: "Frontend Effort",
  QA_EFFORT: "QA Effort",
  DESIGN_EFFORT: "Design Effort",
  MANAGER_EFFORT: "Manager effort",
  TOTAL_PRIORITY: "Total Priority",
  BUSINESS_VALUE: "Business Value",
  REOPEN_COUNTER: "• Reopen counter",
  PERCENT_DONE: "% Done",
  OWNER: "Owner",
  PRODUCT_OWNER: "Product Owner",
  DELIVERY_MANAGER: "Delivery Manager",
  ESTIMATION: "Estimation",
  STREAM: "Stream",
  EXTERNAL_DEPENDENCY: "External Dependency",
};

// ── $type mapping for API requests ───────────────────────────────────────
// Required in POST body when updating custom fields
export const FIELD_TYPES = {
  [FIELDS.STATE]: "StateIssueCustomField",
  [FIELDS.TYPE]: "SingleEnumIssueCustomField",
  [FIELDS.PRIORITY]: "SingleEnumIssueCustomField",
  [FIELDS.EXT_SPRINT]: "MultiVersionIssueCustomField",
  [FIELDS.ASSIGNEE]: "SingleUserIssueCustomField",
  [FIELDS.QA]: "SingleUserIssueCustomField",
  [FIELDS.QA_PRIORITY]: "SingleEnumIssueCustomField",
  [FIELDS.EXT_CATEGORY]: "SingleEnumIssueCustomField",
  [FIELDS.EXT_ENVIRONMENT]: "SingleEnumIssueCustomField",
  [FIELDS.EXT_SERVICE]: "MultiEnumIssueCustomField",
  [FIELDS.EXT_PROJECT]: "MultiEnumIssueCustomField",
  [FIELDS.EXT_TEAM]: "MultiEnumIssueCustomField",
  [FIELDS.BACKEND_EFFORT]: "SimpleIssueCustomField",
  [FIELDS.FRONTEND_EFFORT]: "SimpleIssueCustomField",
  [FIELDS.QA_EFFORT]: "SimpleIssueCustomField",
  [FIELDS.DESIGN_EFFORT]: "SimpleIssueCustomField",
  [FIELDS.MANAGER_EFFORT]: "SimpleIssueCustomField",
  [FIELDS.TOTAL_PRIORITY]: "SimpleIssueCustomField",
  [FIELDS.BUSINESS_VALUE]: "SimpleIssueCustomField",
  [FIELDS.REOPEN_COUNTER]: "SimpleIssueCustomField",
  [FIELDS.PERCENT_DONE]: "SimpleIssueCustomField",
  [FIELDS.OWNER]: "SingleUserIssueCustomField",
  [FIELDS.PRODUCT_OWNER]: "SingleUserIssueCustomField",
  [FIELDS.DELIVERY_MANAGER]: "SingleUserIssueCustomField",
  [FIELDS.ESTIMATION]: "SimpleIssueCustomField",
  [FIELDS.STREAM]: "SingleEnumIssueCustomField",
  [FIELDS.EXTERNAL_DEPENDENCY]: "SingleEnumIssueCustomField",
};

// ── Allowed write operations (whitelist) ─────────────────────────────────
export const ALLOWED_WRITE_FIELDS = [
  FIELDS.ASSIGNEE,
  FIELDS.QA,
  FIELDS.EXT_SPRINT,
];

// ── Enum values ──────────────────────────────────────────────────────────
export const STATE_VALUES = [
  "Backlog",
  "Open",
  "In Progress",
  "Wait",
  "Fixed",
  "Verified",
  "Done",
  "Duplicate",
  "Won't fix",
  "Incomplete",
];

export const TYPE_VALUES = ["Task", "Bug", "Feature", "Epic", "Story", "Sub-task"];

export const PRIORITY_VALUES = ["Critical", "Major", "Normal", "Minor"];

export const QA_PRIORITY_VALUES = [
  "0 Need QA",
  "1 Critical",
  "2 High",
  "3 Medium",
  "4 Low",
  "5 No QA",
];

export const EXT_CATEGORY_VALUES = [
  "Development",
  "Support",
  "Infrastructure",
  "Design",
  "Research",
];

// ── Effort fields grouped by role for capacity planning ──────────────────
export const EFFORT_BY_ROLE = {
  backend: FIELDS.BACKEND_EFFORT,
  frontend: FIELDS.FRONTEND_EFFORT,
  qa: FIELDS.QA_EFFORT,
  design: FIELDS.DESIGN_EFFORT,
  manager: FIELDS.MANAGER_EFFORT,
};

// ── API query fields template ────────────────────────────────────────────
// The fields parameter for GET /api/issues to request all needed data
export const ISSUES_QUERY_FIELDS = [
  "id",
  "idReadable",
  "summary",
  "description",
  "created",
  "updated",
  "resolved",
  "customFields(name,$type,value($type,id,name,login,fullName,presentation,isResolved,color(id)))",
].join(",");

export const SPRINT_QUERY_FIELDS = [
  "id",
  "name",
  "start",
  "finish",
  "archived",
  "isDefault",
  "unresolvedIssuesCount",
  "issues(id,idReadable)",
].join(",");
