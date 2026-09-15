'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { assessments } from '@/lib/assessments';
import { toApiError } from '@/lib/api/client';

/** Start screen: describe the incident (persona inferred, FR-04) and/or pick the role explicitly. */
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
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('placeholder')} />
          <div>
            <div className="mb-2 text-sm font-medium">{t('rolePrompt')}</div>
            <div className="flex flex-wrap gap-2">
              {personas.map((p) => (
                <Button key={p.key} type="button" size="sm" variant={personaKey === p.key ? 'default' : 'outline'} onClick={() => setPersonaKey(personaKey === p.key ? null : p.key)}>
                  {p.name}
                </Button>
              ))}
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={busy || (!personaKey && text.trim().length < 10)} onClick={() => void start()}>
            {busy ? t('starting') : t('start')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
