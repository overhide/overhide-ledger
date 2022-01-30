const Keyv = require('keyv');
const chai = require('chai');
const assert = chai.assert;

const URI = process.env.URI || process.env.npm_config_URI || process.env.npm_package_config_URI || 'http://localhost:54322';
const POSTGRES_HOST = process.env.POSTGRES_HOST || process.env.npm_config_POSTGRES_HOST || process.env.npm_package_config_POSTGRES_HOST || 'localhost'
const POSTGRES_PORT = process.env.POSTGRES_PORT || process.env.npm_config_POSTGRES_PORT || process.env.npm_package_config_POSTGRES_PORT || 5432
const POSTGRES_DB = process.env.POSTGRES_DB || process.env.npm_config_POSTGRES_DB || process.env.npm_package_config_POSTGRES_DB;
const POSTGRES_USER = process.env.POSTGRES_USER || process.env.npm_config_POSTGRES_USER || process.env.npm_package_config_POSTGRES_USER;
const POSTGRES_PASSWORD = process.env.POSTGRES_PASSWORD || process.env.npm_config_POSTGRES_PASSWORD || process.env.npm_package_config_POSTGRES_PASSWORD;
const POSTGRES_SSL = process.env.POSTGRES_SSL || process.env.npm_config_POSTGRES_SSL || process.env.npm_package_config_POSTGRES_SSL;
const SELECT_MAX_ROWS = process.env.SELECT_MAX_ROWS || process.env.npm_config_SELECT_MAX_ROWS || process.env.npm_package_config_SELECT_MAX_ROWS;
const KEYV_URI = process.env.KEYV_URI || process.env.npm_config_KEYV_URI || process.env.npm_package_config_KEYV_URI;
const KEYV_RETARGET_NAMESPACE = process.env.KEYV_RETARGET_NAMESPACE || process.env.npm_config_KEYV_RETARGET_NAMESPACE || process.env.npm_package_config_KEYV_RETARGET_NAMESPACE;
const SALT = process.env.SALT || process.env.npm_config_SALT || process.env.npm_package_config_SALT;

const { log, delay, reliable, waitForXPath, waitForSelector, waitForVisible, waitForClick, getChildFrameByNameOrId } = require('./utils.js');

const database = require('../../main/js/lib/database.js').init({
  pghost: POSTGRES_HOST,
  pgport: POSTGRES_PORT,
  pgdatabase: POSTGRES_DB,
  pguser: POSTGRES_USER,
  pgpassword: POSTGRES_PASSWORD,
  pgssl: POSTGRES_SSL,
  select_max_rows: SELECT_MAX_ROWS
});
const crypto = require('../../main/js/lib/crypto.js').init();
const keyv = new Keyv({
  uri: typeof KEYV_URI === 'string' && KEYV_URI,
  store: typeof KEYV_URI !== 'string' && KEYV_URI,
  namespace: KEYV_RETARGET_NAMESPACE
});

const KEYV_KEY_FOR_LATEST_ID = 'LATEST_ID';

const TEST_PROVIDER_ADDRESS = '0x046c88317b23dc57F6945Bf4140140f73c8FC80F';
const TEST_PROVIDER_EMAIL = 'jakub.at.work@gmail.com';
const TEST_PROVIDER_EMAIL_HASH = crypto.hash(TEST_PROVIDER_EMAIL, SALT);
const TEST_SOME_ADDRESS = '0xd6106c445a07a6a1caf02fc8050f1fde30d7ce8b';
const TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL = 'acct_1DymWuHnm2jVFR4M';  // account for 'jakub.at.work@gmail.com';

const TEST_EMAIL = 'tester@overhide.io';
const TEST_CARD = '4242424242424242';
const TEST_EXPIRY = '0225';
const TEST_CVC = '111';

async function ensureProvider() {
  log('--------------------------- ADD PROVIDER W/SUB --------------------------------------');
  log('provider address: ' + TEST_PROVIDER_ADDRESS + ' <=> ' + TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL);
  try { await database.addProvider(TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL, TEST_PROVIDER_ADDRESS, TEST_PROVIDER_EMAIL_HASH); } catch (e) { log(e); }
  log('add tx: ' + TEST_SOME_ADDRESS + ' => ' + TEST_PROVIDER_ADDRESS);
  try { await database.addTransaction(TEST_SOME_ADDRESS, TEST_PROVIDER_ADDRESS, 300, 'foo', '00', false); } catch (e) { log(e); }
  log('-------------------------------------------------------------------------------------');
}

