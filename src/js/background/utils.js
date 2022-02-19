const makeErrorResponse = (data) => {
  if (typeof data === "string") {
    return { error: data };
  }
  return data;
};

const makeSuccessResponse = (data) => {
  if (typeof data === "string") {
    return { message: data };
  }
  return data;
};

const sha512 = async (str) => {
  const buf = await crypto.subtle.digest(
    "SHA-512",
    new TextEncoder("utf-8").encode(str)
  );
  return Array.prototype.map
    .call(new Uint8Array(buf), (x) => ("00" + x.toString(16)).slice(-2))
    .join("");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let OSName, OSLanguage, BrowserVersion, BrowserName;

const loadBrowserInfo = async () => {
  let {
    browserInfo: {
      browserVersion: bVersion,
      browserName: bName,
      osName: name,
      osLanguage: lang,
    },
  } = await chrome.storage.local.get({
    browserInfo: {
      browserVersion: null,
      browserName: "Chrome",
      osName: null,
      osLanguage: "en",
    },
  });
  OSLanguage = lang;
  OSName = name;
  BrowserVersion = bVersion;
  BrowserName = bName;
};
