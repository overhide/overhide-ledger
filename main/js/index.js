const allow_cors = require('cors')();
const http = require('http');
const express = require('express');
const cookie = require('cookie-parser');
const { createTerminus: terminus, HealthCheckError } = require('@godaddy/terminus');
const ejs = require('ejs');
const os = require('os');
const path = require('path');
const utils = require('./lib/utils.js');

// CONFIGURATION CONSTANTS
//
// Try fetching from environment first (for Docker overrides etc.) then from npm config; fail-over to 
// hardcoded defaults.
const APP_NAME = "overhide-ledger";
const VERSION = process.env.npm_package_version;
const PROTOCOL = process.env.PROTOCOL || process.env.npm_config_PROTOCOL || process.env.npm_package_config_PROTOCOL;
const BASE_URL = process.env.BASE_URL || process.env.npm_config_BASE_URL || process.env.npm_package_config_BASE_URL;
const PORT = process.env.PORT || process.env.npm_config_PORT || process.env.npm_package_config_PORT || 54321;
const DEBUG = process.env.DEBUG || process.env.npm_config_DEBUG || process.env.npm_package_config_DEBUG;
const INSTRUMENTED_FOR_TEST = process.env.INSTRUMENTED_FOR_TEST || process.env.npm_config_INSTRUMENTED_FOR_TEST || process.env.npm_package_config_INSTRUMENTED_FOR_TEST;
const INSIGHTS_KEY = process.env.INSIGHTS_KEY || process.env.npm_config_INSIGHTS_KEY || process.env.npm_package_config_INSIGHTS_KEY
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || process.env.npm_config_STRIPE_PUBLISHABLE_KEY || process.env.npm_package_config_STRIPE_PUBLISHABLE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || process.env.npm_config_STRIPE_SECRET_KEY || process.env.npm_package_config_STRIPE_SECRET_KEY;
const STRIPE_OAUTH_TOKEN_URL = process.env.STRIPE_OAUTH_TOKEN_URL || process.env.npm_config_STRIPE_OAUTH_TOKEN_URL || process.env.npm_package_config_STRIPE_OAUTH_TOKEN_URL;
const STRIPE_OAUTH_AUTHORIZE_URL = process.env.STRIPE_OAUTH_AUTHORIZE_URL || process.env.npm_config_STRIPE_OAUTH_AUTHORIZE_URL || process.env.npm_package_config_STRIPE_OAUTH_AUTHORIZE_URL;
const STRIPE_CLIENT_ID = process.env.STRIPE_CLIENT_ID || process.env.npm_config_STRIPE_CLIENT_ID || process.env.npm_package_config_STRIPE_CLIENT_ID;
const STRIPE_MINIMUM_AMOUNT = process.env.STRIPE_MINIMUM_AMOUNT || process.env.npm_config_STRIPE_MINIMUM_AMOUNT || process.env.npm_package_config_STRIPE_MINIMUM_AMOUNT;
const OUR_PROCESSING_FEE_CENTS = process.env.OUR_PROCESSING_FEE_CENTS || process.env.npm_config_OUR_PROCESSING_FEE_CENTS || process.env.npm_package_config_OUR_PROCESSING_FEE_CENTS;
const OUR_PROCESSING_CURRENCY = process.env.OUR_PROCESSING_CURRENCY || process.env.npm_config_OUR_PROCESSING_CURRENCY || process.env.npm_package_config_OUR_PROCESSING_CURRENCY;
const OUR_RETARGET_FEE_CENTS = process.env.OUR_RETARGET_FEE_CENTS || process.env.npm_config_OUR_RETARGET_FEE_CENTS || process.env.npm_package_config_OUR_RETARGET_FEE_CENTS;
const RATE_LIMIT_FE_WINDOW_MS = process.env.RATE_LIMIT_FE_WINDOW_MS || process.env.npm_config_RATE_LIMIT_FE_WINDOW_MS || process.env.npm_package_config_RATE_LIMIT_FE_WINDOW_MS || 60000;
const RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW = process.env.RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW || process.env.npm_config_RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW || process.env.npm_package_config_RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW || 10;
const RATE_LIMIT_FE_REDIS_URI = process.env.RATE_LIMIT_FE_REDIS_URI || process.env.npm_config_RATE_LIMIT_FE_REDIS_URI || process.env.npm_package_config_RATE_LIMIT_FE_REDIS_URI || null;
const RATE_LIMIT_FE_REDIS_NAMESPACE = process.env.RATE_LIMIT_FE_REDIS_NAMESPACE || process.env.npm_config_RATE_LIMIT_FE_REDIS_NAMESPACE || process.env.npm_package_config_RATE_LIMIT_FE_REDIS_NAMESPACE || "rate-limit";
const RATE_LIMIT_BE_WINDOW_MS = process.env.RATE_LIMIT_BE_WINDOW_MS || process.env.npm_config_RATE_LIMIT_BE_WINDOW_MS || process.env.npm_package_config_RATE_LIMIT_BE_WINDOW_MS || 60000;
const RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW = process.env.RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW || process.env.npm_config_RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW || process.env.npm_package_config_RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW || 10;
const RATE_LIMIT_BE_REDIS_URI = process.env.RATE_LIMIT_BE_REDIS_URI || process.env.npm_config_RATE_LIMIT_BE_REDIS_URI || process.env.npm_package_config_RATE_LIMIT_BE_REDIS_URI || null;
const RATE_LIMIT_BE_REDIS_NAMESPACE = process.env.RATE_LIMIT_BE_REDIS_NAMESPACE || process.env.npm_config_RATE_LIMIT_BE_REDIS_NAMESPACE || process.env.npm_package_config_RATE_LIMIT_BE_REDIS_NAMESPACE || "rate-limit";
const KEYV_TALLY_CACHE_URI = process.env.KEYV_TALLY_CACHE_URI || process.env.npm_config_KEYV_TALLY_CACHE_URI || process.env.npm_package_config_KEYV_TALLY_CACHE_URI;
const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;
const SELECT_MAX_ROWS = process.env.SELECT_MAX_ROWS || process.env.npm_config_SELECT_MAX_ROWS || process.env.npm_package_config_SELECT_MAX_ROWS;
const SALT = process.env.SALT || process.env.npm_config_SALT || process.env.npm_package_config_SALT;
const TOKEN_URL = process.env.TOKEN_URL || process.env.npm_config_TOKEN_URL || process.env.npm_package_config_TOKEN_URL;
const ISPROD = process.env.ISPROD || process.env.npm_config_ISPROD || process.env.npm_package_config_ISPROD || false;
const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN || process.env.npm_config_INTERNAL_TOKEN || process.env.npm_package_config_INTERNAL_TOKEN;
const RECAPTCHA_URI = process.env.RECAPTCHA_URI || process.env.npm_config_RECAPTCHA_URI || process.env.npm_package_config_RECAPTCHA_URI;
const RECAPTCHA_SITE_KEY = process.env.RECAPTCHA_SITE_KEY || process.env.npm_config_RECAPTCHA_SITE_KEY || process.env.npm_package_config_RECAPTCHA_SITE_KEY;
const RECAPTCHA_SECRET_KEY = process.env.RECAPTCHA_SECRET_KEY || process.env.npm_config_RECAPTCHA_SECRET_KEY || process.env.npm_package_config_RECAPTCHA_SECRET_KEY;
const KEYV_URI = process.env.KEYV_URI || process.env.npm_config_KEYV_URI || process.env.npm_package_config_KEYV_URI;
const KEYV_RETARGET_NAMESPACE = process.env.KEYV_RETARGET_NAMESPACE || process.env.npm_config_KEYV_RETARGET_NAMESPACE || process.env.npm_package_config_KEYV_RETARGET_NAMESPACE;
const KEYV_RETARGET_TTL_MILLIS = process.env.KEYV_RETARGET_TTL_MILLIS || process.env.npm_config_KEYV_RETARGET_TTL_MILLIS || process.env.npm_package_config_KEYV_RETARGET_TTL_MILLIS;
const SMTP_HOST = process.env.SMTP_HOST || process.env.npm_config_SMTP_HOST || process.env.npm_package_config_SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT || process.env.npm_config_SMTP_PORT || process.env.npm_package_config_SMTP_PORT;
const SMTP_SECURE = process.env.SMTP_SECURE || process.env.npm_config_SMTP_SECURE || process.env.npm_package_config_SMTP_SECURE;
const SMTP_USER = process.env.SMTP_USER || process.env.npm_config_SMTP_USER || process.env.npm_package_config_SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD || process.env.npm_config_SMTP_PASSWORD || process.env.npm_package_config_SMTP_PASSWORD;
const MAILER_FROM = process.env.MAILER_FROM || process.env.npm_config_MAILER_FROM || process.env.npm_package_config_MAILER_FROM;
const URI = `${PROTOCOL}://${BASE_URL}`;
const DOMAIN = BASE_URL.split(':')[0];

