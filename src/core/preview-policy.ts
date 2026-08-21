import { formatTokenCount } from './token-estimator.js';
import type { PreviewPolicy } from './types.js';

export interface PreviewSignals {
  readonly totalTokens: number;
  readonly tokenWarningThreshold: number;
  readonly redactionCount: number;
  readonly skippedCount: number;
}

export interface PreviewDecision {
  readonly required: boolean;
  /** Why the payload deserves a look, in the order they matter. */
  readonly reasons: readonly string[];
}

/**
 * Decides whether the user should see the payload before it goes anywhere.
 *
 * The reasons are computed whatever the policy says, so a user who chose
 * `never` still gets told what was masked or dropped. Silence is the one
 * outcome worth avoiding: once the prompt is pasted it cannot be recalled.
 */
export function decidePreview(policy: PreviewPolicy, signals: PreviewSignals): PreviewDecision {
  const reasons: string[] = [];

  if (signals.tokenWarningThreshold > 0 && signals.totalTokens > signals.tokenWarningThreshold) {
    reasons.push(
      `about ${formatTokenCount(signals.totalTokens)} tokens, over your ${formatTokenCount(signals.tokenWarningThreshold)} warning threshold`,
    );
  }

  if (signals.redactionCount > 0) {
    reasons.push(`${String(signals.redactionCount)} value(s) were masked`);
  }

  if (signals.skippedCount > 0) {
    reasons.push(`${String(signals.skippedCount)} file(s) were left out`);
  }

  if (policy === 'never') {
    return { required: false, reasons };
  }

  return { required: policy === 'always' || reasons.length > 0, reasons };
}
