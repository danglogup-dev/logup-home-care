import { eventId } from "./demoScenario";
// Tasks & Follow-up store — operational tasks for regulated care settings.
// In-memory store, demo-only. Subscribe pattern matches workforceStore.

export type TaskType = "recurring" | "follow_up" | "one_off";
export type TaskSourceType = "manual" | "incident" | "audit" | "recurring_template";
export type TaskStatus = "open" | "in_progress" | "completed" | "skipped";
export type TaskPriority = "low" | "normal" | "high";
export type Recurrence = "daily" | "weekly" | "monthly" | "custom";
// 0 = Sunday … 6 = Saturday (matches Date.getDay)
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TaskOwnership = "person" | "location";

export interface ActivityEntry {
  at: string; // ISO
  by: string;
  message: string;
}

export interface TaskAttachment {
  id: string;
  kind: "photo" | "file";
  name: string;
  // Data URL for demo (no backend); small previews only.
  dataUrl?: string;
  caption?: string;
  addedById: string;
  addedAt: string;
}

export interface TaskRecord {
  id: string;
  title: string;
  description?: string;
  taskType: TaskType;
  sourceType: TaskSourceType;
  sourceRef?: string; // e.g. eventId("paddy-fall-2d"), "AUDIT-2025-03"
  // Primary site/unit (kept for back-compat and as the "first" location).
  siteId: string;
  unitId?: string;
  // New: a task may apply to multiple sites/units.
  siteIds?: string[];
  unitIds?: string[];
  // Ownership: "person" = assigned to a named user; "location" = owned by site/unit, any on-shift staff can complete.
  // Optional for back-compat — falls back to "person" when assigneeId is set, else "location".
  ownership?: TaskOwnership;
  // For person-owned tasks. For location-owned tasks this is "" (or ignored).
  assigneeId: string;
  assignedById: string;
  dueAt: string; // ISO
  recurrence?: Recurrence;
  recurringTemplateId?: string;
  priority: TaskPriority;
  status: TaskStatus;
  completionNote?: string;
  skippedReason?: string;
  completedAt?: string;
  // Who actually completed/skipped (esp. relevant for location-owned tasks).
  completedById?: string;
  skippedById?: string;
  attachments?: TaskAttachment[];
  activity: ActivityEntry[];
  createdAt: string;
}

export interface RecurringTemplate {
  id: string;
  title: string;
  description?: string;
  taskType: TaskType; // typically "recurring"
  // Primary (first) location — back-compat.
  siteId: string;
  unitId?: string;
  // New: recurring tasks can target multiple sites/units.
  siteIds: string[];
  unitIds: string[];
  defaultAssigneeId: string;
  frequency: Recurrence;
  // New: multiple due times per day (e.g. ["08:00","16:00"]).
  dueTimes: string[];
  // For "weekly" / "custom": weekdays the task occurs on (0=Sun..6=Sat).
  weekdays?: Weekday[];
  // Legacy single time (kept for back-compat — equals dueTimes[0]).
  dueTime: string;
  active: boolean;
  createdAt: string;
}

export interface Site {
  id: string;
  name: string;
  units: { id: string; name: string }[];
}

export interface StaffRef {
  id: string;
  name: string;
  role: string;
}

// ---------- Reference data ----------
export const SITES: Site[] = [
  {
    id: "site-oak",
    name: "Oakfield Manor",
    units: [
      { id: "unit-oak-gf", name: "Ground Floor" },
      { id: "unit-oak-1f", name: "First Floor" },
    ],
  },
  {
    id: "site-rose",
    name: "Riverside Lodge",
    units: [
      { id: "unit-rose-a", name: "Wing A" },
      { id: "unit-rose-b", name: "Wing B" },
    ],
  },
  {
    id: "site-elm",
    name: "Elm Grove House",
    units: [{ id: "unit-elm-main", name: "Main Unit" }],
  },
];