if (STRIPE_OAUTH_AUTHORIZE_URL == null) throw new Error("STRIPE_OAUTH_AUTHORIZE_URL must be specified.");
if (STRIPE_CLIENT_ID == null) throw new Error("STRIPE_CLIENT_ID must be specified.");

// Wire up application context
const ctx_config = {
  pid: process.pid,
  app_name: APP_NAME,
  version: VERSION,
  base_url: BASE_URL,
  swagger_endpoints_path: __dirname + path.sep + 'index.js',
  uri: URI,
  port: PORT,
  debug: DEBUG,
  insights_key: INSIGHTS_KEY,
  stripe_publishable_key: STRIPE_PUBLISHABLE_KEY,
  stripe_secret_key: STRIPE_SECRET_KEY,
  stripe_oauth_token_url: STRIPE_OAUTH_TOKEN_URL,
  stripe_minimum_amount: STRIPE_MINIMUM_AMOUNT,
  stripe_client_id: STRIPE_CLIENT_ID,
  our_processing_fee_cents: OUR_PROCESSING_FEE_CENTS,
  our_processing_currency: OUR_PROCESSING_CURRENCY,
  retarget_fee_cents: OUR_RETARGET_FEE_CENTS,
  rateLimitFeWindowsMs: RATE_LIMIT_FE_WINDOW_MS,
  rateLimitFeMax: RATE_LIMIT_FE_MAX_REQUESTS_PER_WINDOW,
  rateLimitFeRedis: RATE_LIMIT_FE_REDIS_URI,
  rateLimitFeRedisNamespace: RATE_LIMIT_FE_REDIS_NAMESPACE,
  rateLimitBeWindowsMs: RATE_LIMIT_BE_WINDOW_MS,
  rateLimitBeMax: RATE_LIMIT_BE_MAX_REQUESTS_PER_WINDOW,
  rateLimitBeRedis: RATE_LIMIT_BE_REDIS_URI,
  rateLimitBeRedisNamespace: RATE_LIMIT_BE_REDIS_NAMESPACE,
  keyv_tally_cache_uri: KEYV_TALLY_CACHE_URI,
  pghost: POSTGRES_HOST,
  pgport: POSTGRES_PORT,
  pgdatabase: POSTGRES_DB,
  pguser: POSTGRES_USER,
  pgpassword: POSTGRES_PASSWORD,
  pgssl: !!POSTGRES_SSL,
  select_max_rows: SELECT_MAX_ROWS,
  salt: SALT,
  internalToken: INTERNAL_TOKEN,
  tokenUrl: TOKEN_URL,
  isTest: !ISPROD,
  recaptcha_uri: RECAPTCHA_URI,
  recaptcha_site_key: RECAPTCHA_SITE_KEY,
  recaptcha_secret_key: RECAPTCHA_SECRET_KEY,
  keyv_uri: KEYV_URI,
  keyv_retarget_namespace: KEYV_RETARGET_NAMESPACE,
  keyv_retarget_ttl_millis: KEYV_RETARGET_TTL_MILLIS,
  instrumented: /t/i.test(INSTRUMENTED_FOR_TEST),
  smtp_host: SMTP_HOST,
  smtp_port: SMTP_PORT,
  smtp_secure: SMTP_SECURE,
  smtp_user: SMTP_USER,
  smtp_password: SMTP_PASSWORD,
  mailer_from: MAILER_FROM
};
const log = require('./lib/log.js').init(ctx_config).fn("app");
const debug = require('./lib/log.js').init(ctx_config).debug_fn("app");
const insights_key = require('./lib/insights.js').init(ctx_config);
const crypto = require('./lib/crypto.js').init();
const paymentGateway = require('./lib/paymentGateway.js').init(ctx_config);
const authTokenChallengeChecker = require('./lib/auth-token-challenge-checker.js').init(ctx_config);
const loopbackChallengeChecker = require('./lib/loopback-challenge-checker.js').init(ctx_config);
const recaptcha = require('./lib/recaptcha.js').init(ctx_config);
const database = require('./lib/database.js').init(ctx_config);
const swagger = require('./lib/swagger.js').init(ctx_config);
const smtp = require('./lib/smtp.js').init(ctx_config);
const retarget = require('./lib/retarget.js').init(ctx_config);
const token = require('./lib/token.js').check.bind(require('./lib/token.js').init(ctx_config));
const throttle = require('./lib/throttle.js').check.bind(require('./lib/throttle.js').init(ctx_config));
const tallyCache = require('./lib/tally-cache.js').init(ctx_config);
const cacheCheck = require('./lib/tally-cache.js').cacheCheck.bind(require('./lib/tally-cache.js'));
const cacheSave = require('./lib/tally-cache.js').cacheSave.bind(require('./lib/tally-cache.js'));
log("CONFIG:\n%O", ((cfg) => {
  cfg.insights_key = cfg.insights_key ? cfg.insights_key.replace(/.(?=.{2})/g, '*') : null;
  cfg.stripe_secret_key = cfg.stripe_secret_key.replace(/.(?=.{2})/g, '*');
  cfg.stripe_client_id = cfg.stripe_client_id.replace(/.(?=.{2})/g, '*');
  cfg.pgpassword = cfg.pgpassword.replace(/.(?=.{2})/g, '*');
  cfg.salt = cfg.salt.replace(/.(?=.{2})/g, '*');
  cfg.internalToken = cfg.internalToken.replace(/.(?=.{2})/g, '*');
  cfg.recaptcha_secret_key = cfg.recaptcha_secret_key.replace(/.(?=.{2})/g, '*');
  cfg.smtp_password = cfg.smtp_password.replace(/.(?=.{2})/g, '*');
  return cfg;
})({ ...ctx_config }));

var RENDER_PARAMS = {
  uri: URI,
  publishableKey: STRIPE_PUBLISHABLE_KEY,
  currency: OUR_PROCESSING_CURRENCY,
  fee_cents: OUR_PROCESSING_FEE_CENTS,
  minimum_amount: STRIPE_MINIMUM_AMOUNT,
  retarget_fee_cents: OUR_RETARGET_FEE_CENTS,
  retarget_fee_dollars: utils.fixCentsToDollars(OUR_RETARGET_FEE_CENTS),
  startOnProviderPane: false,
  retargetAvailable: !ISPROD
};

// MIDDLEWARE

const app = express();
//app.enable("trust proxy"); // only if you're behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
app.use(express.static(__dirname + `${path.sep}..${path.sep}static`));
app.use(cookie());
app.use(express.json());
app.set('views', __dirname + `${path.sep}..${path.sep}static`);
app.engine('html', ejs.renderFile);
app.engine('template', ejs.renderFile);
app.use(allow_cors);

// ROUTES

app.get('/v1/swagger.json', throttle, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swagger.render());
});

app.get('/reap', (req, res) => {
  res.render('ui.html', { ...RENDER_PARAMS, startOnProviderPane: true });
});

app.get('/pay', (req, res) => {
  res.render('ui.html', RENDER_PARAMS);
});

