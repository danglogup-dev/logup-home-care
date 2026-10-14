import { useTerms } from "@/hooks/useTerms";
import { useState, useEffect, useMemo } from "react";
import {
  Users, AlertTriangle, ClipboardList, BookOpen, ChevronRight, ShieldCheck, ListChecks, Sparkles, Settings, HeartPulse, Building2,
} from "lucide-react";

import { NavLink } from "@/components/NavLink";
import { useLocation, Link } from "react-router-dom";
import LogUpLogo from "./LogUpLogo";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { canAccess, scopedSiteIds, type ModuleKey } from "@/lib/roleStore";
import { useSites, isHomeSupportOrg } from "@/lib/sitesStore";
import { useServiceUsers } from "@/lib/serviceUsersStore";
import { isModuleKeyReleased } from "@/lib/featureFlags";
import { useRole } from "@/hooks/useRole";

type SubItem = { title: string; url: string; key: ModuleKey };
type ModuleItem = {
  title: string;
  icon: typeof Users;
  basePath: string;
  defaultPath: string;
  subItems?: SubItem[];
  /** Permission key for single-link items. */
  key?: ModuleKey;
};

/**
 * Home Care primary navigation. Legacy residential modules (Insights, Events,
 * Care Planning, Audits, Tasks, Organisation, Team) are hidden here, not deleted;
 * their routes stay live for deep links.
 */
const homeCareModules: ModuleItem[] = [
  { title: "Home", icon: Sparkles, basePath: "/app/home", defaultPath: "/app/home", key: "insights.overview" },
  {
    title: "Schedule & Visits",
    icon: HeartPulse,
    basePath: "/app/visits",
    defaultPath: "/app/visits/live",
    subItems: [{ title: "Live visits", url: "/app/visits/live", key: "visits.live" }, { title: "Hours vs approved", url: "/app/visits/hours", key: "visits.hours" }],
  },
  { title: "Clients", icon: Users, basePath: "/app/org/service-users", defaultPath: "/app/org/service-users", key: "org.serviceUsers" },
  {
    title: "Policy Hub",
    icon: BookOpen,
    basePath: "/app/policies",
    defaultPath: "/app/policies/library",
    subItems: [
      { title: "Library", url: "/app/policies/library", key: "policies.library" },
      { title: "Approval Queue", url: "/app/policies/approvals", key: "policies.approvals" },
    ],
  },
  { title: "Workforce", icon: ShieldCheck, basePath: "/app/workforce", defaultPath: "/app/workforce/overview", key: "workforce.overview" },
];

