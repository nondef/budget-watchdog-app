# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] — 2026-10-02

### Added

- The balance of an account with no activity can now be corrected from the
  edit screen, for example when the starting balance was skipped during
  setup. Once the account has transactions the field is locked, and the
  screen explains why.
- Transaction rows show the category under the title and the amount in your
  base currency when the transaction uses a different one.

### Changed

- Messages now appear as Android-style snackbars at the bottom of the screen,
  in the same style everywhere.
- The privacy policy and its in-app summary were rewritten to describe
  exactly what is stored, when the internet is used, how backups and
  feedback work, and how to contact the developer.
- Date and time pickers have compact Cancel and Confirm buttons, with the
  confirm action highlighted.
- Delete buttons use the same solid error colour on every screen.
- The date range filter on Transactions uses separate start and end fields.

### Fixed

- "No transactions" was briefly shown on the Transactions screen before the
  list had loaded.
- Account and category fields on the new budget and new transaction screens
  showed a "required" error as soon as the page opened.
- The category name on the edit transaction screen was always shown in
  Turkish.
- The "Personal care" category showed no icon.
- "Once" and "daily" budgets were labelled with the wrong budget type.
- Unexpected errors on several screens were shown but not written to the
  log.

### Removed

- The @capacitor/toast plugin.

## [1.2.0] — 2026-09-30

### Added

- Changing the base currency now asks for confirmation first, shows progress
  while totals are recalculated, and tells you when the last saved rates had
  to be used because fresh ones couldn't be fetched.
- The language screen shows the device's default language next to the
  selected one.
- The PIN keypad, lock screen and PIN setup give haptic feedback on each key
  press, success and error.
- Home cards have a "See all" shortcut to the full page they summarize.

### Changed

- Favorite exchange rates are stored in the app database instead of browser
  storage, so they are included in backups and can no longer be reset by the
  system. Favorites from earlier versions are carried over automatically on
  first launch.
- The eye button on Home now toggles the "Hide amounts" setting, so masking
  applies across the whole app and persists between launches.
- Values, lists and notices now animate when they change. Collapsing cards
  slide the content below them up instead of making it jump.
- Redesigned the icon picker with a live preview and a separate color
  section. Icon category names are now translated instead of always shown in
  Turkish.
- Budget details show the remaining amount, or how far the budget is over,
  in a single figure.
- Toasts, cards, header buttons and save bars share one set of theme styles,
  so light and dark mode look the same on every screen.
- The final confirmation for erasing all data uses a larger input that is
  easier to type in on a phone.

### Fixed

- Cash-flow chart axis labels didn't update when amounts were hidden or the
  number format was changed.
- The "~" estimate marker was still shown next to amounts that were hidden.
- In light mode, the save bar background didn't match the page background.
- Footer buttons now keep a consistent gap above the gesture bar.
- The app font is now bundled with the app instead of being loaded from
    Google Fonts, so the app no longer connects to Google on launch and looks
    the same offline.

### Removed

- The unused axios dependency.

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

[1.3.0]: https://github.com/nondef/budget-watchdog-app/releases/tag/v1.3.0
[1.2.0]: https://github.com/nondef/budget-watchdog-app/releases/tag/v1.2.0
[1.1.0]: https://github.com/nondef/budget-watchdog-app/releases/tag/v1.1.0