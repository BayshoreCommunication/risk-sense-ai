'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ClipboardCheck,
  HeartPulse,
  LoaderCircle,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { assessments } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';

type Persona = {
  key: string;
  name: string;
  description: string;
  sector: string;
};

function personaIcon(persona: Persona): LucideIcon {
  const context = `${persona.key} ${persona.name} ${persona.sector}`.toLowerCase();
  if (/health|medical|clinical|hipaa|phi/.test(context)) return HeartPulse;
  if (/security|privacy|cyber|data|technology|\bit\b/.test(context)) return ShieldCheck;
  return UserRound;
}

/** Start screen: explicitly choose a persona (FR-04) or provide context for an AI proposal. */
export default function NewAssessmentPage() {
  const t = useTranslations('newAssessment');
  const router = useRouter();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [text, setText] = useState('');
  const [personaKey, setPersonaKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assessments.personas().then(setPersonas).catch((e) => setError(toApiError(e).message));
  }, []);

  const trimmedText = text.trim();
  const hasContext = trimmedText.length >= 10;
  const hasIncompleteContext = trimmedText.length > 0 && !hasContext;
  const canStart = Boolean(personaKey) || hasContext;
  const selectedPersona = personas.find((persona) => persona.key === personaKey) ?? null;

  async function start() {
    if (!canStart || hasIncompleteContext) return;
    setBusy(true);
    setError(null);
    try {
      const turn = await assessments.start({
        ...(personaKey ? { personaKey } : {}),
        ...(hasContext ? { text: trimmedText } : {}),
      });
      router.push(`/chat/${turn._id}`);
    } catch (e) {
      setError(toApiError(e).message);
      setBusy(false);
    }
  }

  return (
    <div className="page-shell max-w-none gap-5 sm:gap-6 min-[90rem]:gap-8">
      <PageHeader title={t('title')} requirements={['FR-04', 'FR-05']} />

      <Card className="overflow-visible py-0 shadow-[0_6px_22px_rgba(15,35,65,0.07)]">
        <CardHeader className="border-b px-6 py-6 sm:px-8 sm:py-7">
          <div className="flex items-start gap-4">
            <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary sm:size-14" aria-hidden="true">
              <ClipboardCheck className="size-6" />
            </span>
            <div className="min-w-0 pt-0.5">
              <CardTitle className="text-lg sm:text-xl">{t('assistantTitle')}</CardTitle>
              <CardDescription className="mt-1 max-w-3xl leading-6">{t('assistantDescription')}</CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="px-6 py-6 sm:px-8 sm:py-7">
          <section aria-labelledby="select-persona-heading">
            <div className="flex items-center gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-primary text-xs font-bold text-primary" aria-hidden="true">
                1
              </span>
              <h2 id="select-persona-heading" className="shrink-0 text-sm font-semibold text-primary sm:text-base">
                {t('selectPersona')}
              </h2>
              <span className="h-px min-w-8 flex-1 bg-border" aria-hidden="true" />
            </div>
            <p className="ml-10 mt-1.5 text-xs leading-5 text-muted-foreground sm:text-sm">{t('personaHint')}</p>

            <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-4" role="group" aria-label={t('personaGroupLabel')}>
              {personas.map((persona, index) => {
                const selected = personaKey === persona.key;
                const Icon = personaIcon(persona);
                const descriptionId = `persona-${index}-description`;
                return (
                  <button
                    key={persona.key}
                    type="button"
                    aria-label={persona.name}
                    aria-describedby={persona.description ? descriptionId : undefined}
                    aria-pressed={selected}
                    className={`group relative flex min-h-36 w-full items-center gap-4 rounded-xl border bg-card p-5 text-left outline-none transition duration-150 focus-visible:ring-4 focus-visible:ring-primary/15 sm:gap-5 ${
                      selected
                        ? 'border-primary shadow-[0_0_0_1px_var(--primary),0_8px_24px_rgba(41,105,210,0.10)]'
                        : 'hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_8px_22px_rgba(15,35,65,0.07)]'
                    }`}
                    onClick={() => setPersonaKey(selected ? null : persona.key)}
                  >
                    <span
                      className={`grid size-14 shrink-0 place-items-center rounded-xl transition sm:size-16 ${
                        selected ? 'bg-primary/12 text-primary' : 'bg-primary/8 text-primary group-hover:bg-primary/12'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="size-7 sm:size-8" strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      {selected ? (
                        <span className="mb-1.5 inline-flex rounded-full bg-primary/10 px-2.5 py-1 text-[0.68rem] font-semibold text-primary">
                          {t('selected')}
                        </span>
                      ) : null}
                      <span className="block text-base font-semibold tracking-[-0.01em] text-foreground">{persona.name}</span>
                      {persona.description ? (
                        <span id={descriptionId} className="mt-1 block text-sm leading-5 text-muted-foreground">
                          {persona.description}
                        </span>
                      ) : null}
                    </span>
                    {selected ? (
                      <span className="absolute right-4 top-4 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground" aria-hidden="true">
                        <Check className="size-4" strokeWidth={2.5} />
                      </span>
                    ) : null}
                  </button>
                );
              })}

              {!error && personas.length === 0 ? (
                <div className="col-span-full grid grid-cols-[repeat(auto-fit,minmax(min(100%,17.5rem),1fr))] gap-4" role="status" aria-label={t('loadingPersonas')}>
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="flex min-h-36 animate-pulse items-center gap-5 rounded-xl border p-5">
                      <span className="size-16 shrink-0 rounded-xl bg-muted" />
                      <span className="flex-1 space-y-2.5">
                        <span className="block h-4 w-2/3 rounded bg-muted" />
                        <span className="block h-3 w-full rounded bg-muted" />
                        <span className="block h-3 w-4/5 rounded bg-muted" />
                      </span>
                    </div>
                  ))}
                  <span className="sr-only">
                    <LoaderCircle className="size-4 animate-spin" />
                    {t('loadingPersonas')}
                  </span>
                </div>
              ) : null}
            </div>
          </section>

          <section className="mt-6 rounded-xl border bg-muted/25 p-4 sm:p-5" aria-labelledby="incident-context-heading">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
              <div>
                <h2 id="incident-context-heading" className="text-sm font-semibold">{t('optionalContext')}</h2>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('optionalContextHint')}</p>
              </div>
              <span className={`shrink-0 text-[0.7rem] ${hasIncompleteContext ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                {t('characterHint', { count: trimmedText.length })}
              </span>
            </div>
            <Textarea
              id="incident-description"
              rows={3}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={t('placeholder')}
              aria-labelledby="incident-context-heading"
              aria-invalid={hasIncompleteContext}
              className="mt-3 min-h-24 resize-y bg-card px-4 py-3 text-sm leading-6 shadow-none focus-visible:ring-2"
            />
            <div className="mt-2 flex items-start gap-2 text-[0.72rem] leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
              <span>{t('privacyNote')}</span>
            </div>
          </section>

          {error ? (
            <p className="mt-5 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          ) : null}

          <div className="mt-6">
            <Button
              size="lg"
              aria-label={t('start')}
              disabled={busy || !canStart || hasIncompleteContext}
              onClick={() => void start()}
              className="min-w-44 bg-[#061d43] px-6 text-white shadow-[0_6px_16px_rgba(6,29,67,0.18)] hover:bg-[#0a2a59]"
            >
              {busy ? t('starting') : t('continue')}
              {!busy ? <ArrowRight data-icon="inline-end" className="size-4" /> : <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
            </Button>
          </div>

          <section className="mt-7 border-t pt-5" aria-labelledby="confirm-selection-heading">
            <div className="flex items-center gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full border-2 border-muted-foreground/60 text-xs font-bold text-muted-foreground" aria-hidden="true">
                2
              </span>
              <h2 id="confirm-selection-heading" className="shrink-0 text-sm font-semibold text-muted-foreground sm:text-base">
                {t('confirmSelection')}
              </h2>
              <span className="h-px min-w-8 flex-1 bg-border" aria-hidden="true" />
            </div>
            <p className="ml-10 mt-2 text-sm leading-6 text-muted-foreground">
              {selectedPersona ? t('confirmHintWithPersona', { persona: selectedPersona.name }) : t('confirmHintWithoutPersona')}
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
