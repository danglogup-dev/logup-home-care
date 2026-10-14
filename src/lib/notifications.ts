import { eventId, fmtDate, daysAgo } from "./demoScenario";
// In-memory notifications store with subscription. Used by the prototype to
// demonstrate cross-module notifications (incidents, tasks, audits, workforce, policies).

import { AlertTriangle, ListChecks, ClipboardList, ShieldCheck, BookOpen, Bell } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NotificationKind =
  | "incident"
  | "action"
  | "task"
  | "audit"
  | "workforce"
  | "policy"
  | "system";

export type NotificationTone = "info" | "warning" | "destructive" | "success";

export interface Notification {
  id: string;
  kind: NotificationKind;
  tone: NotificationTone;
  title: string;
  body: string;
  href: string;            // where clicking the notification should take the user
  createdAt: string;       // display string, e.g. "12 Apr · 14:02"
  read: boolean;
  // Optional contextual ids (kept for back-compat / inspection)
  incidentId?: string;
  actionId?: string;
  assignee?: string;
}

type Listener = (n: Notification[]) => void;

export const NOTIFICATION_ICONS: Record<NotificationKind, LucideIcon> = {
  incident: AlertTriangle,
  action: AlertTriangle,
  task: ListChecks,
  audit: ClipboardList,
  workforce: ShieldCheck,
  policy: BookOpen,
  system: Bell,
};

export const TONE_CLASSES: Record<NotificationTone, { dot: string; icon: string; chip: string }> = {
  info:        { dot: "bg-primary",     icon: "text-primary",     chip: "bg-primary/10 text-primary border-primary/20" },
  warning:     { dot: "bg-warning",     icon: "text-warning",     chip: "bg-warning/10 text-warning border-warning/20" },
  destructive: { dot: "bg-destructive", icon: "text-destructive", chip: "bg-destructive/10 text-destructive border-destructive/20" },
  success:     { dot: "bg-success",     icon: "text-success",     chip: "bg-success/10 text-success border-success/20" },
};

const seed: Notification[] = [
  {
    id: "ntf-001",
    kind: "action",
    tone: "destructive",
    title: "Overdue action: Update medication round handover sheet",
    body: `${eventId("bridget-medication")} · @Claire Nolan — was due ${fmtDate(daysAgo(2))}`,
    href: `/app/incidents/board?eventId=${eventId("bridget-medication")}`,
    createdAt: "today · 08:12",
    read: false,
    incidentId: eventId("bridget-medication"),
    actionId: `${eventId("bridget-medication")}-A1`,
    assignee: "Claire Nolan",
  },
  {
    id: "ntf-002",
    kind: "task",
    tone: "warning",
    title: "Task overdue: Fridge temperature check",
    body: "Oakfield Manor — due 06:00",
    href: "/app/tasks/today",
    createdAt: "today · 07:05",
    read: false,
  },
  {
    id: "ntf-003",
    kind: "audit",
    tone: "info",
    title: "Audit assigned: Medication Management Q2",
    body: "Riverside Lodge · @Siobhán Kelly — due 18 Apr",
    href: "/app/audits/overview",
    createdAt: "yesterday · 16:40",
    read: false,
  },
  {
    id: "ntf-004",
    kind: "workforce",
    tone: "warning",
    title: "Qualification expiring soon",
    body: "Manual Handling · 3 staff expire within 30 days",
    href: "/app/workforce/qualifications",
    createdAt: "yesterday · 14:20",
    read: false,
  },
  {
    id: "ntf-005",
    kind: "policy",
    tone: "info",
    title: "Policy awaiting approval",
    body: "Falls Prevention v3 · submitted by Siobhán Kelly",
    href: "/app/policies/approvals",
    createdAt: "yesterday · 11:02",
    read: true,
  },
  {
    id: "ntf-006",
    kind: "incident",
    tone: "warning",
    title: "Notification deadline: NF06 due within 1 working day",
    body: `${eventId("eileen-safeguarding")} · Safeguarding · Riverside Lodge`,
    href: `/app/incidents/board?eventId=${eventId("eileen-safeguarding")}`,
    createdAt: "today · 07:30",
    read: false,
    incidentId: eventId("eileen-safeguarding"),
  },
  {
    id: "ntf-007",
    kind: "action",
    tone: "info",
    title: "Action assigned: Tissue viability nurse review",
    body: `@Fiona Healy — linked to ${eventId("tomas-pressure-ulcer")}`,
    href: `/app/incidents/board?eventId=${eventId("tomas-pressure-ulcer")}`,
    createdAt: "yesterday · 09:02",
    read: true,
    incidentId: eventId("tomas-pressure-ulcer"),
    actionId: `${eventId("tomas-pressure-ulcer")}-A1`,
    assignee: "Fiona Healy",
  },
  {
    id: "ntf-008",
    kind: "task",
    tone: "success",
    title: "Recurring task completed",
    body: "Daily handover sign-off · Elm Grove House",
    href: "/app/tasks/today",
    createdAt: "10 Apr · 22:10",
    read: true,
  },
];

let items: Notification[] = [...seed];
const listeners = new Set<Listener>();

const emit = () => listeners.forEach((l) => l([...items]));

export const notificationsStore = {
  get(): Notification[] {
    return [...items];
  },
  unreadCount(): number {
    return items.filter((n) => !n.read).length;
  },
  add(n: Omit<Notification, "id" | "read"> & { read?: boolean }) {
    items = [{ ...n, id: `ntf-${Date.now()}`, read: n.read ?? false }, ...items];
    emit();
  },
  markAllRead() {
    items = items.map((n) => ({ ...n, read: true }));
    emit();
  },
  markRead(id: string) {
    items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
    emit();
  },
  clear(id: string) {
    items = items.filter((n) => n.id !== id);
    emit();
  },
  subscribe(l: Listener) {
    listeners.add(l);
    l([...items]);
    return () => listeners.delete(l);
  },
};