export const STAFF: StaffRef[] = [
  { id: "u-ana", name: "Ana Murphy", role: "PIC" },
  { id: "u-james", name: "James O'Connor", role: "Senior Care Lead" },
  { id: "u-priya", name: "Priya Shah", role: "Care Lead" },
  { id: "u-tom", name: "Tom Walsh", role: "Maintenance" },
  { id: "u-lena", name: "Lena Kowalski", role: "Care Assistant" },
  { id: "u-marco", name: "Marco Silva", role: "Night Lead" },
];

// ---------- Helpers ----------
const todayISO = (offsetDays = 0, hours = 9, minutes = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
};

export const siteName = (id: string) => SITES.find(s => s.id === id)?.name ?? id;
// Units are intentionally hidden in the current demo UI (site-only geography).
// Kept in the type system to preserve future support.
export const unitName = (_siteId: string, _unitId?: string) => "";
export const staffName = (id: string) => STAFF.find(s => s.id === id)?.name ?? id;

export const isOverdue = (t: TaskRecord) =>
  (t.status === "open" || t.status === "in_progress") && new Date(t.dueAt).getTime() < Date.now();

export const effectiveStatus = (t: TaskRecord): TaskStatus | "overdue" =>
  isOverdue(t) ? "overdue" : t.status;

export const statusLabel = (s: TaskStatus | "overdue") =>
  ({
    open: "Open",
    in_progress: "In progress",
    completed: "Completed",
    skipped: "Skipped",
    overdue: "Overdue",
  }[s]);

export const statusBadgeClass = (s: TaskStatus | "overdue") =>
  ({
    open: "bg-primary/10 text-primary border-primary/20",
    in_progress: "bg-warning/10 text-warning border-warning/20",
    completed: "bg-success/10 text-success border-success/20",
    skipped: "bg-secondary text-muted-foreground border-border",
    overdue: "bg-destructive/10 text-destructive border-destructive/20",
  }[s]);

export const taskTypeLabel = (t: TaskType) =>
  ({ recurring: "Recurring", follow_up: "Follow-up", one_off: "One-off" }[t]);

export const sourceLabel = (s: TaskSourceType) =>
  ({
    manual: "Manual",
    incident: "Incident",
    audit: "Audit",
    recurring_template: "Recurring",
  }[s]);

// ---------- Multi-location & recurrence helpers ----------
export const WEEKDAY_LABELS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LABELS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const formatList = (items: string[]): string => {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
};

/** Human-readable summary for a RecurringTemplate, e.g. "Every Monday and Friday at 09:00 and 17:00". */
export const recurrenceSummary = (t: Pick<RecurringTemplate, "frequency" | "dueTimes" | "weekdays" | "dueTime">): string => {
  const times = (t.dueTimes && t.dueTimes.length ? t.dueTimes : [t.dueTime]).filter(Boolean);
  const timePart = times.length ? ` at ${formatList(times)}` : "";
  if (t.frequency === "daily") return `Daily${timePart}`;
  if (t.frequency === "monthly") return `Monthly${timePart}`;
  if (t.frequency === "weekly" || t.frequency === "custom") {
    const days = (t.weekdays ?? []).slice().sort();
    if (days.length === 0) return `Weekly${timePart}`;
    if (days.length === 7) return `Daily${timePart}`;
    const dayLabels = days.map(d => WEEKDAY_LABELS_LONG[d]);
    const prefix = t.frequency === "weekly" ? "Weekly on" : "Every";
    return `${prefix} ${formatList(dayLabels)}${timePart}`;
  }
  return `Scheduled${timePart}`;
};

/** Resolve site IDs for a task or template (uses array form, falls back to single). */
export const taskSiteIds = (t: { siteIds?: string[]; siteId: string }): string[] =>
  t.siteIds && t.siteIds.length ? t.siteIds : [t.siteId];

export const taskUnitIds = (t: { unitIds?: string[]; unitId?: string }): string[] =>
  t.unitIds && t.unitIds.length ? t.unitIds : (t.unitId ? [t.unitId] : []);

/** Format the locations of a task/template. Site-only in current demo. */
export const formatLocations = (t: { siteIds?: string[]; siteId: string; unitIds?: string[]; unitId?: string }): string => {
  const siteIds = taskSiteIds(t);
  if (siteIds.length > 1) return `${siteIds.length} sites`;
  return siteName(siteIds[0]);
};

