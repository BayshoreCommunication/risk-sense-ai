export type IdTokenProvider = () => Promise<string | null>;

type InitialAuthState = 'pending' | 'ready' | 'unavailable';

/**
 * Coordinates Firebase's asynchronous persisted-user restoration with protected API requests.
 * Updating a provider is intentionally separate from settling the initial observer state: an
 * explicit sign-in can provide a token immediately, while a cold reload waits for Firebase's
 * first `onAuthStateChanged` result before dispatching a session-authenticated request.
 */
export class AuthBridgeState {
  private idTokenProvider: IdTokenProvider | null = null;
  private initialState: InitialAuthState = 'pending';
  private readonly initialStatePromise: Promise<void>;
  private resolveInitialState: (() => void) | null = null;

  constructor() {
    this.initialStatePromise = new Promise<void>((resolve) => {
      this.resolveInitialState = resolve;
    });
  }

  setIdTokenProvider(provider: IdTokenProvider | null): void {
    this.idTokenProvider = provider;
  }

  completeInitialState(provider: IdTokenProvider | null): void {
    this.idTokenProvider = provider;
    this.settleInitialState('ready');
  }

  markUnavailable(): void {
    this.idTokenProvider = null;
    this.settleInitialState('unavailable');
  }

  async getIdToken(waitForInitialState: boolean): Promise<string | null> {
    if (waitForInitialState && !this.idTokenProvider && this.initialState === 'pending') {
      await this.initialStatePromise;
    }
    return this.idTokenProvider ? this.idTokenProvider() : null;
  }

  private settleInitialState(state: Exclude<InitialAuthState, 'pending'>): void {
    if (this.initialState !== 'pending') return;
    this.initialState = state;
    this.resolveInitialState?.();
    this.resolveInitialState = null;
  }
}

export const authBridgeState = new AuthBridgeState();

type AuthHeaderOptions = {
  sessionId?: string;
  devUser?: string;
  devAuthEnabled: boolean;
};

/** Apply identity and application-session headers through the same tested path used by OpenAPI. */
export async function applyAuthHeaders(
  request: Request,
  { sessionId, devUser, devAuthEnabled }: AuthHeaderOptions,
  state: AuthBridgeState = authBridgeState,
): Promise<Request> {
  const usingDevIdentity = devAuthEnabled && Boolean(devUser);
  // Development builds may still use real Firebase sessions. Skip persisted-user restoration only
  // when this specific session actually carries the explicit development identity cookie.
  const token = await state.getIdToken(Boolean(sessionId) && !usingDevIdentity);
  if (token) request.headers.set('Authorization', `Bearer ${token}`);
  else if (devAuthEnabled && devUser) request.headers.set('X-Dev-User', devUser);
  if (sessionId) request.headers.set('X-Session-Id', sessionId);
  return request;
}
