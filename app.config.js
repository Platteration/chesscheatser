// app.json is the configuration; this adds one thing it cannot hold, the path the web build is
// served under. A GitHub Pages project site lives at <user>.github.io/<repo>/, so its export
// needs every address in the bundle prefixed with /<repo>; a site with a domain of its own is
// served from / and needs none. scripts/build-web.mjs sets WEB_BASE_URL for the one export
// that needs it, so the dev server, the native builds and a plain `expo export` see app.json
// exactly as it is written.
module.exports = ({ config }) => {
  const baseUrl = process.env.WEB_BASE_URL;
  if (!baseUrl) return config;
  if (!/^(\/[A-Za-z0-9._~-]+)+$/.test(baseUrl)) {
    throw new Error(`WEB_BASE_URL must be a path such as /chesscheatser, not ${JSON.stringify(baseUrl)}`);
  }
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
