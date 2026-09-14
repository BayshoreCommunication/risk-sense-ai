'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { assessments, pendingQuestion, type Assessment, type Message, type QuestionSnapshot, type Turn } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';
import { ResultCard } from './ResultCard';

/**
 * One intake conversation (FR-03..FR-08). MCQ / yes-no / number answers are structured and never
 * touch the model; free text goes through fact extraction. Submission and the decision live here too
 * so the requestor sees the whole loop on one screen.
 */
export function ChatSession({ id }: { id: string }) {
  const [a, setA] = useState<Assessment | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] max-w-3xl flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {a?.personaKey && <Badge variant="outline">{a.personaKey.replace(/_/g, ' ')}</Badge>}
        {a?.scenarioKey && <Badge variant="outline">{a.scenarioKey.replace(/_/g, ' ')}</Badge>}
        {a && <Badge variant={a.status === 'closed' ? 'default' : 'secondary'}>{a.status.replace(/_/g, ' ')}</Badge>}
        {a?.facts?.length ? <span>{a.facts.length} facts captured{a.facts.some((f) => f.flagged) ? ' · some flagged for review' : ''}</span> : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto rounded-md border p-4">
        {messages.map((m) => (
          <div key={m._id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                m.role === 'user' ? 'bg-primary text-primary-foreground' : m.kind === 'result' ? 'border bg-muted' : 'bg-muted'
              }`}
            >
              {m.kind === 'info' && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">info</div>}
              {m.kind === 'clarification' && <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">clarification</div>}
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
        {a?.status === 'in_progress' && q && <AnswerBox key={q.key + messages.length} q={q} busy={busy} text={text} setText={setText} onAnswer={answer} />}
        {a?.status === 'intake_complete' && (
          <div className="flex items-center justify-between rounded-md border p-3">
            <span className="text-sm">All required information is captured.</span>
            <Button disabled={busy} onClick={() => void run(() => assessments.submit(id))}>
              {busy ? 'Assessing…' : 'Submit for assessment'}
            </Button>
          </div>
        )}
        {a?.status === 'closed' && <p className="text-center text-sm text-muted-foreground">This assessment is closed.</p>}
      </div>
    </div>
  );
}

function AnswerBox({ q, busy, text, setText, onAnswer }: { q: QuestionSnapshot; busy: boolean; text: string; setText: (s: string) => void; onAnswer: (b: { value?: string | number | boolean; text?: string }) => Promise<void> }) {
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
          Yes
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => void onAnswer({ value: false })}>
          No
        </Button>
        <Input placeholder="or explain in words…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitText()} />
      </div>
    );
  }
  if (q.type === 'number') {
    return (
      <div className="flex gap-2">
        <Input type="number" placeholder="Enter a number" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submitText()} />
        <Button disabled={busy || text === ''} onClick={() => void onAnswer({ value: Number(text) }).then(() => setText(''))}>
          Send
        </Button>
      </div>
    );
  }
  return (
    <div className="flex gap-2">
      <Textarea rows={2} placeholder="Type your answer…" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitText())} />
      <Button disabled={busy || !text.trim()} onClick={submitText}>
        Send
      </Button>
    </div>
  );
}
