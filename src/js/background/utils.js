const stringify = (json) => {
  return Object.keys(json)
    .map(function (key) {
      return encodeURIComponent(key) + "=" + encodeURIComponent(json[key]);
    })
    .join("&");
};

const chromeSyncGetAsync = async (key) => {
  // https://stackoverflow.com/a/58491883
  var p = new Promise(function (resolve, reject) {
    chrome.storage.sync.get(key, function (data) {
      resolve(data);
    });
  });
  return await p;
};

const chromeLocalGetAsync = async (key) => {
  // https://stackoverflow.com/a/58491883
  var p = new Promise(function (resolve, reject) {
    chrome.storage.local.get(key, function (data) {
      resolve(data);
    });
  });
  return await p;
};

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