// ---------- Ownership & current user (demo) ----------
/** Resolve effective ownership: explicit field, otherwise inferred from assignee presence. */
export const taskOwnership = (t: Pick<TaskRecord, "ownership" | "assigneeId">): TaskOwnership =>
  t.ownership ?? (t.assigneeId ? "person" : "location");

export const ownershipLabel = (o: TaskOwnership) =>
  o === "person" ? "Assigned to person" : "Owned by location";

/** Demo "logged-in" user. Drives My Tasks / House Tasks views. */
export const CURRENT_USER: StaffRef & { onShiftSiteIds: string[]; onShiftUnitIds: string[] } = {
  id: "u-priya",
  name: "Priya Shah",
  role: "Care Lead",
  // Sites/units the user is currently rostered on (demo).
  onShiftSiteIds: ["site-oak"],
  onShiftUnitIds: ["unit-oak-gf", "unit-oak-1f"],
};

/** True if a task is directly assigned to the given user (person-owned). */
export const isAssignedToUser = (t: TaskRecord, userId: string): boolean =>
  taskOwnership(t) === "person" && t.assigneeId === userId;

/** True if a task is location-owned and overlaps the user's on-shift sites/units. */
export const isHouseTaskForUser = (
  t: TaskRecord,
  ctx: { onShiftSiteIds: string[]; onShiftUnitIds: string[] }
): boolean => {
  if (taskOwnership(t) !== "location") return false;
  const sIds = taskSiteIds(t);
  const uIds = taskUnitIds(t);
  const siteOverlap = sIds.some(s => ctx.onShiftSiteIds.includes(s));
  if (!siteOverlap) return false;
  // If task is unit-scoped, also require unit overlap; otherwise site overlap is enough.
  if (uIds.length === 0) return true;
  return uIds.some(u => ctx.onShiftUnitIds.includes(u));
};

// ---------- Seed data ----------
const uid = (() => {
  let n = 1;
  return (p: string) => `${p}-${(n++).toString().padStart(4, "0")}`;
})();

// Normalize a partial template (with legacy fields) into a full RecurringTemplate.
const normalizeTemplate = (t: Omit<RecurringTemplate, "siteIds" | "unitIds" | "dueTimes"> & {
  siteIds?: string[]; unitIds?: string[]; dueTimes?: string[];
}): RecurringTemplate => {
  const siteIds = t.siteIds && t.siteIds.length ? t.siteIds : [t.siteId];
  const unitIds = t.unitIds && t.unitIds.length ? t.unitIds : (t.unitId ? [t.unitId] : []);
  const dueTimes = t.dueTimes && t.dueTimes.length ? t.dueTimes : [t.dueTime];
  return {
    ...t,
    siteId: siteIds[0],
    unitId: unitIds[0],
    siteIds, unitIds, dueTimes,
    dueTime: dueTimes[0],
  };
};

