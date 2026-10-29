import { cn } from '@/lib/utils';
import { TableCell, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';

type TableLoadingRowsProps = {
  columns: number;
  rows?: number;
  label: string;
  className?: string;
};

const WIDTHS = ['w-4/5', 'w-3/5', 'w-2/3', 'w-1/2', 'w-3/4', 'w-2/5'];

export function TableLoadingRows({ columns, rows = 5, label, className }: TableLoadingRowsProps) {
  return (
    <>
      <TableRow className="sr-only">
        <TableCell colSpan={columns} role="status" aria-live="polite">{label}</TableCell>
      </TableRow>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <TableRow key={rowIndex} aria-hidden="true" className={cn('hover:bg-transparent', className)}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <TableCell key={columnIndex}>
              <Skeleton className={cn('h-3.5', WIDTHS[(rowIndex + columnIndex) % WIDTHS.length])} />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

type CardListSkeletonProps = {
  label: string;
  cards?: number;
  lines?: number;
  className?: string;
};

export function CardListSkeleton({ label, cards = 4, lines = 3, className }: CardListSkeletonProps) {
  return (
    <div className={cn('divide-y', className)} role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: cards }, (_, cardIndex) => (
        <div key={cardIndex} className="space-y-3 p-4" aria-hidden="true">
          <div className="flex items-center justify-between gap-4">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          {Array.from({ length: lines }, (_, lineIndex) => (
            <Skeleton key={lineIndex} className={cn('h-3', WIDTHS[(cardIndex + lineIndex) % WIDTHS.length])} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function MetricGridSkeleton({ label, count = 4 }: { label: string; count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-live="polite" aria-label={label}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="space-y-3 rounded-xl border bg-card p-4" aria-hidden="true">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-20" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
