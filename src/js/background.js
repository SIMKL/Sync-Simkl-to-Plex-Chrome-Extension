// Extension on install register

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("popup.html#fresh-install"),
  });
});

// Global state

// api methods to use globally

let __API__ = {
  plex: {
    oauth: {},
    apis: {},
  },
  simkl: {
    oauth: {},
    apis: {},
  },
};

// this is used to intercept and open the extension page
const HttpCrxRedirectStub = `http://${chrome.runtime.id}`;

// Utility functions

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

/*
  Plex: API handling
  Guide for Oauth: https://forums.plex.tv/t/authenticating-with-plex/609370
*/

const PlexRedirectURI = `${HttpCrxRedirectStub}/popup.html#plex-oauth`;

(() => {
  // Extension client Config for plex oauth
  // This is shown to user according to plex docs
  const PlexClientName = "SimklPlexDevTest1";
  // This can be anything random but needs to be unique forever
  const PlexClientID = "b7ca5397-2ba6-4c93-977b-5fca205dd322";
  // Plex login timeout in millisecs
  // const PlexLoginTimeout = 600 * 1000;
  // const plexLoginTimeout = 1800 * 1000; // plex default login timeout

  const plexCheckTokenValiditiy = async (responseChannel, token) => {
    if (!token) {
      let { plexOauthToken } = await chromeSyncGetAsync({
        plexOauthToken: null,
      });
      token = plexOauthToken;
      console.debug("saved PlexOauthToken: " + token);
      if (!token) {
        responseChannel({ authToken: null, valid: false });
        return;
      }
    }
    let resp = await fetch(
      "https://plex.tv/api/v2/user?" +
        stringify({
          "X-Plex-Product": PlexClientName,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Token": token,
        }),
      {
        headers: {
          accept: "application/json",
          // if using body instead of query params plex requires
          // content-type: application/x-www-form-urlencoded
        },
      }
    );
    let data = {};
    try {
      data = await resp.json();
      const { authToken } = data;
      let valid = !!authToken;
      if (valid) {
        data = { authToken, valid };
      }
    } catch (error) {
      // invalid json response
      responseChannel(
        makeErrorResponse({
          authToken: null,
          valid: false,
          error: error,
          message: "Invalid JSON response received",
          status: resp.status,
        })
      );
      return;
    }
    if (resp.status >= 300) {
      responseChannel(
        makeErrorResponse({
          authToken: null,
          valid: false,
          error: data,
          message: "Failed to validate auth Token",
          status: resp.status,
        })
      );
      return;
    }
    responseChannel(makeSuccessResponse(data));
  };

  const plexGetAuthToken = async (pinID, pincode) => {
    let qry = stringify({
      "X-Plex-Client-Identifier": PlexClientID,
      code: pincode,
    });
    return await (
      await fetch(`https://plex.tv/api/v2/pins/${pinID}?${qry}`, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      })
    ).json();
  };

  // TODO: to remove the plex warning
  // we need to proxy this particular request
  // on simkl.com php backend
  const plexRequestPIN = async () => {
    const resp = await fetch(
      "https://plex.tv/api/v2/pins?" +
        stringify({
          strong: "true",
          "X-Plex-Product": PlexClientName,
          "X-Plex-Client-Identifier": PlexClientID,
        }),
      {
        method: "POST",
        headers: {
          Accept: "application/json",
        },
      }
    );
    let data = await resp.json();
    if (resp.status >= 300) {
      return {
        message: "Something went wrong",
        error: data,
        status: resp.status,
      };
    }
    return {
      id: data["id"],
      code: data["code"],
    };
  };

  const plexLoginURI = (plexPINcode) => {
    console.debug(PlexRedirectURI);
    const authAppUrl =
      "https://app.plex.tv/auth#?" +
      stringify({
        forwardUrl: PlexRedirectURI,
        clientID: PlexClientID,
        code: plexPINcode,
        "context[device][product]": PlexClientName,
        // context:{device:{product:plexClientName}}
        // TODO: We can't have a forwardURL to a chrome extension it seems
        // Check if it's possible and remove polling logic
      });
    // https://app.plex.tv/auth/#?forwardUrl=http%3A%2F%2Ffdoomgaljjnbjgfijmbomnalapkmjifl%2Fpopup.html%23plex-oauth&clientID=b7ca5397-2ba6-4c93-977b-5fca205dd322&code=qb7i9igf3qy23pnr5ekolpshp&context%5Bdevice%5D%5Bproduct%5D=SimklPlexDevTest1
    // https://app.plex.tv/auth/#?forwardUrl=http%3A%2F%2Ffdoomgaljjnbjgfijmbomnalapkmjifl%2Fpopup.html%23plex-oauth&clientID=b7ca5397-2ba6-4c93-977b-5fca205dd322&code=null&context%5Bdevice%5D%5Bproduct%5D=SimklPlexDevTest1
    // https://app.plex.tv/auth/#?forwardUrl=http%3A%2F%2Ffdoomgaljjnbjgfijmbomnalapkmjifl%2Fpopup.html%23plex-oauth&clientID=b7ca5397-2ba6-4c93-977b-5fca205dd322&code=null&context%5Bdevice%5D%5Bproduct%5D=SimklPlexDevTest1
    return authAppUrl;
  };

  const plexOauthStart = async (responseChannel, inPopup) => {
    let resp = { code: null, id: null };
    let localdat = await chromeLocalGetAsync();
    const { plexPinCode, plexPinID } = localdat;
    console.debug("localStorage:", localdat);
    if (!!plexPinCode && !!plexPinID) {
      // oauth second step
      resp["code"] = plexPinCode;
      resp["id"] = plexPinID;
      chrome.storage.local.set({ plexPinCode: null, plexPinID: null });
      let response = await plexGetAuthToken(resp["id"], resp["code"]);
      console.debug("Plex authToken response:", response);
      if ("errors" in response) {
        // TODO: this might be because pincode and pinid expired
        // they stayed in the local storage for too long
        // failed to authenticate the user
        // show error message
        responseChannel(makeErrorResponse(response));
        return;
      }
      if (response["authToken"] != null) {
        // got the plex authtoken
        // successfully logged in
        responseChannel(
          makeSuccessResponse({ authToken: response["authToken"] })
        );
        return;
      }
      responseChannel(makeErrorResponse(response));
      return;
    }
    // oauth first step
    resp = await plexRequestPIN();
    if ("error" in resp) {
      responseChannel(makeErrorResponse(resp));
      return;
    }
    // save to local storage
    chrome.storage.local.set({
      plexPinCode: resp["code"],
      plexPinID: resp["id"],
    });

    let oauthUrl = plexLoginURI(resp["code"]);
    console.debug("Plex oauth URL:", oauthUrl);
    if (inPopup) {
      // open url in new tab
      chrome.tabs.create({ url: oauthUrl });
    } else {
      // open url in same tab
      chrome.tabs.update({ url: oauthUrl });
    }
    return true;
  };

  __API__.plex.oauth["plexOauthStart"] = plexOauthStart;
  __API__.plex.oauth["plexCheckTokenValiditiy"] = plexCheckTokenValiditiy;
  __API__.plex.oauth["plexGetAuthToken"] = plexGetAuthToken;
})();