const modules: ModuleItem[] = [
  {
    title: "Visits",
    icon: HeartPulse,
    basePath: "/app/visits",
    defaultPath: "/app/visits/live",
    subItems: [{ title: "Live visits", url: "/app/visits/live", key: "visits.live" }, { title: "Hours vs approved", url: "/app/visits/hours", key: "visits.hours" }],
  },
  {
    title: "Insights",
    icon: Sparkles,
    basePath: "/app/insights",
    defaultPath: "/app/insights/overview",
    subItems: [
      { title: "Overview", url: "/app/insights/overview", key: "insights.overview" },
    ],
  },
  {
    title: "Events",
    icon: AlertTriangle,
    basePath: "/app/incidents",
    defaultPath: "/app/incidents/overview",
    subItems: [
      { title: "Overview", url: "/app/incidents/overview", key: "incidents.overview" },
      { title: "Board", url: "/app/incidents/board", key: "incidents.board" },
      { title: "Log an Event", url: "/app/incidents/capture", key: "incidents.capture" },
      { title: "My reports", url: "/app/incidents/mine", key: "incidents.capture" },
      { title: "Reporting", url: "/app/incidents/reporting", key: "incidents.reporting" },
    ],
  },
  {
    title: "Care Planning",
    icon: HeartPulse,
    basePath: "/app/care-plans",
    defaultPath: "/app/care-plans/overview",
    subItems: [
      { title: "Overview", url: "/app/care-plans/overview", key: "carePlans.overview" },
      { title: "Create a Care Plan", url: "/app/care-plans/create", key: "carePlans.create" },
      { title: "Care Plans", url: "/app/care-plans/plans", key: "carePlans.people" },
      { title: "Reviews & Approvals", url: "/app/care-plans/reviews-approvals", key: "carePlans.reviews" },
      { title: "Access & Contributors", url: "/app/care-plans/access-contributors", key: "carePlans.access" },
      { title: "Templates", url: "/app/care-plans/templates", key: "carePlans.templates" },
      { title: "Reporting", url: "/app/care-plans/reporting", key: "carePlans.reporting" },
    ],
  },

  {
    title: "Audits",
    icon: ClipboardList,
    basePath: "/app/audits",
    defaultPath: "/app/audits/overview",
    subItems: [
      { title: "Overview", url: "/app/audits/overview", key: "audits.overview" },
      { title: "My audits", url: "/app/audits/my", key: "audits.my" },
      { title: "Templates", url: "/app/audits/templates", key: "audits.templates" },
      { title: "Reporting", url: "/app/audits/reporting", key: "audits.reporting" },
    ],
  },
  {
    title: "Tasks & Follow-up",
    icon: ListChecks,
    basePath: "/app/tasks",
    defaultPath: "/app/tasks/today",
    subItems: [
      { title: "Today", url: "/app/tasks/today", key: "tasks.today" },
      { title: "Overview", url: "/app/tasks/overview", key: "tasks.overview" },
      { title: "Task Register", url: "/app/tasks/register", key: "tasks.register" },
      { title: "Recurring Setup", url: "/app/tasks/recurring", key: "tasks.recurring" },
      { title: "Reporting", url: "/app/tasks/reporting", key: "tasks.reporting" },
    ],
  },
  {
    title: "Policy Hub",
    icon: BookOpen,
    basePath: "/app/policies",
    defaultPath: "/app/policies/library",
    subItems: [
      { title: "Library", url: "/app/policies/library", key: "policies.library" },
      { title: "Approval Queue", url: "/app/policies/approvals", key: "policies.approvals" },
    ],
  },
  {
    title: "Workforce",
    icon: ShieldCheck,
    basePath: "/app/workforce",
    defaultPath: "/app/workforce/overview",
    subItems: [
      { title: "Overview", url: "/app/workforce/overview", key: "workforce.overview" },
      { title: "Staff Qualifications", url: "/app/workforce/qualifications", key: "workforce.qualifications" },
      { title: "Site Requirements", url: "/app/workforce/requirements", key: "workforce.requirements" },
      { title: "Shift Coverage", url: "/app/workforce/coverage", key: "workforce.coverage" },
      { title: "Reporting", url: "/app/workforce/reporting", key: "workforce.reporting" },
    ],
  },
  {
    title: "Organisation",
    icon: Building2,
    basePath: "/app/org",
    defaultPath: "/app/org/sites",
    subItems: [
      { title: "Sites", url: "/app/org/sites", key: "org.sites" },
      { title: "Service users", url: "/app/org/service-users", key: "org.serviceUsers" },
    ],
  },
  {
    title: "Admin",
    icon: Settings,
    basePath: "/app/admin",
    defaultPath: "/app/admin/event-types",
    subItems: [
      { title: "Event Type Settings", url: "/app/admin/event-types", key: "admin.eventTypes" },
      { title: "Workflows", url: "/app/admin/workflows", key: "admin.workflows" },
      { title: "Care Plan Approval Chains", url: "/app/admin/care-plan-approval-chains", key: "admin.approvalChains" },
      { title: "Data Health", url: "/app/admin/data-health", key: "admin.dataHealth" },
      { title: "Organisation settings", url: "/app/admin/settings", key: "admin.settings" },
    ],
  },
  {
    title: "Team",
    icon: Users,
    basePath: "/app/team",
    defaultPath: "/app/team",
  },
];

