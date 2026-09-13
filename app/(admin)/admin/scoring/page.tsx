'use client';

import { useState } from 'react';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { matricesApi, simulateScore } from '@/lib/admin/content';
import { toApiError } from '@/lib/api/client';

const factorExample = { weight: 25, scale: { min: 1, max: 5 }, mapping: [{ when: { factKey: 'amount_usd', op: 'gt', value: 100000 }, value: 5 }] };

const fields: FieldSpec[] = [
  { name: 'key', label: 'Key', kind: 'text', required: true, immutable: true, help: '"default" is used when no sector matrix exists' },
  { name: 'name', label: 'Name', kind: 'text', required: true },
  { name: 'sector', label: 'Sector', kind: 'select', options: ['financial', 'healthcare', 'it', 'general'] },
  {
    name: 'factors',
    label: 'Factors (JSON)',
    kind: 'json',
    required: true,
    help: 'Six factors; weights sum to 100; mapping = first matching condition → value within scale (FR-18)',
    example: {
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
    label: 'Thresholds (JSON)',
    kind: 'json',
    required: true,
    help: 'Contiguous ranges covering 0–100 (FR-19)',
    example: { monitor_only: { min: 0, max: 25 }, risk: { min: 26, max: 50 }, elevated_risk: { min: 51, max: 75 }, issue: { min: 76, max: 100 } },
  },
  { name: 'confidence', label: 'Confidence policy (JSON)', kind: 'json', example: { professionalConsultBelow: 60, mandatoryReviewBelow: 40 }, help: 'FR-20 / AI-03' },
];

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
      setError(e instanceof SyntaxError ? 'Facts must be valid JSON' : toApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Simulate (FR-18 test harness)</CardTitle>
        <CardDescription>Runs the exact production functions against the current active matrix and active hard rules. Nothing is stored.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="facts">
            Facts (JSON)
          </label>
          <Textarea id="facts" rows={10} className="font-mono text-xs" value={facts} onChange={(e) => setFacts(e.target.value)} />
          <label className="text-sm font-medium" htmlFor="req">
            Required fact keys (for confidence)
          </label>
          <Textarea id="req" rows={2} value={required} onChange={(e) => setRequired(e.target.value)} />
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? 'Scoring…' : 'Run'}
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <div className="space-y-2 text-sm">
          {!result && <p className="text-muted-foreground">Result appears here.</p>}
          {result && (
            <>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold">{result.score}</span>
                <Badge variant={result.classification === 'issue' ? 'destructive' : 'default'}>{result.classification}</Badge>
                {result.ruleDriven && <Badge variant="outline">rule-driven: {result.rule?.ruleKey}</Badge>}
                {result.errorReview && <Badge variant="destructive">error review (score 0)</Badge>}
              </div>
              <div className="text-muted-foreground">
                computed: {result.computedClassification} · confidence {result.confidence}% {result.professionalConsult ? '· Professional Consult' : ''}{' '}
                {result.mandatoryReview ? '· mandatory review' : ''} · matrix {result.matrix.key} v{result.matrix.version}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th>Factor</th>
                    <th>Value</th>
                    <th>Weight</th>
                    <th>Points</th>
                    <th>Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(result.factors).map(([k, f]) => (
                    <tr key={k} className="border-t">
                      <td className="py-1">{k}</td>
                      <td>{f.value}</td>
                      <td>{f.weight}%</td>
                      <td>{f.contribution.toFixed(1)}</td>
                      <td>{f.matchedMapping === null ? 'default (min)' : `#${f.matchedMapping + 1}`}</td>
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
  return (
    <div className="space-y-8">
      <ContentManager
        title="Scoring matrices"
        description="Weights, fact→factor mappings, thresholds and confidence policy (FR-18, FR-19). Versioned; a draft needs approval by another administrator before activation (AI-05)."
        entity="persona"
        apiClient={matricesApi}
        fields={fields}
        columns={[
          { key: 'key', label: 'Key' },
          { key: 'name', label: 'Name' },
          { key: 'sector', label: 'Sector' },
          { key: 'approvedBy', label: 'Approved', render: (it) => (it.approvedBy ? 'yes' : '—') },
        ]}
        versioned
        approval
      />
      <Simulator />
    </div>
  );
}
