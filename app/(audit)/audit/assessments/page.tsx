'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssessmentDetail } from '@/components/review/AssessmentDetail';
import { ReconstructionView } from '@/components/review/ReconstructionView';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem, type AssessmentListResult } from '@/lib/assessments';

const LABEL: Record<string, string> = { monitor_only: 'Monitor Only', risk: 'Risk', elevated_risk: 'Elevated Risk', issue: 'Issue' };
const LIMIT = 25;

/** Audit role (read-only, whole tenant): every assessment, with the stored view and the FR-26 reconstruction side by side. */
export default function AuditAssessmentsPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssessmentListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<{ item: AssessmentListItem; mode: 'stored' | 'reconstruct' } | null>(null);

  const load = useCallback(() => {
    assessments
      .list({ sort: 'newest', limit: LIMIT, page })
      .then(setData)
      .catch((e) => setError(toApiError(e).message));
  }, [page]);
  useEffect(load, [load]);

  const items = data?.items ?? [];
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Assessments (audit view)</h1>
        <p className="text-sm text-muted-foreground">Every assessment in the tenant, newest first. “Stored” shows the record as saved; “Reconstruct” rebuilds it from the hash-chained audit log alone (FR-26) and flags any drift (FR-30).</p>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Requestor</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Persona / scenario</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground">
                  No assessments in this tenant.
                </TableCell>
              </TableRow>
            )}
            {items.map((a) => (
              <TableRow key={a._id}>
                <TableCell className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</TableCell>
                <TableCell className="whitespace-nowrap">{a.requestor?.name ?? '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.department?.name ?? '—'}</TableCell>
                <TableCell>
                  <div>{a.personaKey?.replace(/_/g, ' ') ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{a.status.replace(/_/g, ' ')}</Badge>
                </TableCell>
                <TableCell>{a.result ? LABEL[a.result.classification] ?? a.result.classification : '—'}</TableCell>
                <TableCell className="tabular-nums">{a.result ? `${a.result.confidence}%` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap">{a.decision ? `${a.decision.type}${a.decision.overriddenTo ? ` → ${LABEL[a.decision.overriddenTo] ?? a.decision.overriddenTo}` : ''}` : '—'}</TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Button size="sm" variant="outline" className="mr-1" onClick={() => setOpen({ item: a, mode: 'stored' })}>
                    Stored
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ item: a, mode: 'reconstruct' })}>
                    Reconstruct
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} assessments` : 'Loading…'}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {data?.pages ?? 1}
          </span>
          <Button size="sm" variant="outline" disabled={page >= (data?.pages ?? 1)} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>{open?.mode === 'reconstruct' ? 'Reconstructed from the audit log' : 'Stored record'} · {open?.item._id.slice(-6)}</DialogTitle>
            <DialogDescription>{open?.mode === 'reconstruct' ? 'Nothing here is read from the assessment document; only the audit entries (FR-26).' : 'The assessment as saved in the database.'}</DialogDescription>
          </DialogHeader>
          {open && (open.mode === 'reconstruct' ? <ReconstructionView id={open.item._id} /> : <AssessmentDetail id={open.item._id} />)}
        </DialogContent>
      </Dialog>
    </div>
  );
}
