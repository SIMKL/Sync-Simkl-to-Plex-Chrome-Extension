const setCssVar = (property, value) => {
  return document.body.style.setProperty(property, value);
  // return document.querySelector(':root').style.setProperty(property, value);
};

const getCssVar = (property) => {
  return document.body.style.getPropertyValue(property);
  // return document.querySelector(':root').style.getPropertyValue(property);
};

const removeWindowHash = () => {
  // https://stackoverflow.com/a/5298684
  window.history.replaceState(
    "",
    document.title,
    window.location.pathname + window.location.search
  );
};

const removeWindowQueryParams = () => {
  window.history.replaceState(
    "",
    document.title,
    window.location.pathname + window.location.hash
  );
};

const debounce = (func, timeout = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
};

const inPopup = () => {
  // know if the current view is a popup or a full tab
  // https://stackoverflow.com/a/8921196
  let win = chrome.extension.getViews({
    type: chrome.tabs?.WindowType.POPUP || "popup", // popup
  })[0];
  return win !== undefined && win == window;
};

/*
  https://stackoverflow.com/a/54927497
  https://omahaproxy.appspot.com/
  https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Win_x64/
  https://commondatastorage.googleapis.com/chromium-browser-snapshots/index.html?prefix=Win_x64/953512/
  https://chromium.googlesource.com/chromium/src/+log/99.0.4782.1..99.0.4783.0?pretty=fuller&n=10000
  https://chromium.googlesource.com/chromium/src/+refs
  https://chromereleases.googleblog.com/

  Any version >= 99.0.4783.0 will not have this bug(in chromium)
  `chrome.tabs.update` is not working properly when handling
  popup permission flow on stable chrome versions currently this is a workaround
  tried passing current `tabID` to `oauthStart` to use it on
  `chrome.tabs.update(tabId)` but the bug can be reproduced
  works fine on chrome beta checked on version 99.0.4844.45 (latest beta)
  didn't work on 98.0.4758.102 (latest stable)
    99.0.4783.0     // works
    99.0.4782.1     // doesn't work
    98.0.4758.103+  // no downloads available
    98.0.4758.102   // Does not work
  Can use string compare as chrome follows semvers
*/
const chromeTabsUpdateBugVerCheck = async () =>
  (await getChromeVersion()).fullStr < "99.0.4783.0";

// Alerts
// https://codepen.io/quic5/pen/wWPmKO
// https://eu.simkl.in/css/tv/style_var.css?v126 search for #Alert7

// Note: usage await iosAlert(message, title)
// await will force UI to stall (intentional)
// if iosAlert() is used without await, ui will work on normally
const iosAlert = async function () {
  try {
    let $alert = document.querySelector("#Alert");
    $alert.parentElement.removeChild($alert);
  } catch (error) {}

  let $alert = document.createElement("span");
  // WONTFIX: avoid innerHTML, refactor this
  // This is too convinient and chrome extensions should be secure
  // enough so as to not allow innerHTML to exploit them
  $alert.innerHTML = `
    <div id="Alert">
      <div class="alert-container">
        <div class="alert-title">${arguments[1] || ""}</div>
        <div class="alert-message">${arguments[0]}</div>
        <div class="alert-actions">
          <button class="alert-action-item">OK</button>
        </div>
      </div>
    </div>
    `;

  document.querySelector("body").appendChild($alert);
  return new Promise(function (resolve) {
    // https://stackoverflow.com/a/35718902
    document
      .querySelector("#Alert button")
      .addEventListener("click", function okClickListener() {
        document
          .querySelector("#Alert button")
          .removeEventListener("click", okClickListener);
        $alert.parentElement.removeChild($alert);
        resolve();
      });
  });
};

const unresponsiveServiceWorkerAlert = async () => {
  await iosAlert(
    `
<style>#Alert p{ margin-top:0; }</style>
<p>Chrome extensions have buggy service workers sometimes</p>
<p>Re-enable the extension by right clicking on the <p>Extension icon > Manage extension</p></p>
<!--<p>or visit</p>
<p style="color: var(--form-button-color);">chrome://extensions/?id=${chrome.runtime.id}</p>
<p>and disable and enable the extension</p>-->
<b>or Restart your browser.</b>
`,
    "Unresponsive"
  );
};

const getChromeVersion = async () => {
  // https://web.dev/migrate-to-ua-ch/
  let ua = "";
  if (navigator.userAgentData) {
    let { uaFullVersion } = await navigator.userAgentData.getHighEntropyValues([
      "uaFullVersion",
    ]);
    ua = `Chrome/${uaFullVersion}`;
  } else {
    ua = navigator.userAgent;
  }
  // https://stackoverflow.com/a/47454708
  let pieces = ua.match(
    /Chrom(?:e|ium)\/([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)/
  );
  if (pieces == null || pieces.length != 5) {
    return undefined;
  }
  pieces = pieces.map((piece) => parseInt(piece, 10));
  pieces.shift();
  return {
    major: pieces[0],
    minor: pieces[1],
    build: pieces[2],
    patch: pieces[3],
    fullStr: pieces.join("."),
  };
};

(async () => {
  let _ver = await getChromeVersion();
  window.BrowserVersion = `${_ver.major}.${_ver.minor}`;
  window.BrowserVersionFull = _ver.fullStr;
  setBrowserInfo();
})();

const OSName = navigator.userAgentData
  ? navigator.userAgentData.platform
  : navigator.platform;
// https://stackoverflow.com/a/25603630
const OSLanguage = navigator.languages
  ? navigator.languages[0]
  : navigator.language
  ? navigator.language
  : navigator.userLanguage
  ? navigator.userLanguage
  : "en-US";
const OSLanguageStripped = OSLanguage.split("-")[0];

const setBrowserInfo = () => {
  chrome.storage.local.set(
    {
      browserInfo: {
        browserVersion: BrowserVersion,
        browserName: "Chrome", // as of now only a chrome extension
        osName: OSName,
        osLanguage: OSLanguageStripped,
      },
    },
    async () => {
      consoledebug(
        "setBrowserInfo",
        await chrome.storage.local.get("browserInfo")
      )();
    }
  );
};

// https://stackoverflow.com/a/12606298
const isMobile = {
  Windows: () => /IEMobile/i.test(navigator.userAgent),
  Android: () => /Android/i.test(navigator.userAgent),
  BlackBerry: () => /BlackBerry/i.test(navigator.userAgent),
  iOS: () => /iPhone|iPad|iPod/i.test(navigator.userAgent),
  any: () =>
    isMobile.Windows() ||
    isMobile.BlackBerry() ||
    isMobile.Android() ||
    isMobile.iOS(),
};

// https://stackoverflow.com/a/69590637
const msToHMS = (ms) => {
  // 1- Convert to seconds:
  var seconds = ms / 1000;
  // 2- Extract hours:
  var hours = parseInt(seconds / 3600); // 3600 seconds in 1 hour
  seconds = parseInt(seconds % 3600); // extract the remaining seconds after extracting hours
  // 3- Extract minutes:
  var minutes = parseInt(seconds / 60); // 60 seconds in 1 minute
  // 4- Keep only seconds not extracted to minutes:
  seconds = parseInt(seconds % 60);
  // 5 - Format so it shows a leading zero if needed
  let hoursStr = ("00" + hours).slice(-2);
  let minutesStr = ("00" + minutes).slice(-2);
  let secondsStr = ("00" + seconds).slice(-2);

  return hoursStr + ":" + minutesStr + ":" + secondsStr;
};
