# Privacy

Two Kings Chess does not collect, transmit or sell any personal data.

- Everything the app stores (settings, the game in progress, your record,
  ladder rank, daily results and puzzle progress) is saved on your device,
  using the platform's app storage. Deleting the app deletes it.
- The browser build published at `<user>.github.io/<repo>/` is the exception.
  There that storage is the browser's own, and browsers key it to the site
  address without the path, which GitHub Pages shares between every project
  site the same account publishes. So on that build these records are readable
  and writable by any other page published under the same address, rather than
  by this app alone. Nothing is sent anywhere, and a real installed app is not
  affected; if you would rather it were not readable at all, clear the site's
  data in your browser, or play the installed app.
- The app makes no network requests of its own. It has no accounts, no
  analytics, no advertising and no third-party SDKs that phone home.
- Opening the browser build is a visit to a website: the host that serves its
  files (GitHub Pages, for the published build) receives those requests the
  way any web server does, under its own terms. The game asks it for its own
  files and nothing else (the page, the code, the chess font and the sounds),
  and the site's security policy refuses every other address.
- Sharing a daily result uses the system share sheet; only the text you see
  in the sheet is shared, and only with the app you pick. In a browser without
  a share sheet the same text is copied to your clipboard instead, and goes
  wherever you paste it.
- If in-app purchases are enabled in a release, the purchase itself is
  handled by the App Store or Google Play under their terms; the app only
  records locally that the unlock was made.

Questions: open an issue on the project repository.
