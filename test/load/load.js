/**
 * Load test for overhide-ledger.
 */

/**
 * CONFIGURE TEST BELOW:
 */

const URI = 'https://stage.ledger.overhide.io';
const USER = 'kundel';
const PASSWORD = 'the mutt';
const NUM_WORKERS = 6;
const NUM_ITERATIONS = 9999;
const CHANCE_TO_GEN_PAYEE_PERCENT = 2;
const CHANCE_TO_GEN_PAYER_PERCENT = 2;
const MAX_PAYEES_PER_WORKER = 1;
const MAX_PAYERS_PER_WORKER = 3;

/**/

const puppeteer  = require('puppeteer');
const cluster = require('cluster');

const { disableLog, log, waitForClick } = require('../js/utils.js');
const { switchToPay, generateProvider, generateSubscriber, makePayment, listPayments, fillInSubscriber} = require('../js/actions.js');

disableLog();

var payees = [];
var payers = [];
var workers = NUM_WORKERS;

function fn(index) {
  (async () => {
    for (var iteration = 1; iteration <= NUM_ITERATIONS; iteration++) {
      try {
        var browser = await puppeteer.launch({ headless: true });
        var page = await browser.newPage();
        await page.authenticate({ username: USER, password: PASSWORD });
        await page.goto(URI);
        await page.waitFor('#get-paid-infographic .no-wallet svg');

        if (payees.length == 0) {
          var [provider_address, provider_secret, provider_account_id] = await generateProvider(page);
          payees.push(provider_address);
          process.send(`+payee worker:${index} iteration:${iteration}/${NUM_ITERATIONS}`);
        } else if (payers.length == 0) {
          await switchToPay(page);
          var [subscriber_address, subscriber_secret] = await generateSubscriber(page);
          payers.push(subscriber_address);
          await makePayment(page, provider_address, '2.99');
          process.send(`+payer worker:${index} iteration:${iteration}/${NUM_ITERATIONS}`);
        } else if (payees.length < MAX_PAYEES_PER_WORKER && CHANCE_TO_GEN_PAYEE_PERCENT >= (Math.random() * 100)) {
          var [provider_address, provider_secret, provider_account_id] = await generateProvider(page);
          payees.push(provider_address);
          process.send(`+payee worker:${index} iteration:${iteration}/${NUM_ITERATIONS}`);
        } else if (payers.length < MAX_PAYERS_PER_WORKER && CHANCE_TO_GEN_PAYER_PERCENT >= (Math.random() * 100)) {
          await switchToPay(page);
          var [subscriber_address, subscriber_secret] = await generateSubscriber(page);
          payers.push(subscriber_address);
          await makePayment(page, provider_address, '2.99');
          process.send(`+payer worker:${index} iteration:${iteration}/${NUM_ITERATIONS}`);
        } else {
          await switchToPay(page);
          let which_payer = Math.floor(Math.random() * payers.length);
          fillInSubscriber(page, payers[which_payer], '');
          await listPayments(page);
          process.send(`list worker:${index} iteration:${iteration}/${NUM_ITERATIONS}`);
        }
      } catch (err) {
        process.send(`FAILURE worker:${index} iteration:${iteration}/${NUM_ITERATIONS} :: ${new String(err)}`);
      }
      
      await browser.close();
    }
    process.send(`exiting worker:${index}`);
    process.exit(0);
  })();
}

if (cluster.isMaster) {
  for (var workerIndex = 0; workerIndex < NUM_WORKERS; workerIndex++) {
    let worker = cluster.fork();
    worker.send(workerIndex);
    worker.on('message', msg => {
      console.log(msg);
      if (/exiting worker/.test(msg)) {
        workers--;
        if (!workers) process.exit(0);
      }
    })
  }
} else {
  // in forked process, respect work request
  process.on('message', index => fn(index));
}
