import { useOutletContext } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { FileText, FolderKanban, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { SectionHeader, RowActions } from '../projectsUtils'

export function DocumentsTab() {
  const { project, onAction, onRowAction } = useOutletContext()
  const documents = project.documents || []
  return (
    <Card className="overflow-hidden">
      <SectionHeader title="Project Documents" action={<Button size="sm" onClick={() => onAction('document')}><Paperclip size={14} /> Attach Document</Button>} />
      <CardContent className="p-0">
        {documents.length === 0 ? (
          <EmptyState icon={FolderKanban} title="No documents attached">Attach contracts, drawings, permits and acceptance documents here.</EmptyState>
        ) : (
          <div className="divide-y divide-[#e3ecf8]">
            {documents.map(doc => (
              <div key={doc.document_id} className="flex items-center gap-3 px-5 py-3">
                <FileText size={16} className="shrink-0 text-[#2c3a61]" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {doc.file_url
                      ? <a href={doc.file_url} target="_blank" rel="noreferrer" className="font-medium text-[#1a3fad] hover:underline">{doc.document_name}</a>
                      : <p className="font-medium text-slate-900">{doc.document_name}</p>}
                    {doc.document_type && <Badge variant="muted">{doc.document_type}</Badge>}
                  </div>
                  {doc.remarks && <p className="mt-0.5 truncate text-[11px] text-slate-500">{doc.remarks}</p>}
                </div>
                <RowActions onDelete={() => onRowAction('document', doc)} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
