// Consts

const DefaultSyncPeriod = 12;
const AlarmKey = "plex-libray-sync";
// TODO: Simkl uninstall feedback url
const UNINSTALL_URL =
  "https://google.com/?q=why+u+remove+such+nice+things+,+madness";
// TODO: move this to false in prod
// const DEVELOPMENT = true;
const DEVELOPMENT = false;

// Utils

const stringify = (json) => {
  return Object.keys(json)
    .map((key) => {
      return encodeURIComponent(key) + "=" + encodeURIComponent(json[key]);
    })
    .join("&");
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Enums

(() => {
  // Get/Set nested Value in an object
  // an impostor which implements obj['p.q.r'] and obj['p.q.r'] = val
  // without the syntax
  const nestedIndex = (obj, key, newVal) => {
    if (!key) return undefined;
    let objC = obj;
    let parts = key.split(".");
    let i = 0;
    for (i = 0; i < parts.length - 1; i++) {
      objC = objC[parts[i]];
    }
    if (newVal == undefined) return objC[parts[i]];
    objC[parts[parts.length - 1]] = newVal;
  };

  // Returns an array of all leaf nodes from an object
  // won't work with arrays
  // example {x:'',xe:{p:'e'}} => returns ['x', 'xe.p']
  const nestedKeys = (obj, prefix) => {
    let keys = Object.keys(obj);
    prefix = prefix ? prefix + "." : "";
    return keys.reduce((result, key) => {
      if (isObject(obj[key])) {
        result = result.concat(nestedKeys(obj[key], prefix + key));
      } else {
        result.push(prefix + key);
      }
      return result;
    }, []);
  };

  const isObject = (x) => {
    return Object.prototype.toString.call(x) === "[object Object]";
  };

  Object.prototype.nestedKeys = function () {
    return nestedKeys(this);
  };

  Object.prototype.nestedIndex = function (key, val) {
    return nestedIndex(this, key, val);
  };
})();

Object.prototype.enumify = function () {
  // `Object.prototype.enumify`
  // will fill up nested objects with object[nestedkey] = nestedkey
  // i.e. {x:'',n:{e:{s:''}}} becomes {x:'x',n:{e:{s:'n.e.s'}}}
  // thus it is also idempotent
  // This is just a convinient function to have nested enums
  for (let k of this.nestedKeys()) {
    this.nestedIndex(k, k);
  }
  return this;
};

const CallType = {
  call: "",
  oauth: {
    plex: {
      oauthStart: "",
      checkTokenValiditiy: "",
    },
    simkl: {
      oauthStart: "",
      checkTokenValiditiy: "",
    },
  },
  apis: {
    plex: {
      getBgUrl: "",
    },
    simkl: {
      getLastActivity: "",
      getAllItems: "",
    },
  },
  bg: {
    sync: {
      start: "",
      stop: "",
    },
    popupAfterPermissionPrompt: "",
  },
};

const ActionType = {
  action: "",
  oauth: {
    plex: { login: "", logout: "", loginCheck: "" },
    simkl: { login: "", logout: "", loginCheck: "" },
  },
  ui: {
    sync: {
      enabled: "",
      disabled: "",
      plex: {
        online: "",
        offline: "",
        connecting: "",
        connectdone: "",
        unexpected: "",
        sessionexpired: "",
      },
      simkl: {
        online: "",
        offline: "",
        connecting: "",
        connectdone: "",
        unexpected: "",
        sessionexpired: "",
      },
      progress: "",
      finished: "",
      failed: "",
    },
  },
};

const MediaType = {
  movies: "",
  anime: "",
  shows: "",
};

// TODO: refactor all chrome.storage.{local,sync} key names here
const StorageKeys = {
  setBrowserInfo: "",
};

CallType.enumify();
ActionType.enumify();
MediaType.enumify();
StorageKeys.enumify();

// Not using these elsewhere so clean them up
delete Object.prototype.nestedIndex;
delete Object.prototype.nestedKeys;
delete Object.prototype.enumify;

// Logs intercept

const interceptLogs = () => {
  let cIdx = 0;
  let methods = ["debug", "log", "warn", "error"];
  let copyCon = methods
    .map((method) => ({ [method]: console[method] }))
    .reduce((acc, e) => (acc = { ...acc, ...e }));
  methods.forEach((method) => {
    globalThis[`console${method}`] = (...args) => {
      if (DEVELOPMENT) {
        let now = new Date().toISOString();
        cIdx++;
        const ac = new AbortController();
        // 1sec timeout:
        const timeoutId = setTimeout(() => ac.abort(), 400);
        fetch(`http://localhost:3000`, {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
          signal: ac.signal,
          body: JSON.stringify({
            index: cIdx,
            clientTime: now,
            logLevel: method,
            type: typeof window == "object" ? "window" : "sw",
            args: JSON.stringify(args),
          }),
        })
          .then(() => {
            clearTimeout(timeoutId);
          })
          .catch((e) => {
            // ignore abort error
            if (e instanceof DOMException) return;
            // copyCon.error(e);
          });
      }
      // https://github.com/akoidan/lines-logger
      return Function.prototype.bind.call(copyCon[method], console, ...args);
    };
  });
};

interceptLogs();
