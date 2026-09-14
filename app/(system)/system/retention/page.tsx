'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, toApiError } from '@/lib/api/client';
import type { components } from '@/lib/api/types';

type Run = components['schemas']['RetentionRunResult'] & { _id: string; ranAt: string; trigger: string; error?: string };

/** System administrator: SEC-06 retention enforcement — dry run, real run, history. Policy numbers live on /system/tenant. */
export default function RetentionPage() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [last, setLast] = useState<components['schemas']['RetentionRunResult'] | null>(null);
  const [busy, setBusy] = useState<'dry' | 'real' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(() => {
    api.GET('/system/retention/runs').then((r) => (r.data ? setRuns(r.data.data as Run[]) : setError(toApiError((r as { error?: unknown }).error).message)));
  }, []);
  useEffect(load, [load]);

  async function run(dryRun: boolean) {
    setBusy(dryRun ? 'dry' : 'real');
    setError(null);
    setConfirm(false);
    const r = await api.POST('/system/retention/run', { body: { dryRun } });
    setBusy(null);
    if (!r.data) return setError(toApiError((r as { error?: unknown }).error).message);
    setLast(r.data.data);
    load();
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Retention</h1>
        <p className="text-sm text-muted-foreground">
          Records older than the tenant&apos;s assessment window are flagged, then after a 7-day grace period FREE records are reduced to login id, risk type, date/time and duration, and PAID records are archived to cold storage before reduction. The audit log is never deleted (SEC-07). Every action is audited as <code>retention.*</code>. The nightly job runs at 02:00 UTC when <code>JOBS_ENABLED=true</code>.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" disabled={busy !== null} onClick={() => void run(true)}>
          {busy === 'dry' ? 'Running…' : 'Dry run (report only)'}
        </Button>
        {!confirm ? (
          <Button variant="destructive" disabled={busy !== null} onClick={() => setConfirm(true)}>
            Run now
          </Button>
        ) : (
          <>
            <span className="text-sm text-destructive">This reduces / archives eligible records. Continue?</span>
            <Button variant="destructive" disabled={busy !== null} onClick={() => void run(false)}>
              {busy === 'real' ? 'Running…' : 'Yes, run retention'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {last && (
        <div className="rounded-md border p-3 text-sm">
          <div className="mb-1 font-medium">
            {last.dryRun ? 'Dry run' : 'Run'} · {last.plan.toUpperCase()} · window {last.policy.assessmentDays} days · grace {last.policy.graceDays} days
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge variant="outline">flagged {last.flagged}</Badge>
            <Badge variant="outline">reduced {last.reduced}</Badge>
            <Badge variant="outline">archived {last.archived}</Badge>
            <Badge variant="outline">messages removed {last.messagesRemoved}</Badge>
            <Badge variant="outline">audit entries past window {last.auditPastRetention}</Badge>
            <Badge variant="outline">{last.durationMs} ms</Badge>
          </div>
        </div>
      )}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Flagged</TableHead>
              <TableHead className="text-right">Reduced</TableHead>
              <TableHead className="text-right">Archived</TableHead>
              <TableHead className="text-right">Audit past window</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground">
                  No runs yet.
                </TableCell>
              </TableRow>
            )}
            {runs.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="whitespace-nowrap">{new Date(r.ranAt).toLocaleString()}</TableCell>
                <TableCell>{r.trigger}</TableCell>
                <TableCell>{r.dryRun ? 'dry run' : 'enforced'}</TableCell>
                <TableCell className="text-right tabular-nums">{r.flagged}</TableCell>
                <TableCell className="text-right tabular-nums">{r.reduced}</TableCell>
                <TableCell className="text-right tabular-nums">{r.archived}</TableCell>
                <TableCell className="text-right tabular-nums">{r.auditPastRetention}</TableCell>
                <TableCell className="text-xs text-destructive">{r.error ?? ''}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