// start onboarding with Stripe which then calls /v1/onboardRedirectTargetFromPayGate below.
app.get('/onboard', (req, rsp) => {
  (async () => {
    let state = req.query['state'];
    let clientId = STRIPE_CLIENT_ID;
    let authUrl = STRIPE_OAUTH_AUTHORIZE_URL;
    let redirectUrl = `${URI}/v1/onboardRedirectTargetFromPayGate`;
    if (!state) {
      state = utils.btoa(JSON.stringify({ "goPath": "/register.html", "stopPath": "/onboarderror.html" }))
    }
    let onboardUrl = `${authUrl}?response_type=code&client_id=${clientId}&scope=read_write&state=${state}&redirect_uri=${redirectUrl}`;
    let cookieOpts = { sameSite: 'strict', maxAge: 1 };
    if (PROTOCOL == 'https') {
      cookieOpts.path = '/v1/provider';
      cookieOpts.domain = DOMAIN;
      cookieOpts.secure = true;
    }
    rsp.cookie('oh_paygate_id', '', cookieOpts);
    rsp.render('onboarding.html', { ...RENDER_PARAMS, onboardingUrl: onboardUrl });
  })();
});

/**
 * @swagger
 * /v1/gratis.html:
 *   get:
 *     summary: Retrieve HTML with form-entry for a "gratis" ledger entry.
 *     description: | 
 *       Retrieve HTML with form-entry for a "gratis" ledger entry--to put a $0 transaction for a specified address on the *overhide-ledger*.
 *       <br/>  
 *       The form is meant to be part of an application's user-setup workflow: allowing a subscriber to register to an application free of charge.  If an application allows free users, getting these users to setup an address on *overhide-ledger* means a single ledger-based workflow can be used to authenticate paid and free users.
 *       <br/>
 *       For paying users use the `/v1/transact` endpoint to add a paid transaction.
 *       <br/>
 *       An application would likely show this form in an iframe.
 *       <br/>
 *       On success this page posts an `{event: 'oh-ledger-ok'}` message.  On failure this page posts an `{event: 'oh-ledger-error', detail: '..'}` message.  The `oh-ledger-error` message contains an error string in the event's *detail*.  Whether you've loaded this HTML in an *iframe* or otherwise, you can listen for the events in the parent Web code:
 *       <br/>
 *       ```
 *         // react to events from gratis page
 *         window.addEventListener('message', (e) => {
 *           if (e.data && e.data.event === 'oh-ledger-ok') console.log('OK');
 *         }, false);
 *         window.addEventListener('message', (e) => {
 *           if (e.data && e.data.event === 'oh-ledger-error') console.log('ERROR: ' + e.data.detail);
 *         }, false);
 *       ```
 *       <br/>
 *       Creation of a new address/signing key and signing messages must be done before calling this getter.  If you don't want to do that work, you can send the user to the https://ledger.overhide.io URI to use the full *overhide-ledger* Web form.
 *       <br/>
 *     tags:
 *       - creating entries
 *     parameters:
 *       - in: query
 *         name: address
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *            Ledger *address* as a 42 character *hex* string starting with '0x'.
 *       - in: query
 *         name: signature
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *            The *message* (below) signed by the *signing key* corresponding to the *address*.
 *       - in: query
 *         name: message
 *         required: true
 *         schema:
 *           type: string
 *         description: |
 *            A *message* corresponding to the *signature* (above).
 *     produces:
 *       - text/html
 *     responses:
 *       200:
 *         description: HTML form.
 *       400:
 *         description: Bad parameters preventing completion.
 */
app.get('/v1/gratis.html', throttle, (req, res) => {
  try {
    var query = req.query;
    debug('GET /v1/gratis.html <= %o', query);
    let address = query['address'];
    let signature = query['signature'];
    let message = query['message'];
    if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
    if (!signature || typeof signature !== 'string') throw `invalid signature, must be a string (${signature})`;
    if (!message || typeof message !== 'string') throw `invalid message, must be a string (${message})`;
    address = address.toLowerCase();
    try {
      var target = utils.recover(message, signature);
    } catch (e) {
      throw `address - signature mismatch (address:${address}) (signature:${signature}) (message:${message})`;
    }
    target = target.toLowerCase();
    if (address != target) throw `address - signature mismatch (address:${address}) (signature:${signature}) (message:${message})`;
    res.render('gratis-page.html', { address: address, sitekey: RECAPTCHA_SITE_KEY });
  }
  catch (err) {
    debug('GET /v1/gratis.html <= %o ERROR :: %s', query, err);
    res.status(400).send(String(err));
  }
});

app.post('/v1/gratis', (req, res) => {
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/gratis <= %o', body);
      let address = body['address'];
      let recaptchaResult = body['recaptchaResult'];
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      if (!recaptchaResult || typeof recaptchaResult !== 'string') throw `invalid recaptchaResult, must be a string`;
      address = address.toLowerCase();
      var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
      await recaptcha.verify(ip, recaptchaResult);
      if (!await database.getError()) {
        if (await database.getNumTransactionsFromTo(address, address) == 0) {
          await database.addTransaction(address, address, 0, 0);
        }
      }
      debug('POST /v1/gratis OK');
      res.status(200).send();
    }
    catch (err) {
      debug('POST /v1/gratis <= %o ERROR :: %s', body, err);
      res.status(400).send(String(err));
    }
  })();
});

/**
 * @swagger
 * /v1/transact.js:
 *   get:
 *     summary: Furnishes a script with functionality to pay a service provider and create a ledger entry.
 *     tags:
 *       - creating entries
 *     description: | 
 *       Furnishes a script with functionality to pay a service provider and create a ledger entry.
 *       <br/>  
 *       Funcionality exposed by this script is meant to be part of an application's user-setup workflow: allowing a 
 *       subscriber to register to an application's services for a fee.  The resulting *overhide-ledger* entry can be 
 *       used to authenticate and authorize for services.
 *       <br/>
 *       For "free" users use the `/v1/gratis` endpoint to add a "gratis" transaction.
 *       <br/>
 *       An HTML application would load this script using a `<script>` tag, making available the `oh_ledger_transact`
 *       function within:
 *       <br/>
 *       ```
 *       <html>
 *         <head>
 *           <script src=".../v1/transact.js"></script> <!-- load this script into the page -->
 *           ...
 *         </head>
 *         ...
 *         <script>
 *           ...
 *           oh_ledger_transact(amountCents, fromAddress, toAddress, isPrivate); // call the injected function
 *           ...
 *         </script>
 *       </html>       
 *       ```
 *       <br/>
 *       The `oh_ledger_transact` function injected by this script has the following contract:
 *       <br/> 
 *       ```
 *       Trigger Stripe payment and add entry to ledger.
 *
 *       Posts `{event: 'oh-ledger-ok'}` message against the 'window.parent' on success.
 *
 *       Posts `{event: 'oh-ledger-error', detail: '..'}` message against the 'window.parent' on failure.
 *
 *       param {number} amountCents - amount in cents to pay.
 *       param {string} fromAddress - ledger *address* as a 42 character *hex* string starting with '0x'.
 *       param {string} toAddress - ledger *address* as a 42 character *hex* string starting with '0x'.
 *       param {boolean} isPrivate - flags whether the created transaction is private:  requires a signature from one of the
 *                                   participants to be shown/returned.
 *       ```
 *       <br/>
 *       On success this function posts a `{event: 'oh-ledger-ok'}` message.  On failure this page posts a `{event: 'oh-ledger-error', detail: '..'}` message.  The `oh-ledger-error` message contains an error string in the event's *detail*.  Whether you've loaded this HTML in an *iframe* or otherwise, you can listen for the events in the parent Web code:
 *       <br/>
 *       ```
 *         // react to events from gratis page
 *         window.addEventListener('message', (e) => {
 *           if (e.data && e.data.event === 'oh-ledger-ok') console.log('OK');
 *         }, false);
 *         window.addEventListener('message', (e) => {
 *           if (e.data && e.data.event === 'oh-ledger-error') console.log('ERROR: ' + e.data.detail);
 *         }, false);
 *       ```
 *       <br/>
 *     produces:
 *       - application/javascript
 *     responses:
 *       200:
 *         description: OK, success.
 */
app.get('/v1/transact.js', throttle, (req, res) => {
  try {
    debug('GET /v1/transact.js');
    res.render('transact.js.template', {
      currency: OUR_PROCESSING_CURRENCY,
      publishableKey: STRIPE_PUBLISHABLE_KEY,
      uri: URI
    });
  }
  catch (err) {
    debug('GET /v1/transact.js ERROR :: %s', err);
    res.status(400).send(String(err));
  }
});

