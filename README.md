# Sprint Planner Backend — Extranet Delivery

## Architecture

```
src/
├── config/
│   └── fields.js              # YouTrack field names, types, whitelist
├── mock/
│   └── mock-data.js           # Mock data in exact YouTrack API format
├── api/
│   └── youtrack-client.js     # API client (mock → real swap point)
├── services/
│   ├── backlog-service.js     # Sorting, filtering, plan/unplan
│   ├── capacity-service.js    # Team load calculations
│   └── metrics-service.js     # Sprint completion metrics
└── index.js                   # Public API entry point
```

## Key Design Decisions

### 1. YouTrack API Response Format
All mock data uses **exact YouTrack REST API response format**:
- `customFields` array with `name`, `$type`, `value`
- User entities with `login`, `fullName`, `$type: "User"`
- Sprint entities with `id`, `name`, `$type: "Sprint"`

This means **zero data transformation** when switching to real API.

### 2. Write Whitelist
Only three fields can be modified (defined in `config/fields.js`):
- `Assignee` — reassign developer
- `QA` — reassign QA engineer
- `EXT Sprint` — add/remove from sprint

Any attempt to write other fields throws an error.

### 3. Field Name Accuracy
All field names exactly match the Extranet Delivery project in YouTrack:
- `Backend Effort`, `Frontend Effort`, `QA Effort`, `Design Effort`, `Manager effort`
- `Total Priority` (float) for backlog sorting
- `• Reopen counter` for metrics (note the bullet character)
- `EXT Sprint` (version multi) as the only sprint field

### 4. Effort Model
No story points. Capacity is calculated per-role from effort fields:
- Assignee's effort = Backend/Frontend/Design/Manager effort (based on their role)
- QA's effort = QA Effort field
- Each team member has capacity ± tolerance (e.g., 20±2 SP)

## Switching to Real YouTrack API

When ready, replace method bodies in `youtrack-client.js`:

```javascript
// BEFORE (mock):
export async function getBacklogIssues() {
  await delay();
  return _issues.filter(/* ... */);
}

// AFTER (real):
export async function getBacklogIssues() {
  const response = await fetch(
    `${BASE_URL}/api/issues?` +
    `query=${encodeURIComponent('project:ED State:Backlog')}&` +
    `fields=${ISSUES_QUERY_FIELDS}&` +
    `$top=100`,
    { headers: AUTH_HEADERS }
  );
  return response.json();
}
```

The services layer and frontend need **no changes** — they consume
the same data format.

## Running the Demo

```bash
node demo.js
```

Exercises all methods: backlog retrieval, filtering, sprint planning,
capacity calculation, metrics, reassignment, and security checks.
# sprintplanner
