"use strict";

const stripe = require('stripe')
const qs = require('qs');
const debug = require('./log.js').debug_fn("paymentGateway");
const fetch = require('node-fetch');

// private attribtues
const ctx = Symbol('context');
const metrics = Symbol('metrics');

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
class PaymentGateway {
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
   * @param {string} stripe_publishable_key
   * @param {string} stripe_secret_key
   * @param {string} stripe_oauth_url
   * @param {number} stripe_minimum_amount
   * @param {number} our_processing_fee_cents
   * @param {string} our_processing_currency
   * @returns {PaymentGateway} this
   */
  init({stripe_publishable_key, stripe_secret_key, stripe_oauth_token_url,stripe_minimum_amount,our_processing_fee_cents,our_processing_currency} = {}) {
    if (stripe_publishable_key == null) throw new Error("STRIPE_PUBLISHABLE_KEY must be specified.");
    if (stripe_secret_key == null) throw new Error("STRIPE_SECRET_KEY must be specified.");
    if (stripe_oauth_token_url == null) throw new Error("STRIPE_OAUTH_TOKEN_URL must be specified.");
    if (stripe_minimum_amount == null) throw new Error("STRIPE_MINIMUM_AMOUNT must be specified.");
    if (our_processing_fee_cents == null) throw new Error("OUR_PROCESSING_FEE_CENTS must be specified.");
    if (our_processing_currency == null) throw new Error("OUR_PROCESSING_CURRENCY must be specified.");

    this[ctx] = {
      api: stripe(stripe_secret_key),
      oauth_url: stripe_oauth_token_url,
      secretKey: stripe_secret_key,
      publishableKey: stripe_publishable_key,
      minimum_amount_cents: stripe_minimum_amount * 100,
      fee: our_processing_fee_cents,
      currency: our_processing_currency
    };

    this[ctx].metrics = {
      addPayeeAttempt: 0,
      addPayeeSuccess: 0,
      addPayeeLastError: '',
      addPayeeLastErrorTime: null,
      shuntAttempt: 0,
      shuntSuccess: 0,
      shuntLastError: '',
      shuntLastErrorTime: null,
      getEmailAttempt: 0,
      getEmailSuccess: 0,
      getEmailLastError: '',
      getEmailLastErrorTime: null,
      retargetFeeAttempt: 0,
      retargetFeeSuccess: 0,
      retargetFeeLastError: '',
      retargetFeeLastErrorTime: null
    };

    return this;
  }

  /**
   * Add a payee 
   * 
   * @param {string} code
   * @returns {string} the paymentGatewayId from payment gateway
   */
  async addPayee(code) {
    this[checkInit]();
    this[ctx].metrics.addPayeeAttempt++;
    var params = {
      client_secret: this[ctx].secretKey,
      code: code,
      grant_type: 'authorization_code'
    };
    var url = this[ctx].oauth_url;
    debug(`adding payee to Stripe, POSTing to %s for auth`, url);
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
        throw new Error(`Request to stripe error: ${text}`);
      }
      let result = await response.json();
      if ('error' in result) {
        debug('POST %s: error: %s', url, result.error_description);
        throw new Error(`Stripe error: ${result.error_description}`);
      }
      debug('POST %s: OK - added payee to Stripe - %o', url, result);
      let paymentGatewayId = result.stripe_user_id;
      this[ctx].metrics.addPayeeSuccess++;
      return paymentGatewayId;
    } catch (err) {
      this[ctx].metrics.addPayeeLastError = err.toString();
      this[ctx].metrics.addPayeeLastErrorTime = (new Date()).toISOString();
      throw `Stripe interaction failed: ${err.toString()}`;
    }
  }

  /**
   * Shunt a payment
   * 
   * @param {string} paymentGatewayToken
   * @param {string} accountId
   * @param {number} amountCents
   * @param {string} description
   * @returns {{transferId:..,email:..}} from Stripe
   */
  async shunt(paymentGatewayToken, accountId, amountCents, description) {
    this[checkInit]();
    this[ctx].metrics.shuntAttempt++;
    try {
      debug(`shunting payment to Stripe (${paymentGatewayToken},${accountId},${amountCents})`);
      if (amountCents < this[ctx].minimum_amount_cents) throw `minimum amount not met`;
      let result = await this[ctx].api.charges.create({
        amount: amountCents,
        currency: this[ctx].currency,
        source: paymentGatewayToken,
        application_fee: this[ctx].fee,
        description: description
      }, {
        stripe_account: accountId
      });
      this[ctx].metrics.shuntSuccess++;
      return {transferId:result.id, email: result.source.name};
    } catch (err) {
      this[ctx].metrics.shuntLastError = err.toString();
      this[ctx].metrics.shuntLastErrorTime = (new Date()).toISOString();
      throw `shunting payment to Stripe failed: ${err.toString()}`;
    }
  }

  /**
   * Retrieve email from Stripe for account.
   * 
   * @param {string} accountId 
   * @returns {string} email address
   */
  async getEmailForAccount(accountId) {
    this[checkInit]();
    this[ctx].metrics.getEmailAttempt++;
    try {
      debug(`getting email address from Stripe (${accountId})`);
      let result = await this[ctx].api.accounts.retrieve(accountId);
      this[ctx].metrics.getEmailSuccess++;
      debug(`getting email address from Stripe (${accountId}) <= ${result.email}`);
      return result.email;
    } catch (err) {
      this[ctx].metrics.getEmailLastError = err.toString();
      this[ctx].metrics.getEmailLastErrorTime = (new Date()).toISOString();
      throw `getting email address from Stripe failed: ${err.toString()}`;
    }
  }

  /**
   * Process re-target fee
   * 
   * @param {string} paymentGatewayToken
   * @param {number} amountCents
   * @param {string} description
   * @returns {string} transferId
   */
  async collectRetargetFee(paymentGatewayToken, amountCents, description) {
    this[checkInit]();
    this[ctx].metrics.retargetFeeAttempt++;
    try {
      debug(`collecting retarget fee (${paymentGatewayToken},${amountCents})`);
      if (amountCents < this[ctx].minimum_amount_cents) throw `minimum amount not met`;
      let result = await this[ctx].api.charges.create({
        amount: amountCents,
        currency: this[ctx].currency,
        source: paymentGatewayToken,
        description: description
      });
      this[ctx].metrics.retargetFeeSuccess++;
      return result.id;
    } catch (err) {
      this[ctx].metrics.retargetFeeLastError = err.toString();
      this[ctx].metrics.retargetFeeLastErrorTime = (new Date()).toISOString();
      throw `collecting retarget fee failed: ${err.toString()}`;
    }
  }

  /**
   * @returns {Object} metrics object.
   */
  metrics() {
    this[checkInit]();
    return this[metrics];
  }
}

module.exports = (new PaymentGateway());