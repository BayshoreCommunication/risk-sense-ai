'use client';

import Link from 'next/link';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertCircle, ArrowRight, Bot, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDot, Clock3, FileCheck2, Flag, LoaderCircle, LockKeyhole, MessageCircle, PanelRight, Route, Send, UserRound } from 'lucide-react';
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
  | { status: 'success'; result: Turn | Assessment }
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

function personaSelectionMessageIds(messages: Message[]) {
  const collapsedIds = new Set<string>();

  messages.forEach((message, index) => {
    if (message.role !== 'assistant' || message.question?.key !== '__persona') return;
    collapsedIds.add(message._id);
    const answer = messages[index + 1];
    if (answer?.role === 'user' && answer.kind === 'answer') collapsedIds.add(answer._id);
  });

  return collapsedIds;
}

function reconcileCommittedMessageKeys(current: Message[], canonical: Message[]) {
  return canonical.map((message, index) => {
    const rendered = current[index];
    if (!rendered?._id.startsWith('local-')) return message;
    const sameRenderedTurn =
      rendered.role === message.role &&
      rendered.kind === message.kind &&
      rendered.content === message.content &&
      (rendered.role !== 'assistant' ||
        (rendered.question?.key ?? rendered.questionKey) === (message.question?.key ?? message.questionKey));
    return sameRenderedTurn ? { ...message, _id: rendered._id } : message;
  });
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
  const [loadFailure, setLoadFailure] = useState<'not_found' | 'failed' | null>(null);
  const busyRef = useRef(false);
  const mutationGenerationRef = useRef(0);

  const reload = useCallback(async (expectedGeneration?: number) => {
    const [assessment, transcript] = await Promise.all([assessments.get(id), assessments.messages(id)]);
    if (expectedGeneration !== undefined && expectedGeneration !== mutationGenerationRef.current) return false;
    setA(assessment);
    setMessages((current) => reconcileCommittedMessageKeys(current, transcript));
    return true;
  }, [id]);

  // The first load owns the empty conversation: a failure replaces the loading state instead of
  // leaving it spinning above an error. Ownership/sandbox misses are NOT_FOUND by design (SEC-05).
  const initialLoad = useCallback(() => {
    setLoadFailure(null);
    reload().catch((nextError) => {
      const apiError = toApiError(nextError);
      setLoadFailure(apiError.code === 'NOT_FOUND' || apiError.code === 'FORBIDDEN' ? 'not_found' : 'failed');
    });
  }, [reload]);

  useEffect(() => {
    initialLoad();
  }, [initialLoad]);

  async function run(
    fn: () => Promise<Turn | Assessment>,
    action: BusyAction,
    onCommitted?: (result: Turn | Assessment) => void,
  ): Promise<RunOutcome> {
    if (busyRef.current) return { status: 'failure' };
    const mutationGeneration = mutationGenerationRef.current + 1;
    mutationGenerationRef.current = mutationGeneration;
    busyRef.current = true;
    setBusy(true);
    setBusyAction(action);
    setError(null);
    try {
      const result = await fn();
      // The mutation response is canonical for the new assessment state. Reveal it immediately and
      // reconcile the full transcript in the background instead of blocking the next interaction on
      // two additional reads. A newer mutation invalidates an older background response.
      setA(result);
      onCommitted?.(result);
      void reload(mutationGeneration)
        .then((applied) => {
          if (applied) setError(null);
        })
        .catch(() => {
          if (mutationGeneration === mutationGenerationRef.current) setError(t('refreshFailed'));
        });
      return { status: 'success', result };
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
  const inlineChoiceSaving = Boolean(busy && busyAction === 'answer' && hasInlineChoice && optimisticAnswer);
  const collapsedPersonaMessageIds = personaSelectionMessageIds(messages);
  const visibleMessages = messages.filter((message) => !collapsedPersonaMessageIds.has(message._id));

  return (
    <div className="page-shell @container max-w-none gap-2 overflow-hidden" data-testid="assessment-conversation-page">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-heading text-[1.05rem] font-bold tracking-[-0.025em] text-foreground sm:text-lg">{t('title')}</h1>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{t('assessmentId', { id: id.slice(-8).toUpperCase() })}</p>
        </div>
        <div className="flex items-center gap-2">
          {currentStageKey && (
            <span className="text-xs font-medium text-muted-foreground @min-[68rem]:hidden" data-testid="current-stage-label">
              {t('currentStage')}: <span className="text-foreground">{t(`stages.${currentStageKey}`)}</span>
            </span>
          )}
          {a && (
            <Badge
              variant={a.status === 'closed' ? 'outline' : 'secondary'}
              className={a.status === 'closed' ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300' : undefined}
              data-testid="assessment-status-badge"
              data-status={a.status}
            >
              {status.has(a.status) ? status(a.status) : formatIdentifierLabel(a.status)}
            </Badge>
          )}
        </div>
      </div>

      <section aria-label={t('workspaceLabel')} className="fills overflow-hidden rounded-[1.35rem] border border-[#d7e1ee] bg-[#fbfcff] shadow-[0_18px_55px_rgba(8,32,68,0.1)] ring-1 ring-[#082044]/[0.03] dark:border-border dark:bg-card dark:shadow-[0_20px_60px_rgba(1,8,22,0.28)] dark:ring-white/[0.03]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#dfe7f2] bg-white px-4 py-2 dark:border-border dark:bg-card sm:px-5">
          <div className="flex items-center gap-2.5">
            <span className="relative flex size-8 items-center justify-center rounded-lg bg-[linear-gradient(145deg,#082451_0%,#216ce7_100%)] text-white shadow-[0_6px_16px_rgba(18,71,150,0.24)] ring-1 ring-white/70">
              <Bot className="ai-bot-breathe size-3.5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-[0.78rem] font-semibold tracking-[-0.01em]">{t('assistantName')}</h2>
              <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{t('assistantDescription')}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <details className="group/context relative @min-[68rem]:hidden" data-testid="assessment-context-disclosure">
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

        <div className="grid min-h-0 flex-1 @min-[68rem]:grid-cols-[minmax(0,1fr)_17.5rem]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <Conversation className="min-h-0 flex-1 bg-[#f6f9fd] dark:bg-background/55" data-testid="conversation-log">
              <ConversationContent className="mx-auto w-full max-w-[58rem] gap-2.5 px-4 py-4 sm:gap-3 sm:px-6 sm:py-5" data-testid="conversation-content">
                {!a && messages.length === 0 && !loadFailure && (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground" role="status">
                    <LoaderCircle className="size-5 animate-spin text-primary" aria-hidden="true" />
                    {t('loadingConversation')}
                  </div>
                )}

                {!a && messages.length === 0 && loadFailure && (
                  <div className="flex min-h-72 flex-col items-center justify-center gap-3 px-4 text-center" role="alert" data-testid="conversation-load-failed" data-reason={loadFailure}>
                    <span className="grid size-10 place-items-center rounded-full bg-destructive/10 text-destructive">
                      <AlertCircle className="size-5" aria-hidden="true" />
                    </span>
                    <div className="max-w-md space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">{t(`loadFailure.${loadFailure}.title`)}</h3>
                      <p className="text-xs leading-5 text-muted-foreground">{t(`loadFailure.${loadFailure}.description`)}</p>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                      {loadFailure === 'failed' && (
                        <Button size="sm" onClick={initialLoad}>
                          {t('loadFailure.retry')}
                        </Button>
                      )}
                      <Button size="sm" variant={loadFailure === 'failed' ? 'outline' : 'default'} nativeButton={false} render={<Link href="/chat" />}>
                        {t('loadFailure.newAssessment')}
                      </Button>
                      <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/review" />}>
                        {t('loadFailure.myAssessments')}
                      </Button>
                    </div>
                  </div>
                )}

                {a?.personaKey && a.phase !== 'persona' && (
                  <div
                    className="flex w-full items-center gap-3 rounded-xl border border-[#bcd3ee] bg-[#f2f7fd] px-3.5 py-3 text-[#183b67] shadow-[0_5px_16px_rgba(8,43,94,0.045)] dark:border-[#28517d] dark:bg-[#0d223b] dark:text-[#dcecff]"
                    data-testid="persona-selection-summary"
                    role="status"
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-[#8eb8e7] bg-white text-[#1768d7] dark:border-[#3977b8] dark:bg-[#123257] dark:text-[#91c4ff]">
                      <Check className="size-3.5 stroke-[2.4]" aria-hidden="true" />
                    </span>
                    <p className="min-w-0 text-[0.74rem] leading-5">
                      <span className="font-semibold">{t('persona.selected')}</span>
                      <span className="px-1.5 text-muted-foreground" aria-hidden="true">·</span>
                      <span className="font-medium">{formatIdentifierLabel(a.personaKey)}</span>
                    </p>
                  </div>
                )}

                {visibleMessages.map((message) => {
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
                    <AIMessage key={message._id} from={message.role} className={assistant ? 'mx-auto max-w-[56rem]' : 'max-w-[82%] sm:max-w-[70%]'} data-message-id={message._id}>
                      {activeInlineChoice && inlineChoiceQuestion ? (
                        <InlineChoiceCard
                          q={inlineChoiceQuestion}
                          busy={busy}
                          error={error}
                          text={text}
                          setText={setText}
                          personaLocked={a?.phase === 'questions' && a.personaSource === 'ai'}
                          onAnswer={async (body, displayValue) => {
                            const outcome = await answer(body, displayValue);
                            if (outcome === 'success' && inlineChoiceQuestion.type === 'yes_no') setText('');
                            return outcome;
                          }}
                        />
                      ) : assistant ? (
                        <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-2.5">
                          <span
                            className={`flex size-9 items-center justify-center rounded-full border shadow-[0_4px_12px_rgba(8,43,94,0.1)] ${
                              clarification
                                ? 'border-[#c9bcf4] bg-[#f3f0ff] text-[#6d4bd4] dark:border-[#5f4d91] dark:bg-[#241d3e] dark:text-[#c9bcff]'
                                : 'border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7] dark:border-[#315b91] dark:bg-none dark:bg-[#102a4f] dark:text-[#8fc2ff] dark:shadow-[0_3px_12px_rgba(0,0,0,0.28)]'
                            }`}
                            data-testid="assistant-avatar"
                          >
                            {clarification ? <Flag className="size-3.5" aria-hidden="true" /> : <Bot className="ai-bot-breathe size-3.5" aria-hidden="true" />}
                          </span>
                          <div className="min-w-0">
                            {clarification && (
                              <span className="mb-1 block text-[0.6rem] font-semibold tracking-[0.12em] text-[#6848bf] uppercase dark:text-[#bdadf4]">
                                {t('messageKinds.clarification')}
                              </span>
                            )}
                            <MessageContent
                              className={`w-fit max-w-full ${
                                clarification
                                  ? 'rounded-r-xl border-l-2 border-[#876ce0] bg-[#f5f2ff] py-2.5 pl-3.5 pr-3 text-[#2d2742] dark:border-[#8e78e6] dark:bg-[#1d1833] dark:text-[#eeeaff]'
                                  : 'rounded-xl rounded-tl-sm bg-[#eaf2fb]/90 px-3.5 py-2.5 text-[#14243a] dark:bg-[#10243c] dark:text-[#e8f0fa]'
                              }`}
                              data-testid="assistant-message-surface"
                              data-message-kind={clarification ? 'clarification' : message.kind}
                            >
                              <MessageResponse className="text-[0.86rem] leading-[1.5]">{displayContent}</MessageResponse>
                            </MessageContent>
                          </div>
                        </div>
                      ) : (
                        <MessageContent
                          className="py-2 text-[0.86rem] [overflow-wrap:anywhere] group-[.is-user]:border-[#2b6fdf] group-[.is-user]:bg-[#2b6fdf] group-[.is-user]:text-white group-[.is-user]:shadow-[0_5px_14px_rgba(43,111,223,0.2)] dark:group-[.is-user]:border-[#4c8edb] dark:group-[.is-user]:bg-[#1d5fa9] dark:group-[.is-user]:text-white dark:group-[.is-user]:shadow-[0_6px_16px_rgba(0,0,0,0.22)]"
                          data-testid="user-message-surface"
                        >
                          <p className="whitespace-pre-wrap break-words leading-[1.5]">{displayContent}</p>
                        </MessageContent>
                      )}
                    </AIMessage>
                  );
                })}

                {optimisticAnswer && (
                  <AIMessage from="user" className="max-w-[82%] animate-in fade-in slide-in-from-bottom-1 duration-300 motion-reduce:animate-none sm:max-w-[70%]" data-testid="optimistic-answer">
                    <MessageContent
                      aria-label={t('answer.sending')}
                      className="py-2 text-[0.86rem] [overflow-wrap:anywhere] group-[.is-user]:border-[#2b6fdf] group-[.is-user]:bg-[#2b6fdf] group-[.is-user]:text-white group-[.is-user]:shadow-[0_5px_14px_rgba(43,111,223,0.2)] dark:group-[.is-user]:border-[#4c8edb] dark:group-[.is-user]:bg-[#1d5fa9] dark:group-[.is-user]:text-white dark:group-[.is-user]:shadow-[0_6px_16px_rgba(0,0,0,0.22)]"
                    >
                      <p className="whitespace-pre-wrap break-words leading-[1.5]">{optimisticAnswer}</p>
                    </MessageContent>
                  </AIMessage>
                )}

                {busy && busyAction !== 'decision' && !inlineChoiceSaving && (
                  <AIMessage from="assistant" className="mx-auto max-w-[56rem] animate-in fade-in duration-300 motion-reduce:animate-none" data-testid="assistant-processing">
                    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-2.5">
                      <span className="flex size-9 items-center justify-center rounded-full border border-[#bcd2f3] bg-[linear-gradient(145deg,#f7fbff,#e8f1ff)] text-[#155bd7] shadow-[0_4px_12px_rgba(8,43,94,0.1)] dark:border-[#315b91] dark:bg-none dark:bg-[#102a4f] dark:text-[#8fc2ff] dark:shadow-[0_3px_12px_rgba(0,0,0,0.28)]">
                        <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 pt-2">
                        <p className="text-[0.8rem] text-muted-foreground">{busyMessage}</p>
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

            {showComposer && !hasInlineChoice && (
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

          <aside className="scrollbar-subtle hidden min-h-0 overflow-y-auto overscroll-contain border-l border-[#e2e8f0] bg-[#f8fafc] dark:border-border dark:bg-muted/35 @min-[68rem]:block" aria-label={t('contextPanel')}>
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
  const locale = useLocale();
  const t = useTranslations('chatSession');
  const classification = useTranslations('classification');
  const status = useTranslations('status');
  const stagePosition = currentStageIndex >= 0 ? currentStageIndex + 1 : null;
  const decision = a?.decision;
  const decisionType = decision?.type;
  const decisionTone = decisionType === 'escalate'
    ? 'border-amber-200 bg-amber-50/45 dark:border-amber-400/25 dark:bg-amber-400/[0.07]'
    : 'border-emerald-200 bg-emerald-50/35 dark:border-emerald-400/25 dark:bg-emerald-400/[0.06]';
  const classificationName = (value: string) => classification.has(value) ? classification(value) : formatIdentifierLabel(value);

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

      {decision && (
        <section className={`overflow-hidden rounded-xl border shadow-[0_1px_2px_rgba(15,23,42,0.025)] ${decisionTone}`} data-testid="decision-details">
          <div className="flex items-center justify-between gap-2 border-b border-current/10 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              <span className={`flex size-6 shrink-0 items-center justify-center rounded-lg ${decisionType === 'escalate' ? 'bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300'}`}>
                {decisionType === 'escalate' ? <Route className="size-3" aria-hidden="true" /> : <CheckCircle2 className="size-3" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <h3 className="text-[0.62rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">{t('decisionDetails.title')}</h3>
                <p className="mt-0.5 text-[0.72rem] font-semibold leading-4 text-foreground">{t(`decisionDetails.types.${decisionType}`)}</p>
              </div>
            </div>
            <span className="rounded-full border bg-white/70 px-2 py-0.5 text-[0.58rem] font-semibold text-muted-foreground dark:bg-background/55">
              {t('decisionDetails.currentStatus', { status: status.has(a.status) ? status(a.status) : formatIdentifierLabel(a.status) })}
            </span>
          </div>

          <dl className="grid gap-2 px-3 py-2.5 text-[0.68rem]">
            <div className="grid grid-cols-[0.85rem_minmax(0,1fr)] gap-2">
              <UserRound className="mt-0.5 size-3 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="text-[0.58rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">{t(`decisionDetails.actorLabels.${decisionType}`)}</dt>
                <dd className="mt-0.5 break-words font-medium text-foreground">{decision.byUser?.name ?? t('decisionDetails.unavailable')}</dd>
              </div>
            </div>

            <div className="grid grid-cols-[0.85rem_minmax(0,1fr)] gap-2">
              <Clock3 className="mt-0.5 size-3 text-muted-foreground" aria-hidden="true" />
              <div>
                <dt className="text-[0.58rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">{t(`decisionDetails.timeLabels.${decisionType}`)}</dt>
                <dd className="mt-0.5 font-medium text-foreground">{new Date(decision.decidedAt).toLocaleString(locale)}</dd>
              </div>
            </div>

            {decisionType === 'override' && decision.overriddenTo && a.result && (
              <div className="rounded-lg border border-current/10 bg-white/65 px-2.5 py-2 dark:bg-background/45">
                <dt className="text-[0.58rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">{t('decisionDetails.classificationChange')}</dt>
                <dd className="mt-1.5 grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] items-center gap-1.5 text-foreground">
                  <span>
                    <span className="block text-[0.55rem] font-medium text-muted-foreground">{t('decisionDetails.previousClassification')}</span>
                    <span className="mt-0.5 block font-medium">{classificationName(a.result.classification)}</span>
                  </span>
                  <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span>
                    <span className="block text-[0.55rem] font-medium text-muted-foreground">{t('decisionDetails.newClassification')}</span>
                    <span className="mt-0.5 block font-medium">{classificationName(decision.overriddenTo)}</span>
                  </span>
                </dd>
              </div>
            )}

            {decisionType === 'escalate' && (
              <div className="rounded-lg border border-current/10 bg-white/65 px-2.5 py-2 dark:bg-background/45">
                <dt className="text-[0.58rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">{t('decisionDetails.assignedTo')}</dt>
                <dd className="mt-0.5 break-words font-medium text-foreground">{a.escalatedTo?.name ?? t('decisionDetails.unassignedQueue')}</dd>
              </div>
            )}

            {decision.reason && (
              <div className="rounded-lg border border-current/10 bg-white/65 px-2.5 py-2 dark:bg-background/45">
                <dt className="text-[0.58rem] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                  {decisionType === 'accept' ? t('decisionDetails.note') : t('decisionDetails.reason')}
                </dt>
                <dd className="mt-1 break-words leading-4 text-foreground/80">{decision.reason}</dd>
              </div>
            )}
          </dl>
        </section>
      )}

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
  text,
  setText,
  personaLocked,
  onAnswer,
}: {
  q: QuestionSnapshot;
  busy: boolean;
  error: string | null;
  text: string;
  setText: (value: string) => void;
  personaLocked: boolean;
  onAnswer: (body: { value?: string | number | boolean; text?: string }, displayValue: string) => Promise<AnswerOutcome>;
}) {
  const t = useTranslations('chatSession');
  const explanationId = useId();
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

  const submitExplanation = () => {
    if (busy || q.type !== 'yes_no' || !text.trim()) return;
    const submittedText = text.trim();
    setText('');
    void onAnswer({ text: submittedText }, submittedText).then((outcome) => {
      if (outcome === 'failure') setText(submittedText);
    });
  };

  return (
    <fieldset
      className="min-w-0 animate-in border-0 fade-in slide-in-from-bottom-1 p-0 duration-300 motion-reduce:animate-none"
      data-testid="inline-choice-card"
      aria-busy={busy}
    >
      <legend className="sr-only">{q.text ?? t('answer.optionsLabel')}</legend>
      <div
        className="overflow-hidden rounded-xl border border-[#bcd2ec] bg-[linear-gradient(145deg,#f8fbff_0%,#edf5ff_100%)] shadow-[0_12px_28px_rgba(8,35,76,0.07)] dark:border-[#244b75] dark:bg-none dark:bg-[radial-gradient(circle_at_top_left,rgba(22,75,127,0.22),transparent_42%),#0b1c31] dark:shadow-[0_16px_34px_rgba(0,0,0,0.25)]"
        data-testid="inline-choice-surface"
        data-border-treatment="single"
      >
        <div className="flex items-start gap-3 px-4 pb-3 pt-4 sm:px-5 sm:pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full border border-[#8db7e8] bg-[#e8f3ff] text-[#1764ce] shadow-[0_4px_12px_rgba(8,43,94,0.1)] dark:border-[#3775b7] dark:bg-[#12365f] dark:text-[#9bcbff]" data-testid="active-assistant-avatar">
            <Bot className="ai-bot-breathe size-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 pt-1.5">
            <p className="text-[0.86rem] font-semibold leading-5 text-[#14243a] dark:text-[#e6eef9]">{formatSystemDisplayText(q.text ?? '')}</p>
          </div>
        </div>

        <Suggestions className={`grid grid-cols-1 gap-2 bg-transparent px-4 pb-4 sm:px-5 ${q.type === 'yes_no' ? '' : 'sm:grid-cols-2'}`}>
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
                className={`group/choice min-h-11 w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-[border-color,background-color,box-shadow,transform,opacity] disabled:opacity-100 focus-visible:ring-2 focus-visible:ring-[#77a7ea] focus-visible:ring-offset-2 focus-visible:ring-offset-[#edf5ff] motion-reduce:hover:translate-y-0 dark:focus-visible:ring-offset-[#0b1c31] ${
                  selected
                    ? 'border-[#256bd9] bg-[#e1efff] text-[#103d78] shadow-[0_7px_18px_rgba(25,84,166,0.12)] hover:border-[#256bd9] hover:bg-[#e1efff] dark:border-[#5b9ce8] dark:bg-[#153c67] dark:text-[#eef6ff] dark:shadow-[0_8px_22px_rgba(0,0,0,0.22)] dark:hover:bg-[#153c67]'
                    : 'border-[#b7cde7] bg-white/70 text-[#162238] shadow-none hover:-translate-y-px hover:border-[#79a6dc] hover:bg-white dark:border-[#2f5883] dark:bg-[#102945]/85 dark:text-[#e8eef7] dark:hover:border-[#568cc6] dark:hover:bg-[#14304f]'
                } ${busy && !selected ? 'opacity-55' : ''}`}
                onClick={() => choose(option)}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-5 shrink-0 place-items-center rounded-full border-2 transition-[border-color,background-color,box-shadow] ${
                    selected
                      ? 'border-[#2468d6] bg-[#2468d6] text-white shadow-[0_0_0_3px_rgba(36,104,214,0.1)]'
                      : 'border-[#90add0] bg-white/80 text-transparent group-hover/choice:border-[#6795d2] dark:border-[#7292b5] dark:bg-[#0b1c31] dark:group-hover/choice:border-[#7ab0eb]'
                  }`}
                >
                  {selected && (busy ? <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" /> : <Check className="size-3" />)}
                </span>
                <span className="min-w-0 flex-1 whitespace-normal text-[0.82rem] font-medium leading-[1.2rem]">{option.label}</span>
              </Suggestion>
            );
          })}
        </Suggestions>

        {q.type === 'yes_no' && (
          <div className="mx-4 flex items-center gap-2 border-t border-[#cbdcf0] py-3 sm:mx-5 dark:border-[#294b70]">
            <label className="sr-only" htmlFor={explanationId}>{t('answer.explainLabel')}</label>
            <div
              className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[#b6cce5] bg-white/75 px-3 shadow-[0_2px_8px_rgba(8,35,76,0.035)] transition-[border-color,background-color,box-shadow] focus-within:border-[#4c8adb] focus-within:shadow-[0_0_0_3px_rgba(46,111,204,0.1)] data-[busy=true]:border-[#a4c2e3] data-[busy=true]:bg-[#edf5fd] data-[busy=true]:shadow-none dark:border-[#315a83] dark:bg-[#0a2038]/80 dark:focus-within:border-[#5e9bdc] dark:data-[busy=true]:border-[#365f88] dark:data-[busy=true]:bg-[#102943]"
              data-busy={busy ? 'true' : 'false'}
              data-testid="inline-explanation-shell"
            >
              <MessageCircle className="size-3.5 shrink-0 text-[#6d8fb5] data-[busy=true]:text-[#5f83aa] dark:text-[#80a9d3]" aria-hidden="true" data-busy={busy ? 'true' : 'false'} />
              <Input
                id={explanationId}
                disabled={busy}
                placeholder={t('answer.explainOptionalPlaceholder')}
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !busy && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submitExplanation();
                  }
                }}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-[0.8rem] shadow-none focus-visible:ring-0 disabled:bg-transparent disabled:text-[#617b99] disabled:opacity-100 disabled:placeholder:text-[#617b99] dark:disabled:bg-transparent dark:disabled:text-[#91acc8] dark:disabled:placeholder:text-[#91acc8]"
              />
            </div>
            <Button
              size="icon"
              className="size-10 shrink-0 rounded-full border border-[#2b75cf] bg-[#1768d7] text-white shadow-[0_7px_16px_rgba(24,101,211,0.25)] hover:bg-[#2475dd] disabled:border-[#a8c2de] disabled:bg-[#e8f1fa] disabled:text-[#6f8eae] disabled:shadow-none disabled:opacity-100 dark:border-[#4c91df] dark:bg-[#1768d7] dark:disabled:border-[#365a7d] dark:disabled:bg-[#15304c] dark:disabled:text-[#88a8c9]"
              disabled={busy || !text.trim()}
              onClick={submitExplanation}
              aria-label={t('answer.send')}
              data-testid="inline-explanation-send"
            >
              {busy && text.trim() ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Send className="size-4" aria-hidden="true" />}
              <span className="sr-only">{t('answer.send')}</span>
            </Button>
          </div>
        )}
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
      </div>
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
  const sendVisualState = busy ? 'loading' : text.trim() ? 'ready' : 'disabled';
  const sendButtonClass = "border border-[#1f66c7] bg-[#176bd8] text-white shadow-[0_6px_16px_rgba(24,101,211,0.3)] hover:border-[#2e7be2] hover:bg-[#226fda] focus-visible:border-[#8cbcff] focus-visible:ring-[#4f94ed]/35 disabled:border-[#ccd9e8] disabled:bg-[#e6edf5] disabled:text-[#7e94ad] disabled:shadow-none disabled:opacity-100 dark:border-[#4a8fe9] dark:bg-[#176bd8] dark:text-white dark:shadow-[0_7px_18px_rgba(0,0,0,0.28),0_0_0_1px_rgba(107,166,244,0.08)] dark:hover:border-[#78adf2] dark:hover:bg-[#2175e4] dark:disabled:border-[#2b4868] dark:disabled:bg-[#142a43] dark:disabled:text-[#7f9bbb] dark:disabled:shadow-none";
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
        <Button
          size="icon"
          className={`size-8 shrink-0 rounded-full ${sendButtonClass}`}
          disabled
          aria-label={t('send')}
          data-testid="composer-send-button"
          data-visual-state="disabled"
        >
          <Send className="size-3.5 stroke-[2.25]" aria-hidden="true" />
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
          <Button
            size="icon"
            className={`ml-auto size-8 rounded-full transition-transform hover:scale-[1.03] motion-reduce:hover:scale-100 ${sendButtonClass}`}
            disabled={busy || !text.trim()}
            onClick={submitText}
            aria-label={t('send')}
            aria-busy={busy}
            data-testid="composer-send-button"
            data-visual-state={sendVisualState}
          >
            {busy ? (
              <LoaderCircle className="size-4 animate-spin stroke-[2.25] motion-reduce:animate-none" aria-hidden="true" />
            ) : (
              <Send className="size-4 stroke-[2.25]" aria-hidden="true" />
            )}
            <span className="sr-only">{t('send')}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
