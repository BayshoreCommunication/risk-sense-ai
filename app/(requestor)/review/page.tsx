'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { assessments, type Assessment } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';

const LABEL: Record<string, string> = { monitor_only: 'Monitor Only', risk: 'Risk', elevated_risk: 'Elevated Risk', issue: 'Issue' };

/** DASH-01 (first pass): the requestor's assessments — own, plus department ones on PAID tenants. */
export default function ReviewPage() {
  const router = useRouter();
  const [items, setItems] = useState<Assessment[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assessments
      .list()
      .then((r) => setItems(r.items))
      .catch((e) => setError(toApiError(e).message));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Assessments</h1>
          <p className="text-sm text-muted-foreground">Pending decisions first. Open one to review the recommendation and record your decision.</p>
        </div>
        <Button onClick={() => router.push('/chat')}>New assessment</Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Scenario</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Classification</TableHead>
              <TableHead>Confidence</TableHead>
              <TableHead>Decision</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground">
                  No assessments yet.
                </TableCell>
              </TableRow>
            )}
            {[...items]
              .sort((a, b) => (a.status === 'awaiting_decision' ? -1 : 0) - (b.status === 'awaiting_decision' ? -1 : 0))
              .map((a) => (
                <TableRow key={a._id}>
                  <TableCell>{new Date(a.createdAt).toLocaleString()}</TableCell>
                  <TableCell>{a.scenarioKey?.replace(/_/g, ' ') ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === 'awaiting_decision' ? 'default' : 'secondary'}>{a.status.replace(/_/g, ' ')}</Badge>
                  </TableCell>
                  <TableCell>{a.result ? LABEL[a.result.classification] : '—'}</TableCell>
                  <TableCell>{a.result ? `${a.result.confidence}%` : '—'}</TableCell>
                  <TableCell>{a.decision ? `${a.decision.type}${a.decision.overriddenTo ? ` → ${LABEL[a.decision.overriddenTo]}` : ''}` : '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => router.push(`/chat/${a._id}`)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
