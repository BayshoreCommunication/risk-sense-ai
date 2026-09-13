import { AppShell } from '@/components/shell/AppShell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="requestor">{children}</AppShell>;
}
