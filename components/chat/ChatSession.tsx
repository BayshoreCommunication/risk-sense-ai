'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertCircle, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, FileCheck2, Flag, LoaderCircle, LockKeyhole, PanelRight, Send, Sparkles } from 'lucide-react';
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation';
import { Message as AIMessage, MessageContent, MessageResponse } from '@/components/ai-elements/message';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { assessments, pendingQuestion, type Assessment, type Message, type QuestionSnapshot, type Turn } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';
import { formatIdentifierLabel, formatSystemDisplayText } from '@/lib/format-identifier-label';
import { ResultCard } from './ResultCard';

type PersonaOption = { key: string; name: string; description?: string };
type StageKey = 'persona' | 'describe' | 'questions' | 'review' | 'decision';
type BusyAction = 'answer' | 'persona' | 'submit' | 'decision';
type AnswerOutcome = 'success' | 'failure' | 'ignored';
type RunOutcome =
  | { status: 'success' | 'committed'; result: Turn | Assessment }
  | { status: 'failure' };

const WORKFLOW_STAGES: StageKey[] = ['persona', 'describe', 'questions', 'review', 'decision'];

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
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [optimisticAnswer, setOptimisticAnswer] = useState<string | null>(null);
  const busyRef = useRef(false);

  const reload = useCallback(async () => {
    const [assessment, transcript] = await Promise.all([assessments.get(id), assessments.messages(id)]);
    setA(assessment);
    setMessages(transcript);
  }, [id]);

  useEffect(() => {
    reload().catch((nextError) => setError(toApiError(nextError).message));
  }, [reload]);

  async function run(
    fn: () => Promise<Turn | Assessment>,
    action: BusyAction,
    onRefreshFailure?: (result: Turn | Assessment) => void,
  ): Promise<RunOutcome> {
    if (busyRef.current) return { status: 'failure' };
    busyRef.current = true;
    setBusy(true);
    setBusyAction(action);
    setError(null);
    try {
      const result = await fn();
      try {
        await reload();
        return { status: 'success', result };
      } catch {
        // The mutation already committed. Keep its returned state and never invite a duplicate retry
        // just because transcript revalidation failed.
        setA(result);
        onRefreshFailure?.(result);
        setError(t('refreshFailed'));
        return { status: 'committed', result };
      }
    } catch (mutationError) {
      setError(toApiError(mutationError).message);
      return { status: 'failure' };
    } finally {
      busyRef.current = false;
      setBusy(false);
      setBusyAction(null);
    }
  }

  const question = pendingQuestion(messages, a);
  const answer = async (body: { value?: string | number | boolean; text?: string }, displayValue: string): Promise<AnswerOutcome> => {
    if (busyRef.current) return 'ignored';
    setOptimisticAnswer(displayValue);
    const outcome = await run(
      () => assessments.answer(id, body),
      'answer',
      (result) => {
        const turn = result as Turn;
        const createdAt = new Date().toISOString();
        setMessages((current) => [
          ...current,
          {
            _id: `local-answer-${createdAt}`,
            role: 'user',
            kind: 'answer',
            content: displayValue,
            createdAt,
          },
          ...(turn.nextQuestion?.text
            ? [
                {
                  _id: `local-question-${createdAt}`,
                  role: 'assistant' as const,
                  kind: 'question' as const,
                  content: turn.nextQuestion.text,
                  questionKey: turn.nextQuestion.key,
                  question: turn.nextQuestion,
                  createdAt,
                },
              ]
            : []),
        ]);
      },
    );
    setOptimisticAnswer(null);
    return outcome.status === 'failure' ? 'failure' : 'success';
  };

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
    void run(
      () => assessments.setPersona(id, personaKey),
      'persona',
      (result) => {
        const turn = result as Turn;
        if (!turn.nextQuestion?.text) return;
        const createdAt = new Date().toISOString();
        setMessages((current) => [
          ...current,
          {
            _id: `local-persona-${createdAt}`,
            role: 'user',
            kind: 'answer',
            content: formatIdentifierLabel(personaKey),
            createdAt,
          },
          {
            _id: `local-question-${createdAt}`,
            role: 'assistant',
            kind: 'question',
            content: turn.nextQuestion!.text!,
            questionKey: turn.nextQuestion!.key,
            question: turn.nextQuestion!,
            createdAt,
          },
        ]);
      },
    );
  }

  const candidateOptions: PersonaOption[] =
    question?.key === '__persona' && question.options?.length
      ? question.options.map((option) => ({ key: option.id, name: option.label }))
      : (a?.personaCandidates ?? []).map((key) => ({ key, name: formatIdentifierLabel(key) }));
  const currentStageIndex = activeStage(a);
  const currentStageKey = currentStageIndex >= 0 ? WORKFLOW_STAGES[currentStageIndex] : undefined;
  const showComposer = Boolean(error || a?.status === 'in_progress' || a?.status === 'intake_complete' || a?.status === 'closed');
  const busyMessage =
    busyAction === 'submit'
      ? t('submission.assessing')
      : busyAction === 'persona'
        ? t('persona.processing')
        : t('processing');

  return (
    <div className="page-shell max-w-[1480px] gap-3 overflow-hidden" data-testid="assessment-conversation-page">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-xl font-bold tracking-[-0.03em] text-foreground sm:text-2xl">{t('title')}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('assessmentId', { id: id.slice(-8).toUpperCase() })}</p>
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

      <section aria-label={t('workspaceLabel')} className="fills overflow-hidden rounded-[1.35rem] border border-[#dbe3ef] bg-card shadow-[0_20px_60px_rgba(8,32,68,0.11)] ring-1 ring-[#082044]/[0.035]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dfe7f2] bg-[linear-gradient(135deg,#ffffff_0%,#f8fbff_62%,#edf4ff_100%)] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="relative flex size-10 items-center justify-center rounded-[0.9rem] bg-[linear-gradient(145deg,#082451_0%,#216ce7_100%)] text-white shadow-[0_8px_22px_rgba(18,71,150,0.3)] ring-1 ring-white/70">
              <Bot className="size-4" aria-hidden="true" />
              <Sparkles className="absolute -right-1 -top-1 size-3 rounded-full bg-white p-0.5 text-primary shadow-sm" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-semibold tracking-[-0.01em]">{t('assistantName')}</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('assistantDescription')}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {a?.scenarioKey && (
              <div className="hidden w-[23rem] max-w-full shrink-0 items-center gap-2.5 rounded-xl border border-[#cfe0f6] bg-white/85 px-2.5 py-2 shadow-[0_4px_14px_rgba(22,66,126,0.07)] sm:flex">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eaf2ff] text-[#155bd7]">
                  <FileCheck2 className="size-3.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.67rem] font-semibold tracking-[0.1em] text-muted-foreground uppercase">{t('selectedScenario')}</span>
                  <span className="mt-0.5 block text-xs font-semibold leading-4">{formatIdentifierLabel(a.scenarioKey)}</span>
                </span>
                <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[0.6rem]">
                  {a.scenarioSource === 'ai' ? t('scenarioSources.ai') : t('scenarioSources.default')}
                </Badge>
              </div>
            )}
            <details className="group/context relative min-[1360px]:hidden" data-testid="assessment-context-disclosure">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-card px-3 text-xs font-semibold outline-none transition hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <PanelRight className="size-3.5 text-primary" aria-hidden="true" />
                <span>{t('contextPanel')}</span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open/context:rotate-180" aria-hidden="true" />
              </summary>
              <div className="scrollbar-subtle absolute right-0 top-full z-30 mt-2 max-h-[min(70dvh,34rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card shadow-[0_20px_55px_rgba(15,35,65,0.18)]">
                <AssessmentContext a={a} currentStageIndex={currentStageIndex} />
              </div>
            </details>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 min-[1360px]:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <Conversation className="min-h-0 flex-1 bg-[radial-gradient(circle_at_50%_0%,rgba(42,105,225,0.055),transparent_19rem),linear-gradient(180deg,#ffffff_0%,#fbfcff_100%)]" data-testid="conversation-log">
              <ConversationContent className="mx-auto w-full max-w-[52rem] gap-4 px-4 py-4 sm:px-6 sm:py-5">
                {!a && messages.length === 0 && (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground" role="status">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    {t('loadingConversation')}
                  </div>
                )}

                {messages.map((message) => {
                  if (message.role === 'system') {
                    return (
                      <div key={message._id} className="mx-auto flex w-full max-w-[46rem] items-center gap-3 py-1 text-[0.7rem] text-muted-foreground" role="note">
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                        <span>{message.content}</span>
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>
                    );
                  }

                  const assistant = message.role === 'assistant';
                  const clarification = message.kind === 'clarification';
                  const displayContent = assistant ? formatSystemDisplayText(message.content) : message.content;
                  return (
                    <AIMessage key={message._id} from={message.role} className={assistant ? 'mx-auto max-w-[48rem]' : 'max-w-[82%] sm:max-w-[70%]'}>
                      {assistant ? (
                        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5">
                          <span
                            className={`flex size-7 items-center justify-center rounded-lg border shadow-[0_3px_10px_rgba(8,43,94,0.08)] ${
                              clarification ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7]'
                            }`}
                          >
                            {clarification ? <Flag className="size-3" aria-hidden="true" /> : <Bot className="size-3" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            <span className={`mb-1 block text-[0.68rem] font-semibold tracking-[0.12em] uppercase ${clarification ? 'text-amber-700' : 'text-muted-foreground'}`}>
                              {clarification ? t('messageKinds.clarification') : t('assistantName')}
                            </span>
                            <MessageContent className={`w-full py-0.5 ${clarification ? 'rounded-r-xl border-l-2 border-amber-300 bg-amber-50/50 py-2 pl-3 pr-2' : ''}`}>
                              <MessageResponse className="text-sm leading-[1.6]">{displayContent}</MessageResponse>
                            </MessageContent>
                          </div>
                        </div>
                      ) : (
                        <MessageContent className="[overflow-wrap:anywhere]">
                          <p className="whitespace-pre-wrap break-words leading-[1.5]">{displayContent}</p>
                        </MessageContent>
                      )}
                    </AIMessage>
                  );
                })}

                {optimisticAnswer && (
                  <AIMessage from="user" className="max-w-[82%] sm:max-w-[70%]" data-testid="optimistic-answer">
                    <MessageContent aria-label={t('answer.sending')} className="[overflow-wrap:anywhere]">
                      <p className="whitespace-pre-wrap break-words leading-[1.5]">{optimisticAnswer}</p>
                    </MessageContent>
                  </AIMessage>
                )}

                {busy && busyAction !== 'decision' && (
                  <AIMessage from="assistant" className="mx-auto max-w-[48rem]" data-testid="assistant-processing">
                    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-lg border border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7] shadow-[0_3px_10px_rgba(8,43,94,0.08)]">
                        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <span className="block text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('assistantName')}</span>
                        <p className="mt-1 text-sm text-muted-foreground">{busyMessage}</p>
                      </div>
                    </div>
                  </AIMessage>
                )}

                {a?.result && (
                  <ResultCard
                    a={a}
                    busy={busy}
                    decisionBusy={busyAction === 'decision'}
                    onDecide={(decision) => void run(() => assessments.decide(id, decision), 'decision')}
                  />
                )}
              </ConversationContent>
              <ConversationScrollButton aria-label={t('scrollLatest')} />
            </Conversation>

            {showComposer && (
              <div
                className="scrollbar-subtle max-h-[min(40dvh,22rem)] shrink-0 overflow-y-auto border-t border-[#dfe7f2] bg-[linear-gradient(180deg,#f5f8fd_0%,#fbfcff_55%)] px-3 py-3 shadow-[0_-10px_30px_rgba(8,32,68,0.045)] sm:px-5"
                data-testid="composer"
                aria-busy={busy}
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
                <fieldset className="mx-auto max-w-[52rem] space-y-2.5">
                  <legend className="text-sm font-semibold">{t('persona.confirmTitle')}</legend>
                  <p className="text-xs leading-5 text-muted-foreground">{t('persona.confirmDescription')}</p>
                  <PersonaChooser options={candidateOptions} busy={busy} suggestedKey={a.personaSource === 'ai' ? a.personaKey : undefined} onChoose={choosePersona} />
                </fieldset>
              )}

              {a?.status === 'in_progress' && a.phase === 'describe' && a.personaKey && (
                <div className="mx-auto mb-3 flex max-w-[52rem] flex-wrap items-center justify-between gap-3 border-b pb-3">
                  <div>
                    <p className="text-sm font-semibold">{t('persona.current', { role: formatIdentifierLabel(a.personaKey) })}</p>
                    <p className="text-xs text-muted-foreground">{t('persona.changeHint')}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={busy || personasLoading} onClick={() => void openPersonaPicker()}>
                    {personasLoading ? t('persona.loading') : t('persona.change')}
                  </Button>
                  {personaPickerOpen && !personasLoading && <PersonaChooser options={personaOptions} busy={busy} onChoose={choosePersona} />}
                </div>
              )}

              {a?.status === 'in_progress' && a.phase === 'questions' && a.personaSource === 'ai' && (
                <p className="mx-auto mb-3 flex max-w-[52rem] items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('persona.locked')}{' '}
                    <Link className="font-medium text-primary underline underline-offset-2" href="/chat">{t('persona.startNew')}</Link>{' '}
                    {t('persona.ifIncorrect')}
                  </span>
                </p>
              )}

              {a?.status === 'in_progress' && a.phase !== 'persona' && question && (
                <div className="mx-auto max-w-[52rem]">
                  <AnswerBox key={question.key + messages.length} q={question} busy={busy} text={text} setText={setText} onAnswer={answer} />
                </div>
              )}

              {a?.status === 'intake_complete' && (
                <div className="mx-auto flex max-w-[52rem] flex-col gap-3 rounded-r-xl border-l-2 border-emerald-500 bg-emerald-50/60 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 text-emerald-700" aria-hidden="true" />
                    {t('submission.ready')}
                  </span>
                  <Button disabled={busy} onClick={() => void run(() => assessments.submit(id), 'submit')}>
                    {busy ? t('submission.assessing') : t('submission.submit')}
                    {!busy && <ChevronRight data-icon="inline-end" className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
              )}

              {a?.status === 'closed' && (
                <p className="mx-auto flex max-w-[52rem] items-center justify-center gap-2 py-1 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                  {t('closed')}
                </p>
              )}
              </div>
            )}
          </div>

          <aside className="scrollbar-subtle hidden min-h-0 overflow-y-auto border-l border-[#dfe7f2] bg-[linear-gradient(180deg,#f5f8fd_0%,#f9fbfe_100%)] min-[1360px]:block" aria-label={t('contextPanel')}>
            <AssessmentContext a={a} currentStageIndex={currentStageIndex} />
          </aside>
        </div>
      </section>
    </div>
  );
}

