import Image from 'next/image';
import { cn } from '@/lib/utils';

/** Shared RiskSense brand artwork for public and authenticated product surfaces. */
export function BrandMark({
  className,
  priority = false,
  testId = 'workspace-brand-icon',
}: {
  className?: string;
  priority?: boolean;
  testId?: string;
}) {
  return (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden rounded-lg shadow-[0_6px_18px_rgba(33,108,255,0.28)]',
        className,
      )}
      data-testid={testId}
    >
      <Image alt="" aria-hidden="true" className="size-full object-cover" height={64} priority={priority} src="/icon.png" width={64} />
    </span>
  );
}
