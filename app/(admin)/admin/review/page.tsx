'use client';

import { useCallback, useEffect, useState } from 'react';
import { AssessmentDetail } from '@/components/review/AssessmentDetail';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toApiError } from '@/lib/api/client';
import { assessments, type AssessmentListItem, type AssessmentListResult } from '@/lib/assessments';

const LABEL: Record<string, string> = { monitor_only: 'Monitor Only', risk: 'Risk', elevated_risk: 'Elevated Risk', issue: 'Issue' };
const LIMIT = 25;

/**
 * AI-03 mandatory-review queue: assessments whose confidence fell below the matrix's `mandatoryReviewBelow`
 * and that still await a human decision. Administrators review the extraction (flagged facts, explanation)
 * and follow up with the requestor / TAC content fixes; they do not record the decision (Overview.md roles).
 */
export default function MandatoryReviewQueuePage() {
  const [tab, setTab] = useState<'pending' | 'all'>('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AssessmentListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<AssessmentListItem | null>(null);

  const load = useCallback(() => {
    assessments
      .list({ mandatoryReview: 'true', ...(tab === 'pending' ? { pending: 'true' as const } : {}), sort: 'oldest', limit: LIMIT, page })
      .then(setData)
      .catch((e) => setError(toApiError(e).message));
  }, [tab, page]);
  useEffect(load, [load]);

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Mandatory review queue</h1>
        <p className="text-sm text-muted-foreground">
          Assessments flagged because their confidence fell below the matrix threshold (AI-03). Oldest first. Open one to check the extracted facts and the explanation; the requestor or their reviewer records the decision.
        </p>
      </div>
      <div className="flex gap-1 border-b pb-2">
        <Button size="sm" variant={tab === 'pending' ? 'default' : 'ghost'} onClick={() => { setTab('pending'); setPage(1); }}>
          Awaiting decision{data ? ` ${data.counts.pending}` : ''}
        </Button>
        <Button size="sm" variant={tab === 'all' ? 'default' : 'ghost'} onClick={() => { setTab('all'); setPage(1); }}>
          All flagged{data ? ` ${data.counts.all}` : ''}
        </Button>
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
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && items.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  Nothing flagged for mandatory review.
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
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => setOpen(a)}>
                    Inspect
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data ? `${data.total} flagged` : 'Loading…'}</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>
      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Assessment {open?._id.slice(-6)}</DialogTitle>
            <DialogDescription>Read-only. Decisions are recorded by the requestor or the reviewer it was escalated to.</DialogDescription>
          </DialogHeader>
          {open && <AssessmentDetail id={open._id} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
