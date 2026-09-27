import {
  Check, CheckCircle2, Circle, Clock, FileText, Hourglass, LogOut, Moon,
  Package, Pause, Play, Send, ShoppingBag, ThumbsDown, ThumbsUp, Truck,
  X, XCircle, AlertCircle, Banknote, RefreshCw, Archive,
  Star, Phone, UserCheck, ArrowRightCircle,
  Target, Briefcase, MessageSquare, Handshake, Trophy, Ban,
  Calendar, Eye, CircleX, AlertTriangle,
} from 'lucide-react'

/**
 * Shared StatusBadge component following the HR module design pattern:
 * - Rounded-full pill shape
 * - Icon + label inside
 * - Color-coded by semantic meaning (success, warning, danger, info, muted)
 *
 * Usage:
 *   <StatusBadge status="APPROVED" config={MY_STATUS_CONFIG} />
 *   or with a simple map:
 *   <StatusBadge status="Active" />
 */

// ─── Default status configurations ──────────────────────────────────────────
// Each config maps a lowercase status key to { label, icon, color-classes }
// Colors follow: bg-{color}-100 text-{color}-700 pattern with appropriate icons

const STATUS_STYLES = {
  // ── General / Shared ──
  active: {
    label: 'Active',
    dot: true,
    className: 'bg-emerald-100 text-emerald-700',
  },
  inactive: {
    label: 'Inactive',
    icon: Pause,
    className: 'bg-slate-100 text-slate-500',
  },
  archived: {
    label: 'Archived',
    icon: Archive,
    className: 'bg-slate-100 text-slate-500 opacity-70',
  },

  // ── HR-specific ──
  'on leave': {
    label: 'On Leave',
    icon: Moon,
    className: 'bg-amber-100 text-amber-700',
  },
  resigned: {
    label: 'Resigned',
    icon: LogOut,
    className: 'bg-slate-100 text-slate-500 opacity-70',
    strikethrough: true,
  },
  probationary: {
    label: 'Probationary',
    icon: Hourglass,
    className: 'bg-indigo-100 text-indigo-700',
  },
  terminated: {
    label: 'Terminated',
    icon: X,
    className: 'bg-rose-100 text-rose-700',
  },

  // ── Lifecycle / Workflow ──
  draft: {
    label: 'Draft',
    icon: FileText,
    className: 'bg-slate-100 text-slate-600',
  },
  pending: {
    label: 'Pending',
    icon: Clock,
    className: 'bg-slate-100 text-slate-600',
  },
  submitted: {
    label: 'Submitted',
    icon: Send,
    className: 'bg-blue-100 text-blue-700',
  },
  for_approval: {
    label: 'For Approval',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700',
  },
  approved: {
    label: 'Approved',
    icon: ThumbsUp,
    className: 'bg-emerald-100 text-emerald-700',
  },
  rejected: {
    label: 'Rejected',
    icon: ThumbsDown,
    className: 'bg-rose-100 text-rose-700',
  },
  confirmed: {
    label: 'Confirmed',
    icon: CheckCircle2,
    className: 'bg-blue-100 text-blue-700',
  },
  sent: {
    label: 'Sent',
    icon: Send,
    className: 'bg-blue-100 text-blue-700',
  },
  accepted: {
    label: 'Accepted',
    icon: Check,
    className: 'bg-emerald-100 text-emerald-700',
  },
  converted: {
    label: 'Converted',
    icon: ArrowRightCircle,
    className: 'bg-purple-100 text-purple-700',
  },
  cancelled: {
    label: 'Cancelled',
    icon: XCircle,
    className: 'bg-rose-100 text-rose-700',
  },

  // ── Project statuses ──
  planning: {
    label: 'Planning',
    icon: FileText,
    className: 'bg-slate-100 text-slate-600',
  },
  in_progress: {
    label: 'In Progress',
    icon: Play,
    className: 'bg-blue-100 text-blue-700',
  },
  on_hold: {
    label: 'On Hold',
    icon: Pause,
    className: 'bg-amber-100 text-amber-700',
  },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },
  closed: {
    label: 'Closed',
    icon: Check,
    className: 'bg-emerald-100 text-emerald-700',
  },
  blocked: {
    label: 'Blocked',
    icon: XCircle,
    className: 'bg-rose-100 text-rose-700',
  },

  // ── Task / Milestone ──
  todo: {
    label: 'To Do',
    icon: Circle,
    className: 'bg-slate-100 text-slate-600',
  },
  done: {
    label: 'Done',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },
  billed: {
    label: 'Billed',
    icon: Banknote,
    className: 'bg-emerald-100 text-emerald-700',
  },
  planned: {
    label: 'Planned',
    icon: Clock,
    className: 'bg-slate-100 text-slate-600',
  },
  reserved: {
    label: 'Reserved',
    icon: Package,
    className: 'bg-amber-100 text-amber-700',
  },
  ordered: {
    label: 'Ordered',
    icon: ShoppingBag,
    className: 'bg-amber-100 text-amber-700',
  },
  issued: {
    label: 'Issued',
    icon: Send,
    className: 'bg-blue-100 text-blue-700',
  },
  delivered: {
    label: 'Delivered',
    icon: Truck,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Purchasing workflow ──
  to_purchase: {
    label: 'To Purchase',
    icon: ShoppingBag,
    className: 'bg-amber-100 text-amber-700',
  },
  rfq_sent: {
    label: 'RFQ Sent',
    icon: Send,
    className: 'bg-blue-100 text-blue-700',
  },
  quote_received: {
    label: 'Quote Received',
    icon: FileText,
    className: 'bg-amber-100 text-amber-700',
  },
  comparison_done: {
    label: 'Comparison Done',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },
  po_created: {
    label: 'PO Created',
    icon: FileText,
    className: 'bg-emerald-100 text-emerald-700',
  },
  po_sent: {
    label: 'PO Sent',
    icon: Send,
    className: 'bg-amber-100 text-amber-700',
  },
  partially_received: {
    label: 'Partially Received',
    icon: Package,
    className: 'bg-amber-100 text-amber-700',
  },
  received: {
    label: 'Received',
    icon: Package,
    className: 'bg-emerald-100 text-emerald-700',
  },
  selected: {
    label: 'Selected',
    icon: Check,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Accounts Payable / Receivable ──
  unpaid: {
    label: 'Unpaid',
    icon: AlertCircle,
    className: 'bg-amber-100 text-amber-700',
  },
  partially_paid: {
    label: 'Partially Paid',
    icon: RefreshCw,
    className: 'bg-blue-100 text-blue-700',
  },
  verified: {
    label: 'Verified',
    icon: CheckCircle2,
    className: 'bg-blue-100 text-blue-700',
  },
  paid: {
    label: 'Paid',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },
  ap_open: {
    label: 'AP Open',
    icon: AlertCircle,
    className: 'bg-amber-100 text-amber-700',
  },
  ap_paid: {
    label: 'AP Paid',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Check monitoring ──
  cleared: {
    label: 'Cleared',
    icon: CheckCircle2,
    className: 'bg-emerald-100 text-emerald-700',
  },
  bounced: {
    label: 'Bounced',
    icon: XCircle,
    className: 'bg-rose-100 text-rose-700',
  },

  // ── CRM Leads ──
  new: {
    label: 'New',
    icon: Star,
    className: 'bg-blue-100 text-blue-700',
  },
  contacted: {
    label: 'Contacted',
    icon: Phone,
    className: 'bg-purple-100 text-purple-700',
  },
  qualified: {
    label: 'Qualified',
    icon: UserCheck,
    className: 'bg-emerald-100 text-emerald-700',
  },
  unqualified: {
    label: 'Unqualified',
    icon: Ban,
    className: 'bg-slate-100 text-slate-500',
  },

  // ── CRM Opportunities / Pipeline stages ──
  prospecting: {
    label: 'Prospecting',
    icon: Target,
    className: 'bg-blue-100 text-blue-700',
  },
  qualification: {
    label: 'Qualification',
    icon: Briefcase,
    className: 'bg-indigo-100 text-indigo-700',
  },
  proposal: {
    label: 'Proposal',
    icon: MessageSquare,
    className: 'bg-purple-100 text-purple-700',
  },
  negotiation: {
    label: 'Negotiation',
    icon: Handshake,
    className: 'bg-amber-100 text-amber-700',
  },
  'closed won': {
    label: 'Closed Won',
    icon: Trophy,
    className: 'bg-emerald-100 text-emerald-700',
  },
  'closed lost': {
    label: 'Closed Lost',
    icon: XCircle,
    className: 'bg-rose-100 text-rose-700',
  },

  // ── Inventory ──
  low_stock: {
    label: 'Low Stock',
    icon: AlertCircle,
    className: 'bg-amber-100 text-amber-700',
  },
  out_of_stock: {
    label: 'Out of Stock',
    icon: XCircle,
    className: 'bg-rose-100 text-rose-700',
  },
  in_stock: {
    label: 'In Stock',
    dot: true,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Training Records ──
  scheduled: {
    label: 'Scheduled',
    icon: Calendar,
    className: 'bg-blue-100 text-blue-700',
  },

  // ── Recruitment (Job Openings) ──
  open: {
    label: 'Open',
    icon: Circle,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Recruitment (Applicants) ──
  applied: {
    label: 'Applied',
    icon: Circle,
    className: 'bg-blue-100 text-blue-700',
  },
  screening: {
    label: 'Screening',
    icon: Eye,
    className: 'bg-purple-100 text-purple-700',
  },
  interview: {
    label: 'Interview',
    icon: UserCheck,
    className: 'bg-indigo-100 text-indigo-700',
  },
  offer: {
    label: 'Offer',
    icon: Handshake,
    className: 'bg-amber-100 text-amber-700',
  },
  hired: {
    label: 'Hired',
    icon: UserCheck,
    className: 'bg-emerald-100 text-emerald-700',
  },

  // ── Attendance ──
  present: {
    label: 'Present',
    icon: Check,
    className: 'bg-emerald-100 text-emerald-700',
  },
  late: {
    label: 'Late',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700',
  },
  undertime: {
    label: 'Undertime',
    icon: AlertTriangle,
    className: 'bg-blue-100 text-blue-700',
  },
  'late/undertime': {
    label: 'Late/Undertime',
    icon: CircleX,
    className: 'bg-rose-100 text-rose-600',
  },
  absent: {
    label: 'Absent',
    icon: X,
    className: 'bg-red-100 text-red-600',
  },

  // ── OJT Management ──
  withdrawn: {
    label: 'Withdrawn',
    icon: LogOut,
    className: 'bg-rose-100 text-rose-600',
  },
  extended: {
    label: 'Extended',
    icon: Clock,
    className: 'bg-amber-100 text-amber-700',
  },

  // ── Performance Evaluation ──
  // 'draft' already defined above (uses FileText icon)
  // Override for perf eval context where Draft uses Pen icon

  // ── NDA Monitoring ──
  signed: {
    label: 'Signed',
    icon: ThumbsUp,
    className: 'bg-emerald-100 text-emerald-700',
  },
  expired: {
    label: 'Expired',
    icon: Clock,
    className: 'bg-rose-100 text-rose-600',
  },
  waived: {
    label: 'Waived',
    icon: FileText,
    className: 'bg-slate-100 text-slate-500',
  },
}

export function StatusBadge({ status, config, className = '' }) {
  if (!status) return null

  const key = String(status).toLowerCase().replace(/_/g, ' ').trim()
  const keyUnderscore = String(status).toLowerCase().trim()

  // Look up in custom config first, then global styles (try both space and underscore formats)
  const style = config?.[key] || config?.[keyUnderscore]
    || STATUS_STYLES[key] || STATUS_STYLES[keyUnderscore] || null

  if (!style) {
    // Fallback: render a neutral pill with capitalized label
    const label = String(status).replace(/_/g, ' ')
    return (
      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 ${className}`}>
        {label}
      </span>
    )
  }

  const Icon = style.icon
  const label = style.label || String(status).replace(/_/g, ' ')

  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${style.className} ${className}`}>
      {style.dot && <span className="h-2 w-2 rounded-full bg-current opacity-70" />}
      {Icon && <Icon size={11} className="shrink-0" />}
      {style.strikethrough ? <span className="line-through">{label}</span> : label}
    </span>
  )
}

export { STATUS_STYLES }