const seedTemplates: RecurringTemplate[] = [
  normalizeTemplate({
    id: uid("tpl"),
    title: "Daily fire panel check",
    description: "Inspect fire panel; log faults; sign register.",
    taskType: "recurring",
    siteId: "site-oak", unitId: "unit-oak-gf",
    defaultAssigneeId: "u-james",
    frequency: "daily",
    dueTime: "09:00",
    active: true,
    createdAt: todayISO(-30),
  }),
  normalizeTemplate({
    id: uid("tpl"),
    title: "Medication fridge temperature check",
    description: "Record morning and evening temperatures (2–8°C).",
    taskType: "recurring",
    siteId: "site-oak", unitId: "unit-oak-1f",
    siteIds: ["site-oak"], unitIds: ["unit-oak-1f"],
    dueTimes: ["08:00", "16:00"],
    defaultAssigneeId: "u-priya",
    frequency: "daily",
    dueTime: "08:00",
    active: true,
    createdAt: todayISO(-30),
  }),
  normalizeTemplate({
    id: uid("tpl"),
    title: "Environment walkaround",
    description: "Walk all communal areas; flag hazards.",
    taskType: "recurring",
    siteId: "site-rose", unitId: "unit-rose-a",
    defaultAssigneeId: "u-ana",
    frequency: "daily",
    dueTime: "10:00",
    active: true,
    createdAt: todayISO(-30),
  }),
  normalizeTemplate({
    id: uid("tpl"),
    title: "PPE & hand hygiene stock check",
    description: "Verify gloves, aprons, sanitiser per station.",
    taskType: "recurring",
    siteId: "site-elm", unitId: "unit-elm-main",
    defaultAssigneeId: "u-lena",
    frequency: "weekly",
    weekdays: [1], // Monday
    dueTime: "11:00",
    active: true,
    createdAt: todayISO(-30),
  }),
  normalizeTemplate({
    id: uid("tpl"),
    title: "Emergency equipment check",
    description: "Test call bells, oxygen, evacuation chair across all sites.",
    taskType: "recurring",
    siteId: "site-oak",
    siteIds: ["site-oak", "site-rose", "site-elm"],
    defaultAssigneeId: "u-tom",
    frequency: "custom",
    weekdays: [1, 3, 5], // Mon, Wed, Fri
    dueTime: "14:00",
    active: true,
    createdAt: todayISO(-60),
  }),
];

