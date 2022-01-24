"use strict";

const debug = require('./log.js').debug_fn("loopbackChallenge");
const log = require('./log.js').fn("loopbackChallenge");
const utils = require('./utils.js');
const crypto = require('./crypto.js');

// private attribtues
const ctx = Symbol('context');
const metrics = Symbol('metrics');

// private functions
const checkInit = Symbol('checkInit');
const checkChallenge = Symbol('checkChallenge');

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
      validChallenges: 0,
      invalidChallenges: 0,
      noSignature: 0
    };   
    
    return this;
  }

  /**
   * Get a challenge phrase.
   * @returns {string} challenge phrase
   */
  getChallenge() {
    const encrypted = crypto.symmetricEncrypt((new Date()).toISOString(), this[ctx].salt);
    const encoded = utils.btoa(encrypted);
    return encoded;
  }

  /**
   * @param {string} challenge - the challenge from `getChallenge`
   * @returns {boolean} whether challenge is a valid challenge
   */
  [checkChallenge](challenge) {
    try {
      const decoded = new Buffer(challenge, 'base64');
      const decrypted = crypto.symmetricDecrypt(decoded, this[ctx].salt);
      const now = (new Date()).getTime();
      const timestamp = (new Date(decrypted)).getTime();
      if (!timestamp) return false;
      const diffMinutes = ((now - timestamp) / 1000) / 60;
      if (diffMinutes <= 5) return true;
    } catch (err) {
      debug('checkChallenge DENIED :: challenge:%s', challenge);
      return false;
    }
  }

  /**
   * Validate the signature.
   * @param {string} address - 0x.. prefixed address
   * @param {string} signature - base64 encoded signature of the challenge from `getChallenge`
   * @param {string} message - the challenge message from `getChallenge`
   * @returns {boolean} response or calls next() to continue chain
   */
  async checkSignature(address, signature, message) {
    this[checkInit]();

    try {
      if (!address || typeof address !== 'string' || address.length != 42) throw `invalid address, must be hex encoded 42 character string starting with '0x' (${address})`;
      if (!signature || typeof signature !== 'string' || ! /^[A-Za-z0-9+/=]*$/g.test(signature)) throw `invalid signature, must be base64 encoded string (${signature})`;
      if (!message || typeof message !== 'string') throw `invalid challenge message (${message})`;

      address = address.toLowerCase();
      signature = utils.atob(signature);
      message = message.replace(/ /g, '+');
      debug(`JTN:: ${address} ${message}`);

      const targetAddress = (await utils.recover(message, signature)).toLowerCase();
      if (address.toLowerCase() !== targetAddress) {
        throw `signature doesn't match passed-in address (address:${address.toLowerCase()})(targetAddress:${targetAddress})`;
      }

      if (!(this[checkChallenge](message))) {
        throw `challenge message didn't pass validation`;
      }

      this[metrics].validChallenges++;
      return true;
    } catch (err) {
      debug('checkTokenAuthZ DENIED :: %s', err);
    }      

    this[metrics].invalidChallenges++;
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

module.exports = (new LoopbackChallengeChecker());