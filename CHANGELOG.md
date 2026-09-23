# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] — 2026-09-23

### Added

- Daily wallet reminders can now request Android's "Alarms & reminders"
  permission. Without it the system delivers the notification whenever it
  likes; the notifications screen explains this and links straight to the
  setting.
- Amount fields follow the active locale for decimal and grouping
  separators, and take their fraction digits from the currency's ISO minor
  unit — JPY no longer shows two decimals, KWD no longer loses one.

### Changed

- Reworked the settings, overview, transaction, account and saving goal
  screens onto the design system's semantic tokens, so light and dark mode
  are driven by one source instead of per-element overrides.
- Amounts can be edited anywhere in the field; the caret is no longer pinned
  to the end, and pasted values in either separator style are parsed
  correctly.
- Improved currency picker contrast across themes.
- Reusable date and time picker modals replace the per-page implementations.
- Account type options are localized instead of falling back to English.

### Fixed

- The transaction list now refreshes when the page is entered, so an edit
  made elsewhere is visible immediately.
- Back navigation from form pages no longer stalls when the history stack is
  empty after a deep link or a cold start.
- The help page back button returned to a route that no longer exists.

### Performance

- @faker-js/faker (205 kB gzipped) is no longer part of the production
  bundle. The development data seeder was statically imported and had been
  linked into the startup chunk shipped to every user.

### Removed

- Unreachable components, services and exception classes left over from the
  removed account flow, along with their locale entries.

[1.1.0]: https://github.com/<kullanıcı>/<repo>/releases/tag/v1.1.0