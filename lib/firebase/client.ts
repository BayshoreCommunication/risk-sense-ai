/**
 * Firebase client SDK (T-013, T-016). Safe to import when env is missing: `getFirebaseAuth()`
 * returns null so the dev-bypass login keeps working until the Firebase project exists.
 *
 * First factor (Firebase, free tier): email + password, or Google (OIDC popup).
 * Second factor (ours, T-016): 6-digit code emailed by the backend, verified before a session is issued.
 */
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  OAuthProvider,
  SAMLAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { completeInitialAuthState, markAuthBridgeUnavailable, setIdTokenProvider } from '../api/client';
import { runVerificationRecovery, type VerificationRecoveryResult } from './verification-recovery';

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

export function firebaseConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

let app: FirebaseApp | null = null;

export function getFirebaseAuth(): Auth | null {
  if (!firebaseConfigured()) return null;
  if (!app) app = getApps()[0] ?? initializeApp(config);
  return getAuth(app);
}

function requireAuth(): Auth {
  const auth = getFirebaseAuth();
  if (!auth) throw new Error('Firebase is not configured');
  return auth;
}

/**
 * Registers the ID-token provider with the API client and keeps it in sync with Firebase's
 * persisted user (so a page reload still sends `Authorization: Bearer`). Called once from AuthBridge.
 */
export function initAuthBridge(): () => void {
  const auth = getFirebaseAuth();
  if (!auth) {
    markAuthBridgeUnavailable();
    return () => {};
  }
  let initialStatePending = true;
  return onAuthStateChanged(
    auth,
    (user) => {
      const provider = user ? () => user.getIdToken() : null;
      if (initialStatePending) {
        initialStatePending = false;
        completeInitialAuthState(provider);
      } else {
        setIdTokenProvider(provider);
      }
    },
    () => markAuthBridgeUnavailable(),
  );
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(requireAuth(), provider);
  setIdTokenProvider(() => cred.user.getIdToken());
  return cred.user;
}

/**
 * PAID SSO (FR-03): any Firebase OAuth/OIDC/SAML provider by id — `microsoft.com`, `oidc.<id>`, `saml.<id>`.
 * The provider id comes from `GET /auth/sso/lookup` for the user's email domain. Provider match alone does
 * not prove MFA; the backend accepts a second factor only when Firebase signs that claim, otherwise it asks
 * for the RiskSense email OTP.
 */
export async function signInWithSso(providerId: string, loginHint?: string): Promise<User> {
  const provider = providerId.startsWith('saml.') ? new SAMLAuthProvider(providerId) : new OAuthProvider(providerId);
  if (loginHint) provider.setCustomParameters({ login_hint: loginHint });
  const cred = await signInWithPopup(requireAuth(), provider);
  setIdTokenProvider(() => cred.user.getIdToken());
  return cred.user;
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(requireAuth(), email, password);
  setIdTokenProvider(() => cred.user.getIdToken());
  return cred.user;
}

/** FREE self-signup: verify the Firebase email before the backend may provision the first session. */
export async function signUpWithPassword(email: string, password: string, name: string): Promise<void> {
  const auth = requireAuth();
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  await sendEmailVerification(cred.user, { url: `${window.location.origin}/login` });
  await signOut(auth);
  setIdTokenProvider(null);
}

/**
 * Recover an existing password account without creating an application session. The temporary
 * Firebase identity is always signed out, including when reload or email delivery fails.
 */
export async function resendPasswordVerification(email: string, password: string): Promise<VerificationRecoveryResult> {
  const auth = requireAuth();
  return runVerificationRecovery({
    signIn: async () => (await signInWithEmailAndPassword(auth, email, password)).user,
    reload: (user) => reload(user),
    isEmailVerified: (user) => user.emailVerified,
    sendVerification: (user) => sendEmailVerification(user, { url: `${window.location.origin}/login` }),
    signOut: () => signOut(auth),
    clearTokenProvider: () => setIdTokenProvider(null),
  });
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email, { url: `${window.location.origin}/login` });
}

export async function firebaseSignOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
  setIdTokenProvider(null);
}
