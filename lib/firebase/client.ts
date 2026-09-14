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
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { setIdTokenProvider } from '../api/client';

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
  if (!auth) return () => {};
  const apply = (user: User | null) => setIdTokenProvider(user ? () => user.getIdToken() : null);
  apply(auth.currentUser);
  return onAuthStateChanged(auth, apply);
}

export async function signInWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const cred = await signInWithPopup(requireAuth(), provider);
  return cred.user;
}

/**
 * PAID SSO (FR-03): any Firebase OAuth/OIDC/SAML provider by id — `microsoft.com`, `oidc.<id>`, `saml.<id>`.
 * The provider id comes from `GET /auth/sso/lookup` for the user's email domain; the IdP's own MFA replaces
 * our email OTP for non-privileged roles (backend decides).
 */
export async function signInWithSso(providerId: string, loginHint?: string): Promise<User> {
  const provider = new OAuthProvider(providerId);
  if (loginHint) provider.setCustomParameters({ login_hint: loginHint });
  const cred = await signInWithPopup(requireAuth(), provider);
  return cred.user;
}

export async function signInWithPassword(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(requireAuth(), email, password);
  return cred.user;
}

/** FREE self-signup: the account is created in Firebase; the backend provisions it as a requestor on first session. */
export async function signUpWithPassword(email: string, password: string, name: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(requireAuth(), email, password);
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() });
  return cred.user;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(requireAuth(), email, { url: `${window.location.origin}/login` });
}

export async function firebaseSignOut(): Promise<void> {
  const auth = getFirebaseAuth();
  if (auth) await signOut(auth);
  setIdTokenProvider(null);
}