/**
 * Endpoint used as redirect target when onboarding from Stripe.com; as initiated from UI (likely with /onboard above):
 * 
 * Sequence: 
 * 
 *   // admin configures onboard redirect URL (this) w/Stripe--this is different than the UX redirectUrl below
 *   ...
 *   ui.html calls /onboard w/ goPath := /reap#onboarded in state, state also has address/email, all from ui.html modal
 *   website onboarding calls /onboard w/out state
 *   /onboard -> sets goPath to this if not set, calls stripe w/state+redirectUrl to this
 *   stripe -> this : w/code, state
 *   this -> redirects to goPath from state : w/cookie containing code
 *   goPath redirect -> /provider : next call below
 *   /provider writes to database
 * 
 * Required parameters in query: 
 * 
 *   code:
 *   - payGate auth code
 * 
 *   state:
 *   - {baseUrl:..,goPath:.., stopPath:.., address:.., email:...} base64 encoded JSON string
 *     - baseUrl is the base URL for paths, optional, if not provided, it's that of this server
 *     - goPath is the PATH part of ${PROTOCOL}://${BASE_URL}${PATH} to redirect to from this call if payGateId successfully retrieved
 *       - goPath is redirected-to with 'note' query param for any notification notes (base64 encoded)
 *       - goPath is redirected-to with 'address' query param with address being registered on ledger (if address passed in 'state')
 *       - goPath is redirected-to with 'stopUrl' query param: base64 of '${baseUrl}${state.stopPath}'
 *     - stopPath is the PATH part of ${PROTOCOL}://${BASE_URL}${PATH} to redirect to from this call if error or cancel
 *       - stopPath is redirected-to with 'error' query param with any error notes (base64 encoded)
 *     - address
 *     - email is the provider email for re-targeting
 *   - for example:
 *     - state := btoa(JSON.stringify({"goPath":"/reap#onboarded","stopPath":"/reap","address":"...","email":"..."}));
 *
 * Redirects to one of ${PROTOCOL}://${BASE_URL}${goPath} or ${PROTOCOL}://${BASE_URL}${stopPath}.
 * 
 * > For *ui.html*:
 * > * 'baseUrl' is not set
 * > * 'goPath' needs to be `/reap#onboarded`
 * > * 'stopPath` needs to be '/reap' with the 'error' query param set
 * 
 * If redirects to 'goPath', sets cookie as per:
 * 
 * `Set-Cookie: oh_paygate_id=${symmetricEncrypt(...,$SALT).toString('base64')}; Secure; HttpOnly; SameSite=Strict; Domain=$BASE_URL; Path=/v1/provider`
 * 
 * The cookie is consumed by /v1/provider below: it's expected that 'goPath' calls /v1/provider (button etc.).
 */
app.get('/v1/onboardRedirectTargetFromPayGate', (req, rsp) => {
  (async () => {
    var query = req.query;
    debug('GET /v1/onboardRedirectTargetFromPayGate <= %o', query);
    try {
      var state = JSON.parse(utils.atob(query['state']));
      if (!('goPath' in state)) throw `No 'goPath' URI in 'state' passed in`;
      if (!('stopPath' in state)) throw `No 'stopPath' URI in 'state' passed in`;
    } catch (err) {
      debug('GET /v1/onboardRedirectTargetFromPayGate <= %o ERROR bad URLs in "state" :: %s', query, err);
      rsp.status(400);
      rsp.send(new String(err));
    }
    try {
      let error_description = query['error_description'];
      if (error_description) throw error_description;
      let code = query['code'];
      if (!code || typeof code !== 'string') throw `invalid code (${code})`;
      let paymentGatewayId = await paymentGateway.addPayee(code);
      paymentGatewayId = crypto.symmetricEncrypt(paymentGatewayId, SALT).toString('base64');
      let baseUrl = state.baseUrl ? state.baseUrl : `${PROTOCOL}://${BASE_URL}`;
      let redirectUrl = utils.addQueryParam(`${baseUrl}${state.goPath}`, 'note', utils.btoa('OK, success, provider added.'));
      redirectUrl = utils.addQueryParam(redirectUrl, "stopUrl", utils.btoa(`${baseUrl}${state.stopPath}`));
      if (state.email) {
        redirectUrl = utils.addQueryParam(redirectUrl, "email", state.email);
      }
      if (state.address) {
        redirectUrl = utils.addQueryParam(redirectUrl, "address", state.address);
      }
      debug(`GET /v1/onboardRedirectTargetFromPayGate OK (redirect url: ${redirectUrl} )`);
      let cookieOpts = { sameSite: 'strict' };
      if (PROTOCOL == 'https') {
        cookieOpts.path = '/v1/provider';
        cookieOpts.domain = DOMAIN;
        cookieOpts.secure = true;
      }
      rsp.cookie('oh_paygate_id', paymentGatewayId, cookieOpts);
      rsp.redirect(302, redirectUrl);
    }
    catch (err) {
      debug('GET /v1/onboardRedirectTargetFromPayGate <= %o ERROR :: %s', query, err);
      let baseUrl = state.baseUrl ? state.baseUrl : `${PROTOCOL}://${BASE_URL}`;
      let redirectUrl = utils.addQueryParam(`${baseUrl}${state.stopPath}`, 'error', utils.btoa(new String(err)));
      rsp.redirect(302, redirectUrl);
    }
  })();
});


/**
 * See above /v1/onboardRedirectTargetFromPayGate for flow/sequence.
 * 
 * Required parameters in query:
 * 
 *   address
 *   - provider ledger address
 * 
 *   state:
 *   - {baseUrl, goPath:.., stopPath:.., email:...} base64 encoded JSON string
 *     - baseUrl is the base URL for paths, optional, if not provided, it's that of this server
 *     - goPath is the PATH part of ${PROTOCOL}://${BASE_URL}${PATH} to redirect to from this call if provider successfully set in ledger
 *       - goPath is redirected-to with 'note' query param for any notification notes
 *       - goPath is redirected-to with 'address' query param with address being registered on ledger
 *     - stopPath is the PATH part of ${PROTOCOL}://${BASE_URL}${PATH} to redirect to from this call if error or cancel
 *       - stopPath is redirected-to with 'error' query param with any error notes
 *     - email is the provider email for re-targeting
 *   - for example: 
 *     - state := btoa(JSON.stringify({"goPath":"/reap","stopPath":"/reap"}));
 *     - state := "eyJnb1BhdGgiOiIvcmVhcCIsInN0b3BQYXRoIjoiL3JlYXAifQ=="
 * 
 * Cookie 'oh_paygate_id' contains the encrypted paymentGatewayId as set in /v1/onboardRedirectTargetFromPayGate
 */
app.get('/v1/provider', (req, rsp) => {
  (async () => {
    var query = req.query;
    debug('GET /v1/provider <= %o', query);
    try {
      var state = JSON.parse(utils.atob(query['state']));
      if (!('goPath' in state)) throw `No 'goPath' URI in 'state' passed in`;
      if (!('stopPath' in state)) throw `No 'stopPath' URI in 'state' passed in`;
    } catch (err) {
      debug('GET /v1/provider <= %o ERROR bad URLs in "state" :: %s', query, err);
      rsp.status(400);
      rsp.send(new String(err));
      return;
    }
    let cookieOpts = { sameSite: 'strict', maxAge: 1 };
    if (PROTOCOL == 'https') {
      cookieOpts.path = '/v1/provider';
      cookieOpts.domain = DOMAIN;
      cookieOpts.secure = true;
    }
    rsp.cookie('oh_paygate_id', '', cookieOpts);
    try {
      let address = query['address'];
      if (!address) throw `No 'address' 'query' passed in`;
      address = address.toLowerCase();
      try {
        var paymentGatewayId = new Buffer(req.cookies['oh_paygate_id'], 'base64');
        paymentGatewayId = crypto.symmetricDecrypt(paymentGatewayId, SALT);
      } catch (err) {
        throw `You must first onboard with Stripe before attempting to register.`;
      }
      const email = state['email'];
      const emailHash = email ? crypto.hash(email.toLowerCase(), SALT) : null;
      if (!await database.getError()) {
        await database.addProvider(paymentGatewayId, address, emailHash);
      }
      debug('GET /v1/provider OK');
      let baseUrl = state.baseUrl ? state.baseUrl : `${PROTOCOL}://${BASE_URL}`;
      let redirectUrl = utils.addQueryParam(`${baseUrl}${state.goPath}`, 'note', utils.btoa('OK, success, provider added.'));
      redirectUrl = utils.addQueryParam(redirectUrl, "address", address);
      debug(`GET /v1/provider OK (redirect url: ${redirectUrl} )`);
      // expire the cookie
      rsp.redirect(302, redirectUrl);
    }
    catch (err) {
      debug('GET /v1/provider <= %o ERROR :: %s', query, err);
      let baseUrl = state.baseUrl ? state.baseUrl : `${PROTOCOL}://${BASE_URL}`;
      let redirectUrl = utils.addQueryParam(`${baseUrl}${state.stopPath}`, 'error', utils.btoa(new String(err)));
      rsp.redirect(302, redirectUrl);
    }
  })();
});