// Simkl: API handling
const SimklRedirectURI = `${HttpCrxRedirectStub}/popup.html#simkl-oauth`;

(() => {
  // TODO: github actions and repo secrets for these two

  // const simklGetAllItemsFullSync =
  const simklGetAllItems = async (responseChannel, dateFrom, token) => {
    let types = ["shows", "movies", "anime"];
    let responses = await Promise.all(
      types.map((type) =>
        fetch(
          `https://api.simkl.com/sync/all-items/${type}?` +
            "episode_watched_at=yes" +
            (!dateFrom ? "" : `&date_from=${dateFrom}`) +
            (type == "movies" ? "" : "&extended=full"),
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "simkl-api-key": SimklClientID,
            },
          }
        )
      )
    );
    responses.forEach(async (resp, i) => {
      if (resp.status == 200) {
        let items = await resp.json();
        console.debug("Got items: ", types[i], resp.headers);
      }
    });
    return true;
  };

  const simklGetLastActivity = async (responseChannel, token) => {
    let resp = await fetch("https://api.simkl.com/sync/activities", {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "simkl-api-key": SimklClientID,
      },
    });
    if (resp.status == 200) {
      let data = await resp.json();
      console.debug("Last Activity:", data);
      !!responseChannel && responseChannel(makeSuccessResponse(data));
      return true;
    }
    console.debug(resp.status, resp.statusText);
    let data = await resp.text();
    console.debug("Error: Last Activity:", data);
    !!responseChannel && responseChannel(makeErrorResponse(data));
    return false;
  };

  const simklCheckTokenValiditiy = async (responseChannel, token) => {
    if (!!token) {
      let valid = await simklGetLastActivity(null, token);
      responseChannel(makeSuccessResponse({ authToken: token, valid }));
      return;
    }
    let syncedData = await chromeSyncGetAsync("simklOauthToken");
    console.debug("Simkl:TokenValidatity:localstorage", syncedData);
    let { simklOauthToken } = syncedData;
    if (!!simklOauthToken) {
      let valid = await simklGetLastActivity(null, simklOauthToken);
      responseChannel(
        makeSuccessResponse({ authToken: simklOauthToken, valid })
      );
      return;
    }
    // no token provided or found in localstorage
    responseChannel(makeErrorResponse({ authToken: null, valid: false }));
    return;
  };

  const simklGetAuthToken = async (code) => {
    let req = {
      code: code,
      client_id: SimklClientID,
      client_secret: SimklClientSecret,
      redirect_uri: SimklRedirectURI,
      grant_type: "authorization_code",
    };
    return await (
      await fetch("https://api.simkl.com/oauth/token", {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
      })
    ).json();
  };

  const simklLoginURI = () => {
    // Docs: https://simkl.docs.apiary.io/#reference/authentication-oauth-2.0/authorize-application?console=1
    return (
      "https://simkl.com/oauth/authorize?" +
      stringify({
        response_type: "code",
        client_id: SimklClientID,
        redirect_uri: SimklRedirectURI,
      })
    );
  };

  const simklOauthStart = async (responseChannel, inPopup) => {
    let localdat = await chromeLocalGetAsync();
    console.debug("localStorage:", localdat);
    const { simklPinCode } = localdat;

    if (!!simklPinCode) {
      let response = await simklGetAuthToken(simklPinCode);
      console.debug("Simkl access_token response:", response);
      if ("error" in response) {
        // failed to authenticate the user
        // TODO: this might be because code expired
        // it stayed in the local storage for too long
        responseChannel(makeErrorResponse(response));
        return;
      }
      if (response["access_token"] != null) {
        // got the plex authtoken
        // successfully logged in
        // code is one time use only forget it
        chrome.storage.local.set({ simklPinCode: null });
        responseChannel(
          makeSuccessResponse({ authToken: response["access_token"] })
        );
        return;
      }
      responseChannel(makeErrorResponse(response));
      return;
    }

    let appAuthorizeUrl = simklLoginURI();
    console.debug("Simkl application auth URL:", appAuthorizeUrl);
    if (inPopup) {
      // open url in new tab
      chrome.tabs.create({ url: appAuthorizeUrl });
    } else {
      // open url in same tab
      chrome.tabs.update({ url: appAuthorizeUrl });
    }
    return true;
  };

  __API__.simkl.oauth["simklOauthStart"] = simklOauthStart;
  __API__.simkl.oauth["simklCheckTokenValiditiy"] = simklCheckTokenValiditiy;

  __API__.simkl.apis["simklGetLastActivity"] = simklGetLastActivity;
  __API__.simkl.apis["simklGetAllItems"] = simklGetAllItems;
})();

