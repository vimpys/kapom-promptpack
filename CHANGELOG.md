# Changelog

## [Unreleased]

### Added
- Phase 0 scaffold: TypeScript + esbuild + strict tsconfig + ESLint
- Test harness (@vscode/test-cli + @vscode/test-electron)
- Core: token estimator, shared data shapes, secret guard with line-level redaction
- Core: path scrubbing and the markdown renderer
- Core: file filtering and a gitignore matcher
- Settings: 12 configuration options with validation
- Providers: transport interface with a clipboard implementation
- Command: "Pack Selected Files" in the palette and the explorer context menu
- Review the prompt before it reaches the clipboard, plus a status bar token readout
