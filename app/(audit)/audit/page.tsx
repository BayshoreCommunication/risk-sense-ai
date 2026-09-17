import { redirect } from 'next/navigation';

/**
 * The reference frame gives the Audit role one screen, the log viewer, and section 8 of
 * `docs/ai/BusinessRules.md` asks for no audit dashboard. `/audit` redirects to the log viewer so
 * existing links and the role home keep working.
 */
export default function Page() {
  redirect('/audit/logs');
}
