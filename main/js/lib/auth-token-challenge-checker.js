"use strict";

const debug = require('./log.js').debug_fn("authTokenChallenge");
const log = require('./log.js').fn("authTokenChallenge");
const utils = require('./utils.js');
const crypto = require('./crypto.js');

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
class AuthTokenChallengeChecker {
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
   * @param {string} salt - salt for token tokenizing
   * @returns {Challenge} this
   */
  init({salt} = {}) {

    this[ctx] = {
      salt: salt
    };


    this[metrics] = {
      errors: 0,
      errorsLastCheck: 0,
      errorsDelta: 0,
      validTokens: 0,
      invalidTokens: 0,
      noSignature: 0
    };   
    
    return this;
  }

  /**
   * Check passed in request for a valid signature query parameter.   
   * @param {}  req
   * @param {stirng} address -- to check against
   * @returns {boolean} -- truthy if signature valid for the value of the request's authorization header and
   *                       passed in `fromAddress` query parameter.
   */
   async isValidTokenAuthZ(req, address) {
    this[checkInit]();

    const signature = req.params['signature'];
    const message = req.header['Authorization'];

    return this.checkSignature(address, signature, message.toString('base64'));
   }

  /**
   * Validate the signature.
   * @param {string} address - 0x.. prefixed address
   * @param {string} signature - base64 encoded signature of the challenge from `getChallenge`
   * @param {string} message - the challenge message: bearer token value
   * @returns {boolean} response or calls next() to continue chain
   */
  async checkSignature(address, signature, message) {

    if (!signature) {
      this[metrics].noSignature++;
      return false;  
    }

    try {
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      if (!signature || typeof signature !== 'string' || ! /^[A-Za-z0-9+/=]*$/g.test(signature)) throw `invalid signature, must be base64 encoded string (${signature})`;
      if (!message || typeof message !== 'string') throw `invalid Authorization header (${message})`;
      address = address.toLowerCase();
      signature = Buffer.from(signature, "base64").toString("ascii");
      message = Buffer.from(message, "base64").toString("ascii");
      if (address !== utils.recover(message, signature).toLowerCase()) {
        throw `signature doesn't match passed-in address (from-address:${address})`;
      }
      this[metrics].validTokens++;
      return true;
    } catch (err) {
      debug('isValidTokenAuthZ DENIED :: %s', err);
    }      

    this[metrics].invalidTokens++;
    return false;  
}

  /**
   * @returns {{errors:.., errorsDelta:..}} metrics object.
   */
   metrics() {
    this[checkInit]();
    this[metrics].errorsDelta = this[metrics].errors - this[metrics].errorsLastCheck;
    this[metrics].errorsLastCheck = this[metrics].errors;
    return this[metrics];
  }    
}

module.exports = (new AuthTokenChallengeChecker());