const seedTasks: TaskRecord[] = [
  // Today — recurring, open
  {
    id: uid("tsk"),
    title: "Daily fire panel check",
    description: "Inspect fire panel; log faults; sign register.",
    taskType: "recurring",
    sourceType: "recurring_template",
    sourceRef: seedTemplates[0].id,
    recurringTemplateId: seedTemplates[0].id,
    siteId: "site-oak",
    unitId: "unit-oak-gf",
    assigneeId: "u-james",
    assignedById: "u-ana",
    dueAt: todayISO(0, 9, 0),
    recurrence: "daily",
    priority: "normal",
    ownership: "location",
    status: "open",
    activity: [{ at: todayISO(0, 7, 0), by: "system", message: "Auto-generated from recurring template." }],
    createdAt: todayISO(0, 7, 0),
  },
  // Today — fridge temp, in progress
  {
    id: uid("tsk"),
    title: "Medication fridge temperature check",
    description: "Record morning and evening temperatures (2–8°C).",
    taskType: "recurring",
    sourceType: "recurring_template",
    recurringTemplateId: seedTemplates[1].id,
    siteId: "site-oak",
    unitId: "unit-oak-1f",
    assigneeId: "u-priya",
    assignedById: "u-ana",
    dueAt: todayISO(0, 8, 30),
    recurrence: "daily",
    priority: "high",
    ownership: "location",
    status: "in_progress",
    activity: [
      { at: todayISO(0, 7, 0), by: "system", message: "Auto-generated from recurring template." },
      { at: todayISO(0, 8, 35), by: "Priya Shah", message: "Started check." },
    ],
    createdAt: todayISO(0, 7, 0),
  },
  // Overdue
  {
    id: uid("tsk"),
    title: "Replace broken call bell — Room 14",
    description: "Maintenance to replace faulty call bell unit.",
    taskType: "one_off",
    sourceType: "manual",
    siteId: "site-oak",
    unitId: "unit-oak-1f",
    assigneeId: "u-tom",
    assignedById: "u-ana",
    dueAt: todayISO(-2, 12, 0),
    priority: "high",
    status: "open",
    activity: [{ at: todayISO(-3, 9, 0), by: "Ana Murphy", message: "Task created." }],
    createdAt: todayISO(-3, 9, 0),
  },
  // Incident-linked follow-up, due tomorrow
  {
    id: uid("tsk"),
    title: "GP follow-up — fall, Resident M.K.",
    description: "Contact GP and document advice; update care plan.",
    taskType: "follow_up",
    sourceType: "incident",
    sourceRef: eventId("paddy-fall-2d"),
    siteId: "site-rose",
    unitId: "unit-rose-a",
    assigneeId: "u-ana",
    assignedById: "u-ana",
    dueAt: todayISO(1, 11, 0),
    priority: "high",
    status: "open",
    activity: [{ at: todayISO(0, 8, 0), by: "Ana Murphy", message: `Created from incident ${eventId("paddy-fall-2d")}.` }],
    createdAt: todayISO(0, 8, 0),
  },
  // Audit-linked corrective action, upcoming
  {
    id: uid("tsk"),
    title: "Update infection control signage in laundry",
    description: "Corrective action from infection control audit.",
    taskType: "follow_up",
    sourceType: "audit",
    sourceRef: "AUDIT-2025-03",
    siteId: "site-elm",
    unitId: "unit-elm-main",
    assigneeId: "u-lena",
    assignedById: "u-ana",
    dueAt: todayISO(3, 15, 0),
    priority: "normal",
    status: "open",
    activity: [{ at: todayISO(-1, 14, 0), by: "Ana Murphy", message: "Created from AUDIT-2025-03." }],
    createdAt: todayISO(-1, 14, 0),
  },
  // Completed today
  {
    id: uid("tsk"),
    title: "Environment walkaround",
    taskType: "recurring",
    sourceType: "recurring_template",
    recurringTemplateId: seedTemplates[2].id,
    siteId: "site-rose",
    unitId: "unit-rose-a",
    assigneeId: "u-ana",
    assignedById: "u-ana",
    dueAt: todayISO(0, 10, 0),
    recurrence: "daily",
    priority: "normal",
    ownership: "location",
    status: "completed",
    completedAt: todayISO(0, 10, 22),
    completionNote: "All clear. No hazards.",
    activity: [
      { at: todayISO(0, 7, 0), by: "system", message: "Auto-generated." },
      { at: todayISO(0, 10, 22), by: "Ana Murphy", message: "Marked completed." },
    ],
    createdAt: todayISO(0, 7, 0),
  },
  // Skipped yesterday with reason
  {
    id: uid("tsk"),
    title: "PPE & hand hygiene stock check",
    taskType: "recurring",
    sourceType: "recurring_template",
    recurringTemplateId: seedTemplates[3].id,
    siteId: "site-elm",
    unitId: "unit-elm-main",
    assigneeId: "u-lena",
    assignedById: "u-ana",
    dueAt: todayISO(-1, 11, 0),
    recurrence: "weekly",
    priority: "normal",
    ownership: "location",
    status: "skipped",
    skippedReason: "Supplier delivery delayed; rescheduled.",
    activity: [
      { at: todayISO(-1, 7, 0), by: "system", message: "Auto-generated." },
      { at: todayISO(-1, 16, 0), by: "Lena Kowalski", message: "Marked skipped." },
    ],
    createdAt: todayISO(-1, 7, 0),
  },
  // Completed yesterday
  {
    id: uid("tsk"),
    title: "Daily fire panel check",
    taskType: "recurring",
    sourceType: "recurring_template",
    recurringTemplateId: seedTemplates[0].id,
    siteId: "site-oak",
    unitId: "unit-oak-gf",
    assigneeId: "u-james",
    assignedById: "u-ana",
    dueAt: todayISO(-1, 9, 0),
    recurrence: "daily",
    priority: "normal",
    ownership: "location",
    status: "completed",
    completedAt: todayISO(-1, 9, 12),
    completionNote: "Panel normal. No faults.",
    activity: [
      { at: todayISO(-1, 7, 0), by: "system", message: "Auto-generated." },
      { at: todayISO(-1, 9, 12), by: "James O'Connor", message: "Marked completed." },
    ],
    createdAt: todayISO(-1, 7, 0),
  },
  // Upcoming one-off
  {
    id: uid("tsk"),
    title: "Deep clean Room 22",
    description: "Following resident discharge.",
    taskType: "one_off",
    sourceType: "manual",
    siteId: "site-oak",
    unitId: "unit-oak-1f",
    assigneeId: "u-lena",
    assignedById: "u-ana",
    dueAt: todayISO(2, 13, 0),
    priority: "normal",
    status: "open",
    activity: [{ at: todayISO(0, 9, 0), by: "Ana Murphy", message: "Task created." }],
    createdAt: todayISO(0, 9, 0),
  },
  // Night-shift recurring overdue
  {
    id: uid("tsk"),
    title: "Night safety walkaround",
    description: "Check fire doors, exits, resident wellbeing.",
    taskType: "recurring",
    sourceType: "recurring_template",
    siteId: "site-rose",
    unitId: "unit-rose-b",
    assigneeId: "u-marco",
    assignedById: "u-ana",
    dueAt: todayISO(-1, 23, 0),
    recurrence: "daily",
    priority: "high",
    ownership: "location",
    status: "open",
    activity: [{ at: todayISO(-1, 20, 0), by: "system", message: "Auto-generated." }],
    createdAt: todayISO(-1, 20, 0),
  },
];

