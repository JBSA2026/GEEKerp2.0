// src/config/moduleRoutes.js — reference data for route setup and sub-route persistence
export const MODULE_ROUTES = {
  masterdata: {
    path: 'masterdata',
    moduleKey: 'masterdata',
    defaultSubRoute: 'clients',
    validSubRoutes: ['clients'],
  },
  inventory: {
    path: 'inventory',
    moduleKey: 'inventory',
    defaultSubRoute: 'products-services',
    validSubRoutes: ['products-services', 'movements', 'deliveries'],
  },
  quotation: {
    path: 'quotation',
    moduleKey: 'quotation',
    defaultSubRoute: 'list',
    validSubRoutes: ['list'],
  },
  purchasing: {
    path: 'purchasing',
    moduleKey: 'purchasing',
    defaultSubRoute: 'orders',
    validSubRoutes: ['requests', 'orders', 'suppliers'],
  },
  crm: {
    path: 'crm',
    moduleKey: 'crm',
    defaultSubRoute: 'pipeline',
    validSubRoutes: ['pipeline', 'sales-orders', 'leads', 'activities', 'customers', 'forecast', 'reports'],
  },
  projects: {
    path: 'projects',
    moduleKey: 'projects',
    defaultSubRoute: 'list',
    validSubRoutes: ['list'],
  },
  'accounts-receivable': {
    path: 'accounts-receivable',
    moduleKey: 'accounts-receivable',
    defaultSubRoute: 'workbench',
    validSubRoutes: ['workbench', 'invoices', 'statements', 'reports'],
  },
  'accounts-payable': {
    path: 'accounts-payable',
    moduleKey: 'accounts-payable',
    defaultSubRoute: 'dashboard',
    validSubRoutes: ['dashboard', 'bills', 'vouchers', 'schedule', 'checks', 'aging', 'reports'],
  },
  hr: {
    path: 'hr',
    moduleKey: 'hr',
    defaultSubRoute: '201',
    validSubRoutes: ['201', 'recruitment', 'ojt', 'leave', 'attendance', 'performance', 'training', 'reports'],
  },
  'general-ledger': {
    path: 'general-ledger',
    moduleKey: 'general-ledger',
    defaultSubRoute: 'general-ledger',
    validSubRoutes: ['general-ledger', 'coa', 'entries', 'cash-receipts', 'cash-disbursements', 'sales-book', 'purchases-book'],
  },
  tax: {
    path: 'tax',
    moduleKey: 'tax',
    defaultSubRoute: 'dashboard',
    validSubRoutes: ['dashboard', 'forms', 'vat', 'wht', 'deadlines', 'codes'],
  },
  loa: {
    path: 'loa',
    moduleKey: 'loa',
    defaultSubRoute: 'bir',
    validSubRoutes: ['bir', 'sales', 'purchase', 'missing', 'search'],
  },
  payroll: {
    path: 'payroll',
    moduleKey: 'payroll',
    defaultSubRoute: 'dashboard',
    validSubRoutes: ['dashboard', 'employees', 'generate', 'loans'],
  },
  ojt: {
    path: 'ojt',
    moduleKey: 'ojt',
    defaultSubRoute: 'interns',
    validSubRoutes: ['interns', 'task-logs', 'nda', 'evaluation'],
  },
  reports: {
    path: 'reports',
    moduleKey: 'reports',
    defaultSubRoute: 'executive-overview',
    validSubRoutes: ['executive-overview', 'financial-performance', 'cash-flow', 'project-profitability', 'sales-performance', 'ar-ap-health', 'compliance-snapshot'],
  },
}
