chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("popup.html#fresh-install"),
  });
});

{
  // TODO: remove popup for plex oauth and use this
  /* chrome.webRequest.onBeforeRequest.addListener(
  function (details) {
    return {
      redirectUrl: chrome.runtime.getURL("popup.html#full"),
    };
  },
  { urls: ["*://simkl.com/apps/plex/sync/connected?sync-plex"] },
  ["blocking"]
); */
}

// Global state

let __OAUTH__ = {
  plex: {},
  simkl: {},
};

/*
  Plex: Oauth handling
  Guide to follow: https://forums.plex.tv/t/authenticating-with-plex/609370
*/
(() => {
  // TODO: Get plexToken from chrome.storage.sync
  // Check whether it's valid and request user to login again if not

  // Extension client Config for plex oauth

  // This is shown to user according to plex docs
  const PlexClientName = "SimklPlexDevTest1";
  // This can be anything random but needs to be unique forever
  const PlexClientID = "b7ca5397-2ba6-4c93-977b-5fca205dd322";
  // Plex login timeout in millisecs
  const PlexLoginTimeout = 600 * 1000;
  // const plexLoginTimeout = 1800 * 1000; // plex default login timeout

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
    console.debug(`http://${chrome.runtime.id}/popup.html#plex-oauth`);
    const authAppUrl =
      "https://app.plex.tv/auth#?" +
      stringify({
        forwardUrl: `http://${chrome.runtime.id}/popup.html#plex-oauth`,
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

  const plexOauthStart = async (responseChannel, inPopup) => {
    let resp = { code: null, id: null };
    let localdat = await chromeLocalGetAsync();
    const { pincode, pinid } = localdat;
    console.debug("localstorage:", localdat);
    if (!!pincode && !!pinid) {
      resp["code"] = pincode;
      resp["id"] = pinid;
      chrome.storage.local.set({ pincode: null, pinid: null });
      let response = await plexGetAuthToken(resp["id"], resp["code"]);
      console.debug("Plex authToken response:", response);
      if ("errors" in response) {
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
      } else {
        responseChannel(makeErrorResponse(response));
        return;
      }
    } else {
      // oauth first step
      resp = await plexRequestPIN();
      if ("error" in resp) {
        responseChannel(makeErrorResponse(resp));
        return;
      }
      chrome.storage.local.set(
        {
          pincode: resp["code"],
          pinid: resp["id"],
        },
        () => {
          chrome.storage.local.get().then((x) => console.debug("set", x));
        }
      );
    }
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

  __OAUTH__.plex["plexOauthStart"] = plexOauthStart;
  __OAUTH__.plex["plexCheckTokenValiditiy"] = plexCheckTokenValiditiy;
  __OAUTH__.plex["plexGetAuthToken"] = plexGetAuthToken;
})();

// TODO: Simkl: Oauth handling

// TODO: Periodic background sync

// Registering callbacks (calls)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("[SW] Got message:", message, "from:", sender);
  switch (message.type) {
    case "call":
      if (message.method == "oauth.plex.plexOauthStart") {
        let inPopup = message.inPopup;
        __OAUTH__.plex["plexOauthStart"](sendResponse, inPopup);
        // https://stackoverflow.com/a/57608759
        return true;
      } else if (message.method == "oauth.plex.plexCheckTokenValiditiy") {
        let token = message.token;
        __OAUTH__.plex["plexCheckTokenValiditiy"](sendResponse, token);
        return true;
      }
      break;
    case "action":
      // ignore actions they will be handled by
      // all instances of popup.js
      break;
    default:
      console.debug("Unknown message type", message.type);
      return true;
  }
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
  if (tab.url == `http://${chrome.runtime.id}/popup.html#plex-oauth`) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("/popup.html#plex-oauth"),
    });
  }
});