/**
 * Get challenge to sign.
 */
app.get('/v1/challenge', throttle, (req, res) => {
  (async () => {
    try {
      res.status(200).send(String(loopbackChallengeChecker.getChallenge()));
    }
    catch (err) {
      debug('GET /v1/transact.js ERROR :: %s', err);
      res.status(400).send(String(err));
    }  
  })();
});

/**
 * Endpoint used from UI ('GET /pay') and JS function ('GET /v1/transact.js') to shunt a payment.
 * 
 * Required parameters in body:
 *   - paymentGatewayToken
 *   - providerAddress
 *   - subscriberAddress
 *   - amount
 */
app.post('/v1/shunt', (req, rsp) => {
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/shunt <= %o', body);
      let paymentGatewayToken = body['paymentGatewayToken'];
      let providerAddress = body['providerAddress'];
      let subscriberAddress = body['subscriberAddress'];
      let amountCents = body['amountCents'];
      let isPrivate = !!body['isPrivate'];
      if (!paymentGatewayToken || typeof paymentGatewayToken !== 'string') throw `invalid paymentGatewayToken (${paymentGatewayToken})`;
      if (!providerAddress || typeof providerAddress !== 'string') throw `invalid providerAddress (${providerAddress})`;
      if (!subscriberAddress || typeof subscriberAddress !== 'string') throw `invalid subscriberAddress (${subscriberAddress})`;
      if (!amountCents || parseFloat(amountCents) < parseFloat(STRIPE_MINIMUM_AMOUNT) * 100) throw `invalid amount (${amountCents})`;
      providerAddress = providerAddress.toLowerCase();
      subscriberAddress = subscriberAddress.toLowerCase();
      if (!await database.getError()) {
        let accountId = await database.getAccountId(providerAddress);
        if (!accountId) {
          throw `no such provider: ${providerAddress}`
        }
        let { transferId, email } = await paymentGateway.shunt(paymentGatewayToken, accountId, amountCents, `tx,${accountId},${subscriberAddress},${providerAddress},${amountCents}`);
        await database.addTransaction(subscriberAddress, providerAddress, amountCents, transferId, crypto.hash(email, SALT), isPrivate);
      }
      debug('POST /v1/shunt OK');
      rsp.status(200).send();
    }
    catch (err) {
      debug('POST /v1/shunt <= %o ERROR :: %s', body, err);
      rsp.status(400).send(String(err));
    }
  })();
});

/**
 * Retarget provider by Stripe account.
 * 
 * Required parameters in body:
 *   - accountId
 *   - address
 */
app.post('/v1/retarget-provider', (req, rsp) => {
  if (!!ISPROD) {
    rsp.status(403).send();
  }
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/retarget-provider <= %o', body);
      let accountId = body['accountId'];
      let address = body['address'];
      let signature = body['signature'];
      let message = body['message'];
      let email = body['email'];
      if (!accountId || typeof accountId !== 'string') throw `invalid accountId (${accountId})`;
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      address = address.toLowerCase();
      if (!(await loopbackChallengeChecker.checkSignature(address, signature, message))) throw `invalid signature`;

      let pgEmail = await paymentGateway.getEmailForAccount(accountId);

      if (await database.getError()) {
        throw `DB error`;
      }

      let existingAccountId = await database.getAccountId(address);
      if (existingAccountId && existingAccountId.toLowerCase() !== accountId.toLowerCase()) {
        throw `Address ${address} is already tied to a different account, cannot use it as a re-targeting target.`;
      }
      
      email = pgEmail ? pgEmail : email; // payment gateway email, if any, overrides provided  

      if (!email) throw `No email provided.`

      const emailHash = crypto.hash(email.toLowerCase(), SALT);
      if (pgEmail) {
        var checksOut = await database.isAccountIdInTxs(accountId);
      } else {
        var checksOut = await database.isAccountIdInTxs(accountId, emailHash);
      }
      
      if (!checksOut) {
        throw `No transactions for Stripe account ID: ${accountId} and the provided email.`;
      }

      await retarget.retargetProvider(email, emailHash, address, accountId);
      debug('POST /v1/retarget-provider OK');
      rsp.status(200).send();
    }
    catch (err) {
      debug('POST /v1/retarget-provider <= %o ERROR :: %s', body, err);
      rsp.status(400).send(String(err));
    }
  })();
});

/**
 * Retarget subscriber by email.
 * 
 * Required parameters in body:
 *   - email
 *   - address
 */
app.post('/v1/retarget-subscriber', (req, rsp) => {
  if (!!ISPROD) {
    rsp.status(403).send();
  }
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/retarget-subscriber <= %o', body);
      let email = body['email'];
      let address = body['address'];
      let signature = body['signature'];
      let message = body['message'];
      if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/g.test(email)) throw `invalid email (${email})`;
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      address = address.toLowerCase();
      if (!(await loopbackChallengeChecker.checkSignature(address, signature, message))) throw `invalid signature`;
      if (!await database.getError()) {
        let emailHash = crypto.hash(email.toLowerCase(), SALT);
        let checksOut = await database.isEmailInTxs(emailHash);
        if (!checksOut) {
          throw `No transactions for email: ${email}`;
        }
        await retarget.retargetSubscriber(email, emailHash, address);
      }
      debug('POST /v1/retarget-subscriber OK');
      rsp.status(200).send();
    }
    catch (err) {
      debug('POST /v1/retarget-subscriber <= %o ERROR :: %s', body, err);
      rsp.status(400).send(String(err));
    }
  })();
});

/**
 * Continue re-targeting after user clicks on link from email (hits this endpoint).
 */
app.get('/v1/retarget/:id', throttle, (req, rsp) => {
  if (!!ISPROD) {
    rsp.status(403).send();
  }
  (async () => {
    try {
      var params = req.params;
      var id = params['id'];
      if (!id || typeof id !== 'string') throw `invalid id (${id})`;
      id = id.toLowerCase();
      debug('GET /v1/retarget/%s', id);
      let info = await retarget.retargetAcknowledged(id);
      let accountId = info.accountId;
      if (!await database.getError()) {
        if (accountId) {
          var txs = await database.getLatestTransactionsByAccountId(accountId);
          var num_all_txs = await database.getNumTransactionsByAccountId(accountId);
        } else {
          var txs = await database.getLatestTransactionsByEmailHash(info.emailHash);
          var num_all_txs = await database.getNumTransactionsByEmailHash(info.emailHash);
        }
        if (txs.length == 0) throw 'No transactions';
      }
      debug('GET /v1/retarget/%s OK', id);
      rsp.render('retarget.html', {
        error: '',
        id: id,
        email: info.email,
        address: info.address,
        accountId: accountId,
        txs: JSON.stringify(txs),
        num_txs: txs.length,
        num_all_txs: num_all_txs,
        currency: OUR_PROCESSING_CURRENCY,
        retarget_fee_cents: OUR_RETARGET_FEE_CENTS,
        retarget_fee_dollars: utils.fixCentsToDollars(OUR_RETARGET_FEE_CENTS),
        publishableKey: STRIPE_PUBLISHABLE_KEY
      });
    }
    catch (err) {
      debug('GET /v1/retarget/%s ERROR :: %s OK', id, err);
      rsp.render('retarget.html', {
        error: String(err),
        id: '',
        email: '',
        address: '',
        accountId: '',
        txs: JSON.stringify([]),
        num_txs: '',
        num_all_txs: '',
        currency: '',
        retarget_fee_cents: '',
        retarget_fee_dollars: '',
        publishableKey: STRIPE_PUBLISHABLE_KEY
      });
    }
  })();
});

