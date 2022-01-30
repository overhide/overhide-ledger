/**
 * Tests for main/js/lib/*.js -- libraries used by server.
 */

const debug = require('debug');
const log = require('../../main/js/lib/log.js').init({ app_name: "mocha", debug: "mocha" }).fn("mocha");

function disableLog() {
  debug.disable();
}

/**
 * Attempt to click selector until clickable, or until timeout: with check for presence of selector.
 * 
 * @param {Object} page -- could be array of pages, e.g. [page, frame1, frame2] or one page; single page or first page is used to waitFor(millis)
 * @param {number} everyMillis -- # millis to wait before re-testing and checking result
 * @param {number} numIters -- to try and check/test
 * @param {*} fn -- taking 'page' and returning promise to run on each iteration
 * @param {*} testFn -- taking result from 'fn' and returning promise of checking this 'result' from 'fn' on each iteration, defaults to 'true' check
 */
async function reliable(page, everyMillis, numIters, fn, testFn) {
  testFn = testFn ? testFn : (result) => result === true;
  var waitForPage = Array.isArray(page) ? page[0] : page;
  for (var i = 0; i < numIters; i++) {
    let currentValue = await fn(page);
    let isValid = await testFn(currentValue);
    log(`reliable [${(new Date()).getTime()}] attempt # ${i} OK? ${isValid} :: current: ${currentValue} `);
    if (isValid) {
      return true;
    }
    await waitForPage.waitFor(everyMillis);
  }
  log(`!! ASSERT !! reliable [${(new Date()).getTime()}] timed out`);
  return false;
}

/**
 * Wait for a passed in XPath to match exp in browser window.
 *
 * Repeatedly calls *nightmare.js* *evaluate* on provided function.  Each time testing the result
 * against a passed in regular expression.
 *
 * @param {Object} page
 * @param {regex} exp -- to match result from *XPath* against to qualify as success/matched.
 * @param {number} everyMillis -- # millis to wait before re-executing *XPath* and checking result
 * @param {number} numIters -- to try and check/test *XPath*
 * @param {string} xpath -- to *evaluate* in the *page* instance
 * @param {string} iframe -- name of iframe to source 'document' for xpath from
 * 
 * e.g For *xpath* "//*[@id = 'foo']" 
 *         *exp* should match text content of element with id 'foo'
 *     For *xpath* "//div[contains(text(), 'baz')][contains(@class, 'bar')]" 
 *         *exp* should match 'baz' and have a 'bar' class
 *     For *xpath* "//div[contains(text(), 'baz')][contains(@class, 'bar')]/following-sibling::input/@value" 
 *         *exp* should match value of an 'input' element that's a sibling of an element containing 'baz' and having 
 *         class 'bar'.
 */
async function waitForXPath(page, exp, everyMillis, numIters, xpath, iframe) {
  let document = iframe ? `document.getElementById("${iframe}").contentWindow.document` : 'document';
  log(`waitForXPath [${(new Date()).getTime()}] start :: need to see ${exp} in ${document}.evaluate("${xpath}", ${document}, null, XPathResult.STRING_TYPE, null).stringValue`);
  return await reliable(page, everyMillis, numIters, 
    (page) => page.evaluate(`${document}.evaluate("${xpath}", ${document}, null, XPathResult.STRING_TYPE, null).stringValue`),
    (result) => {
      log(`waitForXPath [${(new Date()).getTime()}] test :: result of ${exp}.test('${result}') is ${exp.test(result)}`);
      return exp.test(result)
    });
}

/**
 * Wait for a passed in query selector to exist in browser window.
 *
 * Repeatedly calls *puppeteer*'s *evaluate* to test.
 *
 * @param {Object} page
 * @param {number} everyMillis -- # millis to wait before re-executing *XPath* and checking result
 * @param {number} numIters -- to try and check/test *XPath*
 * @param {string} selector -- to check for in the *page* instance
 * @param {string} iframe -- name of iframe to source 'document' for xpath from
 */
async function waitForSelector(page, everyMillis, numIters, selector, iframe) {
  let doc = iframe ? `document.getElementById("${iframe}").contentWindow.document` : 'document';
  log(`waitForSelector [${(new Date()).getTime()}] start :: checking for ${selector} in ${doc}`);
  return await reliable(page, everyMillis, numIters,
    (page) => page.evaluate((doc, selector) => {
      let target = eval(doc);
      return !!target.querySelector(selector);
    }, doc, selector),
    (result) => {
      log(`waitForSelector [${(new Date()).getTime()}] test :: selector ${result ? "exists" : "doesn't exist"}`);
      return result;
    });
}

/**
 * Wait for selector to be visible, including opacity.
 * 
 * @param {Object} page
 * @param {string} selector
 * @param {number} everyMillis -- # millis to wait before re-testing and checking result
 * @param {number} numIters -- to try and check/test
 * @param {string} iframe -- name of iframe to source 'document' from
 */
