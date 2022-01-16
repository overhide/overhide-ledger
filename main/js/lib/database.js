"use strict";

const Pool = require('pg').Pool;
const log = require('./log.js').fn("database");
const event = require('./log.js').fn("database-event");
const debug = require('./log.js').debug_fn("database");

// private attribtues
const ctx = Symbol('context');

// private functions
const checkInit = Symbol('checkInit');
const logEvent = Symbol('logEvent');

/**
 * Wires up functionality we use throughout.
 * 
 * Module returns this class as object all wired-up.  Before you can use the methods you must "init" the object 
 * somewhere at process start.
 * 
 * Leverages node's module system for a sort of context & dependency injection, so order of requiring and initializing
 * these sorts of libraries matters.
 */
class Database {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (! this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  // use logging as DB event log (backup of sorts)
  //
  // @param {String} query -- to log
  // @param {*} params -- to log
  [logEvent](query, params) {   
    for (var i = 0; i < params.length; i++) {
      var param = params[i];
      query = query.replace(`$${i+1}`,`'${param}'`);
    }
    event(query);
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} pghost
   * @param {number} phport
   * @param {string} pgdatabase
   * @param {string} pguse
   * @param {string} pgpassword
   * @param {string} pgssl - true or false
   * @param {number} select_max_rows
   * @returns {Database} this
   */
  init({pghost,pgport,pgdatabase,pguser,pgpassword, pgssl, select_max_rows} = {}) {
    if (pghost == null) throw new Error("POSTGRES_HOST must be specified.");
    if (pgport == null) throw new Error("POSTGRES_PORT must be specified.");
    if (pgdatabase == null) throw new Error("POSTGRES_DB must be specified.");
    if (pguser == null) throw new Error("POSTGRES_USER must be specified.");
    if (pgpassword == null) throw new Error("POSTGRES_PASSWORD must be specified.");
    if (select_max_rows == null) throw new Error("SELECT_MAX_ROWS must be specified.");

    const db = new Pool({
      host: pghost,
      port: pgport,
      database: pgdatabase,
      user: pguser,
      password: pgpassword,
      ssl: pgssl
    });

    this[ctx] = {
      db: db,
      select_max_rows: select_max_rows
    };
    
    return this;
  }

  /**
   * Add a payee 
   * 
   * @param {string} paymentGatewayId
   * @param {string} providerAddress
   */
  async addProvider(paymentGatewayId, providerAddress) {
    this[checkInit]();
    try {
      let query = `SELECT paymentgatewayid FROM providers WHERE address = decode($1,'hex')`;
      let params = [providerAddress.slice(2)];
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount > 0) {
        throw `this public address is already registered with the ledger: ${providerAddress}`;
      }
      query = `INSERT INTO providers (paymentgatewayid, address) VALUES ($1,decode($2,'hex'))`;
      params = [paymentGatewayId,providerAddress.slice(2)];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);
    } catch (err) {
      throw `onboarding error :: ${String(err)}`;
    }
  }

  /**
   * @param {string} providerAddress 
   * @returns {string} accountId or null
   */
  async getAccountId(providerAddress) {
    this[checkInit]();
    try {
      let query = `SELECT paymentgatewayid FROM providers WHERE address = decode($1,'hex')`;
      let params = [providerAddress.slice(2)];
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        return null
      }
      debug('%s,%o <= %o', query, params, result.rows[0]);
      return result.rows[0].paymentgatewayid;
    } catch (err) {
      throw `retrieving provider failed: ${String(err)}`;
    }
  }

  /**
   * Add a transaction
   * 
   * @param {string} subscriberAddress
   * @param {string} providerAddress
   * @param {number} amount
   * @param {string} transferId
   */
  async addTransaction(subscriberAddress, providerAddress, amount, transferId, emailHash) {
    this[checkInit]();
    try {
      let query = `INSERT INTO transactions (fromaddress, toaddress, transactionts, amountusdcents, transferid, emailhash) VALUES (decode($1,'hex'),decode($2,'hex'),$3,$4,$5,decode($6,'hex'))`;
      let params = [subscriberAddress.slice(2), providerAddress.slice(2), new Date(), amount, transferId, emailHash];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);
    } catch (err) {
      throw `persisting transaction failed: ${String(err)}`;
    }
  }

  /**
   * Does email hash exist in transactions?
   * 
   * @param {string} emailHash
   * @returns {boolean} 'true' if email hash exists in transactions
   */
  async isEmailInTxs(emailHash) {
    this[checkInit]();
    try {
      let query = `SELECT EXISTS(SELECT 1 FROM transactions WHERE emailhash = decode($1,'hex'))`;
      let params = [emailHash];
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        throw `error while checking for email in transactions`
      }
      debug('%s,%o <= %o', query, params, result.rows[0]);
      return result.rows[0].exists;
    } catch (err) {
      throw `error while checking for email in transactions: ${String(err)}`;
    }
  }

  /**
   * Does accountId exist and does it have transactions?
   * 
   * @param {string} accountId
   * @returns {boolean} 'true' if email hash exists in transactions
   */
  async isAccountIdInTxs(accountId) {
    this[checkInit]();
    try {
      let query = `SELECT EXISTS(SELECT 1 FROM transactions WHERE toaddress in (SELECT address FROM providers WHERE paymentgatewayid = $1))`;
      let params = [accountId];
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        throw `error while checking for provider existence and related transactions`
      }
      debug('%s,%o <= %o', query, params, result.rows[0]);
      return result.rows[0].exists;
    } catch (err) {
      throw `error while checking for provider existence and related transactions: ${String(err)}`;
    }
  }

  /**
   * @param {string} query - to use to select IDs
   * @param {Array} params - params for query to selct IDs
   * @returns {Array} of transaction objects limited by 'select_max_rows' 
   */
  async getTransactionsByQuery(query, params) {
    this[checkInit]();
    try {
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        return [];
      }
      debug('%s,%o <= %o', query, params, result.rows);
      result = result.rows.map(row => {
        return {
          amountusdcents: row.amountusdcents,
          transactionts: row.transactionts,
          from: `0x${row.fromaddress.toString('hex')}`,
          to: `0x${row.toaddress.toString('hex')}`
        };
      })
      return result;
    } catch (err) {
      debug(`Error while checking for transactions: ${String(err)}`)
      throw `Error while checking for transactions.`;
    }
  }

  /**
   * @param {string} from - subscriber address
   * @param {string} to - provider address
   * @returns {Array} of transaction objects limited by 'select_max_rows' 
   */
  async getLatestTransactionsFromTo(from, to) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE (fromaddress = decode($1,'hex') AND toaddress = decode($2,'hex')) AND void = false ORDER BY transactionts DESC LIMIT $3`;
    let params = [from.slice(2), to.slice(2), this[ctx].select_max_rows];
    return this.getTransactionsByQuery(query, params);
  }

  /**
   * @param {string} address - for subscriber
   * @returns {Array} of transaction objects limited by 'select_max_rows' 
   */
  async getLatestTransactionsByAddress(address) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE (fromaddress = decode($1,'hex') OR toaddress = decode($1,'hex')) AND void = false ORDER BY transactionts DESC LIMIT $2`;
    let params = [address.slice(2), this[ctx].select_max_rows];
    return this.getTransactionsByQuery(query, params);
  }

  /**
   * @param {string} emailHash - for subscriber
   * @returns {Array} of transaction objects limited by 'select_max_rows' 
   */
  async getLatestTransactionsByEmailHash(emailHash) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE emailhash = decode($1,'hex') AND void = false ORDER BY transactionts DESC LIMIT $2`;
    let params = [emailHash, this[ctx].select_max_rows];
    return this.getTransactionsByQuery(query, params);
  }

  /**
   * @param {string} accountId - for provider
   * @returns {Array} of transaction objects limited by 'select_max_rows' 
   */
  async getLatestTransactionsByAccountId(accountId) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE toaddress in (SELECT address FROM providers WHERE paymentgatewayid = $1) AND void = false ORDER BY transactionts DESC LIMIT $2`;
    let params = [accountId, this[ctx].select_max_rows];
    return this.getTransactionsByQuery(query, params);
  }

