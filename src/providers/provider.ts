import type { PackSummary } from '../core/types.js';

export interface DeliveryRequest {
  readonly markdown: string;
  readonly summary: PackSummary;
}

/**
 * Cancellation is its own outcome rather than a failure. The user backing out
 * of a preview is the guard working as intended, and it should not be reported
 * as something going wrong.
 */
export type DeliveryOutcome =
  | { readonly status: 'delivered'; readonly detail: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'failed'; readonly reason: string };

/**
 * Where a finished prompt goes.
 *
 * The clipboard is the only transport today, but the whole point of the
 * interface is that an HTTP provider can be added later without the packing
 * pipeline knowing anything about it. Nothing above this line may assume a
 * clipboard exists.
 */
export interface PromptProvider {
  readonly id: string;
  readonly label: string;
  deliver(request: DeliveryRequest): Promise<DeliveryOutcome>;
}

/** Turns an unknown thrown value into something worth showing a user. */
export function describeError(cause: unknown): string {
  if (cause instanceof Error) {
    return cause.message;
  }

  return typeof cause === 'string' ? cause : JSON.stringify(cause);
}
