# FX-WSH-060 Multi-line TASK Slug

This fixture verifies that a multi-line `TASK` input does not break the generated
Work-start artifact directory name.

Regression covered: the slug derivation previously ran `sed` per line without
normalizing embedded newlines first, so a multi-line `TASK` value produced a
slug (and therefore an artifact directory name) containing literal newline
characters instead of hyphen-joined words.

It expects:

- Work-start execution succeeds and creates exactly one artifact directory.
- The artifact directory name contains no newline, carriage return, or tab
  characters.
- The artifact directory name matches the expected
  `<timestamp>-<slug>` shape, where `<slug>` is lowercase alphanumeric words
  joined by single hyphens.
