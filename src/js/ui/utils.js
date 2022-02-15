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

const debounce = (func, timeout = 400) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
};

// string prototype to make it convinient
String.prototype.originUrl = function () {
  return new URL(this).origin + "/";
};

const removeItemOnce = (arr, value) => {
  var index = arr.indexOf(value);
  if (index > -1) {
    arr.splice(index, 1);
  }
  return arr;
};

const inPopup = () => {
  // know if the current view is a popup or a full tab
  // https://stackoverflow.com/a/8921196
  let win = chrome.extension.getViews({ type: "popup" })[0];
  return win !== undefined && win == window;
};

const getChromeVersion = () => {
  // https://stackoverflow.com/a/47454708
  var pieces = navigator.userAgent.match(
    /Chrom(?:e|ium)\/([0-9]+)\.([0-9]+)\.([0-9]+)\.([0-9]+)/
  );
  if (pieces == null || pieces.length != 5) {
    return undefined;
  }
  pieces = pieces.map((piece) => parseInt(piece, 10));
  return {
    major: pieces[1],
    minor: pieces[2],
    build: pieces[3],
    patch: pieces[4],
  };
};

const BrowserVersion = `${getChromeVersion().major}.${
  getChromeVersion().minor
}`;
const OSName = navigator.userAgentData.platform;
// https://stackoverflow.com/a/25603630
const OSLanguage = navigator.languages
  ? navigator.languages[1]
  : navigator.language
  ? navigator.language.split("-")[0]
  : navigator.userLanguage
  ? navigator.userLanguage.split("-")[0]
  : "en";

const setBrowserInfo = () => {
  chrome.storage.local.set(
    {
      browserInfo: {
        browserVersion: BrowserVersion,
        browserName: "Chrome",
        osName: OSName,
        osLanguage: OSLanguage,
      },
    },
    async () => {
      console.debug(
        "setBrowserInfo",
        await chrome.storage.local.get("browserInfo")
      );
    }
  );
};

setBrowserInfo();
