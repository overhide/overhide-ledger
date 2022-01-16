"use strict";

const debug = require('./log.js').debug_fn("loopbackChallenge");
const log = require('./log.js').fn("loopbackChallenge");
const utils = require('./lib/utils.js');
const crypto = require('./lib/crypto.js');

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
class LoopbackChallengeChecker {
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
   * Get a challenge phrase.
   * @returns {string} challenge phrase
   */
  async getChallenge() {

  }

  /**
   * middleware to check passed in signature query parameter if signing a loopback challenge previously requested.
   * @param {}  req
   * @param {} res
   * @param {} next
   * @returns {} response or calls next() to continue chain
   */
   async checkSignature(req, res, next) {
    this[checkInit]();

    const address = req.params['fromAddress'];
    if (!address || typeof address !== 'string' || address.length != 42) {
      const err = `invalid address, checkTokenAuthZ can only be used with requests having fromAddress parameter that is a hex encoded 42 character string starting with '0x' (${address})`;
      debug('checkTokenAuthZ DENIED :: %s', err);
      rsp.status(400).send(String(err));
      return;
    }

    const signature = req.params['signature'];
    const message = req.header['Authorization'];

    if (!signature) {
      this[metrics].noSignature++;

      if (this[ctx].isLedgerPrivate) {
        res.status(401).send('No `signature` query parameter when using v2 API against a private ledger.');
        return;
      } else {
        next();
        return;  
      }
    }

    try {
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      if (!signature || typeof signature !== 'string' || ! /^[A-Za-z0-9+/=]*$/g.test(signature)) throw `invalid signature, must be base64 encoded string (${signature})`;
      if (!message || typeof message !== 'string') throw `invalid Authorization header (${message})`;
      address = address.toLowerCase();
      signature = Buffer.from(signature, "base64").toString("ascii");
      if (address !== utils.recover(message, signature).toLowerCase()) {
        throw `signature doesn't match passed-in address (from-address:${address})`;
      }
      this[metrics].validTokens++;
      next();
      return;
    } catch (err) {
      debug('checkTokenAuthZ DENIED :: %s', err);
    }      

    this[metrics].invalidTokens++;
    if (this[ctx].isLedgerPrivate) {
      res.status(401).send('Authorization header has invalid token when using v2 API against a private ledger.');
      return;
    } else {
      next();
      return;  
    }
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

module.exports = (new LoopbackChallengeChecker());