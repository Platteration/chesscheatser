# Release Two Kings Chess

The app identifiers are `com.platteration.twokingschess` on iOS and Android. Confirm that these belong to your developer accounts before building.

## Browser publication

`.github/workflows/pages.yml` runs checks and exports with `/chesscheatser` as the URL prefix. It publishes through GitHub Actions on the default/release branch and `codex/ui-readiness-fixes-20261010`, and can be dispatched manually. GitHub Pages must use the GitHub Actions source. A browser preview is separate from a signed app-store release.

## Native build and submission

1. Resolve outstanding dependency-audit findings; keep the audit gate enabled. Run `npm ci` and `npm run typecheck && npm test`.
2. Sign in to the correct Expo account with `npx eas-cli login`, then link this checkout with `npx eas-cli init`. Use the existing profiles in `eas.json`. Never commit signing credentials.
3. Build an Android tester APK with `npx eas-cli build --profile preview --platform android`. Obtain an iOS internal/TestFlight build through your Apple account.
4. Test cold launch, safe areas, portrait/landscape and tablet layouts, background/foreground recovery, force-close/reopen, sound, vibration, screen readers, focus, reduce motion and every cosmetic on physical devices. Browser emulation and Metro exports do not verify these.
5. Review [the listing draft](store-listing.md), supply support/privacy URLs and capture native screenshots. Review the final SDKs before answering store privacy/data-safety forms.
6. After device and account checks, build with `npx eas-cli build --profile production --platform all`; submit the correct signed builds with `npx eas-cli submit --profile production --platform ios` and `--platform android`. Store review remains external.

## Two Kings Chess checks

The bundled StoreProvider is a local preview, not billing. Do not advertise paid products or account-based restore until an actual store provider and receipt verification are implemented. Inspect promotion choices, compact controls and all five active comeback auras.

No real purchase, native device test, signed EAS build or store submission was performed by this cloud preparation.
