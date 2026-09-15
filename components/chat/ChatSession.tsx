'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { assessments, pendingQuestion, type Assessment, type Message, type QuestionSnapshot, type Turn } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';
import { ResultCard } from './ResultCard';

type PersonaOption = { key: string; name: string; description?: string };

function formatPersonaKey(key: string) {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * One intake conversation (FR-03..FR-08). MCQ / yes-no / number answers are structured and never
 * touch the model; free text goes through fact extraction. Submission and the decision live here too
 * so the requestor sees the whole loop on one screen.
 */
export function ChatSession({ id }: { id: string }) {
  const t = useTranslations('chatSession');
  const status = useTranslations('status');
  const [a, setA] = useState<Assessment | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personaPickerOpen, setPersonaPickerOpen] = useState(false);
  const [personaOptions, setPersonaOptions] = useState<PersonaOption[]>([]);
  const [personasLoading, setPersonasLoading] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const reload = useCallback(async () => {
    const [aa, mm] = await Promise.all([assessments.get(id), assessments.messages(id)]);
    setA(aa);
    setMessages(mm);
  }, [id]);

  useEffect(() => {
    reload().catch((e) => setError(toApiError(e).message));
  }, [reload]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, a?.status]);

  async function run(fn: () => Promise<Turn | Assessment>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      setBusy(false);
    }
  }

  const q = pendingQuestion(messages, a);
  const answer = (body: { value?: string | number | boolean; text?: string }) => run(() => assessments.answer(id, body));

  async function openPersonaPicker() {
    setPersonaPickerOpen(true);
    if (personaOptions.length > 0) return;

    setPersonasLoading(true);
    setError(null);
    try {
      setPersonaOptions(await assessments.personas());
    } catch (nextError) {
      setError(toApiError(nextError).message);
    } finally {
      setPersonasLoading(false);
    }
  }

  function choosePersona(personaKey: string) {
    setPersonaPickerOpen(false);
    void run(() => assessments.setPersona(id, personaKey));
  }

  const candidateOptions: PersonaOption[] =
    q?.key === '__persona' && q.options?.length
      ? q.options.map((option) => ({ key: option.id, name: option.label }))
      : (a?.personaCandidates ?? []).map((key) => ({ key, name: formatPersonaKey(key) }));

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {a?.personaKey && <Badge variant="outline">{a.personaKey.replace(/_/g, ' ')}</Badge>}
        {a?.personaSource === 'ai' && <Badge variant="secondary">{t('aiSuggestedRole')}</Badge>}
        {a?.scenarioKey && <Badge variant="outline">{a.scenarioKey.replace(/_/g, ' ')}</Badge>}
        {a && <Badge variant={a.status === 'closed' ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : a.status}</Badge>}
        {a?.facts?.length ? <span>{t('factsCaptured', { count: a.facts.length })}{a.facts.some((f) => f.flagged) ? ` · ${t('factsFlagged')}` : ''}</span> : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
        {messages.map((m) => (
          <div key={m._id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : m.kind === 'result' ? 'border bg-muted' : 'bg-muted'
              }`}
            >
              {m.kind === 'info' && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{t('messageKinds.info')}</div>}
              {m.kind === 'clarification' && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{t('messageKinds.clarification')}</div>}
              {m.content}
            </div>
          </div>
        ))}
        {a?.result && (
          <ResultCard a={a} busy={busy} onDecide={(d) => void run(() => assessments.decide(id, d))} />
        )}
        <div ref={bottom} />
      </div>

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-3" data-testid="composer" data-busy={busy ? 'true' : 'false'} data-messages={messages.length} data-status={a?.status ?? ''}>
        {a?.status === 'in_progress' && a.phase === 'persona' && (
          <div className="space-y-3 rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">{t('persona.confirmTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('persona.confirmDescription')}</p>
            </div>
            <PersonaChooser options={candidateOptions} busy={busy} suggestedKey={a.personaSource === 'ai' ? a.personaKey : undefined} onChoose={choosePersona} />
          </div>
        )}
        {a?.status === 'in_progress' && a.phase === 'describe' && a.personaKey && (
          <div className="mb-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{t('persona.current', { role: a.personaKey.replace(/_/g, ' ') })}</p>
                <p className="text-xs text-muted-foreground">{t('persona.changeHint')}</p>
              </div>
              <Button type="button" size="sm" variant="outline" disabled={busy || personasLoading} onClick={() => void openPersonaPicker()}>
                {personasLoading ? t('persona.loading') : t('persona.change')}
              </Button>
            </div>
            {personaPickerOpen && !personasLoading && <PersonaChooser options={personaOptions} busy={busy} onChoose={choosePersona} />}
          </div>
        )}
        {a?.status === 'in_progress' && a.phase === 'questions' && a.personaSource === 'ai' && (
          <p className="mb-3 text-xs text-muted-foreground">
            {t('persona.locked')}{' '}
            <Link className="underline underline-offset-2" href="/chat">
              {t('persona.startNew')}
            </Link>{' '}
            {t('persona.ifIncorrect')}
          </p>
        )}
        {a?.status === 'in_progress' && a.phase !== 'persona' && q && <AnswerBox key={q.key + messages.length} q={q} busy={busy} text={text} setText={setText} onAnswer={answer} />}
        {a?.status === 'intake_complete' && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">{t('submission.ready')}</span>
            <Button disabled={busy} onClick={() => void run(() => assessments.submit(id))}>
              {busy ? t('submission.assessing') : t('submission.submit')}
            </Button>
          </div>
        )}
        {a?.status === 'closed' && <p className="text-center text-sm text-muted-foreground">{t('closed')}</p>}
      </div>
    </div>
  );
}

function PersonaChooser({ options, busy, suggestedKey, onChoose }: { options: PersonaOption[]; busy: boolean; suggestedKey?: string; onChoose: (personaKey: string) => void }) {
  const t = useTranslations('chatSession.persona');
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((option) => (
        <Button key={option.key} type="button" data-testid="persona-option" variant={option.key === suggestedKey ? 'default' : 'outline'} disabled={busy} title={option.description} onClick={() => onChoose(option.key)}>
          {option.name}
          {option.key === suggestedKey ? ` ${t('suggestedSuffix')}` : ''}
        </Button>
      ))}
    </div>
  );
}

function AnswerBox({ q, busy, text, setText, onAnswer }: { q: QuestionSnapshot; busy: boolean; text: string; setText: (s: string) => void; onAnswer: (b: { value?: string | number | boolean; text?: string }) => Promise<void> }) {
  const t = useTranslations('chatSession.answer');
  const submitText = () => {
    if (!text.trim()) return;
    void onAnswer({ text: text.trim() }).then(() => setText(''));
  };
  if (q.type === 'mcq' && q.options?.length) {
    return (
      <div className="flex flex-wrap gap-2">
        {q.options.map((o) => (
          <Button key={o.id} data-testid="answer-option" variant="outline" disabled={busy} onClick={() => void onAnswer({ value: o.id })}>
            {o.label}
          </Button>
        ))}
      </div>
    );
  }
  if (q.type === 'yes_no') {
    return (
      <div className="flex gap-2">
        <Button disabled={busy} onClick={() => void onAnswer({ value: true })}>
          {t('yes')}
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void onAnswer({ value: false })}>
          {t('no')}
        </Button>
        <Input placeholder={t('explainPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitText()} />
      </div>
    );
  }
  if (q.type === 'number') {
    const submitNumber = () => {
      if (!text.trim()) return;
      const value = Number(text);
      if (!Number.isFinite(value)) return;
      void onAnswer({ value }).then(() => setText(''));
    };
    return (
      <div className="flex gap-2">
        <Input
          type="number"
          placeholder={t('numberPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submitNumber();
            }
          }}
        />
        <Button disabled={busy || text.trim() === '' || !Number.isFinite(Number(text))} onClick={submitNumber}>
          {t('send')}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Textarea rows={2} placeholder={t('textPlaceholder')} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitText())} />
      <Button disabled={busy || !text.trim()} onClick={submitText}>
        {t('send')}
      </Button>
    </div>
  );
}
