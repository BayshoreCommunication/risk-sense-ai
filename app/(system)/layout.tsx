import { AppShell } from '@/components/shell/AppShell';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell role="system_administrator">{children}</AppShell>;
}
