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
import { assessments, factOptionLabel, pendingQuestion, type Assessment, type Message, type QuestionSnapshot, type Turn } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';
import { formatDisplayValue, formatIdentifierLabel, formatSystemDisplayText } from '@/lib/format-identifier-label';
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

function latestQuestionMessageId(messages: Message[], question: QuestionSnapshot | null) {
  if (!question) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]!;
    if (
      message.role === 'assistant' &&
      (message.kind === 'question' || message.kind === 'clarification') &&
      message.question?.key === question.key
    ) {
      return message._id;
    }
  }
  return undefined;
}

function normalizedProse(value: string) {
  return formatSystemDisplayText(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase();
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
  const inlineChoiceQuestion =
    a?.status === 'in_progress' &&
    a.phase !== 'persona' &&
    question &&
    (question.type === 'yes_no' || (question.type === 'mcq' && question.options?.length))
      ? question
      : null;
  const inlineChoiceMessageId = latestQuestionMessageId(messages, inlineChoiceQuestion);
  const hasInlineChoice = Boolean(inlineChoiceQuestion && inlineChoiceMessageId);
  const busyMessage =
    busyAction === 'submit'
      ? t('submission.assessing')
      : busyAction === 'persona'
        ? t('persona.processing')
        : t('processing');

  return (
    <div className="page-shell max-w-none gap-2 overflow-hidden" data-testid="assessment-conversation-page">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-[1.05rem] font-bold tracking-[-0.025em] text-foreground sm:text-lg">{t('title')}</h1>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{t('assessmentId', { id: id.slice(-8).toUpperCase() })}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentStageKey && (
            <span className="text-xs font-medium text-muted-foreground min-[1360px]:hidden" data-testid="current-stage-label">
              {t('currentStage')}: <span className="text-foreground">{t(`stages.${currentStageKey}`)}</span>
            </span>
          )}
          {a && <Badge variant={a.status === 'closed' ? 'default' : 'secondary'}>{status.has(a.status) ? status(a.status) : formatIdentifierLabel(a.status)}</Badge>}
        </div>
      </div>

      <section aria-label={t('workspaceLabel')} className="fills overflow-hidden rounded-[1.35rem] border border-[#d7e1ee] bg-[#fbfcff] shadow-[0_18px_55px_rgba(8,32,68,0.1)] ring-1 ring-[#082044]/[0.03] dark:border-border dark:bg-card dark:shadow-[0_20px_60px_rgba(1,8,22,0.28)] dark:ring-white/[0.03]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dfe7f2] bg-white px-4 py-2 dark:border-border dark:bg-card sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#082451_0%,#216ce7_100%)] text-white shadow-[0_6px_16px_rgba(18,71,150,0.24)] ring-1 ring-white/70">
              <Bot className="size-3.5" aria-hidden="true" />
              <Sparkles className="absolute -right-1 -top-1 size-2.5 rounded-full bg-white p-0.5 text-primary shadow-sm" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[0.78rem] font-semibold tracking-[-0.01em]">{t('assistantName')}</h2>
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{t('assistantDescription')}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <details className="group/context relative min-[1360px]:hidden" data-testid="assessment-context-disclosure">
              <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-card px-3 text-xs font-semibold outline-none transition hover:border-primary/30 hover:bg-primary/[0.03] focus-visible:ring-2 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
                <PanelRight className="size-3.5 text-primary" aria-hidden="true" />
                <span>{t('contextPanel')}</span>
                <ChevronDown className="size-3.5 text-muted-foreground transition-transform group-open/context:rotate-180" aria-hidden="true" />
              </summary>
              <div className="scrollbar-subtle absolute right-0 top-full z-30 mt-2 max-h-[min(70dvh,34rem)] w-[min(21rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border bg-card shadow-[0_20px_55px_rgba(15,35,65,0.18)]">
                <AssessmentContext a={a} currentStageIndex={currentStageIndex} messages={messages} />
              </div>
            </details>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 min-[1360px]:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <Conversation className="min-h-0 flex-1 bg-[#fbfcff] dark:bg-background/55" data-testid="conversation-log">
              <ConversationContent className="mx-auto w-full max-w-[64rem] gap-3 px-4 py-3.5 sm:px-6 sm:py-4" data-testid="conversation-content">
                {!a && messages.length === 0 && (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground" role="status">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    {t('loadingConversation')}
                  </div>
                )}

                {messages.map((message) => {
                  if (message.role === 'system') {
                    return (
                      <div key={message._id} className="mx-auto flex w-full max-w-[58rem] items-center gap-3 py-1 text-[0.7rem] text-muted-foreground" role="note">
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                        <span>{message.content}</span>
                        <span className="h-px flex-1 bg-border" aria-hidden="true" />
                      </div>
                    );
                  }

                  if (
                    message.role === 'assistant' &&
                    message.kind === 'result' &&
                    a?.result?.explanation &&
                    normalizedProse(message.content) === normalizedProse(a.result.explanation)
                  ) {
                    return null;
                  }

                  const assistant = message.role === 'assistant';
                  const clarification = message.kind === 'clarification';
                  const activeInlineChoice = Boolean(inlineChoiceQuestion && message._id === inlineChoiceMessageId);
                  const displayContent = assistant ? formatSystemDisplayText(message.content) : message.content;
                  return (
                    <AIMessage key={message._id} from={message.role} className={assistant ? 'mx-auto max-w-[60rem]' : 'max-w-[82%] sm:max-w-[70%]'}>
                      {assistant ? (
                        <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5">
                          <span
                            className={`flex size-7 items-center justify-center rounded-lg border shadow-[0_3px_10px_rgba(8,43,94,0.08)] ${
                              clarification
                                ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-300'
                                : 'border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7] dark:border-primary/35 dark:bg-info-soft dark:text-blue-300'
                            }`}
                          >
                            {clarification ? <Flag className="size-3" aria-hidden="true" /> : <Bot className="size-3" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            <span className={`mb-1 block text-[0.62rem] font-semibold tracking-[0.12em] uppercase ${clarification ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'}`}>
                              {clarification ? t('messageKinds.clarification') : t('assistantName')}
                            </span>
                            <MessageContent className={`w-full py-0.5 ${clarification ? 'rounded-r-xl border-l-2 border-amber-300 bg-amber-50/50 py-2 pl-3 pr-2 dark:border-amber-400/50 dark:bg-amber-400/[0.08]' : ''}`}>
                              <MessageResponse className="text-[0.8rem] leading-[1.55]">{displayContent}</MessageResponse>
                              {activeInlineChoice && inlineChoiceQuestion && (
                                <InlineChoiceCard
                                  q={inlineChoiceQuestion}
                                  busy={busy}
                                  error={error}
                                  personaLocked={a?.phase === 'questions' && a.personaSource === 'ai'}
                                  onAnswer={async (body, displayValue) => {
                                    const outcome = await answer(body, displayValue);
                                    if (outcome === 'success' && inlineChoiceQuestion.type === 'yes_no') setText('');
                                    return outcome;
                                  }}
                                />
                              )}
                            </MessageContent>
                          </div>
                        </div>
                      ) : (
                        <MessageContent className="text-[0.8rem] [overflow-wrap:anywhere]">
                          <p className="whitespace-pre-wrap break-words leading-[1.5]">{displayContent}</p>
                        </MessageContent>
                      )}
                    </AIMessage>
                  );
                })}

                {optimisticAnswer && (
                  <AIMessage from="user" className="max-w-[82%] sm:max-w-[70%]" data-testid="optimistic-answer">
                    <MessageContent aria-label={t('answer.sending')} className="text-[0.8rem] [overflow-wrap:anywhere]">
                      <p className="whitespace-pre-wrap break-words leading-[1.5]">{optimisticAnswer}</p>
                    </MessageContent>
                  </AIMessage>
                )}

                {busy && busyAction !== 'decision' && (
                  <AIMessage from="assistant" className="mx-auto max-w-[60rem]" data-testid="assistant-processing">
                    <div className="grid grid-cols-[1.75rem_minmax(0,1fr)] items-start gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-lg border border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7] shadow-[0_3px_10px_rgba(8,43,94,0.08)] dark:border-primary/35 dark:bg-info-soft dark:text-blue-300">
                        <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 pt-0.5">
                        <span className="block text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('assistantName')}</span>
                        <p className="mt-1 text-xs text-muted-foreground">{busyMessage}</p>
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
                className="scrollbar-subtle max-h-[min(40dvh,22rem)] shrink-0 overflow-y-auto border-t border-[#dfe7f2] bg-[#f5f8fc] px-3 py-3 shadow-[0_-8px_24px_rgba(8,32,68,0.035)] dark:border-border dark:bg-muted/55 dark:shadow-[0_-12px_28px_rgba(1,8,22,0.18)] sm:px-5"
                data-testid="composer"
                aria-busy={busy}
                data-busy={busy ? 'true' : 'false'}
                data-messages={messages.length}
                data-status={a?.status ?? ''}
              >
              {!hasInlineChoice && error && (
                <p className="mb-4 flex items-start gap-2 border-l-2 border-destructive bg-destructive/5 px-3 py-2.5 text-sm text-destructive" role="alert">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {error}
                </p>
              )}

              {a?.status === 'in_progress' && a.phase === 'persona' && (
                <fieldset className="mx-auto max-w-[64rem] space-y-2.5">
                  <legend className="text-sm font-semibold">{t('persona.confirmTitle')}</legend>
                  <p className="text-xs leading-5 text-muted-foreground">{t('persona.confirmDescription')}</p>
                  <PersonaChooser options={candidateOptions} busy={busy} suggestedKey={a.personaSource === 'ai' ? a.personaKey : undefined} onChoose={choosePersona} />
                </fieldset>
              )}

              {a?.status === 'in_progress' && a.phase === 'describe' && a.personaKey && (
                <div className="mx-auto mb-3 flex max-w-[64rem] flex-wrap items-center justify-between gap-3 border-b pb-3">
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

              {!hasInlineChoice && a?.status === 'in_progress' && a.phase === 'questions' && a.personaSource === 'ai' && (
                <p className="mx-auto mb-3 flex max-w-[64rem] items-start gap-2 text-xs leading-5 text-muted-foreground">
                  <LockKeyhole className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    {t('persona.locked')}{' '}
                    <Link className="font-medium text-primary underline underline-offset-2" href="/chat">{t('persona.startNew')}</Link>{' '}
                    {t('persona.ifIncorrect')}
                  </span>
                </p>
              )}

              {a?.status === 'in_progress' && a.phase !== 'persona' && question && (
                <div className="mx-auto max-w-[64rem]">
                  <AnswerBox key={question.key + messages.length} q={question} busy={busy} text={text} setText={setText} onAnswer={answer} />
                </div>
              )}

              {a?.status === 'intake_complete' && (
                <div className="mx-auto flex max-w-[64rem] flex-col gap-3 rounded-r-xl border-l-2 border-emerald-500 bg-emerald-50/60 px-3.5 py-3 dark:border-emerald-400/70 dark:bg-emerald-400/10 sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <FileCheck2 className="size-4 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                    {t('submission.ready')}
                  </span>
                  <Button disabled={busy} onClick={() => void run(() => assessments.submit(id), 'submit')}>
                    {busy ? t('submission.assessing') : t('submission.submit')}
                    {!busy && <ChevronRight data-icon="inline-end" className="size-4" aria-hidden="true" />}
                  </Button>
                </div>
              )}

              {a?.status === 'closed' && (
                <p className="mx-auto flex max-w-[64rem] items-center justify-center gap-2 py-1 text-center text-sm text-muted-foreground">
                  <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-300" aria-hidden="true" />
                  {t('closed')}
                </p>
              )}
              </div>
            )}
          </div>

          <aside className="scrollbar-subtle hidden min-h-0 overflow-y-auto overscroll-contain border-l border-[#e2e8f0] bg-[#f8fafc] dark:border-border dark:bg-muted/35 min-[1360px]:block" aria-label={t('contextPanel')}>
            <AssessmentContext a={a} currentStageIndex={currentStageIndex} messages={messages} />
          </aside>
        </div>
      </section>
    </div>
  );
}

function AssessmentContext({
  a,
  currentStageIndex,
  messages,
}: {
  a: Assessment | null;
  currentStageIndex: number;
  messages: Message[];
}) {
  const t = useTranslations('chatSession');
  const stagePosition = currentStageIndex >= 0 ? currentStageIndex + 1 : null;

  return (
    <div className="space-y-2 p-2.5" data-testid="assessment-context-panel">
      <section className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] dark:border-border dark:bg-card">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('workflow')}</h3>
          {stagePosition !== null && (
            <span
              className="rounded-full bg-[#eef4fb] px-2 py-0.5 text-[0.62rem] font-semibold tabular-nums text-[#315b91] dark:bg-primary/15 dark:text-blue-300"
              aria-label={`${stagePosition} / ${WORKFLOW_STAGES.length}`}
              data-testid="workflow-progress"
            >
              {stagePosition}/{WORKFLOW_STAGES.length}
            </span>
          )}
        </div>
        <ol className="mt-2" aria-label={t('workflow')}>
          {WORKFLOW_STAGES.map((stage, index) => {
            const complete = index < currentStageIndex || (a?.status === 'closed' && index === currentStageIndex);
            const current = index === currentStageIndex && !complete;
            return (
              <li key={stage} className="relative flex min-h-6 gap-2 pb-1.5 last:min-h-0 last:pb-0" aria-current={current ? 'step' : undefined}>
                {index < WORKFLOW_STAGES.length - 1 && <span className="absolute top-4 bottom-0 left-[0.4375rem] w-px bg-[#dce4ee] dark:bg-border" aria-hidden="true" />}
                <span
                  className={`relative z-[1] flex size-4 shrink-0 items-center justify-center rounded-full border text-[0.55rem] font-semibold ${
                    complete
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : current
                        ? 'border-primary bg-primary text-primary-foreground ring-2 ring-primary/10'
                        : 'border-[#d6dee9] bg-white text-muted-foreground dark:border-border dark:bg-card'
                  }`}
                >
                  {complete ? <Check className="size-2.5" aria-hidden="true" /> : current ? <CircleDot className="size-2.5" aria-hidden="true" /> : index + 1}
                </span>
                <span className={`-mt-px text-[0.72rem] leading-4 ${current ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{t(`stages.${stage}`)}</span>
              </li>
            );
          })}
        </ol>
      </section>

      {(a?.personaKey || a?.scenarioKey) && (
        <section className="rounded-xl border border-[#e2e8f0] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.025)] dark:border-border dark:bg-card">
          <h3 className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('assessmentContext')}</h3>
          <dl className="mt-1.5 grid gap-1.5">
            {a.personaKey && (
              <div>
                <dt className="text-[0.61rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">{t('role')}</dt>
                <dd className="mt-0.5 text-[0.74rem] font-medium leading-4 text-foreground">{formatIdentifierLabel(a.personaKey)}</dd>
                {a.personaSource === 'ai' && <dd className="mt-0.5 text-[0.62rem] text-primary">{t('aiSuggestedRole')}</dd>}
              </div>
            )}
            {a.scenarioKey && (
              <div>
                <dt className="text-[0.61rem] font-medium tracking-[0.04em] text-muted-foreground uppercase">{t('scenario')}</dt>
                <dd className="mt-0.5 text-[0.74rem] font-medium leading-4 text-foreground">{formatIdentifierLabel(a.scenarioKey)}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

      <details className="group/facts overflow-hidden rounded-xl border border-[#e2e8f0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.025)] dark:border-border dark:bg-card">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 outline-none transition hover:bg-[#f8fafc] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50 dark:hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
          <span className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('capturedFacts')}</span>
          <span className="flex items-center gap-1.5">
            <span className="min-w-6 rounded-full bg-[#eef4fb] px-1.5 py-0.5 text-center text-[0.62rem] font-semibold tabular-nums text-[#315b91] dark:bg-primary/15 dark:text-blue-300">{a?.facts?.length ?? 0}</span>
            <ChevronDown className="size-3 text-muted-foreground transition-transform group-open/facts:rotate-180" aria-hidden="true" />
          </span>
        </summary>
        <div className="border-t border-[#edf1f6] p-1.5 dark:border-border">
          {a?.facts?.length ? (
            <div className="space-y-0.5">
              {a.facts.map((fact) => (
                <div
                  key={fact.key}
                  className="grid grid-cols-[0.85rem_minmax(0,1fr)] gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-[#f8fafc] dark:hover:bg-muted/60"
                  data-testid="context-fact-row"
                >
                  <span className={`mt-0.5 ${fact.flagged ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300'}`}>
                    {fact.flagged ? <Flag className="size-2.5" aria-hidden="true" /> : <Check className="size-2.5" aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[0.71rem] font-medium leading-4 text-foreground">{formatIdentifierLabel(fact.key)}</p>
                      <span
                        className="shrink-0 text-[0.59rem] leading-4 tabular-nums text-muted-foreground"
                        aria-label={`${Math.round(fact.confidence * 100)}% ${t('factConfidence')}`}
                        title={`${Math.round(fact.confidence * 100)}% ${t('factConfidence')}`}
                      >
                        {Math.round(fact.confidence * 100)}%
                      </span>
                    </div>
                    <p className="line-clamp-2 break-words text-[0.66rem] leading-4 text-muted-foreground">
                      {factOptionLabel(fact, messages) ?? formatDisplayValue(fact.value, t('answer.yes'), t('answer.no'))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-1 py-1 text-[0.7rem] leading-5 text-muted-foreground">{t('noFacts')}</p>
          )}
        </div>
      </details>

      <p className="flex gap-2 rounded-xl bg-[#eff4fa] px-3 py-2 text-[0.63rem] leading-4 text-[#607089] dark:bg-muted/60 dark:text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-3 shrink-0 text-[#356bb3] dark:text-blue-300" aria-hidden="true" />
        <span>{t('governanceNote')}</span>
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
          className="min-h-14 w-full items-center justify-between rounded-xl border-[#d8e3f1] bg-white px-4 text-foreground shadow-[0_2px_8px_rgba(8,35,76,0.045)] transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-primary/35 hover:shadow-[0_7px_18px_rgba(8,45,101,0.09)] motion-reduce:hover:translate-y-0 dark:border-border dark:bg-card"
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

function InlineChoiceCard({
  q,
  busy,
  error,
  personaLocked,
  onAnswer,
}: {
  q: QuestionSnapshot;
  busy: boolean;
  error: string | null;
  personaLocked: boolean;
  onAnswer: (body: { value?: string | number | boolean; text?: string }, displayValue: string) => Promise<AnswerOutcome>;
}) {
  const t = useTranslations('chatSession');
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);

  const choices =
    q.type === 'mcq' && q.options?.length
      ? q.options.map((option) => ({ id: option.id, label: option.label, body: { value: option.id } }))
      : q.type === 'yes_no'
        ? [
            { id: 'yes', label: t('answer.yes'), body: { value: true } },
            { id: 'no', label: t('answer.no'), body: { value: false } },
          ]
        : [];

  if (choices.length === 0) return null;

  const choose = (option: (typeof choices)[number]) => {
    if (busy) return;
    setSelectedOptionId(option.id);
    void onAnswer(option.body, option.label).then((outcome) => {
      if (outcome === 'failure') setSelectedOptionId(null);
    });
  };

  return (
    <fieldset
      className="mt-2.5 overflow-hidden rounded-[1.1rem] border border-[#c8d8ec] bg-[#f8fbff] shadow-[0_10px_26px_rgba(8,35,76,0.065),0_1px_2px_rgba(8,35,76,0.035)] dark:border-border dark:bg-card dark:shadow-[0_12px_30px_rgba(1,8,22,0.2)]"
      data-testid="inline-choice-card"
      aria-busy={busy}
    >
      <legend className="sr-only">{q.text ?? t('answer.optionsLabel')}</legend>
      <div className="flex items-center justify-between gap-3 border-b border-[#d7e3f0] bg-[#f6f9fe] px-3.5 py-2.5 dark:border-border dark:bg-muted/45 sm:px-4">
        <span className="flex items-center gap-2.5 text-[0.74rem] font-semibold text-[#17263d] dark:text-foreground">
          <span className="grid size-6 place-items-center rounded-full border border-[#c8d9ef] bg-white shadow-[0_2px_6px_rgba(8,35,76,0.05)] dark:border-primary/35 dark:bg-card">
            <CircleDot className="size-3.5 text-[#2468d6] dark:text-blue-300" aria-hidden="true" />
          </span>
          {t('answer.responseLabel')}
        </span>
        <span className="rounded-full border border-[#cedced] bg-white px-2.5 py-1 text-[0.64rem] font-medium text-[#40556f] shadow-[0_1px_3px_rgba(8,35,76,0.035)] dark:border-border dark:bg-card dark:text-muted-foreground">
          {q.type === 'yes_no' ? t('answer.chooseYesNo') : t('answer.chooseOne')}
        </span>
      </div>
      <Suggestions className={`grid gap-2 bg-[#f8fbff] p-3 dark:bg-card sm:p-3.5 ${q.type === 'yes_no' ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {choices.map((option) => {
          const selected = selectedOptionId === option.id;
          return (
            <Suggestion
              key={option.id}
              data-testid={q.type === 'yes_no' ? 'binary-answer-option' : 'answer-option'}
              data-selected={selected ? 'true' : 'false'}
              aria-pressed={selected}
              suggestion={option.id}
              variant="outline"
              disabled={busy}
              className={`group/choice min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform,opacity] disabled:opacity-100 focus-visible:ring-2 focus-visible:ring-[#77a7ea] focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8fbff] motion-reduce:hover:translate-y-0 dark:focus-visible:ring-offset-card ${
                selected
                  ? 'border-[#2468d6] bg-[#eaf3ff] text-[#123e78] shadow-[0_5px_14px_rgba(25,84,166,0.11),inset_0_0_0_1px_rgba(36,104,214,0.08)] hover:border-[#2468d6] hover:bg-[#eaf3ff] dark:border-primary dark:bg-primary/20 dark:text-blue-100 dark:hover:bg-primary/20'
                  : 'border-[#cad8e8] bg-white text-[#162238] shadow-[0_2px_7px_rgba(8,35,76,0.025)] hover:-translate-y-px hover:border-[#88aee0] hover:bg-[#f4f8fe] hover:shadow-[0_6px_16px_rgba(8,45,101,0.065)] dark:border-border dark:bg-muted/35 dark:text-foreground dark:hover:border-primary/50 dark:hover:bg-muted/65'
              } ${busy && !selected ? 'opacity-60' : ''}`}
              onClick={() => choose(option)}
            >
              <span
                aria-hidden="true"
                className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition-[border-color,background-color,box-shadow] ${
                  selected
                    ? 'border-[#2468d6] bg-[#2468d6] text-white shadow-[0_0_0_3px_rgba(36,104,214,0.1)]'
                    : 'border-[#a9bdd4] bg-white text-transparent group-hover/choice:border-[#6795d2] dark:border-muted-foreground dark:bg-card dark:group-hover/choice:border-primary'
                }`}
              >
                {selected && (busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : <Check className="size-3" />)}
              </span>
              <span className="min-w-0 flex-1 whitespace-normal text-[0.76rem] font-medium leading-[1.15rem]">{option.label}</span>
            </Suggestion>
          );
        })}
      </Suggestions>
      {error && (
        <p className="mx-3 mb-3 flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-xs leading-5 text-destructive sm:mx-3.5" role="alert">
          <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
      {personaLocked && (
        <p className="flex items-start gap-2 border-t border-[#e2e9f2] bg-[#fbfcfe] px-3.5 py-2.5 text-[0.7rem] leading-5 text-muted-foreground dark:border-border dark:bg-muted/35 sm:px-4">
          <LockKeyhole className="mt-0.5 size-3 shrink-0 text-[#2868cf] dark:text-blue-300" aria-hidden="true" />
          <span>
            {t('persona.locked')}{' '}
            <Link className="font-medium text-primary underline underline-offset-2" href="/chat">{t('persona.startNew')}</Link>{' '}
            {t('persona.ifIncorrect')}
          </span>
        </p>
      )}
    </fieldset>
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
    if (busy || q.type === 'mcq' || !text.trim()) return;
    const submittedText = text.trim();
    setText('');
    void onAnswer({ text: submittedText }, submittedText).then((outcome) => {
      if (outcome === 'failure') setText(submittedText);
    });
  };

  if (q.type === 'mcq') {
    return (
      <div className="mx-auto flex min-h-14 items-center gap-2 rounded-[1.05rem] border border-[#d9e2ed] bg-[#f1f4f8] px-2.5 py-2 shadow-[0_3px_10px_rgba(8,35,76,0.025)] dark:border-border dark:bg-muted/55" data-testid="mcq-input-dock">
        <label className="sr-only" htmlFor={inputId}>{q.text ?? t('optionsLabel')}</label>
        <Input
          id={inputId}
          disabled
          placeholder={t('chooseOne')}
          className="h-9 flex-1 cursor-not-allowed border-0 bg-transparent px-2 text-[0.78rem] text-muted-foreground shadow-none disabled:opacity-100"
        />
        <Button size="icon" className="size-8 shrink-0 rounded-full" disabled aria-label={t('send')}>
          <Send className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{t('send')}</span>
        </Button>
      </div>
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
      <label className="sr-only" htmlFor={inputId}>{q.type === 'yes_no' ? t('explainLabel') : (q.text ?? t('textLabel'))}</label>
      {/* One composer surface: the field and its send share a frame and a focus ring. */}
      <div className="rounded-[1.2rem] border border-[#cfdaea] bg-white shadow-[0_10px_28px_rgba(8,35,76,0.1),0_1px_2px_rgba(8,35,76,0.04)] transition-[border-color,box-shadow] focus-within:border-primary/45 focus-within:shadow-[0_13px_34px_rgba(24,83,170,0.14),0_0_0_4px_rgba(40,100,239,0.08)] dark:border-border dark:bg-card dark:shadow-[0_12px_30px_rgba(1,8,22,0.22)]">
        <Textarea
          id={inputId}
          rows={1}
          disabled={busy}
          placeholder={q.type === 'yes_no' ? t('explainPlaceholder') : t('textPlaceholder')}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-h-10 max-h-24 resize-none border-0 bg-transparent px-3.5 py-2.5 text-[0.8rem] leading-5 shadow-none focus-visible:ring-0"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !busy && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submitText();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-0.5">
          {q.type !== 'yes_no' && <span className="text-[0.65rem] text-muted-foreground">{t('enterHint')}</span>}
          <Button size="icon" className="ml-auto size-8 rounded-full bg-[linear-gradient(145deg,#0a2c5d,#216ce7)] shadow-[0_5px_14px_rgba(24,83,170,0.22)] transition-transform hover:scale-[1.03] motion-reduce:hover:scale-100" disabled={busy || !text.trim()} onClick={submitText} aria-label={t('send')}>
            <Send className="size-4" aria-hidden="true" />
            <span className="sr-only">{t('send')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
