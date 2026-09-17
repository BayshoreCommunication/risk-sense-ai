'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useWorkspace } from '@/components/shell/workspace-context';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Requirement IDs for this screen, shown as chips exactly as the reference frames do. */
  requirements?: string[];
  /** Rendered next to the title, for counts and other title-level state. */
  titleAdornment?: ReactNode;
  /** Buttons and page-level controls, rendered after the role pill and chips. */
  actions?: ReactNode;
};

/**
 * The page header every workspace screen uses: a plain title block on the page background with the
 * verified role and this screen's requirement IDs at the top right. Matches the Figma reference
 * frames in `docs/design/figma-frames/`.
 */
export function PageHeader({ title, description, requirements, titleAdornment, actions }: PageHeaderProps) {
  const t = useTranslations();
  const workspace = useWorkspace();

  return (
    <header className="workspace-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="max-w-3xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="page-heading">{title}</h1>
          {titleAdornment}
        </div>
        {description ? <p className="page-description mt-2">{description}</p> : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        {workspace ? <span className="role-pill">{t(`roles.${workspace.role}`)}</span> : null}
        {requirements?.map((id) => (
          <span key={id} className="req-chip">
            {id}
          </span>
        ))}
        {actions}
      </div>
    </header>
  );
}
