# Changelog

## [0.1.0] — 2026-08-21

First working version. Select files or a folder, right click, paste the result
into any AI chat.

### Added

- **Pack Selected Files** in the Explorer and editor context menus and in the
  Command Palette. Folders expand recursively, and multi-select works.
- A markdown payload with a project overview, a file list and one fenced
  section per file. Paths stay relative, the fence outgrows any backticks
  inside the file, and the language tag follows the extension.
- **Secret guard**, running last and overriding the selection. Files named
  like secrets are dropped even when picked by hand; credentials inside
  ordinary files are masked in place without changing the line count.
- Absolute paths inside file contents are rewritten, so the account name in a
  home directory does not travel with the prompt.
- A review step before the clipboard whenever something was masked or dropped,
  or the payload is large.
- Filtering by extension, ignore globs, file size, binary content and the
  workspace `.gitignore`.
- A status bar readout of the last pack, in the warning colour when something
  was masked or skipped.
- Token estimates, and a warning past a configurable threshold.
- Twelve settings, validated with a clear message when a value is rejected.
- Thai or English headings in the generated prompt.

### Known limits

- Personal data is not detected: national ID numbers, phone numbers, email
  addresses and customer names pass through untouched.
- Only the workspace-root `.gitignore` is read, not nested ones.
- Token counts use a `chars / 4` estimate, which runs low for Thai text.
