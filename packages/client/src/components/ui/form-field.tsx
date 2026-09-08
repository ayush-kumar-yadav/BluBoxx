import type { ReactNode } from 'react';
import { cn } from '../../lib/utils.js';

export const authInputClass = cn(
  'w-full rounded-md border border-border bg-secondary px-3 py-2.5 text-sm text-foreground',
  'outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/20',
);

export function FormField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}