// ---------- State + subscribe ----------
let tasks: TaskRecord[] = [...seedTasks];
let templates: RecurringTemplate[] = [...seedTemplates];
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

// ---------- Selectors ----------
export const getTasks = () => tasks;
export const getTemplates = () => templates;
export const getTask = (id: string) => tasks.find(t => t.id === id);

// ---------- Mutations ----------
export const createTask = (
  input: Omit<TaskRecord, "id" | "status" | "activity" | "createdAt"> &
    Partial<Pick<TaskRecord, "status">>
): TaskRecord => {
  const t: TaskRecord = {
    ...input,
    id: uid("tsk"),
    status: input.status ?? "open",
    activity: [{ at: new Date().toISOString(), by: staffName(input.assignedById), message: "Task created." }],
    createdAt: new Date().toISOString(),
  };
  tasks = [t, ...tasks];
  emit();
  return t;
};

export const updateTask = (id: string, patch: Partial<TaskRecord>, who = "Ana Murphy", note?: string) => {
  tasks = tasks.map(t => {
    if (t.id !== id) return t;
    const next: TaskRecord = { ...t, ...patch };
    if (note) next.activity = [...t.activity, { at: new Date().toISOString(), by: who, message: note }];
    return next;
  });
  emit();
};

export const completeTask = (id: string, completionNote: string | undefined, who: string, whoId?: string) => {
  updateTask(
    id,
    { status: "completed", completionNote, completedAt: new Date().toISOString(), completedById: whoId },
    who,
    "Marked completed." + (completionNote ? ` Note: ${completionNote}` : "")
  );
};

export const skipTask = (id: string, reason: string | undefined, who: string, whoId?: string) => {
  updateTask(
    id,
    { status: "skipped", skippedReason: reason, skippedById: whoId },
    who,
    "Marked skipped." + (reason ? ` Reason: ${reason}` : "")
  );
};

export const startTask = (id: string, who: string) => {
  updateTask(id, { status: "in_progress" }, who, "Marked in progress.");
};

export const reassignTask = (id: string, assigneeId: string, who: string) => {
  updateTask(id, { assigneeId, ownership: "person" }, who, `Reassigned to ${staffName(assigneeId)}.`);
};

export const rescheduleTask = (id: string, dueAt: string, who: string) => {
  updateTask(id, { dueAt }, who, `Rescheduled to ${new Date(dueAt).toLocaleString()}.`);
};

export const addAttachment = (
  id: string,
  attachment: Omit<TaskAttachment, "id" | "addedAt">,
  who: string
) => {
  const att: TaskAttachment = {
    ...attachment,
    id: uid("att"),
    addedAt: new Date().toISOString(),
  };
  tasks = tasks.map(t => {
    if (t.id !== id) return t;
    const next: TaskRecord = {
      ...t,
      attachments: [...(t.attachments ?? []), att],
      activity: [
        ...t.activity,
        { at: att.addedAt, by: who, message: `${attachment.kind === "photo" ? "Photo" : "File"} added: ${attachment.name}${attachment.caption ? ` — ${attachment.caption}` : ""}` },
      ],
    };
    return next;
  });
  emit();
  return att;
};

export const addNote = (id: string, note: string, who: string) => {
  if (!note.trim()) return;
  updateTask(id, {}, who, `Note: ${note.trim()}`);
};

