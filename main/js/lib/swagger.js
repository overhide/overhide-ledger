"use strict";

const path = require('path');
const jsyaml = require('js-yaml');
const swaggerJSDoc = require('swagger-jsdoc');

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
class Swagger {
  constructor() {
    this[ctx] = null;
  }

  // ensure this is initialized
  [checkInit]() {
    if (!this[ctx]) throw new Error('library not initialized, call "init" when wiring up app first');
  }

  /**
   * Initialize this library: this must be the first method called somewhere from where you're doing context & dependency
   * injection.
   * 
   * @param {string} base_url - URI at which Swagger docs are being served
   * @param {string} swagger_endpoints_path - path to file with annotated endpoints for more API definitions
   * @param {string} uri
   * @param {string} our_processing_currency
   * @param {boolean} isLedgerPrivate
   * @returns {Swagger} this
   */
  init({ base_url, swagger_endpoints_path, uri, our_processing_currency, isLedgerPrivate } = {}) {
    if (base_url == null) throw new Error("URL must be specified.");
    if (swagger_endpoints_path == null) throw new Error("Swagger endpoints_path must be specified.");
    if (uri == null) throw new Error("URI must be specified.");

    this[ctx] = {
      base_url: base_url,
      path: swagger_endpoints_path,
      uri: uri,
      currency: our_processing_currency,
      isLedgerPrivate: isLedgerPrivate
    };
    return this;
  }

  /**
   * @returns {string} rendered Swagger jsoon
   */
  render() {
    this[checkInit]();

    let yaml = `
      swaggerDefinition: 
        openapi: 3.0.1
        components:
          securitySchemes:
            bearerAuth:
              type: http
              scheme: bearer
              bearerFormat: uses https://token.overhide.io
        security:
          - bearerAuth: uses https://token.overhide.io
        host: ${this[ctx].base_url}
        basePath: /
        info:
          description: | 
            <hr/>         
            <a href="https://overhide.io" target="_blank">overhide.io</a> is a free and fully open-sourced ecosystem of widgets, a front-end library, and back-end services &mdash; to make addition of "logins" and "in-app-purchases" (IAP) to your app as banal as possible.
            <hr/><br/>

            These are APIs to create entries on [overhide-ledger](https://overhide.io) and to expose this [${this[ctx].uri}](${this[ctx].uri}) service
            as an *overhide* "remuneration provider".  

            All amounts are in *cents* of ${this[ctx].currency}.
            
            These API docs are live: connected to ${this[ctx].uri}.  This is a server cluster running with KEEP_LEDGER_PRIVATE==${this[ctx].isLedgerPrivate} (see [README.md](https://github.com/overhide/overhide-ledger/blob/master/README.md)).

            > These APIs are available on two networks:
            >
            > * [production](https://ledger.overhide.io/swagger.html)
            > * [testing](https://test.ledger.overhide.io/swagger.html)
            >
            > In [production](https://ledger.overhide.io/swagger.html) you're interacting with [Stripe.com](https://stripe.com)'s production servers--genuine payments--and the [overhide-ledger](https://ledger.overhide.io) production database.
            >
            > [Testing](https://test.ledger.overhide.io/swagger.html) APIs use [Stripe.com](https://stripe.com)'s testing servers and the [overhide-ledger test environment](https://test.ledger.overhide.io), with the test database.  See [Stripe's documentation on "test" cards](https://stripe.com/docs/testing#cards).

            This API is in support of [ledger-based authorizations](https://overhide.io/2019/03/20/why.html) as per [https://overhide.io](https://overhide.io).

            This API is in support of the [https://github.com/overhide/ledgers.js](https://github.com/overhide/ledgers.js) library.

            These APIs require bearer tokens to be furnished in an 'Authorization' header as 'Bearer ..' values.  The tokens are to be retrieved from
            [https://token.overhide.io](https://token.overhide.io).
          version: 1.0.0
          title: overhide-ledger API
          contact:
            name: r/overhide (reddit)
            url: https://www.reddit.com/r/overhide/
          externalDocs:
            description: The main Web page.
            url: 'https://ledger.overhide.io'
        tags:
          - name: creating entries
            description: |
              APIs to create ledger entries on [overhide-ledger](https://ledger.overhide.io).

              Take a look at https://overhide.io/2019/03/20/why.html for sample usage and some helpful
              wrapper code ([ledgers.js](https://github.com/overhide/ledgers.js)): you 
              will not have to make these calls yourself if you leverage the wrapper.

              [overhide-ledger](https://ledger.overhide.io) is a centralized ledger of Fiat money payments over the Stripe
              service.
          - name: import & export        
            description: |
              Import and export functionality of ledger data from this provider.
          - name: remuneration provider
            description: |
              Implementation of the *overhide* "remuneration provider" APIs for [overhide-ledger](https://ledger.overhide.io).

              These endpoints is the complete *overhide* "remuneration provider" API.  Alternatively see this API implemented
              for the Ethereum network:  https://github.com/overhide/overhide-ethereum
        definitions:
          Transaction:
            type: object
            required:
              - transaction-value
              - transaction-date
            properties:
              transaction-value:
                type: number
                description: |
                  Value of the transaction.
              transaction-date:
                type: string
                description: |
                  Date-time timestamp of the transaction.

                  The date-time is a string in [ISO 8601/RFC3339 format](https://xml2rfc.tools.ietf.org/public/rfc/html/rfc3339.html#anchor14).
        responses:
          400:
            description: |
              A bad request from the client results in one or more of the following error message strings.

              The message enum might be extended by remuneration provider.
            schema:
              type: array
              items:
                type: string
                enum:
                  - address incompatible
                  - invalid signature
                  - no transactions for address
          401:
            description: Authentication information is missing or invalid
            headers:
              WWW_Authenticate:
                type: string
          406:
            description: |
              The call is not allowed -- this ledger is in private-mode: this '/v1' API call is not allowed against overhide-ledger running in private mode (KEEP_LEDGER_PRIVATE=true).

              Please use the corresponding '/v2' APIs.
          429:
            description: |
              Client is calling the API too frequently.

              Conditions for this response to occur are remuneration provider dependant.
      apis: 
        - ${this[ctx].path}
    `;
    return swaggerJSDoc(jsyaml.safeLoad(yaml));
  }

}

module.exports = (new Swagger());