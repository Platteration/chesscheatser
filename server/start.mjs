// @ts-check
// The website's API for a self-hosted site: the kit's node:http adapter (server/kit/node.js)
// with this app's catalogue, on 127.0.0.1:8788 behind the `location ^~ /api/` proxy in
// deploy/nginx.conf. KIT_DATA_DIR (required: a directory outside the web root), KIT_PORT,
// KIT_HOST and the variables server/kit/README.md lists come from the environment. With none
// of those variables set it still answers `api/config`, saying nothing is switched on.
//
//   KIT_DATA_DIR=/var/lib/two-kings-chess node server/start.mjs
import { serve } from './kit/node.js';
import catalogue from './catalogue.js';

const { url, features } = await serve({ catalogue });
globalThis.console.log(`api listening on ${url} (sign-in ${features.signIn ? 'on' : 'off'}, shop ${features.shop ? 'on' : 'off'})`);
