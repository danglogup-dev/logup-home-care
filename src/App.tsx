import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import SignIn from "./pages/SignIn";
import AppLayout from "./components/AppLayout";
import VisitsLayout from "./components/VisitsLayout";
import { VisitsToday, VisitClients, VisitsMe } from "./pages/visits/VisitPages";
import VisitDetail from "./pages/visits/VisitDetail";
import LiveVisits from "./pages/visits/LiveVisits";
import HoursReport from "./pages/visits/HoursReport";
import FamilyPortal from "./pages/family/FamilyPortal";
import { NotForHomeSupport } from "./components/NotForHomeSupport";
import Incidents from "./pages/Incidents";
import IncidentDraft from "./pages/IncidentDraft";
import MyReports from "./pages/MyReports";
import Reporting from "./pages/Reporting";
import EvidenceExport from "./pages/EvidenceExport";
import Board from "./pages/Board";
import Team from "./pages/Team";
import Audits from "./pages/Audits";
import AuditTemplates from "./pages/audits/AuditTemplates";
import AuditReporting from "./pages/audits/AuditReporting";
import AuditWalkthrough from "./pages/audits/AuditWalkthrough";
import MyAudits from "./pages/audits/MyAudits";
import PolicyLibrary from "./pages/policies/PolicyLibrary";
import PolicyDocument from "./pages/policies/PolicyDocument";
import PolicyEditor from "./pages/policies/PolicyEditor";
import PolicyHistory from "./pages/policies/PolicyHistory";
import ApprovalQueue from "./pages/policies/ApprovalQueue";
import ApprovalChainTemplates from "./pages/policies/ApprovalChainTemplates";
import WorkforceOverview from "./pages/workforce/WorkforceOverview";
import HomeCareWorkforce from "./pages/workforce/HomeCareWorkforce";
import { HomeCareClientList, HomeCareClientRecord } from "./pages/org/HomeCareClients";
import { HomeSupportSwitch } from "@/components/HomeSupportSwitch";
import StaffQualifications from "./pages/workforce/StaffQualifications";
import SiteRequirements from "./pages/workforce/SiteRequirements";
import ShiftCoverage from "./pages/workforce/ShiftCoverage";
import WorkforceReporting from "./pages/workforce/WorkforceReporting";
import TasksOverview from "./pages/tasks/TasksOverview";
import TaskRegister from "./pages/tasks/TaskRegister";
import TaskDetail from "./pages/tasks/TaskDetail";
import RecurringSetup from "./pages/tasks/RecurringSetup";
import TasksReporting from "./pages/tasks/TasksReporting";
import TasksToday from "./pages/tasks/TasksToday";
import Insights from "./pages/Insights";
import CarePlansOverview from "./pages/care-plans/Overview";
import CarePlansPeople from "./pages/care-plans/PeopleSupported";
import CarePlansPersonDetail from "./pages/care-plans/PersonDetail";
import CarePlansReviews from "./pages/care-plans/ReviewsDue";
import CarePlansTemplates from "./pages/care-plans/Templates";
import CarePlanTemplateEditor from "./pages/care-plans/TemplateEditor";
import CarePlansReporting from "./pages/care-plans/Reporting";
import CreateCarePlan from "./pages/care-plans/CreateCarePlan";

import AccessManagement from "./pages/care-plans/AccessManagement";
import ArchivedCarePlanVersion from "./pages/care-plans/ArchivedVersion";

