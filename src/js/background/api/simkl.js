const SimklRedirectURI = `${HttpCrxRedirectStub}/popup.html#simkl-oauth`;

(() => {
  importScripts("./env.js");

  const broadcastOnlineStatus = (online = true) => {
    // inform clients simkl couldn't be reached
    let message = {
      action: online
        ? ActionType.ui.sync.simkl.online
        : ActionType.ui.sync.simkl.offline,
      type: ActionType.action,
    };
    chrome.runtime.sendMessage(message);
  };

  const checkTokenValiditiy = async (responseChannel, token) => {
    responseChannel =
      responseChannel ||
      ((data) => {
        let message = {
          ...data,
          type: ActionType.action,
          action: ActionType.oauth.simkl.loginCheck,
        };
        chrome.runtime.sendMessage(message);
      });

    if (!!token) {
      let { valid, error } = await getLastActivity(token);
      responseChannel(makeSuccessResponse({ authToken: token, valid, error }));
      return;
    }
    let { simklOauthToken } = await chrome.storage.sync.get({
      simklOauthToken: null,
    });
    if (!!simklOauthToken) {
      let { valid, error } = await getLastActivity(simklOauthToken);
      consoledebug("Saved simkl token:", simklOauthToken)();
      responseChannel(
        makeSuccessResponse({ authToken: simklOauthToken, valid, error })
      );
      return;
    }
    // no token provided or found in localstorage
    responseChannel(
      makeErrorResponse({ authToken: null, valid: false, error: null })
    );
    return;
  };

  const getAuthToken = async (code) => {
    try {
      let req = {
        code: code,
        client_id: SimklClientID,
        client_secret: SimklClientSecret,
        redirect_uri: SimklRedirectURI,
        grant_type: "authorization_code",
      };
      let resp = await fetch(`${SimklAPIDomain}/oauth/token`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
      });
      broadcastOnlineStatus();
      if (resp.status === 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return { error: "offline" };
    }
  };

  const loginURI = () => {
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

  const oauthStart = async (responseChannel, inPopup) => {
    let { simklPinCode } = await chrome.storage.local.get({
      simklPinCode: null,
    });
    consoledebug("localStorage:", { simklPinCode })();

    if (!!simklPinCode) {
      // after redirect step
      let response = await getAuthToken(simklPinCode);
      consoledebug("Simkl access_token response:", response)();
      if ("error" in response) {
        // failed to authenticate the user
        // TODO(#16): this might be because code expired
        // it stayed in the local storage for too long
        responseChannel(makeErrorResponse(response));
        return;
      }
      if (response["access_token"] != null) {
        // got the plex authtoken
        // successfully logged in
        // code is one time use only forget it
        chrome.storage.local.remove("simklPinCode");
        responseChannel(
          makeSuccessResponse({ authToken: response["access_token"] })
        );
        return;
      }
      responseChannel(makeErrorResponse(response));
      return;
    }

    let appAuthorizeUrl = loginURI();
    consoledebug("Simkl application auth URL:", appAuthorizeUrl)();
    if (inPopup) {
      // open url in new tab
      chrome.tabs.create({ url: appAuthorizeUrl });
    } else {
      // open url in same tab
      // BUGLOC: chromeTabsUpdateBugVerCheck happens here
      chrome.tabs.update({ url: appAuthorizeUrl }, () => {
        // this debugging step printed nothing when chromeTabsUpdateBugVerCheck
        // bug was happening (when reaching this point)
        chrome.runtime.lastError && consoleerror(chrome.runtime.lastError)();
      });
    }
    return true;
  };

  const getAllItems = async ({ dates, token }, responseChannel, signal) => {
    consoledebug("getAllItems: ", dates)();
    let types =
      dates == null
        ? // dates will be null if full sync
          [MediaType.anime, MediaType.shows, MediaType.movies]
        : // only loop over provided date types
          Object.keys(dates);
    let serverTime;
    try {
      let responses = await Promise.all(
        types.map((type) =>
          fetch(
            `${SimklAPIDomain}/sync/all-items/${type}?` +
              "episode_watched_at=yes" +
              (dates && type in dates ? `&date_from=${dates[type]}` : "") +
              (type == "movies" ? "" : "&extended=full"),
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "simkl-api-key": SimklClientID,
              },
              signal,
            }
          ).catch((err) => {
            throw err;
          })
        )
      );
      broadcastOnlineStatus();
      let data = {};
      await Promise.all(
        responses.map(async (resp, i) => {
          if (!serverTime) {
            serverTime = await getServerTime(resp);
          }
          if (resp.status == 200) {
            let items = await resp.json();
            if (items) {
              consoledebug("Got items for: ", types[i])();
              data[types[i]] = items[types[i]];
              return;
            }
            data[types[i]] = [];
          }
        })
      );
      if (!serverTime) {
        serverTime = await getServerTime(null);
      }
      if (!!responseChannel) {
        // TODO: remove this, responseChannel is unused
        Object.keys(data).length == types.length
          ? responseChannel(makeSuccessResponse(data))
          : responseChannel(makeErrorResponse(data));
      }
      return {
        success: Object.keys(data).length == types.length,
        data,
        serverTime,
      };
    } catch (error) {
      broadcastOnlineStatus(false);
      if (!serverTime) {
        serverTime = await getServerTime(null);
      }
      return { success: false, error: error, serverTime };
    }
  };

  const getLastActivity = async (token, responseChannel = null) => {
    try {
      let resp = await fetch(`${SimklAPIDomain}/sync/activities`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "simkl-api-key": SimklClientID,
        },
      });
      broadcastOnlineStatus();
      if (resp.status == 200) {
        let data = await resp.json();
        !!responseChannel && responseChannel(makeSuccessResponse(data));
        return { valid: true, info: data };
      }
      let data = await resp.json();
      !!responseChannel && responseChannel(makeErrorResponse(data));
      return { valid: false, info: data, status: resp.status };
    } catch (error) {
      broadcastOnlineStatus(false);
      return { valid: false, info: null, error: "offline" };
    }
  };

  const getUserInfo = async (token) => {
    try {
      let resp = await fetch(`${SimklAPIDomain}/users/settings`, {
        headers: {
          "Content-Type": "application/json",
          "simkl-api-key": SimklClientID,
          Authorization: `Bearer ${token}`,
        },
      });
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  const getMediaById = async (token, mPlexids) => {
    // TODO
    try {
      let resp = await fetch(
        `${SimklAPIDomain}/search/id?` +
          stringify({
            imdb: "tt1972591",
          }),
        {
          headers: {
            "Content-Type": "application/json",
            "simkl-api-key": SimklClientID,
            Authorization: `Bearer ${token}`,
          },
        }
      );
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  const syncItemsToSimklList = async (token, items) => {
    // TODO
    // items should be of the form
    /*
      https://simkl.docs.apiary.io/#reference/sync/remove-ratings/add-items-to-specific-list
      {
        "movies": [{
          "title": "", // optional
          "year": <int|str>, // optional
          "to": "<plantowatch|completed|watching|hold|notinteresting>", // required
          "watched_at": "2014-10-10T22:10:00", // optional
          "ids": {
            "<source>": "<id>" // atleast one required for simkl to match
          }
        }, ...],
        "shows": [
          { <same as movies except watched_at>* },
          ...
        ]
      }
    */

    try {
      let resp = await fetch(`${SimklAPIDomain}/sync/add-to-list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "simkl-api-key": SimklClientID,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(items),
      });
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  const syncAddItemsToHistory = async (token, items) => {
    // TODO
    try {
      let resp = await fetch(`${SimklAPIDomain}/sync/history`, {
        method: "POST",
        body: JSON.stringify(items),
        headers: {
          "Content-Type": "application/json",
          "simkl-api-key": SimklClientID,
          Authorization: `Bearer ${token}`,
        },
      });
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  const getShowEpisodeList = async (token, showID) => {
    try {
      let resp = await fetch(`${SimklAPIDomain}/tv/episodes/${showID}`, {
        headers: {
          "Content-Type": "application/json",
          "simkl-api-key": SimklClientID,
          Authorization: `Bearer ${token}`,
        },
      });
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return await resp.json();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  __API__.simkl.oauth.oauthStart = oauthStart;
  __API__.simkl.oauth.checkTokenValiditiy = checkTokenValiditiy;

  __API__.simkl.apis.getLastActivity = getLastActivity;
  __API__.simkl.apis.getAllItems = getAllItems;
  __API__.simkl.apis.getUserInfo = getUserInfo;
  __API__.simkl.apis.getMediaById = getMediaById;
  __API__.simkl.apis.syncItemsToSimklList = syncItemsToSimklList;
  __API__.simkl.apis.syncAddItemsToHistory = syncAddItemsToHistory;
  __API__.simkl.apis.getShowEpisodeList = getShowEpisodeList;
})();