// switch panes
async function switchToGetPaid(page) {
  return waitForClick(page, '#switch-to-get-paid', 250, 4);
}

// switch panes
async function switchToPay(page) {
  return waitForClick(page, '#switch-to-pay-someone', 250, 4);
}

// generate a provider
//
// @param {*} page - from puppeteer
// @returns {Array} `[provider_address, provider_secret, provider_account_id]` newly generated
async function generateProvider(page) {
  assert(await waitForClick(page, '#payee-generate', 250, 4), 'generate payee button');
  var provider_address = await page.evaluate(() => {
    return data['providerAddress'];
  });
  var provider_secret = await page.evaluate(() => {
    return data['providerSecret'];
  });
  await page.click('#register-payee');
  assert (await reliable(page, 250, 3, async (page) => {
    await page.type('input[bind="providedEmail"]', TEST_PROVIDER_EMAIL, { delay: 10 });
    await waitForClick(page, '#register-confirm-modal .ui.primary.button', 250, 32);
    try {
      await page.waitForSelector('#onboarding-continue', { timeout: 6000 });
      return true;
    } catch (e) {
      return false;
    }
  }), 'confirm stripe registration modal and move to onboarding flow');
  assert (await reliable(page, 250, 3, async (page) => {
    await waitForClick(page, '#onboarding-continue', 250, 32);
    try {
      await delay(2000);
      const [button] = await page.$x("//span[contains(., 'Skip this form')]");
      if (button) {
          await button.click();
      }
      return true;
    } catch (e) {
      return false;
    }
  }), 'click next through onboarding flow and wait for Stripe page');
  assert (await reliable(page, 250, 3, async (page) => {
    try {
      await page.waitForSelector('#notification-modal', { timeout: 6000 });
      return true;
    } catch (e) {
      return false;
    }
  }), 'click stripe skip account and get notification modal');
  assert (await waitForXPath(page, /OK, success, provider added./, 250, 32, "//*[@id = 'notification-modal-text']"), 'see registration success notification modal');
  assert (await waitForClick(page, '#notification-modal .close.icon', 250, 32), 'close registration notification modal');
  assert (await waitForVisible(page, '#notificationTextProvider', 250, 32), 'see page after closing registration notification modal');
  var provider_account_id = await database.getAccountId(provider_address);
  log('---------------------------- GENERATE PROVIDER --------------------------------------');
  log(`provider address (for ${provider_account_id}): ${provider_address}`);
  log(`provider secret (for ${provider_account_id}): ${provider_secret}`);
  log('-------------------------------------------------------------------------------------');
  return [provider_address, provider_secret, provider_account_id];
}

// generates subscriber and leaves filled in
//
// @param {*} page - from puppeteer
// @returns {Array} `[subscriber_address, subscriber_secret]` newly generated
async function generateSubscriber(page) {
  assert (await waitForClick(page, '#generate-payer', 250, 4), 'clicking payer generation');
  var subscriber_address = await page.evaluate(() => {
    return data['subscriberAddress'];
  });
  var subscriber_secret = await page.evaluate(() => {
    return data['subscriberSecret'];
  });
  log('--------------------------- GENERATE SUBSCRIBER -------------------------------------');
  log('subscriber address: ' + subscriber_address);
  log('subscriber secret: ' + subscriber_secret);
  log('-------------------------------------------------------------------------------------');
  return [subscriber_address, subscriber_secret]
}

// fill in subscriber address/secret
//
// @param {*} page - from puppeteer
// @param {string} subscriber_address
// @param {string} subscriber_secret
async function fillInSubscriber(page, subscriber_address, subscriber_secret) {
  assert (await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('#subscriber-address').value = ''`);
    await page.type('#subscriber-address', subscriber_address, { delay: 10 });
    return await page.evaluate(`document.querySelector('#subscriber-address').value`);
  }, async (result) => {
    return result === subscriber_address;
  }), 'typing in subscriber address');
  assert (await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('#subscriber-secret').value = ''`);
    await page.type('#subscriber-secret', subscriber_secret, { delay: 10 });
    return await page.evaluate(`document.querySelector('#subscriber-secret').value`);
  }, async (result) => {
    return result === subscriber_secret;
  }), 'typing in subscriber secret');
}