async function waitForVisible(page, selector, everyMillis, numIters, iframe) {
  await waitForSelector(page, everyMillis, numIters, selector, iframe);
  let doc = iframe ? `document.getElementById("${iframe}").contentWindow.document` : 'document';
  log(`waitForVisible [${(new Date()).getTime()}] start :: see selector in DOM ${selector}`);
  for (var i = 0; i < numIters; i++) {
    try {
      var visibleCheckStatus = await page.evaluate((doc, selector) => {
        let target = eval(doc);
        let e = target.querySelector(selector);
        if (!e) {
          return `FAIL: waitForVisible [${(new Date()).getTime()}] no e`;
        }
        e.scrollIntoView();
        const style = window.getComputedStyle(e);
        if (!style || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return `FAIL: waitForVisible [${(new Date()).getTime()}] no style`;
        }
        let rect = e.getBoundingClientRect();
        let centerX = rect.left + rect.width / 2;
        let centerY = rect.top + rect.height / 2;
        let eFromP = target.elementFromPoint(centerX, centerY);
        return `${eFromP === e ? '' : 'FAIL:'} waitForVisible [${(new Date()).getTime()}] OK? :: ${eFromP === e} -- e: #${e.id}.${JSON.stringify(e.classList)} :: eFromP: #${eFromP.id}.${JSON.stringify(eFromP.classList)}`;
      }, doc, selector);
    } catch (err) {
      log(`waitForVisible err :: ${selector} / ${i} -- ${String(err)}`);
    }

    log(`waitForVisible [${(new Date()).getTime()}] attempt # ${i} click result :: ${visibleCheckStatus}`);
    if (visibleCheckStatus && (! /^FAIL:/.test(visibleCheckStatus)) && await page.waitFor(selector, { visible: true })) {
      return true;
    }
    await page.waitFor(everyMillis);
  }
  log(`!! ASSERT !! waitForVisible [${(new Date()).getTime()}] timed out :: ${selector}`);
  return false;
}

/**
 * Attempt to click selector until clickable, or until timeout
 * 
 * @param {Object} page
 * @param {string} selector -- to click
 * @param {number} everyMillis -- # millis to wait before re-testing and checking result
 * @param {number} numIters -- to try and check/test
 * @param {string} iframe -- name of iframe to source 'document' from
 */
async function waitForClick(page, selector, everyMillis, numIters, iframe) {
  await waitForSelector(page, everyMillis, numIters, selector, iframe);
  let doc = iframe ? `document.getElementById("${iframe}").contentWindow.document` : 'document';
  log(`waitForClick [${(new Date()).getTime()}] start :: see selector in DOM ${selector}`);
  for (var i = 0; i < numIters; i++) {
    try {
      var clickResult = await page.evaluate((doc, selector) => {
        let target = eval(doc);
        let e = target.querySelector(selector);
        if (!e) {
          return `FAIL: [${(new Date()).getTime()}] no e`;
        }
        e.scrollIntoView();
        let rect = e.getBoundingClientRect();
        let centerX = rect.left + rect.width / 2;
        let centerY = rect.top + rect.height / 2;
        let eFromP = target.elementFromPoint(centerX, centerY);
        if (eFromP === e) {
          e.click();
          return `SUCCESS: [${(new Date()).getTime()}] OK? :: ${eFromP === e} -- e: #${e.id}.${JSON.stringify(e.classList)} :: eFromP: #${eFromP.id}.${JSON.stringify(eFromP.classList)}`;
        }
        return `FAIL: [${(new Date()).getTime()}] OK? :: ${eFromP === e} -- e: #${e.id}.${JSON.stringify(e.classList)} :: eFromP: #${eFromP.id}.${JSON.stringify(eFromP.classList)}`;
      }, doc, selector);
    } catch (err) {
      log(`waitForClick [${(new Date()).getTime()}] err :: ${selector} / ${i} -- ${String(err)}`);
    }
    log(`waitForClick [${(new Date()).getTime()}] attempt # ${i} click result :: ${clickResult}`);
    if (clickResult && (! /^FAIL:/.test(clickResult))) {
        return true;
    }
    await page.waitFor(everyMillis);
  }
  log(`!! ASSERT !! waitForClick [${(new Date()).getTime()}] timed out :: ${selector}`);
  return false;
}

/**
 * @param {*} page 
 * @param {*} tag
 * @return child frame from page with provided 'tag' which is either an DOM name or id
 */
async function getChildFrameByNameOrId(page, tag) {
  var frames = (await (await page.mainFrame()).childFrames());
  for (frame of frames) {
    if (frame.name() === tag) return frame;
  }  
}

function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}

module.exports = {
  log: log,
  delay: delay,
  disableLog: disableLog,
  reliable: reliable,
  waitForXPath: waitForXPath,
  waitForSelector: waitForSelector,
  waitForVisible: waitForVisible,
  waitForClick: waitForClick,
  getChildFrameByNameOrId: getChildFrameByNameOrId
}