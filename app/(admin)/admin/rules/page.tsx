'use client';

import { useTranslations } from 'next-intl';
import { AlertTriangle, ArrowUpCircle, Info, ShieldCheck, Siren, type LucideIcon } from 'lucide-react';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { Badge } from '@/components/ui/badge';
import { rulesApi } from '@/lib/admin/content';
import { formatIdentifierLabel } from '@/lib/format-identifier-label';
import { useWorkspace } from '@/components/shell/workspace-context';

/** Icon and colour per forced classification, following docs/design/figma-frames/14-admin-rule-engine.png. */
const CLASSIFICATION_TONE: Record<string, { icon: LucideIcon; tile: string; text: string }> = {
  monitor_only: { icon: ShieldCheck, tile: 'bg-emerald-500/10 text-emerald-700', text: 'text-emerald-700' },
  risk: { icon: AlertTriangle, tile: 'bg-amber-500/10 text-amber-700', text: 'text-amber-700' },
  elevated_risk: { icon: ArrowUpCircle, tile: 'bg-orange-500/12 text-orange-700', text: 'text-orange-700' },
  issue: { icon: Siren, tile: 'bg-red-500/10 text-red-700', text: 'text-red-700' },
};

function ruleFields(t: ReturnType<typeof useTranslations>, sectors: string[]): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'name', label: t('fields.name'), kind: 'text', required: true },
  { name: 'description', label: t('fields.description'), kind: 'textarea' },
  {
    name: 'trigger',
    label: t('fields.trigger'),
    kind: 'condition',
    required: true,
    help: t('help.trigger'),
    defaultValue: { factKey: '', op: 'eq', value: '' },
  },
  { name: 'forcedClassification', label: t('fields.forcedClassification'), kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'], required: true },
  { name: 'forcedAction', label: t('fields.forcedAction'), kind: 'text', help: t('help.forcedAction') },
  { name: 'priority', label: t('fields.priority'), kind: 'number', help: t('help.priority') },
  { name: 'sectors', label: t('fields.sectors'), kind: 'list', help: t('help.sectors', { sectors: sectors.join('; ') }) },
  ];
}

export default function RulesPage() {
  const t = useTranslations('admin.rules');
  const classification = useTranslations('classification');
  const workspace = useWorkspace();
  const fields = ruleFields(t, workspace?.sectors ?? []);

  const formatCondition = (value: unknown): string => {
    if (!value || typeof value !== 'object') return '—';
    const condition = value as { all?: unknown[]; any?: unknown[]; factKey?: string; op?: string; value?: unknown };
    if (condition.all) return `(${condition.all.map(formatCondition).join(` ${t('display.and')} `)})`;
    if (condition.any) return `(${condition.any.map(formatCondition).join(` ${t('display.or')} `)})`;
    const operator: Record<string, string> = { eq: '=', ne: '≠', gt: '>', gte: '≥', lt: '<', lte: '≤', in: t('display.in'), exists: t('display.exists') };
    return `${condition.factKey ?? 'fact'} ${operator[condition.op ?? ''] ?? condition.op ?? ''}${condition.op === 'exists' ? '' : ` ${Array.isArray(condition.value) ? condition.value.join(', ') : String(condition.value ?? '')}`}`;
  };
  return (
    <div className="page-shell">
      <ContentManager
        title={t('title')}
        description={t('description')}
        requirements={['FR-16', 'FR-17']}
        entity={t('entity')}
        apiClient={rulesApi}
        fields={fields}
        columns={[]}
        card={(item) => {
          const forced = String(item.forcedClassification ?? '');
          const tone = CLASSIFICATION_TONE[forced] ?? CLASSIFICATION_TONE.monitor_only!;
          const Icon = tone.icon;
          return {
            icon: (
              <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tone.tile}`}>
                <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
              </span>
            ),
            title: String(item.name ?? item.key ?? ''),
            body: (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <span>
                  {t('card.if')}{' '}
                  <code className="rounded-md bg-muted px-1.5 py-1 font-mono text-[0.78rem] font-semibold text-foreground">{formatCondition(item.trigger)}</code>{' '}
                  {t('card.then')}{' '}
                  <strong className={tone.text}>{classification.has(forced) ? classification(forced) : formatIdentifierLabel(forced)}</strong>
                </span>
                <Badge variant="outline" className="bg-background text-[0.68rem]">{t('card.priority', { value: String(item.priority ?? 100) })}</Badge>
              </span>
            ),
          };
        }}
        footer={(
          <aside className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/55 px-4 py-3 text-blue-950" aria-label={t('lockoutExample.title')}>
            <Info className="mt-0.5 size-4 shrink-0 text-blue-600" aria-hidden="true" />
            <div className="min-w-0 text-xs leading-5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{t('lockoutExample.title')}</span>
                <Badge variant="outline" className="border-blue-300 bg-white/70 text-[0.62rem] text-blue-900">{t('lockoutExample.notActive')}</Badge>
                <code className="rounded bg-white/75 px-1.5 py-0.5">{t('lockoutExample.condition')}</code>
                <span aria-hidden="true">→</span>
                <Badge className="border-emerald-200 bg-emerald-50 text-emerald-800" variant="outline">{classification('monitor_only')}</Badge>
              </div>
              <p className="mt-0.5 text-blue-950/70">{t('lockoutExample.description')}</p>
            </div>
          </aside>
        )}
        versioned
        approval
      />
    </div>
  );
}