// generate subscriber, pay provider, view payment
//
// assumptions:
// - subscriber address/key filled in 
//
// @param {*} page - from puppeteer
// @param {string} provider_address - to pay
// @param {string} amount - to pay
// @returns {Array} `[subscriber_address, subscriber_secret]` newly generated
async function makePayment(page, provider_address, amount) {
  await page.type('#pay-amount-input', amount);
  await page.type('#pay-address-input', provider_address);
  await page.click('#pay-with-stripe');
  assert (await waitForClick(page, '#pay-confirm-model-button', 250, 32), 'confirming payment modal');
  var visa_frame = null;
  await reliable(page, 250, 32, async(page) => {
    visa_frame = await getChildFrameByNameOrId(page, 'stripe_checkout_app');
    return !!visa_frame;
  });  
  assert(!!visa_frame, 'never saw visa frame');
  await visa_frame.waitFor('input[placeholder="Email"]',{timeout: 10000});
  await delay(2000);
  await visa_frame.type('input[placeholder="Email"]', TEST_EMAIL);
  await visa_frame.type('input[placeholder="Card number"]', TEST_CARD);
  await visa_frame.type('input[placeholder="MM / YY"]', TEST_EXPIRY);
  await visa_frame.type('input[placeholder="CVC"]', TEST_CVC);
  await visa_frame.click('button[type="submit"]');
  assert(await waitForXPath(page, /OK, success, payment processed./, 250, 32, "//*[@id = 'notification-modal-text']"), 'waiting to see payment confirmation modal');
  assert(await waitForClick(page, '#notification-modal .close.icon', 250, 32), 'closing payment confirmation modal');
  assert (await waitForVisible(page, '[id="notificationTextSubscriber"]', 250, 32), 'waiting for page after closing payment confirmation modal');
}

// check payment from subscriber to provider for amount
//
// @param {*} page - from puppeteer
// @param {string} subscriber_address
// @param {string} provider_address
// @param {*} exp - regular expression for payment string check
async function checkPayment(page, subscriber_address, provider_address, exp) {
  await page.click('#show-ledger-page');
  assert (await waitForXPath(page, new RegExp(subscriber_address, 'i'), 250, 32, "//div[contains(text(), 'From')][contains(@class, 'label')]/following-sibling::input/@value", "ledger-content"));
  assert (await waitForXPath(page, new RegExp(provider_address, 'i'), 250, 32, "//div[contains(text(), 'To')][contains(@class, 'label')]/following-sibling::input/@value", "ledger-content"));
  assert (await waitForXPath(page, exp, 250, 32, "//div[contains(text(), 'Amount (USD)')][contains(@class, 'label')]/following-sibling::input/@value", "ledger-content"));
  assert (await waitForClick(page, '#ledger-modal .close.icon', 250, 32));
}

// list payments from subscriber -- no assert if none
//
// @param {*} page - from puppeteer
// @param {string} subscriber_address
async function listPayments(page) {
  assert (await reliable(page, 250, 3, async (page) => {
    await page.click('#show-ledger-page', { timeout: 10000 });
    return await waitForClick(page, '#ledger-modal .close.icon', 250, 32);
  }), 'viewing payments listing');
}

// check payment from subscriber to provider doesn't exist
//
// @param {*} page - from puppeteer
// @param {string} subscriber_address
// @param {string} provider_address
async function checkNoPayment(page, subscriber_address, provider_address) {
  page.click('#show-ledger-page');
  // current frame might have the amount wait for update to come in
  let foundMatch = (await reliable(page, 250, 3, async (page) => {
    let toPresent = await waitForXPath(page, new RegExp(subscriber_address, 'i'), 250, 32, "//div[contains(text(), 'From')][contains(@class, 'label')]/following-sibling::input/@value", "ledger-content");
    let fromPresent = await waitForXPath(page, new RegExp(provider_address, 'i'), 250, 32, "//div[contains(text(), 'To')][contains(@class, 'label')]/following-sibling::input/@value", "ledger-content");
    return toPresent & fromPresent;
  }));
  assert (!foundMatch); // shouldn't have found match
  assert (await waitForClick(page, '#ledger-modal .close.icon', 250, 32));
}

