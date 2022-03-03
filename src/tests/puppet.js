const puppeteer = require("puppeteer");
const { runQunitPuppeteer, printOutput } = require("node-qunit-puppeteer");

const launchNodeQunit = async (qunitArgs) => {
  try {
    // must be headless: false
    // https://github.com/puppeteer/puppeteer/blob/main/docs/api.md#working-with-chrome-extensions
    let result = await runQunitPuppeteer(qunitArgs, false);
    printOutput(result, console);
    if (result.stats.failed > 0) {
      // Handle the failed test run
      // console.error(result);
    }
  } catch (err) {
    console.error(err);
  }
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const pathToExtension = require("path").join(__dirname, "../");
  console.log("[INFO] Loading extension " + pathToExtension);
  const qunitArgs = {
    targetUrl: null,
    timeout: 10000,
    redirectConsole: true,
    puppeteerArgs: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--allow-file-access-from-files",
    ],
  };
  const puppeteerConfig = {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  };

  // https://stackoverflow.com/a/62229404
  if (process.env.PUPPETEER_EXEC_PATH)
    puppeteerConfig.executablePath = process.env.PUPPETEER_EXEC_PATH;

  const browser = await puppeteer.launch(puppeteerConfig);
  let pages = await browser.pages();
  let prevTabs = pages.length;
  let tries = 0;
  while (tries < 300) {
    pages = await browser.pages();
    if (prevTabs != pages.length) break;
    await sleep(100);
    tries++;
    prevTabs = pages.length;
  }
  // #fresh-install page
  const extPage = pages.find((x) => x.url().startsWith("chrome-extension://"));
  const extId = new URL(extPage.url()).hostname;
  await extPage.close();
  qunitArgs.targetUrl = `chrome-extension://${extId}/tests/index.html`;
  launchNodeQunit(qunitArgs);
  const page = await browser.newPage();
  await page.goto(`chrome-extension://${extId}/tests/index.html`);
  // https://stackoverflow.com/a/49959766
  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        "#qunit-banner.qunit-pass, #qunit-banner.qunit-fail"
      ).length
  );
  await page.evaluate(() =>
    document.querySelectorAll("li>strong").forEach((c) => c.click())
  );
  await page.screenshot({
    path: "qunit-results.png",
    fullPage: true,
  });
  await page.close();
  await browser.close();

  // FEAT: Process screenshot and split it to multiple images
  // if the height is too big
  // can use this https://stackoverflow.com/a/65098968
})();
