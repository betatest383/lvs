import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ImpersonationProvider } from '@/lib/ImpersonationContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// Layout
import AppLayout from './components/layout/AppLayout';

// Role Router
import RoleRouter from './pages/RoleRouter';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import CustomersPage from './pages/admin/CustomersPage';
import TechniciansPage from './pages/admin/TechniciansPage';
import JobsPage from './pages/admin/JobsPage';
import JobDetail from './pages/admin/JobDetail';
import DeletedJobsPage from './pages/admin/DeletedJobsPage';
import InspectionsPage from './pages/admin/InspectionsPage';
import ReportsPage from './pages/admin/ReportsPage';
import EstimatesPage from './pages/admin/EstimatesPage';
import EstimateDetail from './pages/admin/EstimateDetail';
import EstimateRecommendationsPage from './pages/admin/EstimateRecommendationsPage';
import AcceptedEstimatePage from './pages/admin/AcceptedEstimatePage';
import FindingPricebookMappingPage from './pages/admin/FindingPricebookMappingPage';
import ServiceCatalogPage from './pages/admin/ServiceCatalogPage';
import RepairRecommendationConfigPage from './pages/admin/RepairRecommendationConfigPage';
import CapSizingMatrixPage from './pages/admin/CapSizingMatrixPage';
import CapFinishColorRegistry from './pages/admin/CapFinishColorRegistry';
import CapFinishPricingMatrixPage from './pages/admin/CapFinishPricingMatrixPage';
import InspectionMatrixPage from './pages/admin/InspectionMatrixPage';
import InspectionMatrixGapReview from './pages/admin/InspectionMatrixGapReview';
import InspectionStandardsLibrary from './pages/admin/InspectionStandardsLibrary';
import InspectionOutputsPage from './pages/admin/InspectionOutputsPage';
import InvoicesPage from './pages/admin/InvoicesPage';
import MaterialListsPage from './pages/admin/MaterialListsPage';
import StoreAdminPage from './pages/admin/StoreAdminPage';
import MembershipsPage from './pages/admin/MembershipsPage';
import ResourcesAdminPage from './pages/admin/ResourcesAdminPage';
import RulesEnginePage from './pages/admin/RulesEnginePage';
import UserIdentityManagement from './pages/admin/UserIdentityManagement';
import MasterClassificationRegistryPage from './pages/admin/MasterClassificationRegistryPage';
import PricingModifierRegistry from './pages/admin/PricingModifierRegistry';
import CompanyPricingSettingsPage from './pages/admin/CompanyPricingSettingsPage';
import PricingPolicyPage from './pages/admin/PricingPolicyPage';
import LoadedLaborCostPage from './pages/admin/LoadedLaborCostPage';
import CompensationPlansPage from './pages/admin/CompensationPlansPage';
import CommissionEarningsPage from './pages/admin/CommissionEarningsPage';
import RolePortalSidebarManager from './pages/admin/RolePortalSidebarManager';
import DeveloperDiagnostics from './pages/admin/DeveloperDiagnostics';
import DirectorPortal from './pages/operations/DirectorPortal';
import UserIdentityReport from './pages/admin/UserIdentityReport';
import ImpersonationReport from './pages/admin/ImpersonationReport';
import EmployeeAssignmentMigration from './pages/admin/EmployeeAssignmentMigration';
import RuleEngineLayout from './components/rulesengine/RuleEngineLayout';
import RuleDashboard from './pages/rulesengine/RuleDashboard';
import RuleRegistry from './pages/rulesengine/RuleRegistry';
import RuleBuilder from './pages/rulesengine/RuleBuilder';
import RunLogs from './pages/rulesengine/RunLogs';
import LiveEvents from './pages/rulesengine/LiveEvents';
import FailedAutomations from './pages/rulesengine/FailedAutomations';
import ManualTestRunner from './pages/rulesengine/ManualTestRunner';
import RuleReports from './pages/rulesengine/RuleReports';
import RuleSettings from './pages/rulesengine/RuleSettings';
import RuleSimulator from './pages/rulesengine/RuleSimulator';
import RuleDependencyViewer from './pages/rulesengine/RuleDependencyViewer';
import RuleHealth from './pages/rulesengine/RuleHealth';
import RuleSetsPage from './pages/rulesengine/RuleSetsPage';

// LVC OS Registry pages
import LvcOsDashboard from './pages/lvcos/LvcOsDashboard';
import ProjectDashboard from './pages/lvcos/ProjectDashboard';
import SopRegistryPage from './pages/lvcos/SopRegistryPage';
import PolicyRegistry from './pages/lvcos/PolicyRegistry';

// Policy Registry
import PolicyLayout from './components/lvcos/PolicyLayout';
import PolicyDashboard from './pages/policies/PolicyDashboard';
import PolicyRegistryPage from './pages/policies/PolicyRegistryPage';
import PolicyDetail from './pages/policies/PolicyDetail';
import PolicyRelationships from './pages/policies/PolicyRelationships';
import PolicyAcknowledgments from './pages/policies/PolicyAcknowledgments';
import PolicyReports from './pages/policies/PolicyReports';
import FormRegistry from './pages/lvcos/FormRegistry';
import WorkflowRegistry from './pages/lvcos/WorkflowRegistry';
import DashboardRegistry from './pages/lvcos/DashboardRegistry';
import AutomationRegistry from './pages/lvcos/AutomationRegistry';
import IntegrationRegistry from './pages/lvcos/IntegrationRegistry';
import ReleaseNotes from './pages/lvcos/ReleaseNotes';
import ImprovementRequests from './pages/lvcos/ImprovementRequests';
import IdStandardPage from './pages/lvcos/IdStandardPage';
import KpiRegistryPage from './pages/lvcos/KpiRegistryPage';
import WorkflowStatusBoard from './pages/lvcos/WorkflowStatusBoard';
import ProcessPacks from './pages/lvcos/ProcessPacks';
import ProcessPackDetail from './pages/lvcos/ProcessPackDetail';
import BusinessProcessRegistry from './pages/lvcos/BusinessProcessRegistry';