// retarget provider
//
// @param {*} page - from puppeteer
// @returns {Array} `[new_provider_address, new_provider_secret]` newly generated
async function retargetProvider(page) {
  assert (await waitForClick(page, '#payee-generate', 250, 4));
  var new_provider_address = await page.evaluate(() => {
    return data['providerAddress'];
  });
  var new_provider_secret = await page.evaluate(() => {
    return data['providerSecret'];
  });
  assert (await waitForClick(page, '#payee-retarget', 250, 4));
  assert (await waitForXPath(page, /Re-targeting of transactions means finding all ledger payments/, 250, 32, "//p[contains(text(), 'Re-targeting of transactions means finding all ledger payments')]"));

  assert (await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('input[placeholder="acct_1D0000000000VA"]').value = ''`);
    await delay(2000);
    await page.type('input[placeholder="acct_1D0000000000VA"]', TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL, { delay: 10 });
    await page.type('input[placeholder="fred@acme.com"]', TEST_PROVIDER_EMAIL, { delay: 10 });
    return await page.evaluate(`document.querySelector('input[placeholder="acct_1D0000000000VA"]').value`);
  }, async (result) => {
    return result === TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL;
  }));
  assert (await reliable(page, 250, 3, async (page) => {
    await waitForClick(page, '#retarget-provider-ok', 250, 32);
    try {
      await page.waitForSelector('#notification-modal', { timeout: 6000 });
      return true;
    } catch (e) {
      return false;
    }
  }));
  assert (await waitForXPath(page, /OK, success, check your email./, 250, 32, "//*[@id = 'notification-modal-text']"));
  assert (await waitForClick(page, '#notification-modal .close.icon', 250, 32));
  assert (await waitForVisible(page, '#notificationTextProvider', 250, 4));
  var retarget_id = await keyv.get(KEYV_KEY_FOR_LATEST_ID); // if this fails, make sure you're running KEYV as same redis with your server and that INSTRUMENTED_FOR_TEST is set.
  await page.goto(`${URI}/v1/retarget/${retarget_id}`);
  assert (await waitForXPath(page, /Please review all transactions at bottom of page; these will be re-targeted./i, 250, 32, "//*[contains(text(), 'Please review all transactions at bottom of page; these will be re-targeted.')]"));
  await page.type('#secret-input', new_provider_secret);
  assert (await waitForClick(page, '#ok-button', 250, 32));
  visa_frame = (await (await page.mainFrame()).childFrames())[0];
  await visa_frame.type('input[placeholder="Card number"]', TEST_CARD);
  await visa_frame.type('input[placeholder="MM / YY"]', TEST_EXPIRY);
  await visa_frame.type('input[placeholder="CVC"]', TEST_CVC);
  await visa_frame.click('button[type="submit"]');
  assert (await waitForXPath(page, /OK, success, payment processed./, 250, 32, "//*[@id = 'status']"));
  await page.click('#back-button');
  await page.waitFor('#get-paid-infographic .no-wallet svg');
  log('---------------------------- RETARGET PROVIDER --------------------------------------');
  log(`provider address (for test email ${TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL}): ${new_provider_address}`);
  log(`provider secret (for test email ${TEST_PROVIDER_ACCOUNT_ID_WITH_EMAIL}): ${new_provider_secret}`);
  log('-------------------------------------------------------------------------------------');
  return [new_provider_address, new_provider_secret];
}

// retarget subscriber
//
// assumptions:
// - for TEST_EMAIL
//
// @param {*} page - from puppeteer
// @returns {Array} `[new_subscriber_address, new_subscriber_secret]` newly generated
async function retargetSubscriber(page) {
  assert (await waitForClick(page, '#generate-payer', 250, 4));
  var new_subscriber_address = await page.evaluate(() => {
    return data['subscriberAddress'];
  });
  var new_subscriber_secret = await page.evaluate(() => {
    return data['subscriberSecret'];
  });
  assert (await waitForClick(page, '#payer-retarget', 250, 4));
  assert (await waitForXPath(page, /Re-targeting of transactions means finding all ledger payments/, 250, 32, "//p[contains(text(), 'Re-targeting of transactions means finding all ledger payments')]"));
  assert (await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('input[placeholder="fred@acme.com"]').value = ''`);
    await page.type('input[placeholder="fred@acme.com"]', TEST_EMAIL, { delay: 10 });
    return await page.evaluate(`document.querySelector('input[placeholder="fred@acme.com"]').value`);
  }, async (result) => {
    return result === TEST_EMAIL;
  }));
  assert (await reliable(page, 250, 3, async (page) => {
    await waitForClick(page, '#retarget-subscriber-ok', 250, 32);
    try {
      await page.waitForSelector('#notification-modal', { timeout: 6000 });
      return true;
    } catch (e) {
      return false;
    }
  }));
  assert (await waitForXPath(page, /OK, success, check your email./, 250, 32, "//*[@id = 'notification-modal-text']"));
  assert (await waitForClick(page, '#notification-modal .close.icon', 250, 32));
  assert (await waitForVisible(page, '#notificationTextSubscriber', 250, 4));
  var retarget_id = await keyv.get(KEYV_KEY_FOR_LATEST_ID); // if this fails, make sure you're running KEYV as same redis with your server and that INSTRUMENTED_FOR_TEST is set.
  await page.goto(`${URI}/v1/retarget/${retarget_id}`);
  assert (await waitForXPath(page, /Please review all transactions at bottom of page; these will be re-targeted./i, 250, 32, "//*[contains(text(), 'Please review all transactions at bottom of page; these will be re-targeted.')]"));
  await page.type('#secret-input', new_subscriber_secret);
  assert (await waitForClick(page, '#ok-button', 250, 32));
  visa_frame = (await (await page.mainFrame()).childFrames())[0];
  await visa_frame.type('input[placeholder="Card number"]', TEST_CARD);
  await visa_frame.type('input[placeholder="MM / YY"]', TEST_EXPIRY);
  await visa_frame.type('input[placeholder="CVC"]', TEST_CVC);
  await visa_frame.click('button[type="submit"]');
  assert (await waitForXPath(page, /OK, success, payment processed./, 250, 32, "//*[@id = 'status']"));
  await page.click('#back-button');
  await page.waitFor('#get-paid-infographic .no-wallet svg');
  log('------------------------ RETARGET SUBSCRIBER ----------------------------------------');
  log('new subscriber address: ' + new_subscriber_address);
  log('new subscriber secret: ' + new_subscriber_secret);
  log('-------------------------------------------------------------------------------------');
  return [new_subscriber_address, new_subscriber_secret];
}