/**
 * Final step of re-targeting when user pays up the fee.
 * 
 * Required parameters in body:
 *   - paymentGatewayToken
 *   - email
 *   - address
 */
app.post('/v1/go-retarget', throttle, (req, rsp) => {
  if (!!ISPROD) {
    rsp.status(403).send();
  }
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/go-retarget <= %o', body);
      let paymentGatewayToken = body['paymentGatewayToken'];
      let email = body['email'];
      let address = body['address'];
      let accountId = body['accountId'];
      let id = body['id'];
      let signature = body['signature'];
      let message = body['message'];
      if (!paymentGatewayToken || typeof paymentGatewayToken !== 'string') throw `invalid paymentGatewayToken (${paymentGatewayToken})`;
      if (!email || typeof email !== 'string') throw `invalid email (${email})`;
      if (accountId && typeof accountId !== 'string') throw `invalid accountId (${accountId})`;
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      if (!id || typeof id !== 'string') throw `invalid id (${id})`;
      address = address.toLowerCase();
      if (!(await loopbackChallengeChecker.checkSignature(address, signature, message))) throw `invalid signature`;      
      const emailHash = crypto.hash(email.toLowerCase(), SALT);
      id = id.toLowerCase();
      await retarget.retargetFinalized(id);
      let amountCents = OUR_RETARGET_FEE_CENTS;
      if (!await database.getError()) {
        let transferId = await paymentGateway.collectRetargetFee(paymentGatewayToken, amountCents, `retarget,${accountId},${email},${emailHash},${address},${amountCents}`);
        if (accountId) {
          let existingAccountId = await database.getAccountId(address);
          if (existingAccountId && existingAccountId.toLowerCase() !== accountId.toLowerCase()) {
            throw `Address ${address} is already tied to a different account, cannot use it as a re-targeting target.`;
          }
          if (!existingAccountId) {
            await database.addProvider(accountId, address, emailHash);
          }
          await database.retargetByAccountId(accountId, transferId, address);
        } else {
          await database.retargetByEmailHash(emailHash, transferId, address);
        }
      }
      debug('POST /v1/go-retarget OK');
      rsp.status(200).send();
    }
    catch (err) {
      debug('POST /v1/go-retarget <= %o ERROR :: %s', body, err);
      rsp.status(400).send(String(err));
    }
  })();
});

app.get('/v1/ledger.html', throttle, (req, res) => {
  (async () => {
    try {
      var query = req.query;
      debug('GET /v1/ledger.html <= %o', query);
      let address = query['address'];
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      address = address.toLowerCase();
      
      let signature = query['signature'];
      let message = query['message'];
      let tsignature = query['t-signature'];
      let tchallenge = query['t-challenge'];       
      let includePrivate = 
        (!!signature && !!message && (await loopbackChallengeChecker.checkSignature(address, signature, message))) 
        || (!!tsignature && !!tchallenge && authTokenChallengeChecker.checkSignature(address, tsignature, tchallenge));

      if (!await database.getError()) {
        txs = await database.getLatestTransactionsByAddress(address, includePrivate);
        num_all_txs = await database.getNumTransactionsByAddress(address, includePrivate);
        if (txs.length == 0) throw `No transactions available for ${address}`;
      }
      res.render('ledger-page.html', {
        error: '',
        address: address,
        currency: OUR_PROCESSING_CURRENCY,
        txs: JSON.stringify(txs),
        num_txs: txs.length,
        num_all_txs: num_all_txs
      });
    }
    catch (err) {
      debug('GET /v1/ledger.html <= %o ERROR :: %s', query, err);
      res.render('ledger-page.html', {
        error: String(err),
        address: '',
        currency: '',
        txs: '',
        num_txs: '',
        num_all_txs: ''
      });
    }
  })();
});

app.get('/v1/void.html', throttle, (req, res) => {
  (async () => {
    try {
      var query = req.query;
      debug('GET /v1/void.html <= %o', query);
      let providerAddress = query['providerAddress'];
      let subscriberAddress = query['subscriberAddress'];
      let signature = query['signature'];
      let message = query['message'];
      if (!providerAddress || typeof providerAddress !== 'string' || providerAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${providerAddress})`;
      if (!subscriberAddress || typeof subscriberAddress !== 'string' || subscriberAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${subscriberAddress})`;
      providerAddress = providerAddress.toLowerCase();
      subscriberAddress = subscriberAddress.toLowerCase();
      if (!(await loopbackChallengeChecker.checkSignature(providerAddress, signature, message))) throw `invalid signature`;
      if (!await database.getError()) {
        txs = await database.getLatestTransactionsFromTo(subscriberAddress, providerAddress);
        if (txs.length == 0) throw `No transactions from ${subscriberAddress} to ${providerAddress}`;
        num_all_txs = await database.getNumTransactionsFromTo(subscriberAddress, providerAddress);
      }
      res.render('void-page.html', {
        error: '',
        fromAddress: subscriberAddress,
        toAddress: providerAddress,
        signature: signature,
        message: message,
        currency: OUR_PROCESSING_CURRENCY,
        txs: JSON.stringify(txs),
        num_txs: txs.length,
        num_all_txs: num_all_txs
      });
    }
    catch (err) {
      debug('GET /v1/void.html <= %o ERROR :: %s', query, err);
      res.render('void-page.html', {
        error: String(err),
        fromAddress: '',
        toAddress: '',
        signature: '',
        message: '',
        currency: '',
        txs: '',
        num_txs: '',
        num_all_txs: ''
      });
    }
  })();
});

/**
 * Final step of voiding transactions
 * 
 * Required parameters in body:
 *   - providerAddress
 *   - subscriberAddress
 *   - signature
 *   - message
 */
app.post('/v1/go-void', throttle, (req, rsp) => {
  (async () => {
    try {
      var body = req.body;
      debug('POST /v1/go-void <= %o', body);
      let providerAddress = body['providerAddress'];
      let subscriberAddress = body['subscriberAddress'];
      let signature = body['signature'];
      let message = body['message'];
      if (!providerAddress || typeof providerAddress !== 'string' || providerAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${providerAddress})`;
      if (!subscriberAddress || typeof subscriberAddress !== 'string' || subscriberAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${subscriberAddress})`;
      providerAddress = providerAddress.toLowerCase();
      subscriberAddress = subscriberAddress.toLowerCase();
      if (!(await loopbackChallengeChecker.checkSignature(providerAddress, signature, message))) throw `invalid signature`;
      if (!await database.getError()) {
        await database.voidFromTo(subscriberAddress, providerAddress);
      }
      debug('POST /v1/go-void OK');
      rsp.status(200).send();
    }
    catch (err) {
      debug('POST /v1/go-void <= %o ERROR :: %s', body, err);
      rsp.status(400).send(String(err));
    }
  })();
});

