/**
 * Merge class strings, with later Tailwind utilities beating earlier ones.
 *
 * Lives at the top of src/ rather than in a lib/ of its own: this shell already
 * has a `lib/` at its root — the build-time record reader — and two directories
 * of that name meaning different things is a trap for the next reader. One
 * exported function does not need a directory.
 */
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
