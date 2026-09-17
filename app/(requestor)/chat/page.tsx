'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, ArrowRight, Check, LoaderCircle, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { PageHeader } from '@/components/shell/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { assessments } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';

/** Start screen: describe the incident (persona inferred, FR-04) and/or pick the assessment persona explicitly. */
export default function NewAssessmentPage() {
  const t = useTranslations('newAssessment');
  const router = useRouter();
  const [personas, setPersonas] = useState<{ key: string; name: string; description: string }[]>([]);
  const [text, setText] = useState('');
  const [personaKey, setPersonaKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assessments.personas().then(setPersonas).catch((e) => setError(toApiError(e).message));
  }, []);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const turn = await assessments.start({ ...(personaKey ? { personaKey } : {}), ...(text.trim().length >= 10 ? { text: text.trim() } : {}) });
      router.push(`/chat/${turn._id}`);
    } catch (e) {
      setError(toApiError(e).message);
      setBusy(false);
    }
  }

  return (
    <div className="page-shell max-w-5xl">
      <PageHeader title={t('title')} description={t('description')} requirements={['FR-04', 'FR-14']} />

      <Card className="overflow-visible">
        <CardHeader className="border-b pb-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Sparkles className="size-4" />
                </span>
                {t('assistantTitle')}
              </CardTitle>
              <CardDescription>{t('assistantDescription')}</CardDescription>
            </div>
            <Badge variant="outline" className="bg-primary/5 text-primary">
              <ShieldCheck className="size-3" />
              {t('privateSession')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-7 pt-1 lg:grid-cols-[minmax(0,1.14fr)_minmax(18rem,0.86fr)]">
          <div className="space-y-3">
            <label htmlFor="incident-description" className="flex items-center gap-2 text-sm font-semibold">
              <span className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground">1</span>
              {t('incidentLabel')}
            </label>
            <div className="rounded-2xl border bg-card shadow-[0_1px_2px_rgba(15,35,65,0.05)] transition focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/8">
              <Textarea
                id="incident-description"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('placeholder')}
                className="min-h-56 resize-none border-0 bg-transparent px-4 pt-4 text-[0.95rem] leading-7 shadow-none focus-visible:ring-0"
              />
              <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5">
                <span className="text-[0.7rem] text-muted-foreground">{t('characterHint', { count: text.trim().length })}</span>
                <Button size="sm" disabled={busy || (!personaKey && text.trim().length < 10)} onClick={() => void start()}>
                  {busy ? t('starting') : t('start')}
                  {!busy && <ArrowRight data-icon="inline-end" className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-xl bg-info-soft p-3 text-xs leading-5 text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              {t('privacyNote')}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className="grid size-6 place-items-center rounded-md bg-primary text-xs text-primary-foreground">2</span>
                {t('rolePrompt')}
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('roleHint')}</p>
            </div>
            <div className="scrollbar-subtle grid max-h-[22rem] gap-2 overflow-y-auto pr-1" role="group" aria-label={t('personaGroupLabel')}>
              {personas.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={personaKey === p.key}
                  className={`group flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                    personaKey === p.key
                      ? 'border-primary/50 bg-primary/6 shadow-[0_0_0_3px_rgba(41,105,210,0.08)]'
                      : 'bg-card hover:border-primary/25 hover:bg-accent/45'
                  }`}
                  onClick={() => setPersonaKey(personaKey === p.key ? null : p.key)}
                >
                  <span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${personaKey === p.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground group-hover:text-primary'}`}>
                    {personaKey === p.key ? <Check className="size-4" /> : <UserRound className="size-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{p.name}</span>
                    {p.description && <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{p.description}</span>}
                  </span>
                </button>
              ))}
              {!error && personas.length === 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground" role="status">
                  <LoaderCircle className="size-4 animate-spin" />
                  {t('loadingPersonas')}
                </div>
              )}
            </div>
          </div>
          {error && (
            <p className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive lg:col-span-2" role="alert">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
