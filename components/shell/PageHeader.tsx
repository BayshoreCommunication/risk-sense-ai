'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { useWorkspace } from '@/components/shell/workspace-context';

type PageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  /** Internal traceability metadata. Requirement IDs are intentionally not rendered to users. */
  requirements?: string[];
  /** Rendered next to the title, for counts and other title-level state. */
  titleAdornment?: ReactNode;
  /** Buttons and page-level controls, rendered after the role pill. */
  actions?: ReactNode;
};

/**
 * The page header every workspace screen uses: a plain title block on the page background with the
 * verified role and any page actions at the top right. Requirement identifiers remain internal
 * traceability metadata and are not part of the customer-facing information hierarchy.
 */
export function PageHeader({ title, description, titleAdornment, actions }: PageHeaderProps) {
  const t = useTranslations();
  const workspace = useWorkspace();

  return (
    <header className="workspace-header flex flex-col gap-3 min-[75rem]:flex-row min-[75rem]:items-start min-[75rem]:justify-between min-[96rem]:gap-4">
      <div className="min-w-0 max-w-3xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="page-heading">{title}</h1>
          {titleAdornment}
        </div>
        {description ? <p className="page-description mt-2">{description}</p> : null}
      </div>
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 min-[75rem]:w-auto min-[75rem]:shrink-0 min-[75rem]:justify-end">
        {workspace ? <span className="role-pill">{t(`roles.${workspace.role}`)}</span> : null}
        {actions}
      </div>
    </header>
  );
}
