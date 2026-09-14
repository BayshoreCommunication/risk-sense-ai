import { redirect } from 'next/navigation';

/** System administration home → tenant settings (T-080). */
export default function Page() {
  redirect('/system/tenant');
}