import EventTypeSettingsPage from "./pages/admin/EventTypeSettings";
import WorkflowsPage from "./pages/admin/Workflows";
import CarePlanApprovalChainsPage from "./pages/admin/CarePlanApprovalChains";
import DataHealthPage from "./pages/admin/DataHealth";
import CarePlanContribution from "./pages/external/CarePlanContribution";
import OrgSites from "./pages/org/Sites";
import OrgServiceUsers from "./pages/org/ServiceUsers";
import OrgServiceUserProfile from "./pages/org/ServiceUserProfile";
import OrgSitePage from "./pages/org/SitePage";
import OrgChronology from "./pages/org/Chronology";
import OrgAdmitResident from "./pages/org/AdmitResident";
import OrgResidentDirectory from "./pages/org/ResidentDirectory";
import NotFound from "./pages/NotFound";
import PermissionsDebug from "./pages/PermissionsDebug";
import OrgSettingsPage from "./pages/admin/OrgSettings";
import { Guarded } from "./components/Guarded";
import { RoleHomeRedirect } from "./components/RoleHomeRedirect";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner position="top-right" richColors closeButton />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/signin" replace />} />
          <Route path="/signin" element={<SignIn />} />
          <Route path="/external/care-plan-contribution/:inviteId" element={<CarePlanContribution />} />
          <Route path="/print/directory" element={<Guarded moduleKey="org.serviceUsers" moduleLabel="Directory of Residents"><OrgResidentDirectory /></Guarded>} />
          <Route path="/print/service-users/:id/chronology" element={<Guarded moduleKey="org.serviceUsers" moduleLabel="Chronology"><OrgChronology /></Guarded>} />
          <Route path="/family" element={<Guarded moduleKey="family.portal" moduleLabel="Family updates"><FamilyPortal /></Guarded>} />
          <Route path="/app/visits" element={<VisitsLayout />}>
            <Route index element={<Navigate to="today" replace />} />
            <Route path="today" element={<VisitsToday />} />
            <Route path="clients" element={<VisitClients />} />
            <Route path="log-event" element={<Guarded moduleKey="incidents.capture" moduleLabel="Log an Event"><Incidents /></Guarded>} />
            <Route path="policy-help" element={<Guarded moduleKey="policies.library" moduleLabel="Policy Help"><div className="px-2 py-4"><PolicyLibrary /></div></Guarded>} />
            <Route path="me" element={<VisitsMe />} />
            <Route path=":id" element={<VisitDetail />} />
          </Route>
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<RoleHomeRedirect />} />
            <Route path="visits/live" element={<Guarded moduleKey="visits.live" moduleLabel="Live visits"><LiveVisits /></Guarded>} />
            <Route path="visits/hours" element={<Guarded moduleKey="visits.hours" moduleLabel="Hours vs approved"><HoursReport /></Guarded>} />

            {/* Incidents module */}
            <Route path="incidents" element={<RoleHomeRedirect fallback="/app/incidents/board" />} />
            <Route path="incidents/capture" element={<Guarded moduleKey="incidents.capture" moduleLabel="Log an Event"><Incidents /></Guarded>} />
            <Route path="incidents/mine" element={<Guarded moduleKey="incidents.capture" moduleLabel="My reports"><MyReports /></Guarded>} />
            <Route path="incidents/board" element={<Guarded moduleKey="incidents.board" moduleLabel="Events board"><Board /></Guarded>} />
            <Route path="incidents/overview" element={<Guarded moduleKey="incidents.overview" moduleLabel="Events overview"><Reporting /></Guarded>} />
            <Route path="incidents/reporting" element={<Guarded moduleKey="incidents.reporting" moduleLabel="Event reporting"><EvidenceExport /></Guarded>} />
            {/* Events Reporting alias — accepts care-plan filter params like ?personSupportedId=PS-001 */}
            <Route path="events/reporting" element={<Guarded moduleKey="incidents.reporting" moduleLabel="Event reporting"><EvidenceExport /></Guarded>} />
            {/* Legacy redirects for renamed sub-pages */}
            <Route path="incidents/evidence" element={<Navigate to="/app/incidents/reporting" replace />} />
            <Route path="incidents/draft" element={<Guarded moduleKey="incidents.capture" moduleLabel="Log an Event"><IncidentDraft /></Guarded>} />

            {/* Audits module */}
            <Route path="audits" element={<RoleHomeRedirect fallback="/app/audits/overview" frontlinePath="/app/audits/my" />} />
            <Route path="audits/overview" element={<Guarded moduleKey="audits.overview" moduleLabel="Audits overview"><Audits /></Guarded>} />
            <Route path="audits/my" element={<Guarded moduleKey="audits.my" moduleLabel="My audits"><MyAudits /></Guarded>} />
            <Route path="audits/templates" element={<Guarded moduleKey="audits.templates" moduleLabel="Audit templates"><AuditTemplates /></Guarded>} />
            <Route path="audits/reporting" element={<Guarded moduleKey="audits.reporting" moduleLabel="Audit reporting"><AuditReporting /></Guarded>} />
            <Route path="audits/conduct/:id" element={<Guarded moduleKey="audits.my" moduleLabel="Audit"><AuditWalkthrough /></Guarded>} />
            {/* Legacy redirects for removed sub-pages */}
            <Route path="audits/evidence" element={<Navigate to="/app/audits/reporting" replace />} />
            <Route path="audits/completed" element={<Navigate to="/app/audits/reporting" replace />} />

            {/* Policy Hub module */}
            <Route path="policies" element={<Navigate to="/app/policies/library" replace />} />
            <Route path="policies/library" element={<Guarded moduleKey="policies.library" moduleLabel="Policy library"><PolicyLibrary /></Guarded>} />
            <Route path="policies/approvals" element={<Guarded moduleKey="policies.approvals" moduleLabel="Approval queue"><ApprovalQueue /></Guarded>} />
            <Route path="policies/chain-templates" element={<Guarded moduleKey="policies.chainTemplates" moduleLabel="Approval chain templates"><ApprovalChainTemplates /></Guarded>} />
            <Route path="policies/:id" element={<Guarded moduleKey="policies.library" moduleLabel="Policy library"><PolicyDocument /></Guarded>} />
            <Route path="policies/:id/edit" element={<Guarded moduleKey="policies.library" moduleLabel="Policy library"><PolicyEditor /></Guarded>} />
            <Route path="policies/:id/history" element={<Guarded moduleKey="policies.library" moduleLabel="Policy library"><PolicyHistory /></Guarded>} />

            {/* Workforce Compliance & Coverage module */}
            <Route path="workforce" element={<RoleHomeRedirect fallback="/app/workforce/overview" frontlinePath="/app/workforce/qualifications" />} />
            <Route path="workforce/overview" element={<Guarded moduleKey="workforce.overview" moduleLabel="Workforce overview"><HomeSupportSwitch home={<HomeCareWorkforce />} residential={<WorkforceOverview />} /></Guarded>} />
            <Route path="workforce/qualifications" element={<Guarded moduleKey="workforce.qualifications" moduleLabel="Staff qualifications"><StaffQualifications /></Guarded>} />
            <Route path="workforce/requirements" element={<Guarded moduleKey="workforce.requirements" moduleLabel="Site requirements"><SiteRequirements /></Guarded>} />
            <Route path="workforce/coverage" element={<Guarded moduleKey="workforce.coverage" moduleLabel="Shift coverage"><NotForHomeSupport moduleLabel="Shift coverage"><ShiftCoverage /></NotForHomeSupport></Guarded>} />
            <Route path="workforce/reporting" element={<Guarded moduleKey="workforce.reporting" moduleLabel="Workforce reporting"><WorkforceReporting /></Guarded>} />

            {/* Tasks & Follow-up module */}
            <Route path="tasks" element={<Navigate to="/app/tasks/today" replace />} />
            <Route path="tasks/today" element={<Guarded moduleKey="tasks.today" moduleLabel="Today's tasks"><TasksToday /></Guarded>} />
            <Route path="tasks/overview" element={<Guarded moduleKey="tasks.overview" moduleLabel="Tasks overview"><TasksOverview /></Guarded>} />
            <Route path="tasks/mine" element={<Navigate to="/app/tasks/today" replace />} />
            <Route path="tasks/house" element={<Navigate to="/app/tasks/today" replace />} />
            <Route path="tasks/register" element={<Guarded moduleKey="tasks.register" moduleLabel="Task register"><TaskRegister /></Guarded>} />
            <Route path="tasks/recurring" element={<Guarded moduleKey="tasks.recurring" moduleLabel="Recurring task setup"><RecurringSetup /></Guarded>} />
            <Route path="tasks/reporting" element={<Guarded moduleKey="tasks.reporting" moduleLabel="Tasks reporting"><TasksReporting /></Guarded>} />
            <Route path="tasks/:id" element={<Guarded moduleKey="tasks.today" moduleLabel="Task"><TaskDetail /></Guarded>} />

            {/* Insights & Themes module */}
            <Route path="home" element={<Guarded moduleKey="insights.overview" moduleLabel="Home"><Insights asHome /></Guarded>} />
            <Route path="insights" element={<Navigate to="/app/insights/overview" replace />} />
            <Route path="insights/overview" element={<Guarded moduleKey="insights.overview" moduleLabel="Insights & Themes"><Insights /></Guarded>} />

            {/* Care Planning module */}
            <Route path="care-plans" element={<RoleHomeRedirect fallback="/app/care-plans/overview" frontlinePath="/app/care-plans/plans" managerPath="/app/care-plans/reviews-approvals" adminPath="/app/care-plans/overview" viewonlyPath="/app/care-plans/overview" />} />
            <Route path="care-plans/overview" element={<Guarded moduleKey="carePlans.overview" moduleLabel="Care Planning"><CarePlansOverview /></Guarded>} />
            <Route path="care-plans/new" element={<Guarded moduleKey="carePlans.create" moduleLabel="Create a Plan"><CreateCarePlan /></Guarded>} />
            <Route path="care-plans/create" element={<Guarded moduleKey="carePlans.create" moduleLabel="Create a Plan"><CreateCarePlan /></Guarded>} />
            <Route path="care-plans/new-wizard" element={<Navigate to="/app/care-plans/create" replace />} />
            <Route path="care-plans/plans" element={<Guarded moduleKey="carePlans.people" moduleLabel="Care Plans"><CarePlansPeople /></Guarded>} />
            <Route path="care-plans/people" element={<Navigate to="/app/care-plans/plans" replace />} />
            <Route path="care-plans/people/:id" element={<Guarded moduleKey="carePlans.people" moduleLabel="Care plan"><CarePlansPersonDetail /></Guarded>} />
            <Route path="care-plans/plans/:id" element={<Guarded moduleKey="carePlans.people" moduleLabel="Care plan"><CarePlansPersonDetail /></Guarded>} />
            <Route path="care-plans/people/:id/version/:versionId" element={<Guarded moduleKey="carePlans.people" moduleLabel="Care plan version"><ArchivedCarePlanVersion /></Guarded>} />
            <Route path="care-plans/reviews-approvals" element={<Guarded moduleKey="carePlans.reviews" moduleLabel="Reviews & Approvals"><CarePlansReviews /></Guarded>} />
            <Route path="care-plans/reviews" element={<Navigate to="/app/care-plans/reviews-approvals" replace />} />
            <Route path="care-plans/access-contributors" element={<Guarded moduleKey="carePlans.access" moduleLabel="Access & Contributors"><AccessManagement /></Guarded>} />
            <Route path="care-plans/contributions" element={<Navigate to="/app/care-plans/access-contributors" replace />} />
            <Route path="care-plans/specialist-contributions" element={<Navigate to="/app/care-plans/access-contributors" replace />} />
            <Route path="care-plans/access" element={<Navigate to="/app/care-plans/access-contributors" replace />} />
            <Route path="care-plans/access-management" element={<Navigate to="/app/care-plans/access-contributors" replace />} />
            <Route path="care-plans/templates/:id" element={<Guarded moduleKey="carePlans.templates" moduleLabel="Care Plan Template"><CarePlanTemplateEditor /></Guarded>} />
            <Route path="care-plans/templates" element={<Guarded moduleKey="carePlans.templates" moduleLabel="Care Plan Templates"><CarePlansTemplates /></Guarded>} />
            <Route path="care-plans/reporting" element={<Guarded moduleKey="carePlans.reporting" moduleLabel="Care Planning Reporting"><CarePlansReporting /></Guarded>} />


            {/* Team */}
            <Route path="org" element={<Navigate to="/app/org/sites" replace />} />
            <Route path="org/sites" element={<Guarded moduleKey="org.sites" moduleLabel="Sites"><OrgSites /></Guarded>} />
            <Route path="org/sites/:siteId" element={<Guarded moduleKey="org.sites" moduleLabel="Site"><OrgSitePage /></Guarded>} />
            <Route path="org/service-users" element={<Guarded moduleKey="org.serviceUsers" moduleLabel="Service users"><HomeSupportSwitch home={<HomeCareClientList />} residential={<OrgServiceUsers />} /></Guarded>} />
            <Route path="org/service-users/admit" element={<Guarded moduleKey="org.serviceUsers" moduleLabel="Admit"><OrgAdmitResident /></Guarded>} />
            <Route path="org/service-users/:id" element={<Guarded moduleKey="org.serviceUsers" moduleLabel="Service user"><HomeSupportSwitch home={<HomeCareClientRecord />} residential={<OrgServiceUserProfile />} /></Guarded>} />
            <Route path="team" element={<Guarded moduleKey="team" moduleLabel="Team"><Team /></Guarded>} />

            {/* Admin */}
            <Route path="admin" element={<Navigate to="/app/admin/event-types" replace />} />
            <Route path="admin/event-types" element={<Guarded moduleKey="admin.eventTypes" moduleLabel="Event Type settings"><EventTypeSettingsPage /></Guarded>} />
            <Route path="admin/workflows" element={<Guarded moduleKey="admin.workflows" moduleLabel="Workflows"><WorkflowsPage /></Guarded>} />
            <Route path="admin/care-plan-approval-chains" element={<Guarded moduleKey="admin.approvalChains" moduleLabel="Care Plan Approval Chains"><CarePlanApprovalChainsPage /></Guarded>} />
            <Route path="admin/data-health" element={<Guarded moduleKey="admin.dataHealth" moduleLabel="Data Health"><DataHealthPage /></Guarded>} />
            <Route path="admin/settings" element={<Guarded moduleKey="admin.settings" moduleLabel="Organisation settings"><OrgSettingsPage /></Guarded>} />
            {/* Admin-only debug harness */}
            <Route path="_debug/permissions" element={<Guarded moduleKey="debug.permissions" moduleLabel="Permissions QA"><PermissionsDebug /></Guarded>} />




            {/* Legacy redirects */}
            <Route path="board" element={<Navigate to="/app/incidents/board" replace />} />
            <Route path="reporting" element={<Navigate to="/app/incidents/overview" replace />} />
            <Route path="evidence" element={<Navigate to="/app/incidents/reporting" replace />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
