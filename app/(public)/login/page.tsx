'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, toApiError } from '@/lib/api/client';
import { DEV_AUTH_ENABLED } from '@/lib/environment';
import {
  firebaseConfigured,
  firebaseSignOut,
  resendPasswordVerification,
  sendPasswordReset,
  signInWithGoogle,
  signInWithPassword,
  signInWithSso,
  signUpWithPassword,
} from '@/lib/firebase/client';
import { ROLE_HOME, isRole, storeSession } from '@/lib/session';

const DEV_ACCOUNTS = [
  { email: 'requestor@dev.local', labelKey: 'devAccounts.requestorFree' },
  { email: 'admin@dev.local', labelKey: 'devAccounts.administrator' },
  { email: 'sysadmin@dev.local', labelKey: 'devAccounts.systemAdministrator' },
  { email: 'audit@dev.local', labelKey: 'devAccounts.audit' },
  { email: 'requestor@paid.local', labelKey: 'devAccounts.requestorPaid' },
];

type Step = 'credentials' | 'otp';
type Mode = 'signin' | 'signup';

function LoginForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const params = useSearchParams();
  const hasFirebase = firebaseConfigured();

  const [step, setStep] = useState<Step>('credentials');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [otpInfo, setOtpInfo] = useState<{ sentTo: string; expiresAt: string; devCode?: string } | null>(null);
  const [devEmail, setDevEmail] = useState('requestor@dev.local');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => {
    const reason = params.get('reason');
    if (reason === 'session_expired') return t('sessionExpired');
    if (reason === 'session_invalid') return t('sessionInvalid');
    return null;
  });
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>, { signOutOnError = false } = {}) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError(toApiError(e).message);
      if (signOutOnError && hasFirebase) await firebaseSignOut().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  }

  /** Final step for every method: `POST /auth/session` (with the OTP for Firebase logins) → cookies → role home (W1). */
  async function exchangeForSession(body?: { otpCode: string }, headers?: Record<string, string>, devUser?: string) {
    const res = await api.POST('/auth/session', { ...(body ? { body } : {}), ...(headers ? { headers } : {}) });
    if (res.error || !res.data) throw res.error;
    const { sessionId, user } = res.data.data;
    if (!isRole(user.role)) throw new Error(t('unknownRole'));
    storeSession({ sessionId, role: user.role, devUser });
    const next = params.get('next');
    router.replace(next && next !== '/' ? next : ROLE_HOME[user.role]);
  }

  /** After the first factor succeeded: ask the backend to email the code and move to the OTP step (FR-01). */
  async function startSecondFactor() {
    const res = await api.POST('/auth/otp/request');
    if (res.error || !res.data) throw res.error;
    setOtpInfo(res.data.data);
    setOtp('');
    setStep('otp');
  }

  const firstFactor = (fn: () => Promise<unknown>) => run(async () => {
    await fn();
    await startSecondFactor();
  }, { signOutOnError: true });

  /**
   * Company SSO (FR-03, PAID): look the email domain up, sign in through that Firebase provider, then try the
   * session directly — the backend skips the email OTP for SSO logins; if it still asks (privileged role), fall
   * back to the OTP step.
   */
  const ssoSignIn = () =>
    run(
      async () => {
        const lookup = await api.GET('/auth/sso/lookup', { params: { query: { email: email.trim() } } });
        if (!lookup.data) throw toApiError((lookup as { error?: unknown }).error);
        const { providerId, tenant } = lookup.data.data;
        if (!providerId) {
          setNotice(t('ssoNone'));
          return;
        }
        setNotice(t('ssoRedirect', { tenant: tenant ?? '' }));
        await signInWithSso(providerId, email.trim());
        try {
          await exchangeForSession();
        } catch (e) {
          if (toApiError(e).code === 'OTP_REQUIRED') await startSecondFactor();
          else throw e;
        }
      },
      { signOutOnError: true },
    );

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">{t('title')}</CardTitle>
        <CardDescription>
          {step === 'otp'
            ? t('otpPrompt', { email: otpInfo?.sentTo ?? t('yourAddress') })
            : hasFirebase
              ? mode === 'signin'
                ? t('signInPrompt')
                : t('signUpPrompt')
              : DEV_AUTH_ENABLED
                ? t('noFirebase')
                : t('authNotConfigured')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasFirebase && step === 'credentials' && (
          <div className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === 'signin') {
                  void firstFactor(() => signInWithPassword(email.trim(), password));
                } else {
                  void run(
                    async () => {
                      const normalizedEmail = email.trim();
                      await signUpWithPassword(normalizedEmail, password, name);
                      setMode('signin');
                      setPassword('');
                      setNotice(t('verificationEmailSent', { email: normalizedEmail }));
                    },
                    { signOutOnError: true },
                  );
                }
              }}
            >
              {mode === 'signup' && (
                <div className="space-y-1">
                  <Label htmlFor="name">{t('fullName')}</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="email">{t('workEmail')}</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">{t('password')}</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>
              <Button type="submit" className="w-full" disabled={busy || !email || password.length < 8}>
                {busy ? t('pleaseWait') : mode === 'signin' ? t('continue') : t('createAccount')}
              </Button>
              <div className="flex justify-between text-xs text-muted-foreground">
                <button type="button" className="underline" disabled={busy} onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? t('switchToSignUp') : t('switchToSignIn')}
                </button>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="underline"
                    disabled={busy || !email}
                    onClick={() =>
                      void run(async () => {
                        await sendPasswordReset(email.trim());
                        setNotice(t('resetSent', { email: email.trim() }));
                      })
                    }
                  >
                    {t('forgotPassword')}
                  </button>
                )}
              </div>
              {mode === 'signin' && (
                <p className="text-xs text-muted-foreground">
                  {t('resendVerificationHint')}{' '}
                  <button
                    type="button"
                    className="underline"
                    disabled={busy || !email.includes('@') || password.length < 8}
                    title={email.includes('@') && password.length >= 8 ? undefined : t('resendVerificationNeedsCredentials')}
                    onClick={() =>
                      void run(async () => {
                        const normalizedEmail = email.trim();
                        const result = await resendPasswordVerification(normalizedEmail, password);
                        setNotice(
                          result === 'already-verified'
                            ? t('verificationAlreadyComplete', { email: normalizedEmail })
                            : t('verificationResent', { email: normalizedEmail }),
                        );
                      })
                    }
                  >
                    {t('resendVerification')}
                  </button>
                </p>
              )}
            </form>
            <div className="text-center text-xs text-muted-foreground">{t('or')}</div>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void firstFactor(signInWithGoogle)}>
              {t('google')}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy || !email.includes('@')} title={email.includes('@') ? undefined : t('ssoNeedsEmail')} onClick={() => void ssoSignIn()}>
              {t('sso')}
            </Button>
          </div>
        )}

        {hasFirebase && step === 'otp' && (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => exchangeForSession({ otpCode: otp.trim() }));
            }}
          >
            <div className="space-y-1">
              <Label htmlFor="otp">{t('code')}</Label>
              <Input
                id="otp"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                autoComplete="one-time-code"
                autoFocus
              />
              {otpInfo?.devCode && DEV_AUTH_ENABLED && (
                <p className="text-xs text-muted-foreground">
                  {t('devCode')} <code className="font-mono">{otpInfo.devCode}</code>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>
              {busy ? t('verifying') : t('verify')}
            </Button>
            <div className="flex justify-between text-xs text-muted-foreground">
              <button type="button" className="underline" onClick={() => void run(startSecondFactor)}>
                {t('resend')}
              </button>
              <button
                type="button"
                className="underline"
                onClick={() =>
                  void run(async () => {
                    await firebaseSignOut();
                    setStep('credentials');
                  })
                }
              >
                {t('differentAccount')}
              </button>
            </div>
          </form>
        )}

        {DEV_AUTH_ENABLED && step === 'credentials' && (
          <details className="rounded-md border p-3" open={!hasFirebase}>
            <summary className="cursor-pointer text-sm font-medium">{t('devTitle')}</summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => exchangeForSession(undefined, { 'X-Dev-User': devEmail }, devEmail));
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="dev-email">{t('devUser')}</Label>
                <Input id="dev-email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} autoComplete="off" />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
                {t('devSignIn')}
              </Button>
              <div className="flex flex-wrap gap-2 pt-1">
                {DEV_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    type="button"
                    className="cursor-pointer"
                    onClick={() => {
                      setDevEmail(a.email);
                      void run(() => exchangeForSession(undefined, { 'X-Dev-User': a.email }, a.email));
                    }}
                  >
                    <Badge variant="secondary">{t(a.labelKey)}</Badge>
                  </button>
                ))}
              </div>
            </form>
          </details>
        )}

        {!DEV_AUTH_ENABLED && !hasFirebase && <p className="text-sm text-destructive">{t('authNotConfigured')}</p>}
        {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
