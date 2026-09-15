'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileCheck2,
  Flag,
  LoaderCircle,
  LockKeyhole,
  Send,
  Sparkles,
} from 'lucide-react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message as AIMessage, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { assessments, pendingQuestion, type Assessment, type Message, type QuestionSnapshot, type Turn } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';
import { ResultCard } from './ResultCard';

type PersonaOption = { key: string; name: string; description?: string };
type StageKey = 'persona' | 'describe' | 'questions' | 'review' | 'decision';

const WORKFLOW_STAGES: StageKey[] = ['persona', 'describe', 'questions', 'review', 'decision'];

function humanizeKey(key: string) {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function activeStage(a: Assessment | null) {
  if (!a) return -1;
  if (a.status === 'in_progress') return { persona: 0, describe: 1, questions: 2, done: 3 }[a.phase];
  if (a.status === 'intake_complete') return 3;
  return 4;
}

function factValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * One intake conversation (FR-03..FR-08). Structured answers never touch the model; free text is
 * sent only for fact extraction. Submission and the required human decision remain explicit.
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
    const [assessment, transcript] = await Promise.all([assessments.get(id), assessments.messages(id)]);
    setA(assessment);
    setMessages(transcript);
  }, [id]);

  useEffect(() => {
    reload().catch((nextError) => setError(toApiError(nextError).message));
  }, [reload]);

  async function run(fn: () => Promise<Turn | Assessment>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (nextError) {
      setError(toApiError(nextError).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const question = pendingQuestion(messages, a);
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
    question?.key === '__persona' && question.options?.length
      ? question.options.map((option) => ({ key: option.id, name: option.label }))
      : (a?.personaCandidates ?? []).map((key) => ({ key, name: humanizeKey(key) }));
  const currentStageIndex = activeStage(a);
  const currentStageKey = currentStageIndex >= 0 ? WORKFLOW_STAGES[currentStageIndex] : undefined;

  return (
    <div className="page-shell max-w-[1480px] space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <div className="eyebrow flex items-center gap-2">
            <Sparkles className="size-3.5" />
            {t('eyebrow')}
          </div>
          <div>
            <h1 className="page-heading">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('assessmentId', { id: id.slice(-8).toUpperCase() })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {currentStageKey && (
            <span className="text-xs font-medium text-muted-foreground">
              {t('currentStage')}: <span className="text-foreground">{t(`stages.${currentStageKey}`)}</span>
            </span>
          )}
          {a && <Badge variant={a.status === 'closed' ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : a.status}</Badge>}
        </div>
      </div>

      <section aria-label={t('workspaceLabel')} className="overflow-hidden rounded-[1.25rem] border border-border/90 bg-card shadow-[0_18px_50px_rgba(15,35,65,0.07)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-4 py-3.5 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-white">
              <Bot className="size-4.5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">{t('assistantName')}</h2>
              <p className="text-xs text-muted-foreground">{t('assistantDescription')}</p>
            </div>
          </div>
          {a?.scenarioKey && (
            <div className="text-right">
              <span className="block text-[0.65rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('scenario')}</span>
              <span className="text-sm font-medium">{humanizeKey(a.scenarioKey)}</span>
            </div>
          )}
        </header>

        <div className="grid min-h-0 xl:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="min-w-0">
            <Conversation className="h-[min(58dvh,38rem)] min-h-[25rem] bg-background sm:min-h-[30rem] xl:h-[calc(100dvh-20rem)] xl:max-h-[49rem]">
              <ConversationContent className="mx-auto w-full max-w-4xl gap-6 px-4 py-6 sm:px-7 sm:py-8">
                {!a && messages.length === 0 && (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground" role="status">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    {t('loadingConversation')}
                  </div>
                )}

                {messages.map((message) => {
                  if (message.role === 'system') {
                    return (
                      <div key={message._id} className="flex items-center gap-3 text-xs text-muted-foreground" role="note">
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                        <span>{message.content}</span>
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>
                    );
                  }

                  const assistant = message.role === 'assistant';
                  const clarification = message.kind === 'clarification';
                  return (
                    <AIMessage key={message._id} from={message.role} className={assistant ? undefined : 'max-w-[88%] sm:max-w-[78%]'}>
                      {assistant ? (
                        <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3">
                          <span
                            className={`flex size-8 items-center justify-center rounded-lg border ${
                              clarification ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-primary/15 bg-primary/[0.06] text-primary'
                            }`}
                          >
                            {clarification ? <Flag className="size-3.5" aria-hidden="true" /> : <Bot className="size-3.5" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            <span className={`mb-1.5 block text-[0.66rem] font-semibold tracking-[0.12em] uppercase ${clarification ? 'text-amber-700' : 'text-muted-foreground'}`}>
                              {clarification ? t('messageKinds.clarification') : t('assistantName')}
                            </span>
                            <MessageContent className={`w-full border-l-2 py-0 pl-4 ${clarification ? 'border-amber-300' : 'border-primary/20'}`}>
                              <MessageResponse className="leading-6">{message.content}</MessageResponse>
                            </MessageContent>
                          </div>
                        </div>
                      ) : (
                        <MessageContent className="rounded-xl rounded-br-sm bg-slate-950 px-4 py-3 text-white shadow-none">
                          <p className="whitespace-pre-wrap leading-6">{message.content}</p>
                        </MessageContent>
                      )}
                    </AIMessage>
                  );
                })}

                {busy && (
                  <AIMessage from="assistant" role="status">
                    <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg border border-primary/15 bg-primary/[0.06] text-primary">
                        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
                      </span>
                      <MessageContent className="w-full border-l-2 border-primary/20 py-1 pl-4 text-muted-foreground">
                        {a?.status === 'intake_complete' ? t('submission.assessing') : t('processing')}
                      </MessageContent>
                    </div>
                  </AIMessage>
                )}

                {a?.result && <ResultCard a={a} busy={busy} onDecide={(decision) => void run(() => assessments.decide(id, decision))} />}
              </ConversationContent>
              <ConversationScrollButton aria-label={t('scrollLatest')} />
            </Conversation>

            <div
              className="max-h-[48dvh] overflow-y-auto border-t bg-card p-4 sm:p-5"
              data-testid="composer"
              data-busy={busy ? 'true' : 'false'}
              data-messages={messages.length}
              data-status={a?.status ?? ''}
            >
              {error && (
                <p className="mb-4 flex items-start gap-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              {a?.status === 'in_progress' && a.phase === 'persona' && (
                <fieldset className="space-y-3">
                  <legend className="text-sm font-semibold">{t('persona.confirmTitle')}</legend>
                  <p className="text-xs leading-5 text-muted-foreground">{t('persona.confirmDescription')}</p>
                  <PersonaChooser options={candidateOptions} busy={busy} suggestedKey={a.personaSource === 'ai' ? a.personaKey : undefined} onChoose={choosePersona} />
                </fieldset>
              )}

              {a?.status === 'in_progress' && a.phase === 'describe' && a.personaKey && (
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b pb-4">
                  <div>
                    <p className="text-sm font-semibold">{t('persona.current', { role: humanizeKey(a.personaKey) })}</p>
                    <p className="text-xs text-muted-foreground">{t('persona.changeHint')}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={busy || personasLoading} onClick={() => void openPersonaPicker()}>
                    {personasLoading ? t('persona.loading') : t('persona.change')}
                  </Button>
                  {personaPickerOpen && !personasLoading && <PersonaChooser options={personaOptions} busy={busy} onChoose={choosePersona} />}
                </div>
              )}

              {a?.status === 'in_progress' && a.phase === 'questions' && a.personaSource === 'ai' && (
                <p className="mb-4 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('persona.locked')}{' '}
                    <Link className="font-medium text-primary underline underline-offset-2" href="/chat">{t('persona.startNew')}</Link>{' '}
                    {t('persona.ifIncorrect')}
                  </span>
                </p>
              )}

              {a?.status === 'in_progress' && a.phase !== 'persona' && question && (
                <AnswerBox key={question.key + messages.length} q={question} busy={busy} text={text} setText={setText} onAnswer={answer} />
              )}

              {a?.status === 'intake_complete' && (
                <div className="flex flex-col gap-3 border-l-2 border-emerald-500 bg-emerald-50/60 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 text-emerald-700" aria-hidden="true" />
                    {t('submission.ready')}
                  </span>
                  <Button disabled={busy} onClick={() => void run(() => assessments.submit(id))}>
                    {busy ? t('submission.assessing') : t('submission.submit')}
                    {!busy && <ChevronRight data-icon="inline-end" className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
              )}

              {a?.status === 'closed' && (
                <p className="flex items-center justify-center gap-2 py-1 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                  {t('closed')}
                </p>
              )}
            </div>
          </div>

          <aside className="border-t bg-slate-50/65 xl:border-t-0 xl:border-l" aria-label={t('contextPanel')}>
            <section className="p-5">
              <h3 className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('workflow')}</h3>
              <ol className="mt-4 space-y-1" aria-label={t('workflow')}>
                {WORKFLOW_STAGES.map((stage, index) => {
                  const complete = index < currentStageIndex || (a?.status === 'closed' && index === currentStageIndex);
                  const current = index === currentStageIndex && !complete;
                  return (
                    <li key={stage} className="relative flex gap-3 pb-4 last:pb-0" aria-current={current ? 'step' : undefined}>
                      {index < WORKFLOW_STAGES.length - 1 && <span className="absolute top-6 bottom-0 left-3 w-px bg-border" aria-hidden="true" />}
                      <span
                        className={`relative z-[1] flex size-6 shrink-0 items-center justify-center rounded-md border text-[0.65rem] font-semibold ${
                          complete
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : current
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-card text-muted-foreground'
                        }`}
                      >
                        {complete ? <Check className="size-3" aria-hidden="true" /> : current ? <CircleDot className="size-3" aria-hidden="true" /> : index + 1}
                      </span>
                      <span className={`pt-0.5 text-sm ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t(`stages.${stage}`)}</span>
                    </li>
                  );
                })}
              </ol>
            </section>

            {(a?.personaKey || a?.scenarioKey) && (
              <section className="border-t px-5 py-4">
                <h3 className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('assessmentContext')}</h3>
                <dl className="mt-3 space-y-3 text-sm">
                  {a.personaKey && (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('role')}</dt>
                      <dd className="mt-0.5 font-medium">{humanizeKey(a.personaKey)}</dd>
                      {a.personaSource === 'ai' && <dd className="mt-1 text-xs text-primary">{t('aiSuggestedRole')}</dd>}
                    </div>
                  )}
                  {a.scenarioKey && (
                    <div>
                      <dt className="text-xs text-muted-foreground">{t('scenario')}</dt>
                      <dd className="mt-0.5 font-medium">{humanizeKey(a.scenarioKey)}</dd>
                    </div>
                  )}
                </dl>
              </section>
            )}

            <section className="border-t px-5 py-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('capturedFacts')}</h3>
                <span className="text-xs font-semibold tabular-nums text-foreground">{a?.facts?.length ?? 0}</span>
              </div>
              {a?.facts?.length ? (
                <div className="mt-3 divide-y">
                  {a.facts.slice(-6).map((fact) => (
                    <div key={fact.key} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 py-3 first:pt-0 last:pb-0">
                      <span className={`mt-0.5 ${fact.flagged ? 'text-amber-700' : 'text-emerald-700'}`}>
                        {fact.flagged ? <Flag className="size-3.5" aria-hidden="true" /> : <Check className="size-3.5" aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{humanizeKey(fact.key)}</p>
                        <p className="mt-0.5 line-clamp-2 break-words text-xs leading-4 text-muted-foreground">{factValue(fact.value)}</p>
                        <p className="mt-1 text-[0.65rem] tabular-nums text-muted-foreground">{Math.round(fact.confidence * 100)}% {t('factConfidence')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{t('noFacts')}</p>
              )}
            </section>

            <p className="border-t px-5 py-4 text-xs leading-5 text-muted-foreground">
              <LockKeyhole className="mr-1.5 inline size-3.5 text-primary" aria-hidden="true" />
              {t('governanceNote')}
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}

function PersonaChooser({
  options,
  busy,
  suggestedKey,
  onChoose,
}: {
  options: PersonaOption[];
  busy: boolean;
  suggestedKey?: string;
  onChoose: (personaKey: string) => void;
}) {
  const t = useTranslations('chatSession.persona');
  if (options.length === 0) return <p className="text-sm text-muted-foreground">{t('empty')}</p>;

  return (
    <Suggestions className="grid grid-cols-1 sm:grid-cols-2" role="group" aria-label={t('confirmTitle')}>
      {options.map((option) => (
        <Suggestion
          key={option.key}
          data-testid="persona-option"
          suggestion={option.key}
          variant={option.key === suggestedKey ? 'default' : 'outline'}
          disabled={busy}
          title={option.description}
          className="min-h-12 w-full items-center justify-between"
          onClick={onChoose}
        >
          <span>
            <span className="block font-medium">{option.name}</span>
            {option.description && <span className="mt-0.5 block text-xs font-normal opacity-75">{option.description}</span>}
          </span>
          {option.key === suggestedKey && <span className="ml-2 text-xs font-medium">{t('suggestedSuffix')}</span>}
        </Suggestion>
      ))}
    </Suggestions>
  );
}

function AnswerBox({
  q,
  busy,
  text,
  setText,
  onAnswer,
}: {
  q: QuestionSnapshot;
  busy: boolean;
  text: string;
  setText: (value: string) => void;
  onAnswer: (body: { value?: string | number | boolean; text?: string }) => Promise<void>;
}) {
  const t = useTranslations('chatSession.answer');
  const inputId = useId();
  const submitText = () => {
    if (busy || !text.trim()) return;
    void onAnswer({ text: text.trim() }).then(() => setText(''));
  };

  if (q.type === 'mcq' && q.options?.length) {
    return (
      <fieldset>
        <legend className="sr-only">{q.text ?? t('optionsLabel')}</legend>
        <Suggestions className="grid grid-cols-1 sm:grid-cols-2">
          {q.options.map((option) => (
            <Suggestion
              key={option.id}
              data-testid="answer-option"
              suggestion={option.id}
              variant="outline"
              disabled={busy}
              className="w-full border-border/90 bg-background hover:border-primary/35 hover:bg-primary/[0.04]"
              onClick={() => void onAnswer({ value: option.id })}
            >
              {option.label}
            </Suggestion>
          ))}
        </Suggestions>
      </fieldset>
    );
  }

  if (q.type === 'yes_no') {
    return (
      <fieldset className="grid gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
        <legend className="sr-only">{q.text ?? t('yesNoLabel')}</legend>
        <div className="grid grid-cols-2 gap-2">
          <Button disabled={busy} onClick={() => void onAnswer({ value: true })}>
            <Check className="size-4" aria-hidden="true" />
            {t('yes')}
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void onAnswer({ value: false })}>{t('no')}</Button>
        </div>
        <div>
          <label className="sr-only" htmlFor={inputId}>{t('explainLabel')}</label>
          <Input
            id={inputId}
            disabled={busy}
            placeholder={t('explainPlaceholder')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitText();
              }
            }}
          />
        </div>
        <Button variant="outline" disabled={busy || !text.trim()} onClick={submitText} aria-label={t('send')}>
          <Send className="size-4" aria-hidden="true" />
          <span className="sm:sr-only">{t('send')}</span>
        </Button>
      </fieldset>
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
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label className="sr-only" htmlFor={inputId}>{q.text ?? t('numberLabel')}</label>
          <Input
            id={inputId}
            type="number"
            disabled={busy}
            placeholder={t('numberPlaceholder')}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !busy && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submitNumber();
              }
            }}
          />
        </div>
        <Button disabled={busy || text.trim() === '' || !Number.isFinite(Number(text))} onClick={submitNumber}>
          <Send className="size-4" aria-hidden="true" />
          {t('send')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <label className="sr-only" htmlFor={inputId}>{q.text ?? t('textLabel')}</label>
      <div className="relative">
        <Textarea
          id={inputId}
          rows={2}
          disabled={busy}
          placeholder={t('textPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-24 resize-none pr-24"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !busy && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submitText();
            }
          }}
        />
        <Button className="absolute right-2 bottom-2" disabled={busy || !text.trim()} onClick={submitText}>
          <Send className="size-4" aria-hidden="true" />
          {t('send')}
        </Button>
      </div>
    </div>
  );
}