// Training Registry
import TrainingLayout from './components/lvcos/TrainingLayout';
import TrainingDashboard from './pages/training/TrainingDashboard';
import TrainingRegistryPage from './pages/training/TrainingRegistryPage';
import TrainingDetail from './pages/training/TrainingDetail';
import GuidedTrainingPage from './pages/training/GuidedTrainingPage';
import TrainingRelationships from './pages/training/TrainingRelationships';
import RoleTrainingMatrix from './pages/training/RoleTrainingMatrix';
import TrainingReports from './pages/training/TrainingReports';

// Enterprise Task Center
import EnterpriseTaskLayout from './components/tasks/EnterpriseTaskLayout';
import TaskDashboard from './pages/tasks/TaskDashboard';
import MyTasks from './pages/tasks/MyTasks';
import DepartmentTasks from './pages/tasks/DepartmentTasks';
import TaskRegistryPage from './pages/tasks/TaskRegistryPage';
import TaskDetail from './pages/tasks/TaskDetail';
import TaskBoard from './pages/tasks/TaskBoard';
import ApprovalQueue from './pages/tasks/ApprovalQueue';
import OverdueEscalations from './pages/tasks/OverdueEscalations';
import TaskReports from './pages/tasks/TaskReports';
import TaskSettings from './pages/tasks/TaskSettings';
import OrchestrationDashboard from './pages/tasks/OrchestrationDashboard';

// LVC Work Calendar
import CalendarErrorBoundary from '@/components/calendar/CalendarErrorBoundary';
import WorkCalendarPage from '@/components/calendar/WorkCalendarPage';

// Task Templates
import TemplateLayout from './components/templates/TemplateLayout';
import TemplateDashboard from './pages/templates/TemplateDashboard';
import TemplateRegistry from './pages/templates/TemplateRegistry';
import TemplateForm from './pages/templates/TemplateForm';
import TemplateDetail from './pages/templates/TemplateDetail';
import TemplateReviewQueue from './pages/templates/TemplateReviewQueue';

// Notifications
import NotificationLayout from './components/notifications/NotificationLayout';
import NotificationDashboard from './pages/notifications/NotificationDashboard';
import MyNotifications from './pages/notifications/MyNotifications';
import NotificationCenter from './pages/notifications/NotificationCenter';
import NotificationDetail from './pages/notifications/NotificationDetail';
import NotificationRules from './pages/notifications/NotificationRules';
import NotificationHistory from './pages/notifications/NotificationHistory';
import NotificationReports from './pages/notifications/NotificationReports';
import NotificationSettings from './pages/notifications/NotificationSettings';

// Employee Onboarding
import OnboardingLayout from './components/lvcos/OnboardingLayout';
import OnboardingDashboard from './pages/onboarding/OnboardingDashboard';
import OnboardingRegistryPage from './pages/onboarding/OnboardingRegistryPage';
import OnboardingDetail from './pages/onboarding/OnboardingDetail';
import OnboardingReports from './pages/onboarding/OnboardingReports';
import RoleChangeReview from './pages/onboarding/RoleChangeReview';

// Employee Registry
import EmployeeLayout from './components/lvcos/EmployeeLayout';
import EmployeeDashboard from './pages/employees/EmployeeDashboard';
import EmployeeRegistryPage from './pages/employees/EmployeeRegistryPage';
import EmployeeDetail from './pages/employees/EmployeeDetail';
import RoleAssignments from './pages/employees/RoleAssignments';
import TrainingStatus from './pages/employees/TrainingStatus';
import CertificationStatus from './pages/employees/CertificationStatus';
import EquipmentAccountability from './pages/employees/EquipmentAccountability';
import EmployeeDocuments from './pages/employees/EmployeeDocuments';
import PerformanceSummary from './pages/employees/PerformanceSummary';
import CareerPath from './pages/employees/CareerPath';
import EmployeeReports from './pages/employees/EmployeeReports';

// Certification Registry
import CertificationLayout from './components/lvcos/CertificationLayout';
import CertificationDashboard from './pages/certifications/CertificationDashboard';
import CertificationRegistryPage from './pages/certifications/CertificationRegistryPage';
import CertificationDetail from './pages/certifications/CertificationDetail';
import EmployeeCertifications from './pages/certifications/EmployeeCertifications';
import ExpirationTracker from './pages/certifications/ExpirationTracker';
import CertificationMatrix from './pages/certifications/CertificationMatrix';
import CertificationRelationships from './pages/certifications/CertificationRelationships';
import CertificationReports from './pages/certifications/CertificationReports';

// Role Registry
import RoleLayout from './components/lvcos/RoleLayout';
import RoleDashboard from './pages/roles/RoleDashboard';
import RoleRegistryPage from './pages/roles/RoleRegistryPage';
import RoleDetail from './pages/roles/RoleDetail';
import RoleRelationships from './pages/roles/RoleRelationships';
import RolePermissions from './pages/roles/RolePermissions';
import TrainingRequirements from './pages/roles/TrainingRequirements';
import CareerPaths from './pages/roles/CareerPaths';
import RoleReports from './pages/roles/RoleReports';

