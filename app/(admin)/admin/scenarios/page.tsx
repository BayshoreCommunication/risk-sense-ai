'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { GitBranch, ListChecks, ShieldAlert } from 'lucide-react';
import { ContentManager, type FieldSpec } from '@/components/admin/ContentManager';
import { formatIdentifierLabel } from '@/components/admin/format-identifier-label';
import { Badge } from '@/components/ui/badge';
import { scenariosApi, type Item } from '@/lib/admin/content';

function scenarioFields(t: ReturnType<typeof useTranslations>): FieldSpec[] {
  return [
  { name: 'key', label: t('fields.key'), kind: 'text', required: true, immutable: true, help: t('help.key') },
  { name: 'personaKey', label: t('fields.personaKey'), kind: 'text', required: true, immutable: true },
  { name: 'name', label: t('fields.name'), kind: 'text', required: true, help: t('help.name') },
  { name: 'description', label: t('fields.description'), kind: 'textarea', required: true },
  { name: 'businessContext', label: t('fields.businessContext'), kind: 'textarea', required: true },
  { name: 'learningObjective', label: t('fields.learningObjective'), kind: 'textarea' },
  { name: 'riskIndicators', label: t('fields.riskIndicators'), kind: 'list' },
  {
    name: 'conversationFlow',
    label: t('fields.conversationFlow'),
    kind: 'flow',
    required: true,
    help: t('help.conversationFlow'),
    defaultValue: [],
  },
  { name: 'requiredFactKeys', label: t('fields.requiredFactKeys'), kind: 'list', help: t('help.requiredFactKeys') },
  { name: 'expectedClassification', label: t('fields.expectedClassification'), kind: 'select', options: ['monitor_only', 'risk', 'elevated_risk', 'issue'] },
  { name: 'reasoningExample', label: t('fields.reasoningExample'), kind: 'textarea', help: t('help.reasoningExample') },
  {
    name: 'recommendedActions',
    label: t('fields.recommendedActions'),
    kind: 'actions',
    defaultValue: {},
  },
  ];
}

export default function ScenariosPage() {
  const t = useTranslations('admin.scenarios');
  const fields = scenarioFields(t);
  const [featured, setFeatured] = useState<Item | null>(null);
  useEffect(() => {
    let cancelled = false;
    scenariosApi.list().then((items) => {
      if (!cancelled) setFeatured(items.find((item) => item.status === 'active' && item.isCurrent) ?? items.find((item) => item.status === 'active') ?? items[0] ?? null);
    }).catch(() => !cancelled && setFeatured(null));
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="page-shell">
      <ContentManager
      title={t('title')}
      description={t('description')}
      requirements={['FR-11', 'FR-12']}
      entity={t('entity')}
      apiClient={scenariosApi}
      fields={fields}
      columns={[
        { key: 'personaKey', label: t('columns.persona'), render: (item) => formatIdentifierLabel(String(item.personaKey ?? '')) || '—' },
        { key: 'name', label: t('fields.name') },
        { key: 'conversationFlow', label: t('columns.questions'), render: (it) => String((it.conversationFlow as unknown[] | undefined)?.length ?? 0) },
      ]}
      callout={featured ? (
        <section className="overflow-hidden rounded-2xl border bg-card shadow-[0_8px_28px_rgba(15,35,65,0.06)]" aria-label={String(featured.name ?? featured.key ?? t('entity'))}>
          <header className="flex flex-wrap items-start justify-between gap-4 border-b bg-[linear-gradient(120deg,#ffffff,#f6f9ff)] px-5 py-4 sm:px-6">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-500/10 text-sky-700"><GitBranch className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold">{String(featured.name ?? featured.key ?? '')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{formatIdentifierLabel(String(featured.personaKey ?? '')) || '—'} · v{String(featured.version ?? 1)}</p>
              </div>
            </div>
            <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700" variant="outline">{String(featured.status)}</Badge>
          </header>
          <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.6fr)]">
            <div className="space-y-5">
              <div>
                <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t('fields.description')}</h3>
                <p className="mt-2 text-sm leading-6">{String(featured.description ?? '—')}</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t('fields.businessContext')}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{String(featured.businessContext ?? '—')}</p>
              </div>
            </div>
            <div className="space-y-5 rounded-xl border bg-muted/25 p-4">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase"><ShieldAlert className="size-3.5" aria-hidden="true" />{t('fields.riskIndicators')}</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.isArray(featured.riskIndicators) && featured.riskIndicators.length > 0
                    ? featured.riskIndicators.map((indicator) => <Badge key={String(indicator)} variant="secondary">{String(indicator)}</Badge>)
                    : <span className="text-sm text-muted-foreground">—</span>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><ListChecks className="size-4" aria-hidden="true" />{t('fields.conversationFlow')}</span>
                <strong className="tabular-nums">{Array.isArray(featured.conversationFlow) ? featured.conversationFlow.length : 0}</strong>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      versioned
      />
    </div>
  );
}
