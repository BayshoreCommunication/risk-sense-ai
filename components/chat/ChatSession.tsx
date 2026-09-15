'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Bot, Check, ChevronRight, CircleDot, FileCheck2, Flag, LoaderCircle, LockKeyhole, Send, Sparkles, UserRound } from 'lucide-react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message as AIMessage, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    const [aa, mm] = await Promise.all([assessments.get(id), assessments.messages(id)]);
    setA(aa);
    setMessages(mm);
  }, [id]);

  useEffect(() => {
    reload().catch((e) => setError(toApiError(e).message));
  }, [reload]);

  async function run(fn: () => Promise<Turn | Assessment>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(toApiError(e).message);
    } finally {
      busyRef.current = false;
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

  const phaseIndex = !a ? 0 : a.status === 'in_progress' ? Math.max(0, ['persona', 'describe', 'questions', 'done'].indexOf(a.phase)) : a.status === 'intake_complete' ? 3 : 4;
  const progress = [12, 30, 58, 82, 100][phaseIndex] ?? 12;
  const stageKey = !a ? 'loading' : a.status === 'in_progress' ? a.phase : a.status === 'intake_complete' ? 'review' : 'decision';

  return (
    <div className="page-shell max-w-[1420px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="eyebrow flex items-center gap-2"><Sparkles className="size-3.5" />{t('eyebrow')}</div>
          <div>
            <h1 className="page-heading">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('assessmentId', { id: id.slice(-8).toUpperCase() })}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {a?.personaKey && <Badge variant="outline"><UserRound className="size-3" />{a.personaKey.replace(/_/g, ' ')}</Badge>}
          {a?.personaSource === 'ai' && <Badge variant="secondary"><Sparkles className="size-3" />{t('aiSuggestedRole')}</Badge>}
          {a && <Badge variant={a.status === 'closed' ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : a.status}</Badge>}
        </div>
      </div>

      <div className="grid min-h-0 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_18.5rem]">
        <Card className="h-[calc(100dvh-13rem)] min-h-[34rem] max-h-[52rem] gap-0 py-0">
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b bg-card/95 px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-3">
              <span className="relative flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/18">
                <Bot className="size-4.5" />
                <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-card bg-emerald-500" />
              </span>
              <div>
                <div className="text-sm font-semibold">{t('assistantName')}</div>
                <div className="text-xs text-muted-foreground">{t('assistantDescription')}</div>
              </div>
            </div>
            {a?.scenarioKey && <Badge variant="outline" className="bg-background/80">{a.scenarioKey.replace(/_/g, ' ')}</Badge>}
          </div>

          <Conversation className="min-h-0 bg-[linear-gradient(to_bottom,rgba(246,249,253,0.72),rgba(255,255,255,0.2))]">
            <ConversationContent className="mx-auto w-full max-w-4xl gap-5 px-4 py-6 sm:px-6">
              {!a && messages.length === 0 && (
                <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground" role="status">
                  <LoaderCircle className="size-6 animate-spin text-primary" />
                  {t('loadingConversation')}
                </div>
              )}
              {messages.map((m) => {
                if (m.role === 'system') {
                  return (
                    <div key={m._id} className="flex justify-center">
                      <div className="flex max-w-[92%] items-center gap-2 rounded-full border bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
                        <CircleDot className="size-3 text-primary" />
                        {m.content}
                      </div>
                    </div>
                  );
                }
                const assistant = m.role === 'assistant';
                const clarification = m.kind === 'clarification';
                return (
                  <AIMessage key={m._id} from={m.role} className={assistant ? 'max-w-[92%]' : 'max-w-[88%]'}>
                    <div className={`flex gap-2.5 ${assistant ? 'items-start' : 'justify-end'}`}>
                      {assistant && (
                        <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${clarification ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'}`}>
                          {clarification ? <Flag className="size-3.5" /> : <Bot className="size-3.5" />}
                        </span>
                      )}
                      <MessageContent
                        className={
                          assistant
                            ? `rounded-2xl rounded-tl-md border px-4 py-3 shadow-[0_3px_14px_rgba(20,55,100,0.05)] ${clarification ? 'border-amber-200 bg-amber-50/85' : m.kind === 'result' ? 'border-violet-200 bg-violet-50/75' : 'bg-card'}`
                            : 'rounded-2xl rounded-tr-md bg-primary px-4 py-3 text-primary-foreground shadow-md shadow-primary/10'
                        }
                      >
                        {assistant && (m.kind === 'info' || clarification) && (
                          <span className={`mb-1 block text-[0.64rem] font-semibold tracking-[0.12em] uppercase ${clarification ? 'text-amber-700' : 'text-primary'}`}>
                            {t(`messageKinds.${m.kind}`)}
                          </span>
                        )}
                        {assistant ? <MessageResponse className="leading-6">{m.content}</MessageResponse> : <p className="whitespace-pre-wrap leading-6">{m.content}</p>}
                      </MessageContent>
                    </div>
                  </AIMessage>
                );
              })}
              {busy && (
                <AIMessage from="assistant" className="max-w-[92%]" role="status">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Bot className="size-3.5" /></span>
                    <MessageContent className="rounded-2xl rounded-tl-md border bg-card px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-3">
                        <span className="flex gap-1" aria-hidden="true"><i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.2s]" /><i className="size-1.5 animate-bounce rounded-full bg-primary [animation-delay:-0.1s]" /><i className="size-1.5 animate-bounce rounded-full bg-primary" /></span>
                        <span className="text-sm text-muted-foreground">{a?.status === 'intake_complete' ? t('submission.assessing') : t('processing')}</span>
                      </div>
                    </MessageContent>
                  </div>
                </AIMessage>
              )}
              {a?.result && <ResultCard a={a} busy={busy} onDecide={(d) => void run(() => assessments.decide(id, d))} />}
            </ConversationContent>
            <ConversationScrollButton aria-label={t('scrollLatest')} className="bottom-4" />
          </Conversation>

          <div
            className="max-h-[45dvh] shrink-0 overflow-y-auto border-t bg-card/96 p-3.5 sm:p-4"
            data-testid="composer"
            data-busy={busy ? 'true' : 'false'}
            data-messages={messages.length}
            data-status={a?.status ?? ''}
          >
            {error && (
              <p className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />{error}
              </p>
            )}
            {a?.status === 'in_progress' && a.phase === 'persona' && (
              <div className="space-y-3 rounded-xl border bg-muted/25 p-3.5">
                <div>
                  <p className="text-sm font-semibold">{t('persona.confirmTitle')}</p>
                  <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t('persona.confirmDescription')}</p>
                </div>
                <PersonaChooser options={candidateOptions} busy={busy} suggestedKey={a.personaSource === 'ai' ? a.personaKey : undefined} onChoose={choosePersona} />
              </div>
            )}
            {a?.status === 'in_progress' && a.phase === 'describe' && a.personaKey && (
              <div className="mb-3 rounded-xl border bg-muted/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{t('persona.current', { role: a.personaKey.replace(/_/g, ' ') })}</p>
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
              <p className="mb-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                <LockKeyhole className="mt-0.5 size-3.5 shrink-0" />
                <span>{t('persona.locked')}{' '}<Link className="font-medium text-primary underline underline-offset-2" href="/chat">{t('persona.startNew')}</Link>{' '}{t('persona.ifIncorrect')}</span>
              </p>
            )}
            {a?.status === 'in_progress' && a.phase !== 'persona' && q && <AnswerBox key={q.key + messages.length} q={q} busy={busy} text={text} setText={setText} onAnswer={answer} />}
            {a?.status === 'intake_complete' && (
              <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="flex items-center gap-2 text-sm font-medium"><FileCheck2 className="size-4 text-emerald-600" />{t('submission.ready')}</span>
                <Button disabled={busy} onClick={() => void run(() => assessments.submit(id))}>
                  {busy ? t('submission.assessing') : t('submission.submit')} {!busy && <ChevronRight data-icon="inline-end" className="size-4" />}
                </Button>
              </div>
            )}
            {a?.status === 'closed' && <p className="rounded-xl bg-muted/50 p-3 text-center text-sm text-muted-foreground">{t('closed')}</p>}
          </div>
        </Card>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <Card size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">{t('progress')}</span>
                <span className="text-xs font-semibold text-primary">{progress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${progress}%` }} /></div>
              <div className="flex items-center gap-2 text-sm font-semibold"><CircleDot className="size-4 text-primary" />{t(`stages.${stageKey}`)}</div>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold">{t('capturedFacts')}</span>
                <Badge variant="secondary">{a?.facts?.length ?? 0}</Badge>
              </div>
              {a?.facts?.length ? (
                <div className="space-y-2">
                  {a.facts.slice(-6).map((fact) => (
                    <div key={fact.key} className="flex items-start gap-2 rounded-lg bg-muted/45 p-2.5">
                      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full ${fact.flagged ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {fact.flagged ? <Flag className="size-2.5" /> : <Check className="size-2.5" />}
                      </span>
                      <div className="min-w-0"><div className="truncate text-xs font-medium">{fact.key.replace(/_/g, ' ')}</div><div className="text-[0.65rem] text-muted-foreground">{Math.round(fact.confidence * 100)}% {t('factConfidence')}</div></div>
                    </div>
                  ))}
                </div>
              ) : <p className="text-xs leading-5 text-muted-foreground">{t('noFacts')}</p>}
            </CardContent>
          </Card>

          <div className="flex items-start gap-2 rounded-xl border border-primary/15 bg-primary/5 p-3 text-xs leading-5 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" />
            {t('governanceNote')}
          </div>
        </aside>
      </div>
    </div>
  );
}

function PersonaChooser({ options, busy, suggestedKey, onChoose }: { options: PersonaOption[]; busy: boolean; suggestedKey?: string; onChoose: (personaKey: string) => void }) {
  const t = useTranslations('chatSession.persona');
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;

  return (
    <Suggestions className="pb-1">
      {options.map((option) => (
        <Suggestion
          key={option.key}
          data-testid="persona-option"
          suggestion={option.key}
          variant={option.key === suggestedKey ? 'default' : 'outline'}
          disabled={busy}
          title={option.description}
          onClick={onChoose}
        >
          {option.name}
          {option.key === suggestedKey ? ` ${t('suggestedSuffix')}` : ''}
        </Suggestion>
      ))}
    </Suggestions>
  );
}

function AnswerBox({ q, busy, text, setText, onAnswer }: { q: QuestionSnapshot; busy: boolean; text: string; setText: (s: string) => void; onAnswer: (b: { value?: string | number | boolean; text?: string }) => Promise<void> }) {
  const t = useTranslations('chatSession.answer');
  const submitText = () => {
    if (busy || !text.trim()) return;
    void onAnswer({ text: text.trim() }).then(() => setText(''));
  };
  if (q.type === 'mcq' && q.options?.length) {
    return (
      <Suggestions className="pb-1">
        {q.options.map((o) => (
          <Suggestion key={o.id} data-testid="answer-option" suggestion={o.id} variant="outline" disabled={busy} onClick={() => void onAnswer({ value: o.id })}>
            {o.label}
          </Suggestion>
        ))}
      </Suggestions>
    );
  }
  if (q.type === 'yes_no') {
    return (
      <div className="grid gap-2 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
        <Button disabled={busy} onClick={() => void onAnswer({ value: true })}><Check className="size-4" />{t('yes')}</Button>
        <Button variant="outline" disabled={busy} onClick={() => void onAnswer({ value: false })}>{t('no')}</Button>
        <Input
          disabled={busy}
          placeholder={t('explainPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submitText();
            }
          }}
        />
        <Button variant="outline" disabled={busy || !text.trim()} onClick={submitText} aria-label={t('send')}><Send className="size-4" /><span className="sm:sr-only">{t('send')}</span></Button>
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
          disabled={busy}
          placeholder={t('numberPlaceholder')}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submitNumber();
            }
          }}
        />
        <Button disabled={busy || text.trim() === '' || !Number.isFinite(Number(text))} onClick={submitNumber}>
          <Send className="size-4" />{t('send')}
        </Button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Textarea
        rows={2}
        disabled={busy}
        placeholder={t('textPlaceholder')}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="min-h-24 resize-none pr-24"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !busy && !e.nativeEvent.isComposing) {
            e.preventDefault();
            submitText();
          }
        }}
      />
      <Button className="absolute right-2 bottom-2" disabled={busy || !text.trim()} onClick={submitText}>
        <Send className="size-4" />{t('send')}
      </Button>
    </div>
  );
}