// Warehouse pages
import WarehouseDashboard from './pages/warehouse/WarehouseDashboard';
import WarehouseSetupWizard from './pages/warehouse/WarehouseSetupWizard';
import WarehouseSetupDashboard from './pages/warehouse/WarehouseSetupDashboard';
import WarehouseSetupKPIs from './pages/warehouse/WarehouseSetupKPIs';
import TechnicianRequests from './pages/warehouse/TechnicianRequests';
import HardwareChecklists from './pages/warehouse/HardwareChecklists';
import MaterialTransferSheets from './pages/warehouse/MaterialTransferSheets';
import ProcurementOrders from './pages/warehouse/ProcurementOrders';
import ReturnedMaterials from './pages/warehouse/ReturnedMaterials';
import WarehouseCleanup from './pages/warehouse/WarehouseCleanup';
import BinDesignationRequests from './pages/warehouse/BinDesignationRequests';
import ManagerReview from './pages/warehouse/ManagerReview';
import MorningMaterialRequest from './pages/warehouse/MorningMaterialRequest';
import MorningDepartureDashboard from './pages/warehouse/MorningDepartureDashboard';
import NightBeforePrepPage from './pages/warehouse/NightBeforePrepPage';
import MorningMaterialRequestDetail from './pages/warehouse/MorningMaterialRequestDetail';
import MaterialReturnDashboard from './pages/warehouse/MaterialReturnDashboard';
import NewMaterialReturn from './pages/warehouse/NewMaterialReturn';
import WarehouseReturns from './pages/warehouse/WarehouseReturns';
import MaterialReturnDetail from './pages/warehouse/MaterialReturnDetail';
import MaterialReturnHistory from './pages/warehouse/MaterialReturnHistory';

// Consumables
import ConsumableDashboard from './pages/consumables/ConsumableDashboard';
import NewConsumableRequest from './pages/consumables/NewConsumableRequest';
import WarehousePickList from './pages/consumables/WarehousePickList';
import ConsumableRequestDetail from './pages/consumables/ConsumableRequestDetail';
import ConsumableHistory from './pages/consumables/ConsumableHistory';

import OperationsCenter from './pages/operations/OperationsCenter';
import MorningBriefPage from './pages/operations/MorningBriefPage';

// Continuous Improvement pages
import ImprovementDashboard from './pages/ci/ImprovementDashboard';
import SubmitImprovement from './pages/ci/SubmitImprovement';
import ImprovementQueue from './pages/ci/ImprovementQueue';
import MyIdeas from './pages/ci/MyIdeas';
import ReviewBoard from './pages/ci/ReviewBoard';
import ImplementedImprovements from './pages/ci/ImplementedImprovements';
import ExecutiveDashboard from './pages/ci/ExecutiveDashboard';

// Management Audits pages
import AuditDashboard from './pages/audits/AuditDashboard';
import AuditTemplates from './pages/audits/AuditTemplates';
import NewAudit from './pages/audits/NewAudit';
import AuditQueue from './pages/audits/AuditQueue';
import CompletedAudits from './pages/audits/CompletedAudits';
import EmployeeAuditHistory from './pages/audits/EmployeeAuditHistory';
import ProcessCompliance from './pages/audits/ProcessCompliance';
import CorrectiveActions from './pages/audits/CorrectiveActions';

// Technician pages
import TechDashboard from './pages/tech/TechDashboard';
import TodayJobsPage from './pages/tech/TodayJobsPage';
import InspectionSetup from './pages/tech/InspectionSetup';
import InspectionForm from './pages/tech/InspectionForm';
import InspectionLanding from './pages/tech/InspectionLanding';
import ExteriorInspectionForm from './pages/tech/ExteriorInspectionForm';
import ProductResources from './pages/tech/ProductResources';
import MyEquipmentPage from './pages/tech/MyEquipmentPage';
import HR from './pages/tech/HR';
import TrainingAndCertifications from './pages/tech/TrainingAndCertifications';
import TechMessages from './pages/tech/TechMessages';
import TechReportsPage from './pages/tech/TechReportsPage';
import MyTruckPage from './pages/tech/MyTruckPage';
import TechReadinessPage from './pages/tech/TechReadinessPage';
import WeeklyInspectionPage from './pages/tech/WeeklyInspectionPage';
import JobHub from './pages/tech/JobHub';
import ErrorBoundary from '@/components/shared/ErrorBoundary';
import JobHubDaily from './pages/tech/JobHubDaily';
import RecommendationReviewPage from './pages/tech/RecommendationReviewPage';
import CrownCalculationReview from './pages/tech/CrownCalculationReview';
import CapResolverReview from './pages/tech/CapResolverReview';

// Forms Center
import FormsCenter from './pages/FormsCenter';

// Stucco Measurement Tool
import StuccoMeasurementTool from './pages/stucco/StuccoMeasurementTool';
import StuccoMeasurementLanding from './pages/stucco/StuccoMeasurementLanding';

// Fleet
import FleetDashboard from './pages/fleet/FleetDashboard';
import TruckProfiles from './pages/fleet/TruckProfiles';
import TruckDetail from './pages/fleet/TruckDetail';
import VehicleAssignments from './pages/fleet/VehicleAssignments';
import SharedVehicleCheckout from './pages/fleet/SharedVehicleCheckout';
import TruckReadiness from './pages/fleet/TruckReadiness';
import TruckHistory from './pages/fleet/TruckHistory';

// ServiceTitan Integration Hub
import IntegrationDashboard from './pages/servicetitan/IntegrationDashboard';
import WebhookInbox from './pages/servicetitan/WebhookInbox';
import EventLog from './pages/servicetitan/EventLog';
import TransferSheetSync from './pages/servicetitan/TransferSheetSync';
import JobSync from './pages/servicetitan/JobSync';
import PurchaseOrderSync from './pages/servicetitan/PurchaseOrderSync';
import InventorySync from './pages/servicetitan/InventorySync';
import MappingRules from './pages/servicetitan/MappingRules';
import FailedSyncs from './pages/servicetitan/FailedSyncs';
import IntegrationSettings from './pages/servicetitan/IntegrationSettings';
import CustomerSyncControlPanel from './pages/servicetitan/CustomerSyncControlPanel';
import WebhookSimulator from './pages/servicetitan/WebhookSimulator';
import ServiceTitanWebhookMonitor from './pages/admin/ServiceTitanWebhookMonitor';
import ServiceTitanIntegrityAudit from './pages/admin/ServiceTitanIntegrityAudit';

