import { defineConfig } from '@vscode/test-cli';

export default defineConfig({
  files: 'out/test/ext/**/*.test.js',
  // The Extension Host needs a real folder open for the pack command to
  // resolve a workspace folder from a selection.
  workspaceFolder: 'test/fixtures/workspace',
});