// Void entry from provider to subscriber
//
// @param {string} provider_address - to void from
// @param {string} provider_secret - to void from
// @param {string} subscriber_address - to void for
async function voidEntry(page, provider_address, provider_secret, subscriber_address) {
  assert (await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('#provider-address').value = ''`);
    await page.type('#provider-address', provider_address, { delay: 10 });
    return await page.evaluate(`document.querySelector('#provider-address').value`);
  }, async (result) => {
    return result === provider_address;
  }));
  assert(await reliable(page, 250, 3, async (page) => {
    await page.evaluate(`document.querySelector('#provider-secret').value = ''`);
    await page.type('#provider-secret', provider_secret, { delay: 10 });
    return await page.evaluate(`document.querySelector('#provider-secret').value`);
  }, async (result) => {
    return result === provider_secret;
  }));
  await waitForClick(page, '#void-button', 250, 32);
  assert (await reliable(page, 250, 3, async (page) => {
    await waitForVisible(page, '#void-from-address', 250, 32);
    await page.evaluate(`document.querySelector('#void-from-address').value = ''`);
    await page.type('#void-from-address', subscriber_address, { delay: 10 });
    return await page.evaluate(`document.querySelector('#void-from-address').value`);
  }, async (result) => {
    return result === subscriber_address;
  }));
  assert (await reliable(page, 250, 3, async (page) => {
    await waitForVisible(page, '#show-void-page-button', 250, 32);
    await waitForClick(page, '#show-void-page-button', 250, 32);
    return await waitForXPath(page, /Please confirm you wish to void transactions from/i, 250, 32, "//*[contains(text(), 'Please confirm you wish to void transactions from')]", 'void-content');
  }));
  await waitForClick(page, '#ok-button', 250, 32, 'void-content');
  await waitForSelector(page, 250, 4, '#notification-modal');
  await waitForXPath(page, /Entries voided./, 250, 32, "//*[@id = 'notification-modal-text']");
  await waitForClick(page, '#notification-modal .close.icon', 250, 32);
  await waitForVisible(page, '#notificationTextProvider', 250, 4);
}

module.exports = {
  ensureProvider: ensureProvider,
  switchToPay: switchToPay,
  switchToGetPaid: switchToGetPaid,
  voidEntry: voidEntry,
  retargetSubscriber: retargetSubscriber,
  retargetProvider: retargetProvider,
  checkNoPayment: checkNoPayment,
  checkPayment: checkPayment,
  listPayments: listPayments,
  makePayment: makePayment,
  fillInSubscriber: fillInSubscriber,
  generateSubscriber: generateSubscriber,
  generateProvider: generateProvider
}