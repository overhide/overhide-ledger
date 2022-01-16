"use strict";

const web3 = new (require('web3'))();

/**
 * Return 'amount' of cents as a fixed(2) dollars string.
 * 
 * @param {string|number} amount - cents
 * @returns {string} dollars
 */
function fixCentsToDollars(amount) {
  amount = String(amount);
  let dollars = amount.slice(0,-2);
  let cents = amount.slice(-2);
  if (!cents) cents = '0';
  if (!dollars) dollars = '0';
  cents = cents.length == 1 ? '0' + cents : cents;
  return `${dollars}.${cents}`;
}

/**
 * Recover original signing address from signature for message.
 * 
 * @param {string} message - passed into 'sign'
 * @param {string} signature - returned from 'sign'
 * @returns {string} address - passed into 'sign'
 */
function recover(message, signature) {
  return web3.eth.accounts.recover(message, signature);
}

/**
 * @param {string} uri - to modify with param
 * @param {string} key - of new param being added
 * @param {string} value - of new param being added
 * @returns {string} the new URI
 */
function addQueryParam(uri, key, value) {
  let parts = uri.split('#');
  if (!parts.length) throw `#addQueryParam, bad URI (uri:${uri})`;
  if (/\?/.test(parts[0])) {
    parts[0] = `${parts[0]}&${key}=${value}`;
  } else {
    parts[0] = `${parts[0]}?${key}=${value}`;
  }
  return parts.join('#');
}

/**
 * @param {string} what - base64 string to convert text
 */
function atob(what) {
  return Buffer.from(what, 'base64').toString();
}

/**
 * @param {string} what - text to convert to base64
 */
function btoa(what) {
  return Buffer.from(what).toString('base64');
}

module.exports = {
  fixCentsToDollars: fixCentsToDollars,
  recover: recover,
  addQueryParam: addQueryParam,
  atob: atob,
  btoa: btoa
}