'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { Assessment, DecisionInput } from '@/lib/assessments';

const LABEL: Record<string, string> = { monitor_only: 'Monitor Only', risk: 'Risk', elevated_risk: 'Elevated Risk', issue: 'Issue' };
const VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = { monitor_only: 'secondary', risk: 'default', elevated_risk: 'default', issue: 'destructive' };

/**
 * The AI recommendation + the human decision (FR-20, AI-02, FR-22, FR-23). The assessment cannot close
 * without one of the three decisions — the backend enforces it; this card just offers them.
 */
export function ResultCard({ a, onDecide, busy }: { a: Assessment; onDecide: (d: DecisionInput) => void; busy: boolean }) {
  const r = a.result!;
  const [mode, setMode] = useState<'none' | 'override' | 'escalate'>('none');
  const [reason, setReason] = useState('');
  const [to, setTo] = useState<string>('');
  const decided = a.decision && a.status !== 'escalated';
  const isError = a.status === 'error_review';

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-2xl">{r.score}/100</CardTitle>
          <Badge variant={VARIANT[r.classification] ?? 'default'} className="text-sm">
            {LABEL[r.classification] ?? r.classification}
          </Badge>
          {r.ruleDriven && <Badge variant="outline">Rule-driven: {r.ruleName ?? r.ruleKey}</Badge>}
          {isError && <Badge variant="destructive">Error review — score 0</Badge>}
          <Badge variant="outline">Confidence {r.confidence}%</Badge>
          {r.professionalConsult && <Badge variant="secondary">Professional consult recommended</Badge>}
        </div>
        <CardDescription>
          Recommended action: <span className="font-medium text-foreground">{r.recommendedAction}</span>
          {r.nextSteps.length ? ` · Next steps: ${r.nextSteps.join(', ')}` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p>{r.explanation}</p>
        {r.ruleDriven && r.computedClassification !== r.classification && (
          <p className="text-xs text-muted-foreground">Without the rule, the computed classification would have been {LABEL[r.computedClassification]}.</p>
        )}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Factor breakdown</summary>
          <table className="mt-2 w-full">
            <tbody>
              {Object.entries(r.factors).map(([k, f]) => (
                <tr key={k} className="border-t">
                  <td className="py-1">{k}</td>
                  <td>value {f.value}</td>
                  <td>{f.weight}%</td>
                  <td>{f.contribution.toFixed(1)} pts</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>

        {decided ? (
          <div className="rounded-md bg-muted p-3">
            <div className="font-medium">
              Decision: {a.decision!.type}
              {a.decision!.overriddenTo ? ` → ${LABEL[a.decision!.overriddenTo]}` : ''}
            </div>
            {a.decision!.reason && <div className="text-muted-foreground">{a.decision!.reason}</div>}
            <div className="text-xs text-muted-foreground">
              {new Date(a.decision!.decidedAt).toLocaleString()} · status {a.status}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">The AI does not decide. Record your decision to close this assessment (FR-22).</p>
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || isError} onClick={() => onDecide({ type: 'accept' })}>
                Accept recommendation
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setMode(mode === 'override' ? 'none' : 'override')}>
                Override…
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setMode(mode === 'escalate' ? 'none' : 'escalate')}>
                Escalate…
              </Button>
            </div>
            {mode !== 'none' && (
              <div className="space-y-2 rounded-md border p-3">
                {mode === 'override' && (
                  <Select value={to} onValueChange={(v) => setTo(v ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="New classification" />
                    </SelectTrigger>
                    <SelectContent>
                      {a.classifications.map((c) => (
                        <SelectItem key={c} value={c}>
                          {LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Textarea
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={mode === 'override' ? 'Reason (at least 25 characters, kept for reporting — FR-23)' : 'Why are you escalating? (optional)'}
                />
                <Button
                  disabled={busy || (mode === 'override' && (!to || reason.trim().length < 25))}
                  onClick={() => onDecide(mode === 'override' ? { type: 'override', overriddenTo: to as DecisionInput['overriddenTo'], reason } : { type: 'escalate', reason: reason || undefined })}
                >
                  {mode === 'override' ? 'Record override' : 'Escalate'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
