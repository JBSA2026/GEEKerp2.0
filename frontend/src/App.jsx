import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useSubRouteTracker } from '@/hooks/useSubRouteTracker'
import { PersistentRedirect } from '@/components/PersistentRedirect'
import Dashboard from '@/pages/Dashboard'
import Administration from '@/pages/Administration'
import { MasterDataLayout, MasterDataContent } from '@/pages/masterdata'
import {
  InventoryLayout,
  StockMovement,
  DeliveryNotes,
} from '@/pages/inventory'
import { PSLayout } from '@/pages/products-services'
import {
  QuotationLayout,
  QuotationList,
  QuotationCreate,
  QuotationDetail,
  QuotationEdit,
  QuotationHistory,
  QuotationVersions,
} from '@/pages/quotation'
import {
  PurchasingLayout,
  PurchaseRequestsList,
  PurchaseRequestCreate,
  PurchaseRequestDetail,
  PurchaseRequestEdit,
  PurchaseOrdersList,
  SupplierList,
} from '@/pages/purchasing'
import {
  CRMLayout,
  CustomerList,
  Leads,
  SalesActivities,
  SalesPipeline,
  SalesForecast,
  SalesReports,
  SalesOrderDetail,
  SalesOrderList,
} from '@/pages/crm'
import {
  ProjectsLayout,
  ProjectList,
  ProjectCreate,
  ProjectDetail,
  ProjectEdit,
  OverviewTab as ProjectOverviewTab,
  BudgetTab as ProjectBudgetTab,
  TasksTab as ProjectTasksTab,
  MaterialsTab as ProjectMaterialsTab,
  DocumentsTab as ProjectDocumentsTab,
} from '@/pages/projects'
import {
  ARLayout,
  ARWorkbench,
  ARInvoices,
  ARInvoiceDetail,
  ARStatements,
  ARReports,
} from '@/pages/accounts-receivable'
import {
  APLayout,
  APDashboard,
  APBills,
  APBillDetailPage,
  APVouchers,
  APVoucherDetailPage,
  APSchedule,
  APChecks,
  APAging,
  APReports,
} from '@/pages/accounts-payable'
import {
  HRLayout,
  Employee201,
  Recruitment,
  OJTManagement,
  LeaveManagement,
  Attendance,
  PerformanceEvaluation,
  TrainingRecords,
  HRReports,
} from '@/pages/hr'
import DocumentManagement from '@/pages/DocumentManagement'
import {
  GLLayout,
  GLChartOfAccounts,
  GLJournalEntries,
  GLCashReceipts,
  GLCashDisbursements,
  GLSalesBook,
  GLPurchasesBook,
  GLGeneralLedger,
} from '@/pages/general-ledger'
import WorkflowApproval from '@/pages/WorkflowApproval'
import CommissionManagement from '@/pages/CommissionManagement'
import {
  TaxLayout,
  TaxDashboard,
  TaxBIRForms,
  TaxVATSummary,
  TaxWHTSummary,

  TaxReminders,
  Form2307,
  Form2307Detail,
  Form2307Print,
  Form0619E,
  Form0619EDetail,
  Form1601C,
  Form1601CDetail,
  Form1601EQ,
  Form1601EQDetail,
  Form2550Q,
  Form2550QDetail,
  Form2316,
  Form2316Detail,
  Form1600VT,
  Form1600VTDetail,
  Form1702Q,
  Form1702QDetail,
  Form1702,
  Form1702Detail,
  Form1604E,
  Form1604EDetail,
  Form1604EPrint,
  Form0605,
  Form0605Detail,
} from '@/pages/tax-management'
import SampleBIRForms from '@/pages/tax-management/SampleBIRForms'
import {
  LOALayout,
  BIRFormTab,
  SalesTrailTab,
  PurchaseTrailTab,
  MissingDocsTab,
  DocumentSearchTab,
} from '@/pages/loa'
import {
  PayrollLayout,
  PayrollDashboard,
  PayrollEmployees,
  PayrollGenerate,
  PayrollHistory,
  PayrollLoans,
} from '@/pages/payroll'
import {
  OJTLayout,
  InternList,
  TaskLogs,
  NDAMonitoring,
  Evaluation,
} from '@/pages/ojt'
import {
  ReportsLayout,
  ExecutiveOverview,
  FinancialPerformance,
  CashFlow,
  ProjectProfitability,
  SalesPerformance,
  ArApHealth,
  ComplianceSnapshot,
} from '@/pages/reports'
import UnderDevelopment from '@/pages/UnderDevelopment'
import Login from '@/pages/Login'
import { AppToaster } from '@/components/ui/toast'
import { getStoredUser, logout } from '@/utils/api'
import { PermissionsProvider, usePermissions } from '@/hooks/usePermissions.jsx'
import { ModuleGuard } from '@/components/ui/module-guard'
import { SessionGuard } from '@/components/ui/session-guard'

