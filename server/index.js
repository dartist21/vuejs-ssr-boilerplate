require('dotenv').config(); // eslint-disable-line
const fs = require('fs');
const path = require('path');
const LRU = require('lru-cache');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const favicon = require('serve-favicon');
const compression = require('compression');
const CookieDough = require('cookie-dough');
const { createBundleRenderer } = require('vue-server-renderer');

const isProd = process.env.NODE_ENV === 'production';
const resolve = file => path.resolve(__dirname, file);
const templatePath = resolve('./index.html');

const app = express();

function createRenderer(bundle, options) {
  // https://github.com/vuejs/vue/blob/dev/packages/vue-server-renderer/README.md#why-use-bundlerenderer
  return createBundleRenderer(
    bundle,
    Object.assign(options, {
      // for component caching
      cache: LRU({
        max: 1000,
        maxAge: 1000 * 60 * 15,
      }),
      // this is only needed when vue-server-renderer is npm-linked
      basedir: resolve('../dist'),
      // recommended for performance
      runInNewContext: false,
    }),
  );
}

let renderer;
let readyPromise;
if (isProd) {
  // In production: create server renderer using template and built server bundle.
  // The server bundle is generated by vue-ssr-webpack-plugin.
  const template = fs.readFileSync(templatePath, 'utf-8');
  const bundle = require('../dist/vue-ssr-server-bundle.json'); //eslint-disable-line
  // The client manifests are optional, but it allows the renderer
  // to automatically infer preload/prefetch links and directly add <script>
  // tags for any async chunks used during render, avoiding waterfall requests.
  const clientManifest = require('../dist/vue-ssr-client-manifest.json'); //eslint-disable-line
  renderer = createRenderer(bundle, {
    template,
    clientManifest,
  });
} else {
  // In development: setup the dev server with watch and hot-reload,
  // and create a new renderer on bundle / index template update.
  // eslint-disable-next-line
  readyPromise = require('../build/setup-dev-server')(app, templatePath, (bundle, options) => {
    renderer = createRenderer(bundle, options);
  });
}

const serve = (path, cache) => express.static(resolve(path), {
  maxAge: cache && isProd ? 1000 * 60 * 60 * 24 * 30 : 0,
});

app.engine('html', require('ejs').renderFile);

app.set('view engine', 'html');
app.set('views', path.resolve(__dirname, '../dist'));
app.set('port', process.env.PORT || 8080);

app.use(helmet());
app.use(compression({ threshold: 0 }));
app.use(cookieParser());
app.use(favicon(path.resolve(__dirname, '../public/img/icons/favicon.ico')));
app.use('/dist', serve('../dist', true));
app.use('/public', serve('../public', true));
app.use('/manifest.json', serve('../public/manifest.json', true));

// app.use('/service-worker.js', serve('./dist/service-worker.js'));

// eslint-disable-next-line
async function render(req, res) {
  const s = Date.now(); // eslint-disable-line

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Server', 'Vue-ssr');

  const handleError = err => {
    if (err.url) {
      res.redirect(err.url);
    } else if (err.code === 404) {
      res.status(404).send('404 | Page Not Found');
    } else {
      // Render Error Page or Redirect
      res.status(500).send('500 | Internal Server Error');
      console.error(`error during render : ${req.url}`);
      console.error(err.stack);
    }
  };

  const context = {
    url: req.url,
    title: 'Vuejs SSR template',
    meta: '<meta description="Vuejs SSR project">',
    cookies: new CookieDough(req),
  };
  try {
    const html = await renderer.renderToString(context);
    res.send(html);
  } catch (error) {
    return handleError(error);
  }
}

// eslint-disable-next-line
function shouldRender(req, res) {
  return isProd
    ? render
    : (req, res) => {
      readyPromise.then(() => render(req, res));
    };
}

if (isProd) {
  app.get('/', shouldRender());
  app.get('*', (req, res) => {
    res.render('index');
  });
} else {
  app.get('*', shouldRender());
}

app.listen(app.get('port'), () => console.log(`Server started at localhost:${app.get('port')}`));