/**
 *  @swagger
 * /v1/export/{to-address}:
 *    get:
 *      summary: Export all transactions addressed to *to-address* from this cluster, such that they can be imported into another provider.
 *      description: |
 *        Retrieve batches of remuneration records -- in descending transaction time order -- addressed to *to-address* from this
 *        cluster, this provider.  
 * 
 *        Each subsequent batch of records needs to be retrieved using repeated calls into the endpoint with the *skip* 
 *        parameter: to skip records already retrieved.  This operation is concurrency-safe as new records will always be 
 *        returned by the last batch(es):  everything is in descending transaction time order.
 * 
 *        Results out of this remuneration provider always exclude voided transactions (e.g. transactions you void when you 
 *        issue refunds through [Stripe](https://stripe.com)).  All transactions voided through the "Void Txs" button in the 
 *        [legacy app](https://ledger.overhide.io/reap) are excluded.  This would be similar to setting truthy the 
 *        <em>include-refunds</em> query parameter in other remuneration providers &mdash; which work somewhat differently as they are
 *        blockchain based and cannot be voided.
 *  
 *        All values in *USD cents*.
 * 
 *        Rate limits:  
 *          - *front-end* (all calls unless providing *as-of* and *tally-only* that are cached): 30 calls / minute / IP (across all overhide APIs)
 *          - *back-end* (calls providing *as-of* and *tally-only* IFF already cached): 600 calls / minute / IP (across all overhide APIs)
 *      tags:
 *        - import & export
 *      parameters:
 *        - in: path
 *          name: to-address
 *          required: true
 *          description: |
 *            The target public address to check for payment made.  A 42 character 'hex' string prefixed with '0x'.
 *          schema:
 *            type: string
 *        - in: query
 *          name: signature
 *          required: true
 *          description: |
 *            A base64 econded signature of the `Authorization` header value (also passed into this call), signed by *to-address*.
 *          schema:
 *            type: string
 *        - in: query
 *          name: skip
 *          required: false
 *          schema:
 *            type: integer
 *          description: |
 *            Number of records to skip before retrieving the next batch of records.  To get all records, keep on retrieving batches
 *            with *skip* until the endpoint returns an empty list with 200/OK.
 *      produces:
 *        - application/json
 *      responses:
 *        200:
 *          description: |
 *            List of transactions.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                properties:
 *                  transactions:
 *                    type: array
 *                    description: |
 *                      All the transactions from *from-address* to *to-address* in the range required
 *                      (*since*,*max-most-recent*,or unlimited).
 *                    items:
 *                      $ref: "#/definitions/Transaction"
 *        400:
 *          $ref: "#/responses/400"
 *        401:
 *          $ref: "#/responses/401"
 *        429:
 *          $ref: "#/responses/429"
 */
 app.get('/v1/export/:toAddress', token, throttle, (req, rsp) => {
  (async () => {
    try {
      debug('GET /v1/export <= %o, %o', req.params, req.query);
      let address = req.params['address'];
      let skip = req.query['skip'];
      address = address.toLowerCase();
      skip = parseInt(skip);

      if (!authTokenChallengeChecker.isValidTokenAuthZ(req, address)) {
        debug(`GET /v1/export DENIED :: signature doesn't match authZ header and address`);
        rsp.status(401).send();
        return;
      }

      let result = await database.getTransgetAllTransactionsForAddressactions(address, skip);
      debug('GET /v1/export OK');
      rsp.json(result);
      rsp.locals.result = result;
    }
    catch (err) {
      debug('GET /v1/export ERROR :: %s', String(err));
      rsp.status(400).send(String(err));
    }
  })();
});

/**
 *  @swagger
 * /v1/get-transactions/{from-address}/{to-address}:
 *    get:
 *      summary: Retrieve remuneration transactions and/or their tally.
 *      description: |
 *        Retrieve the latest remuneration transactions (and/or their tally) from *from-address* to *to-address*.
 * 
 *        Results out of this remuneration provider always exclude voided transactions (e.g. transactions you void when you 
 *        issue refunds through [Stripe](https://stripe.com)).  All transactions voided through the "Void Txs" button in the 
 *        [legacy app](https://ledger.overhide.io/reap) are excluded.  This would be similar to setting truthy the 
 *        <em>include-refunds</em> query parameter in other remuneration providers &mdash; which work somewhat differently as they are
 *        blockchain based and cannot be voided.
 * 
 *        Results out of this renumeration provider will return private transactions iff a valid *signature* is provided; see 
 *        *isPrivate* parameter in `GET /v1/transact.js`.
 * 
 *        All values in *USD cents*.
 * 
 *        Rate limits:  
 *          - *front-end* (all calls unless providing *as-of* and *tally-only* that are cached): 30 calls / minute / IP (across all overhide APIs)
 *          - *back-end* (calls providing *as-of* and *tally-only* IFF already cached): 600 calls / minute / IP (across all overhide APIs)
 *      tags:
 *        - remuneration provider
 *      parameters:
 *        - in: path
 *          name: from-address
 *          required: true
 *          description: |
 *            A public address from which to verify payment details (amount/date) to the *to-address*.  A 42 character
 *            'hex' string prefixed with '0x'
 *          schema:
 *            type: string
 *        - in: path
 *          name: to-address
 *          required: true
 *          description: |
 *            The target public address to check for payment made.  A 42 character 'hex' string prefixed with '0x'.
 *          schema:
 *            type: string
 *        - in: query
 *          name: signature
 *          required: false
 *          description: |
 *            A base64 econded signature of the `Authorization` header value (also passed into this call), signed by *from-address*.
 * 
 *            If a valid *signature* is provided, private transactions will be returned in the result.  Private transactions
 *            are ones created with the *isPrivate* parameter set against the `oh_ledger_transact` method as injected from
 *            `GET /v1/transact.js`.
 *          schema:
 *            type: string
 *        - in: query
 *          name: max-most-recent
 *          required: false
 *          schema:
 *            type: integer
 *          description: |
 *            Number of most recent transactions to retrieve.
 *        - in: query
 *          name: since
 *          required: false
 *          schema:
 *            type: string
 *          description: |
 *            Retrieve transactions since this date-time (inclusive) until now.
 *
 *            The date-time is a UTC timestamp string in [ISO 8601/RFC3339 format](https://xml2rfc.tools.ietf.org/public/rfc/html/rfc3339.html#anchor14).
 *        - in: query
 *          name: as-of
 *          required: false
 *          schema:
 *            type: string
 *          description: |
 *            Retrieve transactions as-of this date-time (inclusive).
 * 
 *            Responses from this endpoint include an *as-of* timestamp.  Subsequent *tally-only* requests with this *as-of* timestamp are
 *            treated as *back-end* requests and go against *back-end* rate limits IFF the same *tally-only* request has recently been made 
 *            (by the front-end, for example), and is cached.
 *
 *            The date-time is a string in [ISO 8601/RFC3339 format](https://xml2rfc.tools.ietf.org/public/rfc/html/rfc3339.html#anchor14).
 *        - in: query
 *          name: tally-only
 *          required: false
 *          schema:
 *            type: boolean
 *          description: |
 *            If present and set to `true` then the 200/OK response will not list individual *transactions*, just the
 *            *tally*.
 *
 *            If not present or set to anything but `true` then the 200/OK response will list individual *transactions* in
 *            addition to the *tally*.  
 *        - in: query
 *          name: tally-dollars
 *          required: false
 *          schema:
 *            type: boolean
 *          description: |
 *            If present and set to `true` then the 200/OK response will not list individual *transactions*, just the
 *            *tally* in dollars (not cents).
 *      produces:
 *        - application/json
 *      responses:
 *        200:
 *          description: |
 *            List of transactions and/or tally.
 *          content:
 *            application/json:
 *              schema:
 *                type: object
 *                required:
 *                 - tally
 *                properties:
 *                  tally:
 *                    type: number
 *                    description: |
 *                      Tally of all the transactions from *from-address* to *to-address* in the range required
 *                      (*since*,*max-most-recent*,or unlimited).
 *                  transactions:
 *                    type: array
 *                    description: |
 *                      All the transactions from *from-address* to *to-address* in the range required
 *                      (*since*,*max-most-recent*,or unlimited).
 *                    items:
 *                      $ref: "#/definitions/Transaction"
 *                  as-of:
 *                    type: string
 *                    description: |
 *                      Timestamp of this request.
 * 
 *                      Use this timestamp as the *as-of* parameter to subsequent requests to be rate-limited at *back-end* limits (higher).  Only
 *                      works with *tally-dollars* requests.
 * 
 *                      The date-time is a string in [ISO 8601/RFC3339 format](https://xml2rfc.tools.ietf.org/public/rfc/html/rfc3339.html#anchor14).
 *        400:
 *          $ref: "#/responses/400"
 *        401:
 *          $ref: "#/responses/401"
 *        429:
 *          $ref: "#/responses/429"
 */