/**
 * @param {string} fromAddress - for subscriber
 * @param {string} toAddress - for provider
 * @param {number} maxMostRecent
 * @param {Date} since - string to pass into Date constructor
 * @param {Date} asOf - string to pass into Date constructor
 * @param {boolean} tallyOnly
 * @returns {{tally:.., transactions:[{transaction-value:..,transaction-date:..}], 'as-of':..}} where the 'transactions' array is only filled if not 'tallyOnly'.
 */
  async getTransactions({ fromAddress, toAddress, maxMostRecent = null, since = null, asOf = null, tallyOnly = false }) {
    this[checkInit]();
    let query_mmr = '';
    let query_since = `${since ? `AND transactionts >= '${since.toISOString()}'` : ''} ${asOf ? `AND transactionts <= '${asOf.toISOString()}'` : ''}`;
    try {
      if (maxMostRecent) {
        query_mmr = `LIMIT ${maxMostRecent}`;
      }
      let query = `SELECT sum(amountusdcents) AS tally FROM transactions WHERE fromAddress = decode($1,'hex') AND toaddress = decode($2,'hex') AND void = false ${query_since} ${query_mmr}`;
      let params = [fromAddress.slice(2), toAddress.slice(2)];
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query, params);
      if (result.rowCount == 0) {
        return { tally: 0, transactions: [], 'as-of': (new Date()).toISOString() };
      }
      let tally = result.rows[0].tally;
      debug('%s,%o <= %o', query, params, tally);
      if (tallyOnly) {
        return {tally: tally, 'as-of': (new Date()).toISOString()};
      }
      query = `SELECT amountusdcents, transactionts FROM transactions WHERE fromAddress = decode($1,'hex') AND toaddress = decode($2,'hex') AND void = false ${query_since} ORDER BY transactionts DESC ${query_mmr}`;
      debug('%s,%o', query, params);
      result = await this[ctx].db.query(query, params);
      if (result.rowCount == 0) {
        return { tally: 0, transactions: [], 'as-of': (new Date()).toISOString() };
      }
      debug('%s,%o <= %o', query, params, result.rows);
      result = result.rows.map(row => {
        return {
          "transaction-value": row.amountusdcents,
          "transaction-date": row.transactionts
        };
      })
      return {tally: tally, transactions: result, 'as-of': (new Date()).toISOString()};
    } catch (err) {
      debug(`Error while getting transactions: ${String(err)}`)
      throw `Error while getting transactions.`;
    }
  }

  /**
   * @param {string} query - to use to select IDs
   * @param {Array} params - params for query to selct IDs
   * @returns {number} of all transactions
   */
  async getNumTransactionsByQuery(query, params) {
    this[checkInit]();
    try {
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      return result.rows[0].count;
    } catch (err) {
      debug(`Error while checking for transactions: ${String(err)}`)
      throw `Error while checking for transactions.`;
    }
  }

  /**
   * @param {string} from - subscriber address
   * @param {string} to - provider address
   * @returns {number} of all transactions
   */
  async getNumTransactionsFromTo(from, to) {
    this[checkInit]();
    let query = `SELECT count(1) FROM transactions WHERE (fromaddress = decode($1,'hex') AND toaddress = decode($2,'hex')) AND void = false`;
    let params = [from.slice(2), to.slice(2)];
    return this.getNumTransactionsByQuery(query, params);
  }

  /**
   * @param {string} address - for subscriber
   * @returns {number} of all transactions
   */
  async getNumTransactionsByAddress(address) {
    this[checkInit]();
    let query = `SELECT count(1) FROM transactions WHERE (fromaddress = decode($1,'hex') OR toaddress = decode($1,'hex')) AND void = false`;
    let params = [address.slice(2)];
    return this.getNumTransactionsByQuery(query, params);
  }

  /**
   * @param {string} emailHash - for subscriber
   * @returns {number} of all transactions
   */
  async getNumTransactionsByEmailHash(emailHash) {
    this[checkInit]();
    let query = `SELECT count(1) FROM transactions WHERE emailhash = decode($1,'hex') AND void = false`;
    let params = [emailHash];
    return this.getNumTransactionsByQuery(query, params);
  }

  /**
   * @param {string} accountId - for provider
   * @returns {Array} of transaction objects
   */
  async getNumTransactionsByAccountId(accountId) {
    this[checkInit]();
    let query = `SELECT count(1) FROM transactions WHERE toaddress in (SELECT address FROM providers WHERE paymentgatewayid = $1) AND void = false`;
    let params = [accountId];
    return this.getNumTransactionsByQuery(query, params);
  }

  /**
   * @param {string} emailHash 
   * @param {string} transactionId 
   * @param {string} address
   */
  async retargetByEmailHash(emailHash, transactionId, address) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE emailhash = decode($1,'hex') and void = false`;
    let params = [emailHash];
    try {
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        throw `No transactions found.`
      }
      let ids = '(' + result.rows.map((rec) => {
        return rec.id
      }).toString() + ')';
      debug('%s,%o <= %o', query, params, ids);
      
      query = `INSERT INTO transactions(fromaddress,toaddress,transactionts,amountusdcents,transferid,emailhash,void)
                 WITH o AS (SELECT toaddress, transactionts, amountusdcents, emailhash, void FROM transactions WHERE id in ${ids}),
                      n AS (SELECT decode($1,'hex') as fromaddress, trim($2) as transferId)
               SELECT n.fromaddress,o.toaddress,o.transactionts,o.amountusdcents,n.transferid,o.emailhash,o.void from o,n`;
      params = [address.slice(2), transactionId];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);

      query = `UPDATE transactions SET void = true WHERE id in ${ids}`;
      params = [];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);

    } catch (err) {
      debug(`Error while re-targeting by email hash: ${String(err)}`)
      throw `Error while re-targeting by email.`;
    }
  }

  /**
   * @param {string} accountId - for provider
   * @param {string} transactionId 
   * @param {string} address
   */
  async retargetByAccountId(accountId, transactionId, address) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE toaddress in (SELECT address FROM providers WHERE paymentgatewayid = $1) AND void = false`;
    let params = [accountId];
    try {
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        throw `No transactions found.`
      }
      let ids = '(' + result.rows.map((rec) => {
        return rec.id
      }).toString() + ')';
      debug('%s,%o <= %o', query, params, ids);
      
      query = `INSERT INTO transactions(fromaddress,toaddress,transactionts,amountusdcents,transferid,emailhash,void)
                 WITH o AS (SELECT fromaddress, transactionts, amountusdcents, emailhash, void FROM transactions WHERE id in ${ids}),
                      n AS (SELECT decode($1,'hex') as toaddress, trim($2) as transferId)
               SELECT o.fromaddress,n.toaddress,o.transactionts,o.amountusdcents,n.transferid,o.emailhash,o.void from o,n`;
      params = [address.slice(2), transactionId];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);

      query = `UPDATE transactions SET void = true WHERE id in ${ids}`;
      params = [];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);

    } catch (err) {
      debug(`Error while re-targeting by account ID: ${String(err)}`)
      throw `Error while re-targeting by account ID.`;
    }
  }

  /**
   * @param {string} from - for subscriber
   * @param {string} to - for provider
   * @param {string} address
   */
  async voidFromTo(from, to) {
    this[checkInit]();
    let query = `SELECT * FROM transactions WHERE (fromaddress = decode($1,'hex') AND toaddress = decode($2,'hex')) AND void = false`;
    let params = [from.slice(2), to.slice(2)];
    try {
      debug('%s,%o', query, params);
      let result = await this[ctx].db.query(query,params);
      if (result.rowCount == 0) {
        throw `No transactions found.`
      }
      let ids = '(' + result.rows.map((rec) => {
        return rec.id
      }).toString() + ')';
    
      query = `UPDATE transactions SET void = true WHERE id in ${ids}`;
      params = [];
      debug('%s,%o', query, params);
      await this[ctx].db.query(query,params);
      this[logEvent](query, params);

    } catch (err) {
      debug('Error while voiding from %s to %s: %s', from, to, String(err));
      throw `Error while voiding from ${from} to ${to}.`;
    }
  }

  /**
   * Call when process is exiting.
   */
  async terminate() {
    this[checkInit]();
    debug(`terminating`);
    await this[ctx].db.end();
  }

  /**
   * @returns {string} null if no error else error string if problem using DB from connection pool.
   */
  async getError() {
    this[checkInit]();
    try {
      var client = await this[ctx].db.connect();
      const res = await client.query('SELECT NOW()');
      return null;
    } catch (err) {
      log(`not healthy: ${String(err)}`);
      return String(err);
    } finally {
      if (client) client.release()
    }    
  }
}

module.exports = (new Database());