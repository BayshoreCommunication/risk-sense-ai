'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api, toApiError } from '@/lib/api/client';
import { firebaseConfigured, firebaseSignOut, sendPasswordReset, signInWithGoogle, signInWithPassword, signUpWithPassword } from '@/lib/firebase/client';
import { ROLE_HOME, isRole, storeSession } from '@/lib/session';

const DEV_ACCOUNTS = [
  { email: 'requestor@dev.local', label: 'Requestor (FREE)' },
  { email: 'admin@dev.local', label: 'Administrator (TAC)' },
  { email: 'sysadmin@dev.local', label: 'System Administrator (Bayshore)' },
  { email: 'audit@dev.local', label: 'Audit (read-only)' },
  { email: 'requestor@paid.local', label: 'Requestor (PAID · Acme Finance)' },
];

const isProdBuild = process.env.NEXT_PUBLIC_ENV === 'production';

type Step = 'credentials' | 'otp';
type Mode = 'signin' | 'signup';

function LoginForm() {
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
  const [notice, setNotice] = useState<string | null>(null);
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
    if (!isRole(user.role)) throw new Error('Unknown role');
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

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">RiskSense AI</CardTitle>
        <CardDescription>
          {step === 'otp'
            ? `Enter the 6-digit code we emailed to ${otpInfo?.sentTo ?? 'your address'}.`
            : hasFirebase
              ? mode === 'signin'
                ? 'Sign in to start or review a risk assessment.'
                : 'Create your account. You will confirm your email with a code.'
              : 'Firebase is not configured — development sign-in only.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {hasFirebase && step === 'credentials' && (
          <div className="space-y-4">
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void firstFactor(() => (mode === 'signin' ? signInWithPassword(email.trim(), password) : signUpWithPassword(email.trim(), password, name)));
              }}
            >
              {mode === 'signup' && (
                <div className="space-y-1">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="email">Work email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
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
                {busy ? 'Please wait…' : mode === 'signin' ? 'Continue' : 'Create account'}
              </Button>
              <div className="flex justify-between text-xs text-muted-foreground">
                <button type="button" className="underline" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? 'New here? Create an account' : 'Already have an account? Sign in'}
                </button>
                {mode === 'signin' && (
                  <button
                    type="button"
                    className="underline"
                    disabled={!email}
                    onClick={() =>
                      void run(async () => {
                        await sendPasswordReset(email.trim());
                        setNotice(`Password reset email sent to ${email.trim()}.`);
                      })
                    }
                  >
                    Forgot password?
                  </button>
                )}
              </div>
            </form>
            <div className="text-center text-xs text-muted-foreground">or</div>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => void firstFactor(signInWithGoogle)}>
              Continue with Google
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
              <Label htmlFor="otp">Verification code</Label>
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
              {otpInfo?.devCode && !isProdBuild && (
                <p className="text-xs text-muted-foreground">
                  Dev mail provider — your code is <code className="font-mono">{otpInfo.devCode}</code>
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy || otp.length !== 6}>
              {busy ? 'Verifying…' : 'Verify and sign in'}
            </Button>
            <div className="flex justify-between text-xs text-muted-foreground">
              <button type="button" className="underline" onClick={() => void run(startSecondFactor)}>
                Resend code
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
                Use a different account
              </button>
            </div>
          </form>
        )}

        {!isProdBuild && step === 'credentials' && (
          <details className="rounded-md border p-3" open={!hasFirebase}>
            <summary className="cursor-pointer text-sm font-medium">Development sign-in (seeded accounts, no OTP)</summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => exchangeForSession(undefined, { 'X-Dev-User': devEmail }, devEmail));
              }}
            >
              <div className="space-y-1">
                <Label htmlFor="dev-email">Seeded dev user</Label>
                <Input id="dev-email" value={devEmail} onChange={(e) => setDevEmail(e.target.value)} autoComplete="off" />
              </div>
              <Button type="submit" variant="secondary" className="w-full" disabled={busy}>
                Sign in (dev bypass)
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
                    <Badge variant="secondary">{a.label}</Badge>
                  </button>
                ))}
              </div>
            </form>
          </details>
        )}

        {isProdBuild && !hasFirebase && <p className="text-sm text-destructive">Authentication is not configured for this deployment.</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
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
