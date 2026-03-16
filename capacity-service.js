// ═══════════════════════════════════════════════════════════════════════════
// Capacity Planning Service
// Calculates team load by role from sprint issues
// ═══════════════════════════════════════════════════════════════════════════

import { FIELDS } from "../config/fields.js";
import {
  getSprintIssues,
  getTeamCapacity,
  getAvailableUsers,
  getScalarField,
  getUserFieldLogin,
  getEfforts,
} from "../api/youtrack-client.js";

/**
 * Calculate capacity utilization for all team members in a sprint
 *
 * Returns: [{
 *   login, fullName, role,
 *   capacity, tolerance,
 *   load,            // total effort assigned
 *   tasks,           // [ { idReadable, effort } ]
 *   status,          // "empty" | "under" | "optimal" | "over"
 *   utilizationPct,  // 0-100+
 * }]
 */
export async function calculateCapacity(sprintName) {
  const [issues, capacityConfig, users] = await Promise.all([
    getSprintIssues(sprintName),
    getTeamCapacity(),
    getAvailableUsers(),
  ]);

  // Initialize capacity map from config
  const capacityMap = {};
  for (const member of capacityConfig) {
    const user = users.find((u) => u.login === member.login);
    capacityMap[member.login] = {
      login: member.login,
      fullName: user?.fullName || member.login,
      role: member.role,
      capacity: member.capacity,
      tolerance: member.tolerance,
      load: 0,
      tasks: [],
      status: "empty",
      utilizationPct: 0,
    };
  }

  // Accumulate load from sprint issues
  for (const issue of issues) {
    const efforts = getEfforts(issue);
    const assigneeLogin = getUserFieldLogin(issue, FIELDS.ASSIGNEE);
    const qaLogin = getUserFieldLogin(issue, FIELDS.QA);

    // Assignee gets backend/frontend/design/manager effort
    if (assigneeLogin && capacityMap[assigneeLogin]) {
      const member = capacityMap[assigneeLogin];
      const effortForRole = getEffortForRole(efforts, member.role);
      if (effortForRole > 0) {
        member.load += effortForRole;
        member.tasks.push({
          idReadable: issue.idReadable,
          effort: effortForRole,
        });
      }
    }

    // QA gets QA effort
    if (qaLogin && capacityMap[qaLogin]) {
      const member = capacityMap[qaLogin];
      if (efforts.qa > 0) {
        member.load += efforts.qa;
        member.tasks.push({
          idReadable: issue.idReadable,
          effort: efforts.qa,
        });
      }
    }
  }

  // Calculate status for each member
  for (const member of Object.values(capacityMap)) {
    member.utilizationPct = member.capacity > 0
      ? Math.round((member.load / member.capacity) * 100)
      : 0;
    member.status = getCapacityStatus(member);
  }

  return Object.values(capacityMap);
}

/**
 * Get capacity summary totals by role
 *
 * Returns: {
 *   backend:  { totalCapacity, totalLoad, members },
 *   frontend: { totalCapacity, totalLoad, members },
 *   qa:       { totalCapacity, totalLoad, members },
 *   design:   { totalCapacity, totalLoad, members },
 *   manager:  { totalCapacity, totalLoad, members },
 * }
 */
export async function getCapacitySummary(sprintName) {
  const members = await calculateCapacity(sprintName);
  const summary = {};

  for (const member of members) {
    if (!summary[member.role]) {
      summary[member.role] = {
        totalCapacity: 0,
        totalLoad: 0,
        members: [],
      };
    }
    summary[member.role].totalCapacity += member.capacity;
    summary[member.role].totalLoad += member.load;
    summary[member.role].members.push(member);
  }

  return summary;
}

/**
 * Check what happens to capacity if an issue is added to sprint
 * Returns preview without actually modifying data
 *
 * Returns: [{
 *   login, fullName, role,
 *   currentLoad, newLoad, capacity, tolerance,
 *   currentStatus, newStatus,
 *   warning: boolean  // true if would become overloaded
 * }]
 */
export async function previewAddIssue(sprintName, issue) {
  const members = await calculateCapacity(sprintName);
  const efforts = getEfforts(issue);
  const assigneeLogin = getUserFieldLogin(issue, FIELDS.ASSIGNEE);
  const qaLogin = getUserFieldLogin(issue, FIELDS.QA);
  const affected = [];

  for (const member of members) {
    let additionalEffort = 0;

    if (member.login === assigneeLogin) {
      additionalEffort = getEffortForRole(efforts, member.role);
    }
    if (member.login === qaLogin) {
      additionalEffort += efforts.qa;
    }

    if (additionalEffort > 0) {
      const newLoad = member.load + additionalEffort;
      const newMember = { ...member, load: newLoad };
      affected.push({
        login: member.login,
        fullName: member.fullName,
        role: member.role,
        currentLoad: member.load,
        newLoad,
        additionalEffort,
        capacity: member.capacity,
        tolerance: member.tolerance,
        currentStatus: member.status,
        newStatus: getCapacityStatus(newMember),
        warning: newLoad > member.capacity + member.tolerance,
      });
    }
  }

  return affected;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getEffortForRole(efforts, role) {
  switch (role) {
    case "backend": return efforts.backend;
    case "frontend": return efforts.frontend;
    case "design": return efforts.design;
    case "manager": return efforts.manager;
    case "qa": return efforts.qa;
    default: return 0;
  }
}

function getCapacityStatus(member) {
  const { load, capacity, tolerance } = member;
  if (load > capacity + tolerance) return "over";
  if (load >= capacity - tolerance) return "optimal";
  if (load >= capacity * 0.4) return "under";
  return "empty";
}
