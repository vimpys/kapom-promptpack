import * as vscode from 'vscode';
import { formatTokenCount } from '../core/token-estimator.js';
import {
  describeError,
  type DeliveryOutcome,
  type DeliveryRequest,
  type PromptProvider,
} from './provider.js';

/**
 * Puts the prompt on the system clipboard.
 *
 * `vscode.env.clipboard` is used rather than a `clip`/`pbcopy` child process so
 * this keeps working over Remote SSH, in WSL, inside a dev container and on
 * vscode.dev, where the clipboard lives on the machine the UI runs on.
 */
export class ClipboardProvider implements PromptProvider {
  readonly id = 'clipboard';

  readonly label = 'Clipboard';

  async deliver(request: DeliveryRequest): Promise<DeliveryOutcome> {
    if (request.markdown.length === 0) {
      return { status: 'failed', reason: 'nothing to copy' };
    }

    try {
      await vscode.env.clipboard.writeText(request.markdown);
    } catch (cause) {
      // A clipboard write can genuinely fail on a headless or locked-down
      // host. Saying so beats leaving the user to paste stale content.
      return { status: 'failed', reason: describeError(cause) };
    }

    const { fileCount, totalTokens } = request.summary;

    return {
      status: 'delivered',
      detail: `${String(fileCount)} file(s), about ${formatTokenCount(totalTokens)} tokens`,
    };
  }
}