// Inventory Transaction Engine
import InventoryLayout from './components/inventory/InventoryLayout';
import InventoryDashboard from './pages/inventory/InventoryDashboard';
import ReceiveInventory from './pages/inventory/ReceiveInventory';
import IssueEquipment from './pages/inventory/IssueEquipment';
import ReturnEquipment from './pages/inventory/ReturnEquipment';
import TransferEquipment from './pages/inventory/TransferEquipment';
import PhysicalCountWizard from './pages/inventory/PhysicalCountWizard';
import TransactionHistory from './pages/inventory/TransactionHistory';
import ConsumableInventory from './pages/inventory/ConsumableInventory';
import ConsumableReceive from './pages/inventory/ConsumableReceive';
import ConsumableAdjust from './pages/inventory/ConsumableAdjust';
import InventoryMasterList from './pages/inventory/InventoryMasterList';
import InventoryDetail from './pages/inventory/InventoryDetail';
import ReplayInventoryState from './pages/inventory/ReplayInventoryState';
import InventoryReports from './pages/inventory/InventoryReports';
import WarehouseLocationsPage from './pages/inventory/WarehouseLocationsPage';
import BinLocationsPage from './pages/inventory/BinLocationsPage';
import InventoryCategoriesPage from './pages/inventory/InventoryCategoriesPage';
import VendorsPage from './pages/inventory/VendorsPage';
import ManufacturersPage from './pages/inventory/ManufacturersPage';
import MasterDataHub from './pages/inventory/MasterDataHub';

// Notification Framework
import NotificationTest from './pages/NotificationTest';

// Equipment Management
import EquipmentLayout from './components/equipment/EquipmentLayout';
import EquipmentDashboard from './pages/equipment/EquipmentDashboard';
import EquipmentMaster from './pages/equipment/EquipmentMaster';
import AddEquipment from './pages/equipment/AddEquipment';
import AssignEquipment from './pages/equipment/AssignEquipment';
import EquipmentPackages from './pages/equipment/EquipmentPackages';
import TemporaryCheckouts from './pages/equipment/TemporaryCheckouts';
import EquipmentRepairsPage from './pages/equipment/EquipmentRepairs';
import AssetHistory from './pages/equipment/AssetHistory';
import EquipmentAudits from './pages/equipment/EquipmentAudits';
import EquipmentReports from './pages/equipment/EquipmentReports';

// Profile
import ProfilePage from './pages/ProfilePage';

// Customer pages
import CustomerDashboard from './pages/customer/CustomerDashboard';
import MyReportsPage from './pages/customer/MyReportsPage';
import MyEstimatesPage from './pages/customer/MyEstimatesPage';
import MyInvoicesPage from './pages/customer/MyInvoicesPage';
import StorePage from './pages/customer/StorePage';
import MyMembershipPage from './pages/customer/MyMembershipPage';
import BookJobPage from './pages/customer/BookJobPage';
import MyJobsPage from './pages/customer/MyJobsPage';