app.get('/v1/get-transactions/:fromAddress/:toAddress', token, cacheCheck, throttle, (req, rsp, next) => {
  (async () => {
    try {
      debug('GET /v1/get-transactions <= %o, %o', req.params, req.query);

      if (rsp.locals.backend && rsp.locals.result) {
        rsp.json(rsp.locals.result);
        return;
      }

      let fromAddress = req.params['fromAddress'];
      let toAddress = req.params['toAddress'];
      let maxMostRecent = req.query['max-most-recent'];
      let since = req.query['since'];
      let asOf = req.query['as-of'];
      let tallyOnly = req.query['tally-only'];
      let tallyDollars = req.query['tally-dollars'];
      if (!fromAddress || typeof fromAddress !== 'string' || fromAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${fromAddress})`;
      if (!toAddress || typeof toAddress !== 'string' || toAddress.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${toAddress})`;
      if (maxMostRecent && (isNaN(parseInt(maxMostRecent)) || parseInt(maxMostRecent) < 1)) throw `invalid max-most-recent, must be integer with value of 1 or more if speicified: (${maxMostRecent})`;
      if (since) {
        try {
          if (!since.match(/....-..-..[tT ]..:..:..(\..+)?Z/)) throw `timestamp ${since} does not match 'YYYY-MM-DDThh:mm:ss.mmmZ'`;
          since = new Date(since);
        } catch (err) {
          throw `invalid since, must be ISO 8601 date string if speicified: (${since})`;
        }
      }
      if (asOf) {
        try {
          if (!asOf.match(/....-..-..[tT ]..:..:..(\..+)?Z/)) throw `timestamp ${asOf} does not match 'YYYY-MM-DDThh:mm:ss.mmmZ'`;
          asOf = new Date(asOf);
        } catch (err) {
          throw `invalid since, must be ISO 8601 date string if speicified: (${asOf})`;
        }
      }
      if (tallyOnly && (typeof tallyOnly !== 'string' || !/^(true|false)$/gi.test(tallyOnly))) throw `invalid tallyOnly, must be 'true' or 'false' if specified (${tallyOnly})`;
      if (tallyDollars && (typeof tallyDollars !== 'string' || !/^(true|false)$/gi.test(tallyDollars))) throw `invalid tallyDollars, must be 'true' or 'false' if specified (${tallyDollars})`;
      fromAddress = fromAddress.toLowerCase();
      toAddress = toAddress.toLowerCase();
      tallyOnly = tallyOnly ? /^true$/gi.test(tallyOnly) : false;
      tallyDollars = tallyDollars ? /^true$/gi.test(tallyDollars) : false;
      let result = await database.getTransactions({
        fromAddress: fromAddress,
        toAddress: toAddress,
        maxMostRecent: maxMostRecent,
        since: since,
        asOf: asOf,
        tallyOnly: tallyOnly,
        includePrivate: authTokenChallengeChecker.isValidTokenAuthZ(req, req.params['from-address'])
      });
      if (tallyDollars) {
        result = { ...result, tally: (result.tally / 100).toFixed(2) };
      }
      debug('GET /v1/get-transactions OK');
      rsp.json(result);
      rsp.locals.result = result;
      next();
    }
    catch (err) {
      debug('GET /v1/get-transactions ERROR :: %s', String(err));
      rsp.status(400).send(String(err));
    }
  })();
}, cacheSave);

/**
 * @swagger
 * /v1/is-signature-valid:
 *   post:
 *     summary: Check signature.
 *     description: |
 *       Check if provided signature corresponds to the provided address, resolved to the provided message.
 *
 *       Check if provided address is a valid address with, optionally, at least one entry on the ledger.
 * 
 *       Rate limits:  
 *         - *front-end* (all calls unless providing `true` *skip-ledger*): 30 calls / minute / IP (across all overhide APIs)
 *         - *back-end* (calls providing `true` *skip-ledger*): 600 calls / minute / IP (across all overhide APIs)
 *     tags:
 *       - remuneration provider
 *     requestBody:
 *       required: true
 *       content:
 *         'application/json':
 *            schema:
 *              type: object
 *              required:
 *                - signature
 *                - message
 *                - address
 *              properties:
 *                signature:
 *                  type: string
 *                  description: |
 *                    base64 encoded string of *signature* to verify
 *                message:
 *                  type: string
 *                  description: |
 *                    base64 encoded string of *message* that's signed for the *address*
 *                address:
 *                  type: string
 *                  description: |
 *                    the address (public key) of signature: a 42 character 'hex' string prefixed with '0x'
 *     parameters:
 *       - in: query
 *         name: skip-ledger
 *         required: false
 *         schema:
 *           type: boolean
 *         description: |
 *           Defaults to `false`.
 * 
 *           Controls whether the ledger should be checked for existance of transactions from this address.
 * 
 *           Setting to `true` skips the ledger check but allows *back-end* rate-limits on this API.
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: |
 *           Signature is valid.
 *       400:
 *         $ref: "#/responses/400"
 *       401:
 *         $ref: "#/responses/401"
 *       429:
 *         $ref: "#/responses/429"
 */
app.post('/v1/is-signature-valid',
  token,
  (req, res, next) => { res.locals.backend = /t/.test(req.query['skip-ledger']); next() },
  throttle,
  (req, rsp) => {
    (async () => {
      try {
        var body = req.body;
        debug('POST /v1/is-signature-valid <= %o', body);

        let address = body['address'];
        let signature = body['signature'];
        let message = body['message'];
        let skipLedger = /t/.test(req.query['skip-ledger']);
        if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
        if (!signature || typeof signature !== 'string' || ! /^[A-Za-z0-9+/=]*$/g.test(signature)) throw `invalid signature, must be base64 encoded string (${signature})`;
        if (!message || typeof message !== 'string' || ! /^[A-Za-z0-9+/=]*$/g.test(message)) throw `invalid message, must be base64 encoded string (${message})`;
        address = address.toLowerCase();
        signature = utils.atob(signature);
        message = utils.atob(message);
        if (address !== utils.recover(message, signature).toLowerCase()) {
          throw `invalid signature`;
        }
        if (!skipLedger && !await database.getError()) {
          if ((await database.getNumTransactionsByAddress(address)) == 0) {
            debug('POST /v1/is-signature-valid ERROR :: no transactions for address');
            rsp.status(400).send('no transactions for address');
            return;
          }
        }
        debug('POST /v1/is-signature-valid OK');
        rsp.status(200).send();
      }
      catch (err) {
        debug('POST /v1/is-signature-valid ERROR :: %s', String(err));
        rsp.status(400).send('invalid signature');
      }
    })();
  });

// SERVER LIFECYCLE

const server = http.createServer(app);

function onSignal() {
  log('terminating: starting cleanup');
  return Promise.all([
    database.terminate()
  ]);
}

async function onHealthCheck() {
  const dbError = await database.getError();
  const tallyCacheMetrics = tallyCache.metrics();
  const authTokenChallengeMetrics = authTokenChallengeChecker.metrics();
  const loopbackChallengeMetrics = loopbackChallengeChecker.metrics();
  const healthy = !dbError && tallyCacheMetrics.errorsDelta === 0;
  if (!healthy) {
    const reason = `dbError: ${dbError}, tallyCacheErrors: ${tallyCacheMetrics.errorsDelta}`;
    log(reason);
    throw new HealthCheckError('healtcheck failed', [reason])
  }
  let status = {
    host: os.hostname(),
    version: VERSION,
    database: 'OK',
    retarget: retarget.metrics(),
    smtp: smtp.metrics(),
    paymentGateway: paymentGateway.metrics(),
    tallyCacheMetrics: tallyCacheMetrics,
    authTokenChallengeMetrics: authTokenChallengeMetrics,
    loopbackChallengeMetrics: loopbackChallengeMetrics
  };
  return status;
}

terminus(server, {
  signal: 'SIGINT',
  healthChecks: {
    '/status.json': onHealthCheck,
  },
  onSignal
});

server.listen(PORT);