// ---------- Recurring templates ----------
export type CreateTemplateInput =
  Omit<RecurringTemplate, "id" | "createdAt" | "active" | "siteIds" | "unitIds" | "dueTimes" | "siteId" | "unitId" | "dueTime"> & {
    siteIds: string[];
    unitIds?: string[];
    dueTimes: string[];
    weekdays?: Weekday[];
    active?: boolean;
  };

export const createTemplate = (input: CreateTemplateInput): RecurringTemplate => {
  const siteIds = input.siteIds.length ? input.siteIds : [SITES[0].id];
  const unitIds = input.unitIds ?? [];
  const dueTimes = input.dueTimes.length ? input.dueTimes : ["09:00"];
  const tpl: RecurringTemplate = {
    ...input,
    siteIds, unitIds, dueTimes,
    siteId: siteIds[0],
    unitId: unitIds[0],
    dueTime: dueTimes[0],
    id: uid("tpl"),
    active: input.active ?? true,
    createdAt: new Date().toISOString(),
  };
  templates = [tpl, ...templates];
  emit();
  return tpl;
};

export const updateTemplate = (id: string, patch: Partial<RecurringTemplate>) => {
  templates = templates.map(t => {
    if (t.id !== id) return t;
    const next = { ...t, ...patch };
    // Keep legacy single-fields in sync with array fields.
    if (patch.siteIds) { next.siteIds = patch.siteIds; next.siteId = patch.siteIds[0] ?? t.siteId; }
    if (patch.unitIds) { next.unitIds = patch.unitIds; next.unitId = patch.unitIds[0]; }
    if (patch.dueTimes) { next.dueTimes = patch.dueTimes; next.dueTime = patch.dueTimes[0] ?? t.dueTime; }
    return next;
  });
  emit();
};

export const deleteTemplate = (id: string) => {
  templates = templates.filter(t => t.id !== id);
  emit();
};

// ---------- Reporting ----------
export interface ReportFilters {
  from?: string; // ISO
  to?: string;
  siteId?: string;
  unitId?: string;
  assigneeId?: string;
  taskType?: TaskType;
  status?: TaskStatus | "overdue";
}

export const runReport = (f: ReportFilters): TaskRecord[] => {
  return tasks.filter(t => {
    if (f.from && new Date(t.dueAt) < new Date(f.from)) return false;
    if (f.to && new Date(t.dueAt) > new Date(f.to)) return false;
    if (f.siteId && t.siteId !== f.siteId) return false;
    if (f.unitId && t.unitId !== f.unitId) return false;
    if (f.assigneeId && t.assigneeId !== f.assigneeId) return false;
    if (f.taskType && t.taskType !== f.taskType) return false;
    if (f.status) {
      const s = effectiveStatus(t);
      if (s !== f.status) return false;
    }
    return true;
  });
};

const csvEscape = (v: string) => `"${v.replace(/"/g, '""')}"`;

export const exportReportCsv = (rows: TaskRecord[]): string => {
  const head = [
    "Task ID", "Title", "Type", "Source", "Source Ref", "Site", "Unit",
    "Assignee", "Assigned by", "Due", "Status", "Priority", "Completed at",
    "Completion note", "Skipped reason",
  ];
  const lines = [head.map(csvEscape).join(",")];
  rows.forEach(t => {
    lines.push([
      t.id, t.title, taskTypeLabel(t.taskType), sourceLabel(t.sourceType), t.sourceRef ?? "",
      siteName(t.siteId), unitName(t.siteId, t.unitId), staffName(t.assigneeId),
      staffName(t.assignedById), new Date(t.dueAt).toLocaleString(),
      statusLabel(effectiveStatus(t)), t.priority,
      t.completedAt ? new Date(t.completedAt).toLocaleString() : "",
      t.completionNote ?? "", t.skippedReason ?? "",
    ].map(v => csvEscape(String(v))).join(","));
  });
  return lines.join("\n");
};

export const downloadCsv = (filename: string, csv: string) => {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------- React hook ----------
import { useEffect, useState } from "react";
export const useTasksStore = () => {
  const [, setN] = useState(0);
  useEffect(() => {
    const unsub = subscribe(() => setN(x => x + 1));
    return () => { unsub(); };
  }, []);
  return { tasks, templates };
};