// Product Resource Management
import ResourceLayout from './components/resources/ResourceLayout';
import ProductResourceDashboard from './pages/resources/ProductResourceDashboard';
import ResourceLibrary from './pages/resources/ResourceLibrary';
import ResourceUpload from './pages/resources/ResourceUpload';
import ResourceDetail from './pages/resources/ResourceDetail';
import ResourceApprovalQueue from './pages/resources/ApprovalQueue';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, user } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else {
      navigateToLogin();
      return null;
    }
  }

  if (!isLoadingAuth && !isLoadingPublicSettings && !user) {
    navigateToLogin();
    return null;
  }

  return (
    <Routes>
      {/* Root — role-based dashboard */}
      <Route element={<AppLayout />}>
        <Route path="/" element={<RoleRouter />} />

        {/* Operations Center */}
        <Route path="/operations" element={<OperationsCenter />} />
        <Route path="/operations/morning-brief" element={<MorningBriefPage />} />
        <Route path="/operations-director" element={<DirectorPortal />} />

        {/* Continuous Improvement */}
        <Route path="/ci" element={<ImprovementDashboard />} />
        <Route path="/ci/submit" element={<SubmitImprovement />} />
        <Route path="/ci/queue" element={<ImprovementQueue />} />
        <Route path="/ci/my-ideas" element={<MyIdeas />} />
        <Route path="/ci/review-board" element={<ReviewBoard />} />
        <Route path="/ci/implemented" element={<ImplementedImprovements />} />
        <Route path="/ci/executive" element={<ExecutiveDashboard />} />

        {/* Management Audits */}
        <Route path="/audits" element={<AuditDashboard />} />
        <Route path="/audits/templates" element={<AuditTemplates />} />
        <Route path="/audits/new" element={<NewAudit />} />
        <Route path="/audits/queue" element={<AuditQueue />} />
        <Route path="/audits/completed" element={<CompletedAudits />} />
        <Route path="/audits/employee-history" element={<EmployeeAuditHistory />} />
        <Route path="/audits/compliance" element={<ProcessCompliance />} />
        <Route path="/audits/corrective-actions" element={<CorrectiveActions />} />

        {/* Admin */}
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/customers" element={<CustomersPage />} />
        <Route path="/admin/technicians" element={<TechniciansPage />} />
        <Route path="/admin/jobs" element={<JobsPage />} />
        <Route path="/admin/jobs/deleted" element={<DeletedJobsPage />} />
        <Route path="/admin/jobs/:id" element={<JobDetail />} />
        <Route path="/admin/inspections" element={<InspectionsPage />} />
        <Route path="/admin/reports" element={<ReportsPage />} />
        <Route path="/admin/estimates" element={<EstimatesPage />} />
        <Route path="/admin/estimates/recommendations/:jobId" element={<EstimateRecommendationsPage />} />
        <Route path="/admin/estimates/accepted/:jobId" element={<AcceptedEstimatePage />} />
        <Route path="/admin/estimates/pricebook-mapping" element={<FindingPricebookMappingPage />} />
        <Route path="/admin/service-catalog" element={<ServiceCatalogPage />} />
        <Route path="/admin/repair-recommendation-config" element={<RepairRecommendationConfigPage />} />
        <Route path="/admin/cap-sizing-matrix" element={<CapSizingMatrixPage />} />
        <Route path="/admin/cap-finish-colors" element={<CapFinishColorRegistry />} />
        <Route path="/admin/cap-finish-pricing" element={<CapFinishPricingMatrixPage />} />
        <Route path="/admin/inspection-matrix" element={<InspectionMatrixPage />} />
        <Route path="/admin/inspection-matrix/gaps" element={<InspectionMatrixGapReview />} />
        <Route path="/admin/inspection-standards" element={<InspectionStandardsLibrary />} />
        <Route path="/admin/inspection-outputs" element={<InspectionOutputsPage />} />
        <Route path="/admin/estimates/:id" element={<EstimateDetail />} />
        <Route path="/admin/invoices" element={<InvoicesPage />} />
        <Route path="/admin/material-lists" element={<MaterialListsPage />} />
        <Route path="/admin/store" element={<StoreAdminPage />} />
        <Route path="/admin/memberships" element={<MembershipsPage />} />
        <Route path="/admin/resources" element={<ResourcesAdminPage />} />
        <Route path="/admin/rules-engine" element={<RulesEnginePage />} />
        <Route path="/admin/user-identity" element={<UserIdentityManagement />} />
        <Route path="/admin/user-identity-report" element={<UserIdentityReport />} />
        <Route path="/admin/impersonation-report" element={<ImpersonationReport />} />
        <Route path="/admin/assignment-migration" element={<EmployeeAssignmentMigration />} />
        <Route path="/admin/notification-test" element={<NotificationTest />} />
        <Route path="/admin/master-classification" element={<MasterClassificationRegistryPage />} />
        <Route path="/admin/pricing-modifiers" element={<PricingModifierRegistry />} />
        <Route path="/admin/pricing-policy" element={<PricingPolicyPage />} />
        <Route path="/admin/pricing-settings" element={<CompanyPricingSettingsPage />} />
        <Route path="/admin/loaded-labor-costs" element={<LoadedLaborCostPage />} />
        <Route path="/admin/compensation-plans" element={<CompensationPlansPage />} />
        <Route path="/admin/commission-earnings" element={<CommissionEarningsPage />} />
        <Route path="/admin/role-portal-manager" element={<RolePortalSidebarManager />} />
        <Route path="/admin/developer-diagnostics" element={<DeveloperDiagnostics />} />

        {/* Warehouse */}
        <Route path="/warehouse" element={<WarehouseDashboard />} />
        <Route path="/warehouse/setup" element={<WarehouseSetupWizard />} />
        <Route path="/warehouse/setup/:sessionId" element={<WarehouseSetupWizard />} />
        <Route path="/warehouse/setup-dashboard" element={<WarehouseSetupDashboard />} />
        <Route path="/warehouse/setup-kpis" element={<WarehouseSetupKPIs />} />
        <Route path="/warehouse/technicians" element={<TechnicianRequests />} />
        <Route path="/warehouse/hardware-checklists" element={<HardwareChecklists />} />
        <Route path="/warehouse/transfer-sheets" element={<MaterialTransferSheets />} />
        <Route path="/warehouse/purchase-orders" element={<ProcurementOrders />} />
        <Route path="/warehouse/returned-materials" element={<ReturnedMaterials />} />
        <Route path="/warehouse/cleanup" element={<WarehouseCleanup />} />
        <Route path="/warehouse/bin-requests" element={<BinDesignationRequests />} />
        <Route path="/warehouse/manager-review" element={<ManagerReview />} />
        <Route path="/warehouse/morning-material-request" element={<MorningMaterialRequest />} />
        <Route path="/warehouse/morning-departure" element={<MorningDepartureDashboard />} />
        <Route path="/warehouse/night-before-prep" element={<NightBeforePrepPage />} />
        <Route path="/warehouse/morning-material-request/:id" element={<MorningMaterialRequestDetail />} />

        {/* WH-201 Material Returns */}
        <Route path="/warehouse/material-returns" element={<MaterialReturnDashboard />} />
        <Route path="/warehouse/material-returns/new" element={<NewMaterialReturn />} />
        <Route path="/warehouse/material-returns/verify" element={<WarehouseReturns />} />
        <Route path="/warehouse/material-returns/history" element={<MaterialReturnHistory />} />
        <Route path="/warehouse/material-returns/:id" element={<MaterialReturnDetail />} />

        {/* Consumables */}
        <Route path="/consumables" element={<ConsumableDashboard />} />
        <Route path="/consumables/new" element={<NewConsumableRequest />} />
        <Route path="/consumables/picklist" element={<WarehousePickList />} />
        <Route path="/consumables/history" element={<ConsumableHistory />} />
        <Route path="/consumables/:id" element={<ConsumableRequestDetail />} />

        {/* LVC OS Registry */}
        <Route path="/lvcos" element={<LvcOsDashboard />} />
        <Route path="/lvcos/project" element={<ProjectDashboard />} />
        <Route path="/lvcos/sop-registry" element={<SopRegistryPage />} />
        <Route path="/lvcos/policy-registry" element={<PolicyRegistry />} />

        {/* Policy Registry */}
        <Route path="/lvcos/policies" element={<PolicyLayout />}>
          <Route index element={<PolicyDashboard />} />
          <Route path="registry" element={<PolicyRegistryPage />} />
          <Route path="detail/:id" element={<PolicyDetail />} />
          <Route path="relationships" element={<PolicyRelationships />} />
          <Route path="acknowledgments" element={<PolicyAcknowledgments />} />
          <Route path="reports" element={<PolicyReports />} />
        </Route>
        <Route path="/lvcos/form-registry" element={<FormRegistry />} />
        <Route path="/lvcos/workflow-registry" element={<WorkflowRegistry />} />
        <Route path="/lvcos/dashboard-registry" element={<DashboardRegistry />} />
        <Route path="/lvcos/automation-registry" element={<AutomationRegistry />} />
        <Route path="/lvcos/integration-registry" element={<IntegrationRegistry />} />
        <Route path="/lvcos/release-notes" element={<ReleaseNotes />} />
        <Route path="/lvcos/improvement-requests" element={<ImprovementRequests />} />
        <Route path="/lvcos/id-standard" element={<IdStandardPage />} />
        <Route path="/lvcos/kpi-registry" element={<KpiRegistryPage />} />
        <Route path="/lvcos/status-board" element={<WorkflowStatusBoard />} />
        <Route path="/lvcos/process-packs" element={<ProcessPacks />} />
        <Route path="/lvcos/process-packs/:id" element={<ProcessPackDetail />} />
        <Route path="/lvcos/business-process-registry" element={<BusinessProcessRegistry />} />

        {/* Training Registry */}
        <Route path="/lvcos/training" element={<TrainingLayout />}>
          <Route index element={<TrainingDashboard />} />
          <Route path="registry" element={<TrainingRegistryPage />} />
          <Route path="detail/:id" element={<TrainingDetail />} />
          <Route path="guide/:trainingId" element={<GuidedTrainingPage />} />
          <Route path="relationships" element={<TrainingRelationships />} />
          <Route path="matrix" element={<RoleTrainingMatrix />} />
          <Route path="reports" element={<TrainingReports />} />
        </Route>

        {/* Enterprise Task Center */}
        <Route path="/tasks" element={<EnterpriseTaskLayout />}>
          <Route index element={<TaskDashboard />} />
          <Route path="my-tasks" element={<MyTasks />} />
          <Route path="department" element={<DepartmentTasks />} />
          <Route path="registry" element={<TaskRegistryPage />} />
          <Route path="created-by-me" element={<TaskRegistryPage scope="created_by_me" title="Created by Me" description="Tasks you have created." />} />
          <Route path="team-queue" element={<TaskRegistryPage scope="team" title="Team Queue" description="Tasks across your team scope." />} />
          <Route path="due-today" element={<TaskRegistryPage filter="due_today" title="Due Today" description="Tasks due today." />} />
          <Route path="blocked" element={<TaskRegistryPage filter="Blocked" title="Blocked Tasks" description="Tasks currently blocked." />} />
          <Route path="awaiting-review" element={<TaskRegistryPage filter="Submitted for Review" title="Awaiting Review" description="Tasks submitted for your review." />} />
          <Route path="awaiting-approval" element={<TaskRegistryPage filter="Awaiting Approval" title="Awaiting Approval" description="Tasks awaiting Owner approval." />} />
          <Route path="changes-requested" element={<TaskRegistryPage filter="Changes Requested" title="Changes Requested" description="Tasks with changes requested." />} />
          <Route path="completed" element={<TaskRegistryPage filter="Completed" title="Completed Tasks" description="Completed tasks." />} />
          <Route path="recurring" element={<TaskRegistryPage filter="recurring" title="Recurring Tasks" description="Recurring operational tasks." />} />
          <Route path="data-review" element={<TaskRegistryPage scope="data_review" title="Data Review" description="Test, demo, and archived tasks — Owner/Admin only." />} />
          <Route path="detail/:id" element={<ErrorBoundary message="Task Detail Error — something went wrong while displaying this task."><TaskDetail /></ErrorBoundary>} />
          <Route path="board" element={<TaskBoard />} />
          <Route path="approvals" element={<ApprovalQueue />} />
          <Route path="overdue" element={<OverdueEscalations />} />
          <Route path="reports" element={<TaskReports />} />
          <Route path="settings" element={<TaskSettings />} />
          <Route path="orchestration" element={<OrchestrationDashboard />} />
          <Route path="calendar" element={<CalendarErrorBoundary><WorkCalendarPage /></CalendarErrorBoundary>} />
        </Route>

        {/* Task Templates */}
        <Route path="/templates" element={<TemplateLayout />}>
          <Route index element={<TemplateDashboard />} />
          <Route path="registry" element={<TemplateRegistry />} />
          <Route path="new" element={<TemplateForm />} />
          <Route path="edit/:id" element={<TemplateForm />} />
          <Route path="detail/:id" element={<TemplateDetail />} />
          <Route path="review" element={<TemplateReviewQueue />} />
        </Route>

        {/* Notifications */}
        <Route path="/notifications" element={<NotificationLayout />}>
          <Route index element={<NotificationDashboard />} />
          <Route path="my" element={<MyNotifications />} />
          <Route path="center" element={<NotificationCenter />} />
          <Route path="detail/:id" element={<NotificationDetail />} />
          <Route path="rules" element={<NotificationRules />} />
          <Route path="history" element={<NotificationHistory />} />
          <Route path="reports" element={<NotificationReports />} />
          <Route path="settings" element={<NotificationSettings />} />
        </Route>

        {/* Employee Onboarding */}
        <Route path="/lvcos/onboarding" element={<OnboardingLayout />}>
          <Route index element={<OnboardingDashboard />} />
          <Route path="registry" element={<OnboardingRegistryPage />} />
          <Route path="detail/:id" element={<OnboardingDetail />} />
          <Route path="role-changes" element={<RoleChangeReview />} />
          <Route path="reports" element={<OnboardingReports />} />
        </Route>

        {/* Employee Registry */}
        <Route path="/lvcos/employees" element={<EmployeeLayout />}>
          <Route index element={<EmployeeDashboard />} />
          <Route path="registry" element={<EmployeeRegistryPage />} />
          <Route path="detail/:id" element={<EmployeeDetail />} />
          <Route path="role-assignments" element={<RoleAssignments />} />
          <Route path="training-status" element={<TrainingStatus />} />
          <Route path="certification-status" element={<CertificationStatus />} />
          <Route path="equipment" element={<EquipmentAccountability />} />
          <Route path="documents" element={<EmployeeDocuments />} />
          <Route path="performance" element={<PerformanceSummary />} />
          <Route path="career-path" element={<CareerPath />} />
          <Route path="reports" element={<EmployeeReports />} />
        </Route>

        {/* Certification Registry */}
        <Route path="/lvcos/certifications" element={<CertificationLayout />}>
          <Route index element={<CertificationDashboard />} />
          <Route path="registry" element={<CertificationRegistryPage />} />
          <Route path="detail/:id" element={<CertificationDetail />} />
          <Route path="employees" element={<EmployeeCertifications />} />
          <Route path="expiration" element={<ExpirationTracker />} />
          <Route path="matrix" element={<CertificationMatrix />} />
          <Route path="relationships" element={<CertificationRelationships />} />
          <Route path="reports" element={<CertificationReports />} />
        </Route>

        {/* Role Registry */}
        <Route path="/roles" element={<RoleLayout />}>
          <Route index element={<RoleDashboard />} />
          <Route path="registry" element={<RoleRegistryPage />} />
          <Route path="detail/:id" element={<RoleDetail />} />
          <Route path="relationships" element={<RoleRelationships />} />
          <Route path="permissions" element={<RolePermissions />} />
          <Route path="training" element={<TrainingRequirements />} />
          <Route path="career-paths" element={<CareerPaths />} />
          <Route path="reports" element={<RoleReports />} />
        </Route>

        {/* Technician */}
        <Route path="/tech/job-hub" element={<JobHubDaily />} />
        <Route path="/tech/dashboard" element={<TodayJobsPage />} />
        <Route path="/tech/inspection-select" element={<InspectionLanding />} />
        <Route path="/tech/inspection-setup" element={<InspectionSetup />} />
        <Route path="/tech/inspection" element={<InspectionForm />} />
        <Route path="/tech/exterior-inspection" element={<ExteriorInspectionForm />} />
        <Route path="/tech/reports" element={<TechReportsPage />} />
        <Route path="/tech/truck" element={<MyTruckPage />} />
        <Route path="/tech/readiness" element={<TechReadinessPage />} />
        <Route path="/tech/weekly-inspection" element={<WeeklyInspectionPage />} />
        <Route path="/tech/job-hub/:jobId" element={<ErrorBoundary message="Job Hub failed to load."><JobHub /></ErrorBoundary>} />
        <Route path="/tech/recommendation-review/:jobId" element={<RecommendationReviewPage />} />
        <Route path="/tech/crown-calculation/:jobId" element={<CrownCalculationReview />} />
        <Route path="/tech/cap-resolver/:jobId" element={<CapResolverReview />} />
        <Route path="/tech/equipment" element={<MyEquipmentPage />} />
        <Route path="/tech/resources" element={<ProductResources />} />
        <Route path="/tech/hr" element={<HR />} />
        <Route path="/tech/training" element={<TrainingAndCertifications />} />
        <Route path="/tech/certifications" element={<TrainingAndCertifications />} />
        <Route path="/tech/messages" element={<TechMessages />} />

        {/* Forms */}
        <Route path="/forms" element={<FormsCenter />} />

        {/* Stucco Measurement Tool */}
        <Route path="/stucco-measurement/:jobId" element={<StuccoMeasurementTool />} />
        <Route path="/forms/stucco-measurement" element={<StuccoMeasurementLanding />} />

        {/* Fleet */}
        <Route path="/fleet" element={<FleetDashboard />} />
        <Route path="/fleet/trucks" element={<TruckProfiles />} />
        <Route path="/fleet/trucks/:id" element={<TruckDetail />} />
        <Route path="/fleet/assignments" element={<VehicleAssignments />} />
        <Route path="/fleet/shared-checkout" element={<SharedVehicleCheckout />} />
        <Route path="/fleet/readiness" element={<TruckReadiness />} />
        <Route path="/fleet/history" element={<TruckHistory />} />

        {/* ServiceTitan Integration Hub */}
        <Route path="/servicetitan" element={<IntegrationDashboard />} />
        <Route path="/servicetitan/webhook-inbox" element={<WebhookInbox />} />
        <Route path="/servicetitan/event-log" element={<EventLog />} />
        <Route path="/servicetitan/transfer-sheets" element={<TransferSheetSync />} />
        <Route path="/servicetitan/jobs" element={<JobSync />} />
        <Route path="/servicetitan/purchase-orders" element={<PurchaseOrderSync />} />
        <Route path="/servicetitan/inventory" element={<InventorySync />} />
        <Route path="/servicetitan/mapping-rules" element={<MappingRules />} />
        <Route path="/servicetitan/failed-syncs" element={<FailedSyncs />} />
        <Route path="/servicetitan/settings" element={<IntegrationSettings />} />
        <Route path="/servicetitan/customer-sync" element={<CustomerSyncControlPanel />} />
        <Route path="/servicetitan/simulator" element={<WebhookSimulator />} />
        <Route path="/servicetitan/webhook-monitor" element={<ServiceTitanWebhookMonitor />} />
        <Route path="/admin/servicetitan-integrity-audit" element={<ServiceTitanIntegrityAudit />} />

        {/* Inventory Transaction Engine */}
        <Route path="/inventory" element={<InventoryLayout />}>
          <Route index element={<InventoryDashboard />} />
          <Route path="consumables" element={<ConsumableInventory />} />
          <Route path="consumables/receive" element={<ConsumableReceive />} />
          <Route path="consumables/adjust" element={<ConsumableAdjust />} />
          <Route path="master" element={<InventoryMasterList type="all" />} />
          <Route path="master/consumables" element={<InventoryMasterList type="Consumable" />} />
          <Route path="master/materials" element={<InventoryMasterList type="Material" />} />
          <Route path="master/equipment" element={<InventoryMasterList type="Equipment" />} />
          <Route path="master/tools" element={<InventoryMasterList type="Tool" />} />
          <Route path="master/fleet-parts" element={<InventoryMasterList type="Fleet Part" />} />
          <Route path="master/safety" element={<InventoryMasterList type="Safety Supply" />} />
          <Route path="master/detail/:id" element={<InventoryDetail />} />
          <Route path="replay" element={<ReplayInventoryState />} />
          <Route path="master-data" element={<MasterDataHub />} />
          <Route path="warehouses" element={<WarehouseLocationsPage />} />
          <Route path="bins" element={<BinLocationsPage />} />
          <Route path="categories" element={<InventoryCategoriesPage />} />
          <Route path="vendors" element={<VendorsPage />} />
          <Route path="manufacturers" element={<ManufacturersPage />} />
          <Route path="reports" element={<InventoryReports />} />
          <Route path="receive" element={<ReceiveInventory />} />
          <Route path="issue" element={<IssueEquipment />} />
          <Route path="return" element={<ReturnEquipment />} />
          <Route path="transfer" element={<TransferEquipment />} />
          <Route path="count" element={<PhysicalCountWizard />} />
          <Route path="transactions" element={<TransactionHistory />} />
        </Route>

        {/* Equipment Management */}
        <Route path="/equipment" element={<EquipmentLayout />}>
          <Route index element={<EquipmentDashboard />} />
          <Route path="master" element={<EquipmentMaster />} />
          <Route path="add" element={<AddEquipment />} />
          <Route path="assign" element={<AssignEquipment />} />
          <Route path="packages" element={<EquipmentPackages />} />
          <Route path="checkouts" element={<TemporaryCheckouts />} />
          <Route path="repairs" element={<EquipmentRepairsPage />} />
          <Route path="history" element={<AssetHistory />} />
          <Route path="audits" element={<EquipmentAudits />} />
          <Route path="reports" element={<EquipmentReports />} />
        </Route>

        {/* Enterprise Rules Engine */}
        <Route path="/rules-engine" element={<RuleEngineLayout />}>
          <Route index element={<RuleDashboard />} />
          <Route path="registry" element={<RuleRegistry />} />
          <Route path="builder" element={<RuleBuilder />} />
          <Route path="live-events" element={<LiveEvents />} />
          <Route path="run-logs" element={<RunLogs />} />
          <Route path="failed" element={<FailedAutomations />} />
          <Route path="test-runner" element={<ManualTestRunner />} />
          <Route path="test-runner/:ruleId" element={<ManualTestRunner />} />
          <Route path="reports" element={<RuleReports />} />
          <Route path="settings" element={<RuleSettings />} />
          <Route path="simulator" element={<RuleSimulator />} />
          <Route path="simulator/:ruleId" element={<RuleSimulator />} />
          <Route path="dependencies" element={<RuleDependencyViewer />} />
          <Route path="dependencies/:ruleId" element={<RuleDependencyViewer />} />
          <Route path="health" element={<RuleHealth />} />
          <Route path="rule-sets" element={<RuleSetsPage />} />
        </Route>

        {/* Profile */}
        <Route path="/profile" element={<ProfilePage />} />

        {/* Customer */}
        <Route path="/customer/dashboard" element={<CustomerDashboard />} />
        <Route path="/customer/reports" element={<MyReportsPage />} />
        <Route path="/customer/estimates" element={<MyEstimatesPage />} />
        <Route path="/customer/invoices" element={<MyInvoicesPage />} />
        <Route path="/customer/store" element={<StorePage />} />
        <Route path="/customer/membership" element={<MyMembershipPage />} />
        <Route path="/customer/book" element={<BookJobPage />} />
        <Route path="/customer/jobs" element={<MyJobsPage />} />

        {/* Product Resource Management */}
        <Route path="/resources" element={<ResourceLayout />}>
          <Route index element={<ProductResourceDashboard />} />
          <Route path="library" element={<ResourceLibrary />} />
          <Route path="upload" element={<ResourceUpload />} />
          <Route path="approvals" element={<ResourceApprovalQueue />} />
          <Route path="detail/:id" element={<ResourceDetail />} />
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <ImpersonationProvider>
        <QueryClientProvider client={queryClientInstance}>
          <Router>
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster position="top-center" />
        </QueryClientProvider>
      </ImpersonationProvider>
    </AuthProvider>
  );
}

export default App;