'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FlaskConical, Play, ShieldCheck } from 'lucide-react';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { matricesApi, simulateScore } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

const factorExample = { weight: 25, scale: { min: 1, max: 5 }, mapping: [{ when: { factKey: 'amount_usd', op: 'gt', value: 100000 }, value: 5 }] };

function matrixFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'name', label: t('fields.name'), kind: 'text', required: true },
  { name: 'sector', label: t('fields.sector'), kind: 'select', options: ['financial', 'healthcare', 'it', 'general'] },
  {
    name: 'factors',
    label: t('fields.factors'),
    kind: 'factors',
    required: true,
    help: t('help.factors'),
    defaultValue: {
      impact: factorExample,
      likelihood: { ...factorExample, weight: 20, mapping: [] },
      severity: { ...factorExample, weight: 20, mapping: [] },
      controlEffectiveness: { ...factorExample, weight: 15, mapping: [] },
      regulatorySensitivity: { ...factorExample, weight: 15, mapping: [] },
      duration: { ...factorExample, weight: 5, mapping: [] },
    },
  },
  {
    name: 'thresholds',
    label: t('fields.thresholds'),
    kind: 'thresholds',
    required: true,
    help: t('help.thresholds'),
    defaultValue: { monitor_only: { min: 0, max: 25 }, risk: { min: 26, max: 50 }, elevated_risk: { min: 51, max: 75 }, issue: { min: 76, max: 100 } },
  },
  {
    name: 'confidence',
    label: t('fields.confidence'),
    kind: 'confidence',
    defaultValue: { professionalConsultBelow: 60, mandatoryReviewBelow: 40 },
    help: t('help.confidence'),
  },
  ];
}

type SimResult = {
  score: number;
  classification: string;
  computedClassification: string;
  ruleDriven: boolean;
  rule?: { ruleKey: string; ruleName: string } | null;
  confidence: number;
  professionalConsult: boolean;
  mandatoryReview: boolean;
  errorReview: boolean;
  factors: Record<string, { value: number; weight: number; contribution: number; matchedMapping: number | null }>;
  matrix: { key: string; version: number };
};

function Simulator() {
  const t = useTranslations('admin.scoring.simulator');
  const [facts, setFacts] = useState('{\n  "amount_usd": 250000,\n  "authorized": false,\n  "controls_bypassed": true,\n  "incident_status": "active"\n}');
  const [required, setRequired] = useState('amount_usd; authorized; controls_bypassed; incident_status');
  const [result, setResult] = useState<SimResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const parsed = JSON.parse(facts);
      const res = await simulateScore({
        facts: parsed,
        requiredFactKeys: required.split(';').map((s) => s.trim()).filter(Boolean),
        factConfidences: {},
        includeRules: true,
      });
      setResult(res as unknown as SimResult);
    } catch (e) {
      setError(e instanceof SyntaxError ? t('invalidFacts') : toApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-0 bg-card shadow-sm ring-1 ring-foreground/8">
      <CardHeader className="border-b border-border/60 pb-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-500/10 text-violet-700">
            <FlaskConical className="size-5" aria-hidden="true" />
          </span>
          <div>
            <CardTitle className="text-base">{t('title')}</CardTitle>
            <CardDescription className="mt-1 leading-5">{t('description')}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-4">
          <label className="text-sm font-medium" htmlFor="facts">
            {t('facts')}
          </label>
          <Textarea id="facts" rows={10} className="bg-background font-mono text-xs" value={facts} onChange={(e) => setFacts(e.target.value)} />
          <label className="text-sm font-medium" htmlFor="req">
            {t('requiredFacts')}
          </label>
          <Textarea id="req" rows={2} className="bg-background" value={required} onChange={(e) => setRequired(e.target.value)} />
          <Button onClick={() => void run()} disabled={busy}>
            <Play data-icon="inline-start" aria-hidden="true" />
            {busy ? t('scoring') : t('run')}
          </Button>
          {error && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-sm text-destructive" role="alert">{error}</p>}
        </div>
        <div className="min-h-72 space-y-3 rounded-xl border border-border/70 bg-background p-4 text-sm">
          {!result ? (
            <div className="grid h-full min-h-56 place-items-center text-center text-muted-foreground">
              <div>
                <ShieldCheck className="mx-auto mb-3 size-8 text-primary/40" aria-hidden="true" />
                <p>{t('empty')}</p>
              </div>
            </div>
          ) : null}
          {result && (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-3">
                <span className="font-heading text-3xl font-semibold tracking-tight tabular-nums">{result.score}</span>
                <Badge variant={result.classification === 'issue' ? 'destructive' : 'default'}>{result.classification}</Badge>
                {result.ruleDriven ? <Badge variant="outline">{t('ruleDriven')}: {result.rule?.ruleKey}</Badge> : null}
                {result.errorReview ? <Badge variant="destructive">{t('errorReview')}</Badge> : null}
              </div>
              <div className="leading-6 text-muted-foreground">
                {t('computed')}: {result.computedClassification} · {t('confidence')} {result.confidence}% {result.professionalConsult ? `· ${t('professionalConsult')}` : ''}{' '}
                {result.mandatoryReview ? `· ${t('mandatoryReview')}` : ''} · {t('matrix')} {result.matrix.key} v{result.matrix.version}
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/70">
              <table className="w-full min-w-[36rem] text-xs">
                <thead className="bg-muted/45">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-2 py-2">{t('columns.factor')}</th>
                    <th className="px-2 py-2">{t('columns.value')}</th>
                    <th className="px-2 py-2">{t('columns.weight')}</th>
                    <th className="px-2 py-2">{t('columns.points')}</th>
                    <th className="px-2 py-2">{t('columns.mapping')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.factors).map(([k, f]) => (
                    <tr key={k} className="border-t">
                      <td className="px-2 py-2 font-medium">{k}</td>
                      <td className="px-2 py-2 tabular-nums">{f.value}</td>
                      <td className="px-2 py-2 tabular-nums">{f.weight}%</td>
                      <td className="px-2 py-2 tabular-nums">{f.contribution.toFixed(1)}</td>
                      <td className="px-2 py-2">{f.matchedMapping === null ? t('defaultMinimum') : `#${f.matchedMapping + 1}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ScoringPage() {
  const t = useTranslations('admin.scoring');
  const fields = matrixFields(t);
  return (
    <div className="space-y-6">
      <ContentManager
        title={t('title')}
        description={t('description')}
        entity={t('entity')}
        apiClient={matricesApi}
        fields={fields}
        columns={[
          { key: 'key', label: t('fields.key') },
          { key: 'name', label: t('fields.name') },
          { key: 'sector', label: t('fields.sector') },
          { key: 'approvedBy', label: t('columns.approved'), render: (it) => (it.approvedBy ? t('yes') : '—') },
        ]}
        versioned
        approval
      />
      <Simulator />
    </div>
  );
}
