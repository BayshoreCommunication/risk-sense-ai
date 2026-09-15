'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
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
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="facts">
            {t('facts')}
          </label>
          <Textarea id="facts" rows={10} className="font-mono text-xs" value={facts} onChange={(e) => setFacts(e.target.value)} />
          <label className="text-sm font-medium" htmlFor="req">
            {t('requiredFacts')}
          </label>
          <Textarea id="req" rows={2} value={required} onChange={(e) => setRequired(e.target.value)} />
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? t('scoring') : t('run')}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="space-y-2 text-sm">
          {!result ? <p className="text-muted-foreground">{t('empty')}</p> : null}
          {result && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{result.score}</span>
                <Badge variant={result.classification === 'issue' ? 'destructive' : 'default'}>{result.classification}</Badge>
                {result.ruleDriven ? <Badge variant="outline">{t('ruleDriven')}: {result.rule?.ruleKey}</Badge> : null}
                {result.errorReview ? <Badge variant="destructive">{t('errorReview')}</Badge> : null}
              </div>
              <div className="text-muted-foreground">
                {t('computed')}: {result.computedClassification} · {t('confidence')} {result.confidence}% {result.professionalConsult ? `· ${t('professionalConsult')}` : ''}{' '}
                {result.mandatoryReview ? `· ${t('mandatoryReview')}` : ''} · {t('matrix')} {result.matrix.key} v{result.matrix.version}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>{t('columns.factor')}</th>
                    <th>{t('columns.value')}</th>
                    <th>{t('columns.weight')}</th>
                    <th>{t('columns.points')}</th>
                    <th>{t('columns.mapping')}</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.factors).map(([k, f]) => (
                    <tr key={k} className="border-t">
                      <td className="py-1">{k}</td>
                      <td>{f.value}</td>
                      <td>{f.weight}%</td>
                      <td>{f.contribution.toFixed(1)}</td>
                      <td>{f.matchedMapping === null ? t('defaultMinimum') : `#${f.matchedMapping + 1}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
    <div className="space-y-8">
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
