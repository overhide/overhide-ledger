/**
 * Tests for main/js/lib/*.js -- libraries used by server.
 */

const puppeteer  = require('puppeteer');

const URI = process.env.URI || process.env.npm_config_URI || process.env.npm_package_config_URI || 'http://localhost:54322';

const { log, waitForClick } = require('./utils.js');
const { switchToGetPaid, switchToPay, voidEntry, generateProvider, generateSubscriber, fillInSubscriber, makePayment, checkPayment, checkNoPayment, retargetProvider, retargetSubscriber } = require('./actions.js');

describe('smoke tests', function () {
  this.timeout('120s');

  // initialization hook for every test
  before((done) => { 
    (async () => {
      done();
    })();
  });

  // cleanup hook for every test
  after((done) => {
    (async () => {
      done();
    })();
  });

  /**************/
  /* The tests. */
  /**************/

  it('smoke test', (done) => {
    (async () => {
      const browser = await puppeteer.launch({headless: false});
      const page = await browser.newPage();
      await page.setViewport({ width: 960, height: 540 });

      log('smoke test <=======> generate a provider and register');
      await page.goto(`${URI}/reap`);
      await page.waitFor('#get-paid-infographic .no-wallet svg');
      log('smoke test <=======> generate a provider and register :: generateProvider');
      var [provider_address, provider_secret, provider_account_id] = await generateProvider(page);

      log('smoke test <=======> generate subscriber, pay provider :: generateSubscriber');
      await switchToPay(page);
      var [subscriber_address, subscriber_secret] = await generateSubscriber(page);
      log('smoke test <=======> generate subscriber, pay provider :: makePayment');
      await makePayment(page, provider_address, '2.99');

      log('smoke test <=======> check payment');
      await checkPayment(page, subscriber_address, provider_address, /2\.99/);

      log('smoke test <=======> retarget provider');
      await switchToGetPaid(page);
      var [new_provider_address, new_provider_secret] = await retargetProvider(page);

      log('smoke test <=======> make payment from subscriber to retargeted provider :: fillInSubscriber');
      await switchToPay(page);
      await fillInSubscriber(page, subscriber_address, subscriber_secret);
      log('smoke test <=======> make payment from subscriber to retargeted provider :: makePayment');
      await makePayment(page, new_provider_address, '3.99');

      log('smoke test <=======> view subscriber payment to retargeted provider');
      await checkPayment(page, subscriber_address, new_provider_address, /3\.99/);

      log('smoke test <=======> retarget subscriber');
      var [new_subscriber_address, new_subscriber_secret] = await retargetSubscriber(page);

      log('smoke test <=======> check payment from re-targeted subscriber to re-targeted provider :: fillInSubscriber');
      await switchToPay(page);
      await fillInSubscriber(page, new_subscriber_address, new_subscriber_secret);
      log('smoke test <=======> check payment from re-targeted subscriber to re-targeted provider :: checkPayment');
      await checkPayment(page, new_subscriber_address, new_provider_address, /3\.99/);

      log('smoke test <=======> void entry from new subscriber :: voidEntry');
      await switchToGetPaid(page);
      await voidEntry(page, new_provider_address, new_provider_secret, new_subscriber_address);
      log('smoke test <=======> void entry from new subscriber :: fillInSubscriber');
      await switchToPay(page);
      await fillInSubscriber(page, new_subscriber_address, new_subscriber_secret);
      log('smoke test <=======> void entry from new subscriber :: checkNoPayment');
      await checkNoPayment(page, new_subscriber_address, new_provider_address);

      await browser.close();
      done()
    })();
  });
})

