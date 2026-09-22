'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useState } from 'react';
import { ArrowRight, BarChart3, CheckCircle2, LoaderCircle, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LanguageSwitcher } from '@/components/shell/LanguageSwitcher';
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
import { isPublicDemoAccessMode, PUBLIC_DEMO_ACCESS_AVAILABLE, PUBLIC_DEMO_ACCOUNTS, type PublicDemoAccount } from '@/lib/public-demo';
import { clearSession, isRole, safeNextForRole, storeSession, type Role } from '@/lib/session';

const DEV_ACCOUNTS = [
  { email: 'requestor@dev.local', labelKey: 'devAccounts.requestorFree' },
  { email: 'admin@dev.local', labelKey: 'devAccounts.administrator' },
  { email: 'sysadmin@dev.local', labelKey: 'devAccounts.systemAdministrator' },
  { email: 'audit@dev.local', labelKey: 'devAccounts.audit' },
  { email: 'requestor@paid.local', labelKey: 'devAccounts.requestorPaid' },
];

type Step = 'credentials' | 'otp';
type Mode = 'signin' | 'signup';
type LoginNotice =
  | { key: 'ssoNone' }
  | { key: 'ssoRedirect'; tenant: string }
  | { key: 'verificationEmailSent' | 'verificationResent' | 'verificationAlreadyComplete' | 'resetSent'; email: string };

type SessionPayload = {
  sessionId: string;
  accessMode: 'standard' | 'public_demo_read_only' | 'public_demo_sandbox';
  user: { role: string };
  tenant: { slug: string };
};