// TODO: Periodic background sync

// Registering callbacks (calls)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("[SW] Got message:", message, "from:", sender);
  switch (message.type) {
    case "call":
      switch (message.method) {
        case "oauth.plex.plexOauthStart":
          __API__.plex.oauth["plexOauthStart"](sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case "oauth.plex.plexCheckTokenValiditiy":
          __API__.plex.oauth["plexCheckTokenValiditiy"](
            sendResponse,
            message.token
          );
          return true;
        case "oauth.simkl.simklOauthStart":
          __API__.simkl.oauth["simklOauthStart"](sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case "oauth.simkl.simklCheckTokenValiditiy":
          __API__.simkl.oauth["simklCheckTokenValiditiy"](
            sendResponse,
            message.token
          );
          return true;
        case "apis.simkl.simklGetLastActivity":
          __API__.simkl.apis["simklGetLastActivity"](
            sendResponse,
            message.token
          );
          return true;
        case "apis.simkl.simklGetAllItems":
          __API__.simkl.apis["simklGetAllItems"](
            sendResponse,
            message.dateFrom,
            message.token
          );
          return true;

        default:
          console.debug("Unknown message call", message);
          break;
      }
      break;
    case "action":
      // ignore actions they will be handled by
      // all instances of popup.js
      break;
    default:
      console.debug("Unknown message type", message.type);
      break;
  }
  return true;
});

// Intercept and redirect to chrome-extension://

function handleOauthIntercepts() {
  return ({ tabId, url }) => {
    if (url == PlexRedirectURI) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("/popup.html#plex-oauth"),
      });
    } else if (url.startsWith(SimklRedirectURI)) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("/popup.html#simkl-oauth"),
      });
      let parts = url.split("?");
      let simklPinCode = parts[parts.length - 1].split("=")[1];
      console.debug(`got pincode for simkl: ${simklPinCode}`);
      chrome.storage.local.set({
        simklPinCode: simklPinCode,
      });
    }
  };
}

// This had to be done because declarativeNetRequest is not working
// in combination with server redirect (explained in devlog.md/4-2-22)

// also capture errors because for plex ?code= is making onBeforeNavigate take way too long
chrome.webNavigation.onErrorOccurred.addListener(handleOauthIntercepts(), {
  url: [{ urlPrefix: HttpCrxRedirectStub }],
});

chrome.webNavigation.onBeforeNavigate.addListener(handleOauthIntercepts(), {
  url: [{ urlPrefix: HttpCrxRedirectStub }],
});
