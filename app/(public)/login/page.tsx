'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { ArrowRight, CheckCircle2, Fingerprint, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
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

/** Seeded accounts the owner demonstrates with; the password is the seeded demo password, never a real credential. */
const DEMO_ACCOUNTS = [
  { role: 'Administrator', home: '/admin', email: 'admin@dev.local' },
  { role: 'Sys admin', home: '/system', email: 'sysadmin@dev.local' },
  { role: 'Auditor', home: '/audit', email: 'audit@dev.local' },
  { role: 'Requestor', home: '/chat', email: 'requestor@tac.local' },
];
const DEMO_PASSWORD = 'RiskSense2026!';

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
    // A development build may prefill the code; any other build must never hold or show it (SEC-03).
    setOtpInfo(DEV_AUTH_ENABLED ? res.data.data : { ...res.data.data, devCode: undefined });
    if (DEV_AUTH_ENABLED && res.data.data.devCode) {
      setOtp(res.data.data.devCode);
    } else {
      setOtp('');
    }
    setStep('otp');
  }

  /** FREE requestors exchange directly; only an OTP_REQUIRED response opens the PAID/managed-role factor. */
  async function exchangeOrRequestOtp() {
    try {
      await exchangeForSession();
    } catch (nextError) {
      if (toApiError(nextError).code === 'OTP_REQUIRED') await startSecondFactor();
      else throw nextError;
    }
  }

  const firstFactor = (fn: () => Promise<unknown>) => run(async () => {
    await fn();
    await exchangeOrRequestOtp();
  }, { signOutOnError: true });

  /**
   * Company SSO (FR-03, PAID): look the email domain up, sign in through that Firebase provider, then try the
   * session directly — a current Firebase-signed second-factor claim can satisfy a requestor login; provider
   * match alone cannot, so otherwise fall back to the RiskSense OTP step. Managed operator roles always
   * complete their RiskSense-controlled factor.
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
        await exchangeOrRequestOtp();
      },
      { signOutOnError: true },
    );

  const linkClass = 'underline underline-offset-2 hover:text-foreground disabled:no-underline disabled:opacity-60';

  return (
    <Card className="w-full max-w-[26rem] border-border bg-card shadow-[0_20px_60px_rgba(15,35,65,0.09)]">
      <CardHeader className="space-y-1.5 pb-5">
        <div className="mb-1 flex size-9 items-center justify-center rounded-lg border border-primary/15 bg-primary/6 text-primary">
          {step === 'otp' ? <KeyRound className="size-4.5" /> : <Fingerprint className="size-4.5" />}
        </div>
        <CardTitle className="text-2xl">{t('title')}</CardTitle>
        <CardDescription className="leading-6">
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
      <CardContent className="space-y-4">
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
              <Button type="submit" size="lg" className="w-full" disabled={busy || !email || password.length < 8}>
                {busy ? t('pleaseWait') : mode === 'signin' ? t('continue') : t('createAccount')}
                {!busy && <ArrowRight data-icon="inline-end" className="size-4" />}
              </Button>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <button type="button" className={linkClass} disabled={busy} onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? t('switchToSignUp') : t('switchToSignIn')}
                </button>
                {mode === 'signin' && (
                  <>
                    <button
                      type="button"
                      className={linkClass}
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
                    <button
                      type="button"
                      className={linkClass}
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
                  </>
                )}
              </div>
            </form>

            <div className="flex items-center gap-3 text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t('or')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2">
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void firstFactor(signInWithGoogle)}>
                {t('google')}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={busy || !email.includes('@')} title={email.includes('@') ? undefined : t('ssoNeedsEmail')} onClick={() => void ssoSignIn()}>
                {t('sso')}
              </Button>
            </div>

            {mode === 'signin' && (
              <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-semibold text-foreground">{t('demo.title')}</span>
                  <span className="text-[0.68rem] text-muted-foreground">{t('demo.hint')}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {DEMO_ACCOUNTS.map((account) => (
                    <button
                      key={account.email}
                      type="button"
                      className="cursor-pointer rounded-md border bg-background px-2 py-1.5 text-center text-xs transition hover:border-primary hover:bg-background/60"
                      onClick={() => {
                        setEmail(account.email);
                        setPassword(DEMO_PASSWORD);
                      }}
                    >
                      <span className="block font-medium text-foreground whitespace-nowrap">{account.role}</span>
                      <span className="block text-[0.65rem] text-muted-foreground">{account.home}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
              {DEV_AUTH_ENABLED && otpInfo?.devCode && (
                <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 text-xs">
                  <span className="font-medium text-foreground">{t('devCode')}</span>
                  <button
                    type="button"
                    className="rounded bg-background px-2 py-0.5 font-mono text-sm font-bold tracking-widest text-primary border border-border hover:bg-muted cursor-pointer"
                    onClick={() => setOtp(otpInfo.devCode!)}
                    title="Click to insert code"
                  >
                    {otpInfo.devCode}
                  </button>
                </div>
              )}
            </div>
            <Button type="submit" size="lg" className="w-full" disabled={busy || otp.length !== 6}>
              {busy ? t('verifying') : t('verify')}
              {!busy && <ShieldCheck data-icon="inline-end" className="size-4" />}
            </Button>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <button type="button" className={linkClass} onClick={() => void run(startSecondFactor)}>
                {t('resend')}
              </button>
              <button
                type="button"
                className={linkClass}
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
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
              <LockKeyhole className="mt-0.5 size-3.5 shrink-0 text-primary" />
              <span>{t('recoveryNote')}</span>
            </p>
          </form>
        )}

        {DEV_AUTH_ENABLED && step === 'credentials' && (
          <details className="rounded-lg border border-dashed bg-muted/25 p-3.5" open={!hasFirebase}>
            <summary className="cursor-pointer text-sm font-semibold">{t('devTitle')}</summary>
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

        {!DEV_AUTH_ENABLED && !hasFirebase && <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t('authNotConfigured')}</p>}
        {notice && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            {notice}
          </p>
        )}
        {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {/* The plan split decides the role and the MFA step, so it stays on the page as one line (FR-02, SEC-03). */}
        <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">{t('planNote')}</p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  const t = useTranslations('login');
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto grid min-h-screen max-w-[1540px] lg:grid-cols-2">
        <section className="relative flex min-h-screen items-center justify-center px-4 py-8 sm:px-8 lg:px-12 xl:px-16">
          <div aria-hidden="true" className="subtle-grid absolute inset-0 opacity-30" />
          <div className="relative flex w-full justify-center">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </section>

        <section className="relative hidden overflow-hidden border-l border-white/10 bg-[linear-gradient(160deg,#2a6ee4_0%,#1546a8_100%)] px-10 py-12 text-white lg:flex lg:flex-col xl:px-14 xl:py-14">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#38a0ff] to-transparent" />
          <div aria-hidden="true" className="absolute -right-28 top-24 size-80 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-[#1674df] text-xs font-bold text-white">R</div>
            <div className="font-semibold">{t('title')}</div>
          </div>

          <div className="relative flex flex-1 flex-col justify-center">
            <div className="max-w-lg space-y-7">
              <div className="space-y-4">
                <div className="text-[0.68rem] font-semibold tracking-[0.17em] text-white/70 uppercase">{t('eyebrow')}</div>
                <h1 className="text-4xl leading-[1.08] font-semibold tracking-[-0.045em] xl:text-[2.9rem]">{t('heroTitle')}</h1>
                <p className="text-sm leading-6 text-white/75 xl:text-base xl:leading-7">{t('heroDescription')}</p>
              </div>
              <div className="divide-y divide-white/10 border-y border-white/10">
                {(['guided', 'deterministic', 'auditable'] as const).map((key, index) => (
                  <div key={key} className="flex items-center gap-4 py-3.5 text-sm text-white/80">
                    <span className="font-mono text-[0.65rem] text-white/70">0{index + 1}</span>
                    <span className="flex-1">{t(`assurance.${key}`)}</span>
                    <CheckCircle2 className="size-4 text-white/80" aria-hidden="true" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
