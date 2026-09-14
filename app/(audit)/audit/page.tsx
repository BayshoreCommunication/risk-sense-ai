import { redirect } from 'next/navigation';

/** Audit home → the assessments audit view (T-063). */
export default function Page() {
  redirect('/audit/assessments');
}
