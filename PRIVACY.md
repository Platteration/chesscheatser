# Privacy

Two Kings Chess does not sell any personal data. The phone app collects and
transmits none. The website collects some only if you sign in or buy on a
site whose owner has switched sign-in on (with the shop or without it), as
described below.

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
- The phone app makes no network requests of its own. It has no accounts, no
  analytics, no advertising and no third-party SDKs that phone home.
- Opening the browser build is a visit to a website: the host that serves its
  files (GitHub Pages, for the published build) receives those requests the
  way any web server does, under its own terms. The game asks it for its own
  files and nothing else (the page, the code, the chess font, the sounds, and
  `api/config`, which says whether sign-in and the shop are switched on there;
  on GitHub Pages they are not, and the next point does not apply), and the
  site's security policy refuses every other address.
- Sign-in and the shop, on a website whose owner has switched sign-in on (the
  shop needs sign-in; sign-in can be on without the shop). Nothing leaves your
  device unless you sign in or buy: then Google tells this site an account id
  and your email address, and Stripe handles the payment. The site keeps your
  Google account id, what you bought (if the shop is on) and Stripe's customer
  id for you; your email address is kept only with your signed-in session, to
  show you which account is signed in. Signing in sets one cookie while you sign
  in and one while you stay signed in (30 days), each for that alone. Google and
  Stripe handle what they receive under their own terms; the site never sees
  your card. Delete account (in the Account card) removes what the site holds
  about you, purchases included, but for a count of your recent checkouts that
  limits how many can be started in an hour and expires within two hours; the
  payment itself stays with Stripe.
- Sharing a daily result uses the system share sheet; only the text you see
  in the sheet is shared, and only with the app you pick. In a browser without
  a share sheet the same text is copied to your clipboard instead, and goes
  wherever you paste it.
- If in-app purchases are enabled in a phone release, the purchase itself is
  handled by the App Store or Google Play under their terms; the app only
  records locally that the unlock was made.

Questions: open an issue on the project repository.
