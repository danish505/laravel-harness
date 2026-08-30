export const EXIT_CODES = {
  SUCCESS: 0,
  REVIEW_REJECTED: 1,
  BLOCKED: 2,
  CANCELLED: 3,
  FAILED: 4,
  CONFIG_ERROR: 5,
  INTERNAL_ERROR: 6,
} as const;

export type ExitCode = typeof EXIT_CODES[keyof typeof EXIT_CODES];

import type { RunStatus } from '../types.js';

export function statusToExitCode(status: RunStatus): ExitCode {
  switch (status) {
    case 'approved':         return EXIT_CODES.SUCCESS;
    case 'review_rejected':  return EXIT_CODES.REVIEW_REJECTED;
    case 'blocked':          return EXIT_CODES.BLOCKED;
    case 'cancelled':        return EXIT_CODES.CANCELLED;
    case 'failed':           return EXIT_CODES.FAILED;
    default:                 return EXIT_CODES.INTERNAL_ERROR;
  }
}