// Inner component so useNavigate works inside BrowserRouter
function AppRoutes() {
  const [user, setUser] = useState(() => getStoredUser())
  const navigate = useNavigate()
  const { refresh: refreshPermissions } = usePermissions()
  useSubRouteTracker()

  async function handleLogout() {
    await logout()
    setUser(null)
  }

  async function handleLogin(userData) {
    await refreshPermissions()
    setUser(userData)
  }

  // Called by SessionGuard when session expires (token already removed)
  function handleSessionEnd() {
    setUser(null)
  }

  // Redirect to login as soon as user is cleared
  useEffect(() => {
    if (!user) navigate('/login', { replace: true })
  }, [user, navigate])

  const isLoggedIn = !!user

  return (
    <>
      {isLoggedIn && <SessionGuard onSessionEnd={handleSessionEnd} />}
      <Routes>
      <Route
        path="/login"
        element={
          isLoggedIn
            ? <Navigate to="/dashboard" replace />
            : <Login onLogin={handleLogin} />
        }
      />
      <Route path="/" element={<AppLayout onLogout={handleLogout} user={user} />}>
        <Route index element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />} />
        <Route path="dashboard" element={isLoggedIn ? <ModuleGuard moduleKey="dashboard"><Dashboard user={user} /></ModuleGuard> : <Navigate to="/login" replace />} />
        <Route path="administration/*" element={isLoggedIn ? <ModuleGuard moduleKey="administration"><Administration /></ModuleGuard> : <Navigate to="/login" replace />} />
        <Route
          path="masterdata"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="masterdata"><MasterDataLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="masterdata" defaultRoute="clients" />} />
          <Route path=":resource" element={<MasterDataContent />} />
          <Route path="*" element={<Navigate to="clients" replace />} />
        </Route>
        <Route
          path="inventory"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="inventory"><InventoryLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="inventory" defaultRoute="products-services" />} />
          <Route path="list" element={<Navigate to="/inventory/products-services" replace />} />
          <Route path="products-services/*" element={<PSLayout />} />
          <Route path="movements" element={<StockMovement />} />
          <Route path="deliveries" element={<DeliveryNotes />} />
          <Route path="*" element={<Navigate to="products-services" replace />} />
        </Route>
        <Route
          path="quotation"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="quotation"><QuotationLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="quotation" defaultRoute="list" />} />
          <Route path="list" element={<QuotationList />} />
          <Route path="new" element={<QuotationCreate />} />
          <Route path=":id" element={<QuotationDetail />} />
          <Route path=":id/edit" element={<QuotationEdit />} />
          <Route path=":id/history" element={<QuotationHistory />} />
          <Route path=":id/versions" element={<QuotationVersions />} />
          <Route path="*" element={<Navigate to="list" replace />} />
        </Route>
        <Route
          path="purchasing"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="purchasing"><PurchasingLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="purchasing" defaultRoute="orders" />} />
          <Route path="requests" element={<PurchaseRequestsList />} />
          <Route path="requests/new" element={<PurchaseRequestCreate />} />
          <Route path="requests/:id" element={<PurchaseRequestDetail />} />
          <Route path="requests/:id/edit" element={<PurchaseRequestEdit />} />
          <Route path="orders" element={<PurchaseOrdersList />} />
          <Route path="suppliers" element={<SupplierList />} />
          <Route path="*" element={<Navigate to="/purchasing/orders" replace />} />
        </Route>
        <Route
          path="crm"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="crm"><CRMLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="crm" defaultRoute="pipeline" />} />
          <Route path="pipeline" element={<SalesPipeline />} />
          <Route path="leads" element={<Leads />} />
          <Route path="opportunities" element={<Navigate to="/crm/pipeline" replace />} />
          <Route path="activities" element={<SalesActivities />} />
          <Route path="customers" element={<CustomerList />} />
          <Route path="forecast" element={<SalesForecast />} />
          <Route path="reports" element={<SalesReports />} />
          <Route path="sales-orders" element={<SalesOrderList />} />
          <Route path="sales-orders/:id" element={<SalesOrderDetail />} />
          <Route path="*" element={<Navigate to="pipeline" replace />} />
        </Route>
        <Route
          path="projects"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="projects"><ProjectsLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="projects" defaultRoute="list" />} />
          <Route path="list" element={<ProjectList />} />
          <Route path="new" element={<ProjectCreate />} />
          <Route path=":id" element={<ProjectDetail />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<ProjectOverviewTab />} />
            <Route path="budget" element={<ProjectBudgetTab />} />
            <Route path="tasks" element={<ProjectTasksTab />} />
            <Route path="materials" element={<ProjectMaterialsTab />} />
            <Route path="documents" element={<ProjectDocumentsTab />} />
            <Route path="*" element={<Navigate to="overview" replace />} />
          </Route>
          <Route path=":id/edit" element={<ProjectEdit />} />
          <Route path="*" element={<Navigate to="list" replace />} />
        </Route>
        <Route
          path="accounts-receivable"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="accounts-receivable"><ARLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="accounts-receivable" defaultRoute="workbench" />} />
          <Route path="workbench" element={<ARWorkbench />} />
          <Route path="invoices" element={<ARInvoices />} />
          <Route path="invoices/:id" element={<ARInvoiceDetail />} />
          <Route path="statements" element={<ARStatements />} />
          <Route path="reports" element={<ARReports />} />
          <Route path="*" element={<Navigate to="workbench" replace />} />
        </Route>
        <Route
          path="accounts-payable"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="accounts-payable"><APLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="accounts-payable" defaultRoute="dashboard" />} />
          <Route path="dashboard" element={<APDashboard />} />
          <Route path="bills" element={<APBills />} />
          <Route path="bills/:id" element={<APBillDetailPage />} />
          <Route path="vouchers" element={<APVouchers />} />
          <Route path="vouchers/:id" element={<APVoucherDetailPage />} />
          <Route path="schedule" element={<APSchedule />} />
          <Route path="checks" element={<APChecks />} />
          <Route path="aging" element={<APAging />} />
          <Route path="reports" element={<APReports />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route
          path="hr"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="hr"><HRLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="hr" defaultRoute="201" />} />
          <Route path="201" element={<Employee201 />} />
          <Route path="recruitment" element={<Recruitment />} />
          <Route path="ojt" element={<OJTManagement />} />
          <Route path="leave" element={<LeaveManagement />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="performance" element={<PerformanceEvaluation />} />
          <Route path="training" element={<TrainingRecords />} />
          <Route path="reports" element={<HRReports />} />
          <Route path="*" element={<Navigate to="201" replace />} />
        </Route>
        <Route path="documents" element={isLoggedIn ? <ModuleGuard moduleKey="documents"><DocumentManagement user={user} /></ModuleGuard> : <Navigate to="/login" replace />} />
        <Route
          path="general-ledger"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="general-ledger"><GLLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="general-ledger" defaultRoute="general-ledger" />} />
          <Route path="coa" element={<GLChartOfAccounts />} />
          <Route path="entries" element={<GLJournalEntries />} />
          <Route path="cash-receipts" element={<GLCashReceipts />} />
          <Route path="cash-disbursements" element={<GLCashDisbursements />} />
          <Route path="sales-book" element={<GLSalesBook />} />
          <Route path="purchases-book" element={<GLPurchasesBook />} />
          <Route path="general-ledger" element={<GLGeneralLedger />} />
          <Route path="*" element={<Navigate to="/general-ledger/general-ledger" replace />} />
        </Route>
        <Route path="workflow" element={isLoggedIn ? <ModuleGuard moduleKey="workflow"><WorkflowApproval user={user} /></ModuleGuard> : <Navigate to="/login" replace />} />
        <Route
          path="tax"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="tax"><TaxLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="tax" defaultRoute="dashboard" />} />
          <Route path="dashboard" element={<TaxDashboard />} />
          <Route path="forms" element={<TaxBIRForms />} />
          <Route path="forms/2307/new" element={<Form2307 mode="create" />} />
          <Route path="forms/2307/:formId" element={<Form2307Detail />} />
          <Route path="forms/2307/:formId/edit" element={<Form2307 mode="edit" />} />
          <Route path="forms/2307/:formId/print" element={<Form2307Print />} />
          <Route path="forms/0619E/new" element={<Form0619E mode="create" />} />
          <Route path="forms/0619E/:formId" element={<Form0619EDetail />} />
          <Route path="forms/0619E/:formId/edit" element={<Form0619E mode="edit" />} />
          <Route path="forms/1601C/new" element={<Form1601C mode="create" />} />
          <Route path="forms/1601C/:formId" element={<Form1601CDetail />} />
          <Route path="forms/1601C/:formId/edit" element={<Form1601C mode="edit" />} />
          <Route path="forms/1601EQ/new" element={<Form1601EQ mode="create" />} />
          <Route path="forms/1601EQ/:formId" element={<Form1601EQDetail />} />
          <Route path="forms/1601EQ/:formId/edit" element={<Form1601EQ mode="edit" />} />
          <Route path="forms/2550Q/new" element={<Form2550Q mode="create" />} />
          <Route path="forms/2550Q/:formId" element={<Form2550QDetail />} />
          <Route path="forms/2550Q/:formId/edit" element={<Form2550Q mode="edit" />} />
          <Route path="forms/2316/new" element={<Form2316 mode="create" />} />
          <Route path="forms/2316/:formId" element={<Form2316Detail />} />
          <Route path="forms/2316/:formId/edit" element={<Form2316 mode="edit" />} />
          <Route path="forms/1600VT/new" element={<Form1600VT mode="create" />} />
          <Route path="forms/1600VT/:formId" element={<Form1600VTDetail />} />
          <Route path="forms/1600VT/:formId/edit" element={<Form1600VT mode="edit" />} />
          <Route path="forms/1702Q/new" element={<Form1702Q mode="create" />} />
          <Route path="forms/1702Q/:formId" element={<Form1702QDetail />} />
          <Route path="forms/1702Q/:formId/edit" element={<Form1702Q mode="edit" />} />
          <Route path="forms/1702/new" element={<Form1702 mode="create" />} />
          <Route path="forms/1702/:formId" element={<Form1702Detail />} />
          <Route path="forms/1702/:formId/edit" element={<Form1702 mode="edit" />} />
          <Route path="forms/1604E/new" element={<Form1604E mode="create" />} />
          <Route path="forms/1604E/:formId" element={<Form1604EDetail />} />
          <Route path="forms/1604E/:formId/edit" element={<Form1604E mode="edit" />} />
          <Route path="forms/1604E/:formId/print" element={<Form1604EPrint />} />
          <Route path="forms/0605/new" element={<Form0605 mode="create" />} />
          <Route path="forms/0605/:formId" element={<Form0605Detail />} />
          <Route path="forms/0605/:formId/edit" element={<Form0605 mode="edit" />} />
          <Route path="vat" element={<TaxVATSummary />} />
          <Route path="wht" element={<TaxWHTSummary />} />
          <Route path="reminders" element={<TaxReminders />} />
          <Route path="sample-forms" element={<SampleBIRForms />} />

          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route
          path="loa"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="loa"><LOALayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="loa" defaultRoute="bir" />} />
          <Route path="bir" element={<BIRFormTab />} />
          <Route path="sales" element={<SalesTrailTab />} />
          <Route path="purchase" element={<PurchaseTrailTab />} />
          <Route path="missing" element={<MissingDocsTab />} />
          <Route path="search" element={<DocumentSearchTab />} />
          <Route path="*" element={<Navigate to="bir" replace />} />
        </Route>
        <Route
          path="payroll"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="payroll"><PayrollLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<PersistentRedirect modulePath="payroll" defaultRoute="dashboard" />} />
          <Route path="dashboard" element={<PayrollDashboard />} />
          <Route path="employees" element={<PayrollEmployees />} />
          <Route path="generate" element={<PayrollGenerate />} />
          <Route path="history" element={<Navigate to="../generate" replace />} />
          <Route path="loans" element={<PayrollLoans />} />
          <Route path="*" element={<Navigate to="dashboard" replace />} />
        </Route>
        <Route path="commission" element={isLoggedIn ? <ModuleGuard moduleKey="commission"><CommissionManagement user={user} /></ModuleGuard> : <Navigate to="/login" replace />} />
        {/* Under Development modules */}
        <Route path="service" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        <Route path="datacenter" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        <Route path="lms" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        <Route path="ai" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        <Route path="ojt" element={isLoggedIn ? <ModuleGuard moduleKey="ojt"><OJTLayout /></ModuleGuard> : <Navigate to="/login" replace />}>
          <Route index element={<PersistentRedirect modulePath="ojt" defaultRoute="interns" />} />
          <Route path="interns" element={<InternList />} />
          <Route path="task-logs" element={<TaskLogs />} />
          <Route path="nda" element={<NDAMonitoring />} />
          <Route path="evaluation" element={<Evaluation />} />
          <Route path="*" element={<Navigate to="interns" replace />} />
        </Route>
        <Route
          path="reports"
          element={
            isLoggedIn
              ? <ModuleGuard moduleKey="reports"><ReportsLayout /></ModuleGuard>
              : <Navigate to="/login" replace />
          }
        >
          <Route index element={<Navigate to="executive-overview" replace />} />
          <Route path="executive-overview" element={<ExecutiveOverview />} />
          <Route path="financial-performance" element={<FinancialPerformance />} />
          <Route path="cash-flow" element={<CashFlow />} />
          <Route path="project-profitability" element={<ProjectProfitability />} />
          <Route path="sales-performance" element={<SalesPerformance />} />
          <Route path="ar-ap-health" element={<ArApHealth />} />
          <Route path="compliance-snapshot" element={<ComplianceSnapshot />} />
          <Route path="*" element={<Navigate to="executive-overview" replace />} />
        </Route>
        <Route path="bi" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        <Route path="settings" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
        {/* Catch-all for unknown routes */}
        <Route path="*" element={isLoggedIn ? <UnderDevelopment /> : <Navigate to="/login" replace />} />
      </Route>
    </Routes>
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <PermissionsProvider>
        <AppToaster />
        <AppRoutes />
      </PermissionsProvider>
    </BrowserRouter>
  )
}
