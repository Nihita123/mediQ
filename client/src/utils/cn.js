/**
 * utils/cn.js — Class name utility (shadcn/ui pattern)
 *
 * Merges Tailwind classes intelligently, resolving conflicts.
 */

import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
