"use strict";

const qs = require('qs');
const debug = require('./log.js').debug_fn("recaptcha");
const fetch = require('node-fetch');

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Recaptcha {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} recaptcha_uri
   * @param {string} recaptcha_secret_key
   * @returns {Recaptcha} this
   */
  init({recaptcha_uri, recaptcha_secret_key} = {}) {
    if (recaptcha_uri == null) throw new Error("RECAPTCHA_URI must be specified.");
    if (recaptcha_secret_key == null) throw new Error("RECAPTCHA_SECRET_KEY must be specified.");

    this[ctx] = {
      secretKey: recaptcha_secret_key,
      uri: recaptcha_uri
    };
    return this;
  }

  /**
   * Add a payee 
   * 
   * @param {string} code
   * @returns {string} the paymentGatewayId from payment gateway
   */
  async verify(ip, result) {
    this[checkInit]();
    var params = {
      secret: this[ctx].secretKey,
      response: result,
      remoteip: ip
    };
    var url = this[ctx].uri;
    debug(`verifying, POSTing to %s for auth`, url);
    try {
      let response = await fetch(url, {
        method: 'POST', headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        }, 
        body: qs.stringify(params)
      });
      if (response.status != 200) {
        let text = await response.text();
        debug(`POST %s code: %s error: %s`, url, response.status, text);
        throw new Error(`Request to verify error: ${text}`);
      }
      let result = await response.json();
      let success = result.success;
      if (!success) {
        debug('POST %s: error(s): %o', url, result.error_codes);
        throw new Error(`Recaptcha error(s): ${JSON.stringify(result.error_codes)}`);
      }
      debug('POST %s: OK - %o', url, result);
    } catch (err) {
      throw `Stripe interaction failed: ${err.toString()}`;
    }
  }
}

module.exports = (new Recaptcha());