"use strict";

const mailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const log = require('./log.js').fn("smtp");
const debug = require('./log.js').debug_fn("smtp");

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
class Smtp {
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
   * @param {string} smtp_host
   * @param {string} smtp_port
   * @param {string} smtp_secure
   * @param {string} smtp_user
   * @param {string} smtp_password
   * @param {string} uri
   * @param {string} mailer_from
   * @returns {Smtp} this
   */
  init({smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, uri, mailer_from} = {}) {
    if (smtp_host == null) throw new Error("SMTP_HOST must be specified.");
    if (smtp_port == null) throw new Error("SMTP_PORT must be specified.");
    if (smtp_secure == null) throw new Error("SMTP_SECURE must be specified.");
    if (smtp_user == null) throw new Error("SMTP_USER must be specified.");
    if (smtp_password == null) throw new Error("SMTP_PASSWORD must be specified.");
    if (uri == null) throw new Error("URI must be specified.");
    if (mailer_from == null) throw new Error("MAILER_FROM must be specified.");

    this[ctx] = {
      mailer: mailer.createTransport({
        host: smtp_host,
        port: smtp_port,
        secure: /[tT]/.test(smtp_secure),
        auth: {
          user: smtp_user,
          pass: smtp_password
        }}),
        tls: {
          ciphers: 'SSLv3'
        },
        uri: uri,
        mailer_from: mailer_from
    };

    this[ctx].metrics = {
      numErrors: 0,
      lastError: ''
    };

    return this;
  }

  /**
   * Add a payee 
   * 
   * @param {string} code
   * @param {string} id - to include in email link
   * @param {string} templateName to use for email
   * @returns {string} the paymentGatewayId from payment gateway
   */
  async sendRetarget(email, id, templateName) {
    this[checkInit]();
    debug('perparing email to %s (id: %s)', email, id);
    let url = `${this[ctx].uri}/v1/retarget/${id}`;
    debug(`sending subscriber retarget: ${url}`);
    let messageHtml = await ejs.renderFile(__dirname + `${path.sep}${templateName}.html`, {email: email, url: url});
    let messageTxt = await ejs.renderFile(__dirname + `${path.sep}${templateName}.txt`, {email: email, url: url});
    try {
      await this[ctx].mailer.sendMail({
        from: this[ctx].mailer_from,
        to: email,
        subject: 'overhide-ledger transaction re-targeting',
        text: messageTxt,
        html: messageHtml
      });
    } catch (err) {
      let msg = `email sending to ${email} :: ERROR: ${err}`;
      debug(msg);
      this[ctx].metrics.numErrors++;
      this[ctx].metrics.lastError = err;
      throw new Error(msg);
    }
    debug('retarget email sent to %s', email);
  }

  /**
   * @returns {Object} metrics object.
   */
  metrics() {
    this[checkInit]();
    return this[metrics];
  }
}

module.exports = (new Smtp());