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

  Object.prototype.enumify = function () {
    for (let k of this.nestedKeys()) {
      this.nestedIndex(k, k);
    }
    return this;
  };
})();

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
    plex: {},
    simkl: {
      getLastActivity: "",
      getAllItems: "",
    },
  },
  bg: {
    addInterceptListeners: "",
  },
};
// `Object.prototype.enumify` defined in above
// it will fill up nested objects with object[nestedkey] = nestedkey
// i.e. {x:'',n:{e:{s:''}}} becomes {x:'x',n:{e:{s:'n.e.s'}}}
// thus it is also idempotent
CallType.enumify();

const ActionType = {
  action: "",
  oauth: {
    plex: { login: "", logout: "" },
    simkl: { login: "", logout: "" },
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
    },
  },
};

ActionType.enumify();

const DefaultSyncPeriod = 12;
