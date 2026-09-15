export type VerificationRecoveryResult = 'sent' | 'already-verified';

export type VerificationRecoveryOperations<User> = {
  signIn: () => Promise<User>;
  reload: (user: User) => Promise<void>;
  isEmailVerified: (user: User) => boolean;
  sendVerification: (user: User) => Promise<void>;
  signOut: () => Promise<void>;
  clearTokenProvider: () => void;
};

/**
 * Shared, dependency-injected recovery workflow so provider failures and retry cleanup are
 * deterministic to test without contacting Firebase.
 */
export async function runVerificationRecovery<User>(
  operations: VerificationRecoveryOperations<User>,
): Promise<VerificationRecoveryResult> {
  let signedIn = false;
  try {
    const user = await operations.signIn();
    signedIn = true;
    await operations.reload(user);
    if (operations.isEmailVerified(user)) return 'already-verified';
    await operations.sendVerification(user);
    return 'sent';
  } finally {
    if (signedIn) {
      try {
        await operations.signOut();
      } finally {
        operations.clearTokenProvider();
      }
    }
  }
}