export function AppSidebar() {
  const terms = useTerms();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const role = useRole();
  const orgSites = useSites();
  const homeSupport = isHomeSupportOrg(orgSites);
  const { users: orgUsers } = useServiceUsers();
  const orgScope = new Set<string>(scopedSiteIds(role));
  const orgSiteCount = orgSites.filter((x) => x.status === "active" && orgScope.has(x.id)).length;
  const orgResidentCount = orgUsers.filter((u) => orgScope.has(u.siteId) && (u.status === "active" || u.status === "temporary_absence")).length;

  // Filter modules and sub-items by role. Hide a module entirely if it has
  // sub-items and none of them are accessible. Team is always visible.
  const visibleModules = useMemo<ModuleItem[]>(() => {
    const source = homeSupport
      ? [...homeCareModules, ...modules.filter((m) => m.title === "Admin")]
      : modules;
    return source
      .filter((m) => !m.key || (isModuleKeyReleased(m.key) && canAccess(m.key, role.role)))
      .map((m) => {
        if (m.key === "org.serviceUsers") return { ...m, title: terms.Plural };
        if (!m.subItems) return m;
        const subs = m.subItems
          .filter((s) => isModuleKeyReleased(s.key) && canAccess(s.key, role.role))
          // Shift coverage is a residential rota concept; hidden (not deleted) for home support.
          .filter((s) => !(s.key === "workforce.coverage" && homeSupport))
          .map((s) => (s.key === "org.serviceUsers" ? { ...s, title: terms.Plural } : s));
        return { ...m, subItems: subs, defaultPath: subs[0]?.url || m.defaultPath };
      })
      .filter((m) => !m.subItems || m.subItems.length > 0);
  }, [role.role, terms, homeSupport]);

  const [openModules, setOpenModules] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    modules.forEach((m) => {
      if (m.subItems && location.pathname.startsWith(m.basePath)) initial[m.title] = true;
    });
    return initial;
  });

  // Auto-open the active module section when route changes
  useEffect(() => {
    setOpenModules((prev) => {
      const next = { ...prev };
      modules.forEach((m) => {
        if (m.subItems && location.pathname.startsWith(m.basePath)) {
          next[m.title] = true;
        }
      });
      return next;
    });
  }, [location.pathname]);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarContent className="pt-5">
        <div className={`mb-6 ${collapsed ? 'px-2' : 'px-4'}`}>
          <div className={collapsed ? 'flex justify-center py-1' : 'flex items-center py-2'}>
            {collapsed
              ? <LogUpLogo variant="mark" size="md" />
              : <LogUpLogo variant="horizontal" size="md" />}
          </div>
          {!collapsed && (
            <div className="mt-3 rounded-xl bg-secondary p-3">
              <p className="text-xs font-medium text-foreground">Oakfield Care Group</p>
              <p className="text-xs text-muted-foreground mt-0.5">{orgSiteCount} {orgSiteCount === 1 ? "site" : "sites"} · {terms.count(orgResidentCount)}</p>
            </div>
          )}
        </div>

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleModules.map((mod) => {
                const isActive = location.pathname.startsWith(mod.basePath);
                const Icon = mod.icon;

                // Simple item (Team) or collapsed rail
                if (!mod.subItems || collapsed) {
                  const target = mod.subItems ? mod.defaultPath : mod.basePath;
                  return (
                    <SidebarMenuItem key={mod.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <NavLink
                          to={target}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-primary/10 text-primary'
                              : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                          }`}
                          activeClassName=""
                        >
                          <Icon className="h-5 w-5 shrink-0" />
                          {!collapsed && <span>{mod.title}</span>}
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }

                // Expandable module
                const open = !!openModules[mod.title];
                return (
                  <SidebarMenuItem key={mod.title}>
                    <Collapsible
                      open={open}
                      onOpenChange={(v) => setOpenModules((p) => ({ ...p, [mod.title]: v }))}
                    >
                      <div className="flex items-center">
                        <SidebarMenuButton asChild isActive={isActive} className="flex-1">
                          <Link
                            to={mod.defaultPath}
                            onClick={(e) => {
                              if (isActive) {
                                e.preventDefault();
                                setOpenModules((p) => ({ ...p, [mod.title]: !p[mod.title] }));
                              } else {
                                setOpenModules((p) => ({ ...p, [mod.title]: true }));
                              }
                            }}
                            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                            }`}
                          >
                            <Icon className="h-5 w-5 shrink-0" />
                            <span className="flex-1">{mod.title}</span>
                          </Link>
                        </SidebarMenuButton>
                        <CollapsibleTrigger
                          aria-label={`Toggle ${mod.title}`}
                          className={`mr-1 grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground transition-transform ${
                            open ? 'rotate-90' : ''
                          }`}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <ul className="mt-1 ml-4 pl-3 border-l border-sidebar-border space-y-0.5">
                          {mod.subItems.map((sub) => {
                            const subActive = location.pathname === sub.url || location.pathname.startsWith(sub.url + '/');
                            return (
                              <li key={sub.url}>
                                <NavLink
                                  to={sub.url}
                                  className={`block rounded-md px-3 py-1.5 text-[13px] transition-colors ${
                                    subActive
                                      ? 'bg-primary/10 text-primary font-medium'
                                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                  }`}
                                  activeClassName=""
                                >
                                  {sub.title}
                                </NavLink>
                              </li>
                            );
                          })}
                        </ul>
                      </CollapsibleContent>
                    </Collapsible>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