function AssessmentContext({ a, currentStageIndex }: { a: Assessment | null; currentStageIndex: number }) {
  const t = useTranslations('chatSession');

  return (
    <div>
      <section className="p-4">
        <h3 className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('workflow')}</h3>
        <ol className="mt-3 space-y-0.5" aria-label={t('workflow')}>
          {WORKFLOW_STAGES.map((stage, index) => {
            const complete = index < currentStageIndex || (a?.status === 'closed' && index === currentStageIndex);
            const current = index === currentStageIndex && !complete;
            return (
              <li key={stage} className="relative flex gap-2.5 pb-3.5 last:pb-0" aria-current={current ? 'step' : undefined}>
                {index < WORKFLOW_STAGES.length - 1 && <span className="absolute top-5 bottom-0 left-2.5 w-px bg-border" aria-hidden="true" />}
                <span
                  className={`relative z-[1] flex size-5 shrink-0 items-center justify-center rounded-md border text-[0.6rem] font-semibold ${
                    complete
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : current
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground'
                  }`}
                >
                  {complete ? <Check className="size-3" aria-hidden="true" /> : current ? <CircleDot className="size-3" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`pt-px text-xs ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t(`stages.${stage}`)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {(a?.personaKey || a?.scenarioKey) && (
        <section className="border-t px-4 py-3.5">
          <h3 className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('assessmentContext')}</h3>
          <dl className="mt-2.5 grid gap-2.5 text-xs">
            {a.personaKey && (
              <div>
                <dt className="text-[0.68rem] text-muted-foreground">{t('role')}</dt>
                <dd className="mt-0.5 font-medium">{formatIdentifierLabel(a.personaKey)}</dd>
                {a.personaSource === 'ai' && <dd className="mt-0.5 text-[0.68rem] text-primary">{t('aiSuggestedRole')}</dd>}
              </div>
            )}
            {a.scenarioKey && (
              <div>
                <dt className="text-[0.68rem] text-muted-foreground">{t('scenario')}</dt>
                <dd className="mt-0.5 font-medium">{formatIdentifierLabel(a.scenarioKey)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <details className="group/facts border-t">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 outline-none transition hover:bg-primary/[0.025] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span className="text-[0.65rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('capturedFacts')}</span>
          <span className="flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-foreground">{a?.facts?.length ?? 0}</span>
            <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open/facts:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t px-4 py-3">
          {a?.facts?.length ? (
            <div className="divide-y">
              {a.facts.slice(-6).map((fact) => (
                <div key={fact.key} className="grid grid-cols-[0.9rem_minmax(0,1fr)] gap-2 py-2.5 first:pt-0 last:pb-0">
                  <span className={`mt-0.5 ${fact.flagged ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {fact.flagged ? <Flag className="size-3" aria-hidden="true" /> : <Check className="size-3" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{formatIdentifierLabel(fact.key)}</p>
                    <p className="mt-0.5 line-clamp-2 break-words text-[0.7rem] leading-4 text-muted-foreground">{factValue(fact.value)}</p>
                    <p className="mt-0.5 text-[0.62rem] tabular-nums text-muted-foreground">{Math.round(fact.confidence * 100)}% {t('factConfidence')}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">{t('noFacts')}</p>
          )}
        </div>
      </details>

      <p className="border-t px-4 py-3 text-[0.7rem] leading-5 text-muted-foreground">
        <LockKeyhole className="mr-1.5 inline size-3 text-primary" aria-hidden="true" />
        {t('governanceNote')}
      </p>
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
          className="min-h-14 w-full items-center justify-between rounded-xl border-[#d8e3f1] bg-white px-4 text-foreground shadow-[0_2px_8px_rgba(8,35,76,0.045)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_7px_18px_rgba(8,45,101,0.09)] motion-reduce:hover:translate-y-0"
          onClick={onChoose}
        >
          <span>
            <span className="block font-medium">{option.name}</span>
            {option.description && <span className="mt-0.5 block text-xs font-normal opacity-75">{option.description}</span>}
          </span>
          {option.key === suggestedKey && <span className="ml-2 text-xs font-medium text-primary">{t('suggestedSuffix')}</span>}
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
  onAnswer: (body: { value?: string | number | boolean; text?: string }, displayValue: string) => Promise<AnswerOutcome>;
}) {
  const t = useTranslations('chatSession.answer');
  const inputId = useId();
  const submitText = () => {
    if (busy || !text.trim()) return;
    const submittedText = text.trim();
    setText('');
    void onAnswer({ text: submittedText }, submittedText).then((outcome) => {
      if (outcome === 'failure') setText(submittedText);
    });
  };

  if (q.type === 'mcq' && q.options?.length) {
    return (
      <fieldset>
        <legend className="sr-only">{q.text ?? t('optionsLabel')}</legend>
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-foreground">{t('responseLabel')}</span>
          <span className="text-[0.7rem] text-muted-foreground">{t('chooseOne')}</span>
        </div>
        <Suggestions className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {q.options.map((option, index) => (
            <Suggestion
              key={option.id}
              data-testid="answer-option"
              suggestion={option.id}
              variant="outline"
              disabled={busy}
              className="group/choice min-h-10 w-full items-center gap-2.5 rounded-xl border border-[#d8e3f1] bg-white px-3 py-2 text-left shadow-[0_2px_8px_rgba(8,35,76,0.04)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/35 hover:bg-primary/[0.035] hover:shadow-[0_7px_16px_rgba(8,45,101,0.08)] motion-reduce:hover:translate-y-0"
              onClick={() => void onAnswer({ value: option.id }, option.label)}
            >
              <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-md border border-primary/15 bg-primary/[0.055] text-[0.65rem] font-bold text-primary transition group-hover/choice:border-primary/30 group-hover/choice:bg-primary group-hover/choice:text-white">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="min-w-0 flex-1 text-xs leading-5">{option.label}</span>
              <ChevronRight aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground/50 transition group-hover/choice:translate-x-0.5 group-hover/choice:text-primary" />
            </Suggestion>
          ))}
        </Suggestions>
      </fieldset>
    );
  }

  if (q.type === 'yes_no') {
    return (
      <fieldset className="grid gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-end">
        <legend className="sr-only">{q.text ?? t('yesNoLabel')}</legend>
        <div className="flex items-center justify-between gap-3 sm:col-span-3">
          <span className="text-xs font-semibold text-foreground">{t('responseLabel')}</span>
          <span className="text-[0.7rem] text-muted-foreground">{t('optionalExplanation')}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" disabled={busy} onClick={() => void onAnswer({ value: true }, t('yes'))}>
            <Check className="size-4" aria-hidden="true" />
            {t('yes')}
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void onAnswer({ value: false }, t('no'))}>{t('no')}</Button>
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
          <Button size="sm" variant="outline" disabled={busy || !text.trim()} onClick={submitText} aria-label={t('send')}>
          <Send className="size-4" aria-hidden="true" />
          <span className="sm:sr-only">{t('send')}</span>
        </Button>
      </fieldset>
    );
  }

  if (q.type === 'number') {
    const submitNumber = () => {
      if (!text.trim()) return;
      const submittedText = text.trim();
      const value = Number(submittedText);
      if (!Number.isFinite(value)) return;
      setText('');
      void onAnswer({ value }, submittedText).then((outcome) => {
        if (outcome === 'failure') setText(submittedText);
      });
    };
    return (
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex items-center justify-between gap-3 sm:col-span-2">
          <p className="text-xs font-semibold text-foreground">{t('responseLabel')}</p>
          <p className="text-[0.7rem] text-muted-foreground">{t('numberHint')}</p>
        </div>
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
        <Button size="sm" disabled={busy || text.trim() === '' || !Number.isFinite(Number(text))} onClick={submitNumber}>
          <Send className="size-4" aria-hidden="true" />
          {t('send')}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <p className="sr-only">{t('responseLabel')}</p>
      <label className="sr-only" htmlFor={inputId}>{q.text ?? t('textLabel')}</label>
      {/* One composer surface: the field and its send share a frame and a focus ring. */}
      <div className="rounded-[1.2rem] border border-[#cfdaea] bg-white shadow-[0_10px_28px_rgba(8,35,76,0.1),0_1px_2px_rgba(8,35,76,0.04)] transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-[0_13px_34px_rgba(24,83,170,0.14),0_0_0_4px_rgba(40,100,239,0.08)]">
        <Textarea
          id={inputId}
          rows={2}
          disabled={busy}
          placeholder={t('textPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-12 max-h-28 resize-none border-0 bg-transparent px-4 py-3 text-sm leading-5 shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !busy && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submitText();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-2.5 pt-1">
          <span className="text-[0.7rem] text-muted-foreground">{t('enterHint')}</span>
          <Button size="icon" className="size-9 rounded-full bg-[linear-gradient(145deg,#0a2c5d,#216ce7)] shadow-[0_6px_16px_rgba(24,83,170,0.24)] transition-transform hover:scale-[1.03] motion-reduce:hover:scale-100" disabled={busy || !text.trim()} onClick={submitText} aria-label={t('send')}>
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">{t('send')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
