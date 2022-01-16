"use strict";

const Keyv = require('keyv');
const uuid = require('uuid');
const smtp = require('./smtp.js');
const debug = require('./log.js').debug_fn("retarget");
const log = require('./log.js').fn("retarget");

const KEYV_KEY_FOR_LATEST_ID = 'LATEST_ID'; // a bit of instrumentation for testing.

// private attribtues
const ctx = Symbol('context');
const metrics = Symbol('metrics');

// private functions
const checkInit = Symbol('checkInit');
const getKeyv = Symbol('getKeyv');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Retarget {
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
   * @param {string} keyv_uri - 'keyv' adapter uri for key-value abstraction 'keyv'
   * @param {string} keyv_retarget_namespace - namespace to use in 'keyv' data store for retargetting
   * @param {number} keyv_retarget_ttl_millis - time to live in milliseconds for each email based retarget
   * @param {boolean} instrumented - 'true' if behaviour should be instrumented for testing (e.g. running smoke test)
   * @returns {Auth} this
   */
  init({ keyv_uri, keyv_retarget_namespace, keyv_retarget_ttl_millis, instrumented}) {
    if (!keyv_uri) log("WARNING:  KEYV_URI not be specified--using in-memory store");
    if (!keyv_retarget_namespace) throw new Error("KEYV_RETARGET_NAMESPACE must be specified.")

    this[ctx] = {
      uri: keyv_uri,
      namespace: keyv_retarget_namespace,
      ttl: keyv_retarget_ttl_millis,
      instrumented: instrumented
    };

    this[ctx].keyv = this[getKeyv]();

    this[ctx].metrics = {
      subscriberRetargetMailsSent: 0,
      providerRetargetMailsSent: 0
    };

    return this;
  }

  // @return A 'keyv' datastore instance for authenticated users
  [getKeyv]() {
    return new Keyv({
      uri: typeof this[ctx].uri === 'string' && this[ctx].uri,
      store: typeof this[ctx].uri !== 'string' && this[ctx].uri,
      namespace: this[ctx].namespace
    });
  }

  /**
   * Start retargeting subscriber by email
   * 
   * @param {string} email
   * @param {string} emailHash
   * @param {string} address
   */
  async retargetSubscriber(email, emailHash, address) {
    this[checkInit]();
    debug('begin retarget for %s', email);
    let id = `${emailHash}-${uuid()}`.toLowerCase();
    let value = {
      email: email,
      emailHash: emailHash,
      address: address
    };
    await this[ctx].keyv.set(id,value,this[ctx].ttl);
    if (this[ctx].instrumented) await this[ctx].keyv.set(KEYV_KEY_FOR_LATEST_ID, id);
    await smtp.sendRetarget(email, id, 'subscriber-email');
    this[ctx].metrics.subscriberRetargetMailsSent++;
    debug('retarget mail sent for %s', email);
  }

  /**
   * Start retargeting provider by email
   * 
   * @param {string} email
   * @param {string} emailHash
   * @param {string} address
   * @param {string} accountId
   */
  async retargetProvider(email, emailHash, address, accountId) {
    this[checkInit]();
    debug('begin retarget for %s', email);
    let id = `${emailHash}-${uuid()}`.toLowerCase();
    let value = {
      email: email,
      emailHash: emailHash,
      address: address,
      accountId: accountId
    };
    await this[ctx].keyv.set(id,value,this[ctx].ttl);
    if (this[ctx].instrumented) await this[ctx].keyv.set(KEYV_KEY_FOR_LATEST_ID, id);
    await smtp.sendRetarget(email, id, 'provider-email');
    this[ctx].metrics.providerRetargetMailsSent++;
    debug('retarget mail sent for %s', email);
  }

  /**
   * Retarget acknowledged with id
   * 
   * @param {string} id 
   * @returns {emailHash:..,address:..}
   */
  async retargetAcknowledged(id) {
    this[checkInit]();
    let val = await this[ctx].keyv.get(id);
    if (val) {
      debug('retarget acknowledged: %s', id);
      return val;
    } else {
      debug('retarget acknowledge FAIL (not found): %s', id);
      throw 'Invalid retarget link.';
    }
  }

  /**
   * Retarget finalized with id: id removed.
   * 
   * @param {string} id 
   * @returns {emailHash:..,address:..}
   */
  async retargetFinalized(id) {
    this[checkInit]();
    let val = await this[ctx].keyv.get(id);
    if (val) {
      debug('retarget finalized: %s', id);
      await this[ctx].keyv.delete(id);
      return val;
    } else {
      debug('retarget finalize FAIL (not found): %s', id);
      throw 'Invalid retarget link.';
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

module.exports = (new Retarget());