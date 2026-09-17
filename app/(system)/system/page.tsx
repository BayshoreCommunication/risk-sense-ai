import { redirect } from 'next/navigation';

/**
 * The reference frames give the System Administrator no landing screen — their navigation starts at
 * user provisioning — and the page we had only repeated the sidebar. `/system` redirects there so
 * existing links keep working.
 */
export default function Page() {
  redirect('/system/users');
}