function LoginForm() {
  const t = useTranslations('login');
  const tRole = useTranslations('roles');
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
  const [notice, setNotice] = useState<LoginNotice | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeDemoRole, setActiveDemoRole] = useState<Role | null>(null);

  const routeNotice = params.get('reason') === 'session_expired'
    ? t('sessionExpired')
    : params.get('reason') === 'session_invalid'
      ? t('sessionInvalid')
      : null;
  const actionNotice = notice?.key === 'ssoNone'
    ? t('ssoNone')
    : notice?.key === 'ssoRedirect'
      ? t('ssoRedirect', { tenant: notice.tenant })
      : notice
        ? t(notice.key, { email: notice.email })
        : null;
  const visibleNotice = actionNotice ?? routeNotice;

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

  async function completeSession(session: SessionPayload, expectedRole?: Role, devUser?: string) {
    const { sessionId, user } = session;
    if (!isRole(user.role)) throw new Error(t('unknownRole'));
    const publicDemoError = expectedRole && user.role !== expectedRole
      ? t('demo.roleMismatch')
      : expectedRole && session.tenant.slug !== 'tac'
        ? t('demo.tenantMismatch')
      : expectedRole && !isPublicDemoAccessMode(session.accessMode)
        ? t('demo.accessModeMismatch')
        : null;
    if (publicDemoError) {
      // Terminate the unexpected server session before clearing local state. The selected public
      // identity must never silently open a different or writable workspace.
      storeSession({ sessionId, role: user.role });
      await api.DELETE('/auth/session').catch(() => undefined);
      clearSession();
      throw new Error(publicDemoError);
    }
    storeSession({ sessionId, role: user.role, devUser });
    router.replace(safeNextForRole(params.get('next'), user.role));
  }

  /** Final step for ordinary identity methods: Firebase/dev identity → app session → role home (W1). */
  async function exchangeForSession(body?: { otpCode: string }, headers?: Record<string, string>, devUser?: string) {
    const res = await api.POST('/auth/session', { ...(body ? { body } : {}), ...(headers ? { headers } : {}) });
    if (res.error || !res.data) throw res.error;
    await completeSession(res.data.data, undefined, devUser);
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

  const openPublicDemo = (account: PublicDemoAccount) => {
    setActiveDemoRole(account.role);
    void run(
      async () => {
        try {
          // Public role previews use only a short-lived backend session. Clear any ordinary
          // identity first so subsequent requests cannot accidentally carry a Firebase bearer.
          clearSession();
          await firebaseSignOut();
          const res = await api.POST('/auth/public-demo/session', { body: { role: account.role } });
          if (res.error || !res.data) throw res.error;
          await completeSession(res.data.data, account.role);
        } catch (demoError) {
          setActiveDemoRole(null);
          clearSession();
          throw demoError;
        }
      },
      { signOutOnError: false },
    );
  };

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
          setNotice({ key: 'ssoNone' });
          return;
        }
        setNotice({ key: 'ssoRedirect', tenant: tenant ?? '' });
        await signInWithSso(providerId, email.trim());
        await exchangeOrRequestOtp();
      },
      { signOutOnError: true },
    );

  return (
    <Card className="w-full max-w-[38rem] gap-0 border-0 bg-transparent py-0 shadow-none">
      <CardHeader className="px-0 pb-8">
        <div className="mb-7 flex items-center justify-between gap-3">
          <div className="flex size-16 items-center justify-center rounded-xl bg-[#2864ef] text-2xl font-bold text-white shadow-[0_10px_30px_rgba(40,100,239,0.3)]">
            R
          </div>
          <Badge variant="outline" className="rounded-full bg-background/80 px-3 py-1.5">
            {step === 'otp' ? t('steps.verify') : t('steps.identity')}
          </Badge>
        </div>
        <CardTitle className="text-3xl tracking-[-0.035em] sm:text-4xl">{t('title')}</CardTitle>
        <CardDescription className="max-w-md leading-6">
          {step === 'otp'
            ? t('otpPrompt', { email: otpInfo?.sentTo ?? t('yourAddress') })
            : hasFirebase
              ? mode === 'signin'
                ? t('signInPrompt')
                : t('signUpPrompt')
              : PUBLIC_DEMO_ACCESS_AVAILABLE
                ? t('demo.description')
                : DEV_AUTH_ENABLED
                  ? t('noFirebase')
                  : t('authNotConfigured')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-0 pb-0 pt-0">
        {step === 'credentials' && mode === 'signin' && PUBLIC_DEMO_ACCESS_AVAILABLE ? (
          <section aria-labelledby="demo-access-title" className="rounded-2xl border border-primary/20 bg-primary/[0.045] p-4">
            <div className="mb-3">
              <h2 id="demo-access-title" className="text-sm font-semibold text-foreground">{t('demo.title')}</h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('demo.description')}</p>
            </div>
            <div className="grid grid-cols-1 gap-2 min-[30rem]:grid-cols-2" aria-label={t('demo.roleList')}>
              {PUBLIC_DEMO_ACCOUNTS.map((account) => {
                const selected = busy && activeDemoRole === account.role;
                return (
                  <button
                    key={account.role}
                    type="button"
                    aria-label={t('demo.openRole', { role: tRole(account.role) })}
                    className="group min-w-0 rounded-xl border border-border bg-background/85 p-3 text-left shadow-sm transition hover:border-primary/45 hover:bg-background focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={busy}
                    onClick={() => openPublicDemo(account)}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-foreground">{tRole(account.role)}</span>
                      {selected ? <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin text-primary" /> : <ArrowRight aria-hidden="true" className="size-3.5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />}
                    </span>
                    <span className="mt-1 block text-[0.68rem] font-medium text-primary">{t('demo.sandbox')}</span>
                    <span className="mt-1 block truncate text-[0.63rem] text-muted-foreground">{account.email}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[0.68rem] leading-4 text-muted-foreground">{t('demo.safety')}</p>
          </section>
        ) : null}

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
                      setNotice({ key: 'verificationEmailSent', email: normalizedEmail });
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
                        setNotice({ key: 'resetSent', email: email.trim() });
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
                        setNotice({
                          key: result === 'already-verified' ? 'verificationAlreadyComplete' : 'verificationResent',
                          email: normalizedEmail,
                        });
                      })
                    }
                  >
                    {t('resendVerification')}
                  </button>
                </p>
              )}
            </form>
            <div className="flex items-center gap-3 text-center text-[0.68rem] font-semibold tracking-[0.12em] text-muted-foreground uppercase">
              <span className="h-px flex-1 bg-border" />
              {t('or')}
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void firstFactor(signInWithGoogle)}>
                {t('google')}
              </Button>
              <Button type="button" variant="outline" className="w-full" disabled={busy || !email.includes('@')} title={email.includes('@') ? undefined : t('ssoNeedsEmail')} onClick={() => void ssoSignIn()}>
                {t('sso')}
              </Button>
            </div>
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
              <div className="relative grid grid-cols-6 gap-2 rounded-xl outline-none focus-within:ring-3 focus-within:ring-ring/35">
                <Input
                  id="otp"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  autoComplete="one-time-code"
                  autoFocus
                  className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
                />
                {Array.from({ length: 6 }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className={`grid aspect-square min-w-0 place-items-center rounded-xl border bg-background font-mono text-xl font-semibold shadow-sm transition ${
                      otp.length === index ? 'border-primary ring-2 ring-primary/12' : 'border-input'
                    }`}
                  >
                    {otp[index] ?? ''}
                  </span>
                ))}
              </div>
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
                    setActiveDemoRole(null);
                    setOtp('');
                    setOtpInfo(null);
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

        {!DEV_AUTH_ENABLED && !hasFirebase && !PUBLIC_DEMO_ACCESS_AVAILABLE && <p className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{t('authNotConfigured')}</p>}
        {visibleNotice && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 p-3 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
            {visibleNotice}
          </p>
        )}
        {error && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="space-y-4 border-t pt-5">
          <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/[0.035] p-4 text-xs leading-5 text-muted-foreground">
            <LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>{t('recoveryNote')}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-4 text-xs font-medium text-muted-foreground">
              <span>{t('footer.help')}</span>
              <span>{t('footer.privacy')}</span>
              <span>{t('footer.terms')}</span>
            </div>
            <LanguageSwitcher compact />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  const t = useTranslations('login');
  return (
    <main className="flex min-h-dvh items-start justify-center overflow-x-hidden bg-[#f5f8ff] dark:bg-background min-[75rem]:p-4 min-[90rem]:items-center min-[90rem]:p-8">
      <div className="grid min-h-dvh w-full bg-card min-[75rem]:min-h-[min(900px,calc(100dvh-2rem))] min-[75rem]:max-w-[1320px] min-[75rem]:grid-cols-[minmax(36rem,1.16fr)_minmax(29rem,0.84fr)] min-[75rem]:overflow-hidden min-[75rem]:rounded-[2rem] min-[75rem]:border min-[75rem]:shadow-[0_35px_100px_rgba(26,56,110,0.15)] min-[90rem]:min-h-[min(900px,calc(100dvh-4rem))] dark:min-[75rem]:shadow-[0_35px_100px_rgba(0,0,0,0.35)]">
        <section className="relative flex min-h-dvh items-center justify-center px-5 py-8 sm:px-10 sm:py-10 min-[75rem]:min-h-0 min-[75rem]:px-12 min-[82rem]:px-16 min-[90rem]:px-20">
          <div aria-hidden="true" className="subtle-grid absolute inset-0 opacity-20" />
          <div className="relative w-full">
            <Suspense>
              <LoginForm />
            </Suspense>
          </div>
        </section>

        <section className="relative hidden overflow-hidden bg-[linear-gradient(145deg,#2864ef_0%,#1748c8_100%)] px-10 py-10 text-white min-[75rem]:flex min-[75rem]:flex-col min-[75rem]:justify-between min-[90rem]:px-12 min-[90rem]:py-14">
          <div aria-hidden="true" className="absolute -right-24 -top-16 size-80 rounded-full border border-white/10" />
          <div className="relative flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-white ring-1 ring-white/20">R</div>
            <div className="text-lg font-semibold">{t('title')}</div>
          </div>

          <div className="relative flex flex-col items-center text-center">
            <div className="grid size-40 place-items-center rounded-full border border-white/20 bg-white/[0.06] shadow-[0_0_80px_rgba(255,255,255,0.12)] min-[90rem]:size-52">
              <ShieldCheck aria-hidden="true" className="size-20 stroke-[1.25] text-white min-[90rem]:size-28" />
            </div>
            <h1 className="mt-7 text-[1.75rem] font-semibold tracking-[-0.04em] min-[90rem]:mt-10 min-[90rem]:text-[2rem]">{t('heroTitle')}</h1>
            <p className="mt-3 max-w-sm text-sm leading-7 text-white/78">{t('heroDescription')}</p>
          </div>

          <div className="relative space-y-5">
            {([
              ['guided', LockKeyhole],
              ['deterministic', Sparkles],
              ['auditable', BarChart3],
            ] as const).map(([key, Icon]) => (
              <div key={key} className="grid grid-cols-[3rem_minmax(0,1fr)] items-center gap-4">
                <span className="grid size-12 place-items-center rounded-xl bg-white/12 ring-1 ring-white/10"><Icon aria-hidden="true" className="size-5" /></span>
                <div>
                  <p className="text-sm font-semibold">{t(`assurance.${key}`)}</p>
                  <p className="mt-1 text-xs leading-5 text-white/65">{t(`assuranceDetails.${key}`)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
