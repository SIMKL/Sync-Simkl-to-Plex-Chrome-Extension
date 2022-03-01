/*
  Plex: API handling
  Guide for Oauth:  https://forums.plex.tv/t/authenticating-with-plex/609370
  Docs for API:     https://github.com/Arcanemagus/plex-api/wiki
                    https://github.com/pkkid/python-plexapi
                    https://github.com/jrudio/go-plex-client
*/

const PlexRedirectURI = `${HttpCrxRedirectStub}/popup.html#plex-oauth`;

(async () => {
  await loadBrowserInfo();

  // Extension client Config for plex oauth
  // This is shown to user according to plex docs
  const PlexClientName = "Simkl>Plex(Dev)";
  const PlexClientNameHumanReadable = "Simkl to Plex";
  const PlexClientVersion = chrome.runtime.getManifest().version + ".dev";
  // This can be anything random but needs to be unique forever
  const PlexClientID =
    "ab13e1dbe1919ac4d775912da8d3e7a61c3d58cc3395980c2a183e1d9627ee8a174a48f926e728e6645c1b17d8da9299ed00887a6f3c45ee2f2d9d9e4c6ed802";
  // const PlexClientID = await sha512(`${PlexClientName} ${PlexClientVersion}`);

  const broadcastOnlineStatus = (online = true) => {
    // inform clients plex couldn't be reached
    let message = {
      action: online
        ? ActionType.ui.sync.plex.online
        : ActionType.ui.sync.plex.offline,
      type: ActionType.action,
    };
    chrome.runtime.sendMessage(message);
  };

  const throwError = (err) => {
    consoleerror(err)();
    throw err;
  };

  const stringifyPlex = (data) => {
    return stringify({
      ...data,
      "X-Plex-Device-Name": PlexClientNameHumanReadable,
      "X-Plex-Product": PlexClientName,
      "X-Plex-Client-Identifier": PlexClientID,
      "X-Plex-Version": PlexClientVersion,
      "X-Plex-Platform": BrowserName,
      "X-Plex-Platform-Version": BrowserVersion,
      "X-Plex-Device": OSName,
      "X-Plex-Language": OSLanguage,
    });
  };

  const checkTokenValiditiy = async (responseChannel, token) => {
    responseChannel =
      responseChannel ||
      ((data) => {
        let message = {
          ...data,
          type: ActionType.action,
          action: ActionType.oauth.plex.loginCheck,
        };
        chrome.runtime.sendMessage(message);
      });
    consoledebug("SW: Checking token validity")();
    if (!token) {
      let { plexOauthToken } = await chrome.storage.sync.get({
        plexOauthToken: null,
      });
      token = plexOauthToken;
      consoledebug("The saved plexOauthToken: " + token)();
      if (!token) {
        responseChannel({ authToken: null, valid: false });
        return;
      }
    }
    try {
      const ac = new AbortController();
      // 5 second timeout:
      const timeoutId = setTimeout(() => ac.abort(), 5000);
      consoledebug("SW: fetch user info from plex.tv")();
      let resp = await fetch(
        "https://plex.tv/api/v2/user?" +
          stringifyPlex({
            "X-Plex-Token": token,
          }),
        {
          signal: ac.signal,
          headers: {
            accept: "application/json",
          },
        }
      ).catch(throwError);
      clearTimeout(timeoutId);
      broadcastOnlineStatus();
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
      consoledebug("SW: got the response")();
      responseChannel(makeSuccessResponse(data));
    } catch (error) {
      broadcastOnlineStatus(false);
      consoledebug("SW: Couldn't connect to plex.tv")();
      responseChannel(
        makeErrorResponse({
          authToken: null,
          valid: false,
          error: error,
          message: "Couldn't connect to plex.tv",
        })
      );
    }
  };

  const getAuthToken = async (pinID, pincode) => {
    let qry = stringifyPlex({
      code: pincode,
    });
    try {
      let resp = await fetch(`https://plex.tv/api/v2/pins/${pinID}?${qry}`, {
        method: "GET",
        headers: {
          accept: "application/json",
        },
      }).catch(throwError);
      broadcastOnlineStatus();
      let data = await resp.json();
      return data;
    } catch (error) {
      broadcastOnlineStatus(false);
      return null;
    }
  };

  // TODO: to remove the plex warning
  // we need to proxy this particular request
  // on simkl.com php backend
  const plexRequestPIN = async () => {
    try {
      const resp = await fetch(
        "https://plex.tv/api/v2/pins?" +
          stringifyPlex({
            strong: "true",
          }),
        {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
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
    } catch (error) {
      broadcastOnlineStatus(false);
      return {
        message: "Couldn't connect to plex.tv",
        error: error,
      };
    }
  };

  const plexLoginURI = (plexPINcode) => {
    consoledebug(PlexRedirectURI)();
    const authAppUrl =
      "https://app.plex.tv/auth#?" +
      stringify({
        clientID: PlexClientID,
        code: plexPINcode,
        "context[device][product]": PlexClientName,
        // We can't have a forwardURL with a chrome-extension:// scheme
        // so using webRequest api to intercept http://<chrome_ext_id>
        // and using that as the forwardUrl
        forwardUrl: PlexRedirectURI,
      });
    return authAppUrl;
  };

  const oauthStart = async (responseChannel, inPopup) => {
    let resp = { code: null, id: null };
    let { plexPinCode, plexPinID } = await chrome.storage.local.get();
    consoledebug("localStorage:", { plexPinCode, plexPinID })();
    if (!!plexPinCode && !!plexPinID) {
      // oauth second step (after redirect)
      resp["code"] = plexPinCode;
      resp["id"] = plexPinID;
      chrome.storage.local.remove("plexPinCode", "plexPinID");
      let response = await getAuthToken(resp["id"], resp["code"]);
      if (response == null) {
        return;
      }
      consoledebug("Plex authToken response:", response)();
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
    consoledebug("Plex oauth URL:", oauthUrl)();
    if (inPopup) {
      // open url in new tab
      chrome.tabs.create({ url: oauthUrl });
    } else {
      // open url in same tab
      chrome.tabs.update({ url: oauthUrl }, () => {
        chrome.runtime.lastError && consoleerror(chrome.runtime.lastError)();
      });
    }
    return true;
  };

  const getLocalServers = async ({ plexToken, plexApiBaseURL }) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}servers?` +
          stringify({
            "X-Plex-Token": plexToken,
          }),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      try {
        let data = await resp.json();
        consoledebug(data)();
        if (!!data.MediaContainer && !!data.MediaContainer.Server) {
          return { servers: data.MediaContainer.Server, error: null };
        }
        return { error: "unexpected", servers: null };
      } catch (error) {
        // not json, might be xml
        let xml = await resp.text();
        let xmlData = txml.parse(xml);
        return { servers: xmlData, error: null };
      }
    } catch (err) {
      broadcastOnlineStatus(false);
    }
  };

  const getLibrarySections = async (
    { plexToken, plexApiBaseURL },
    fullResponse = false
  ) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}library/sections?` +
          stringifyPlex({
            "X-Plex-Token": plexToken,
          }),
        {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        try {
          let data = await resp.json();
          if (!!data.MediaContainer && !!data.MediaContainer.Directory) {
            return {
              libraries: fullResponse
                ? data.MediaContainer.Directory
                : data.MediaContainer.Directory.filter((l) =>
                    ["show", "movie"].includes(l.type)
                  ),
              error: null,
            };
          }
          return { error: "unexpected", libraries: null };
        } catch (error) {
          // TODO: invalid json response
          return { error: error, libraries: null };
        }
      }
      return { error: resp.statusText, libraries: null, status: resp.status };
    } catch (error) {
      broadcastOnlineStatus(false);
      return { error: "offline", libraries: null };
    }
  };

  const getLibrarySectionAll = async (
    { plexToken, plexApiBaseURL, libraryKey },
    libraryKind = "movie"
  ) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}library/sections/${libraryKey}/all?` +
          stringifyPlex({
            // movies   -> 1
            // shows    -> 2
            // seasons  -> 3
            // episodes -> 4
            type: libraryKind == "movie" ? 1 : 4,
            includeGuids: 1,
            // "X-Plex-Container-Start": 0,
            // TODO: if unspecified know what's the limit
            // and know what's the max limit for container size
            // in general (when specified)
            // worked for 1274 items
            // "X-Plex-Container-Size": 50,
            "X-Plex-Text-Format": "plain",
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            accept: "application/json",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        try {
          let data = await resp.json();
          if (!!data.MediaContainer && !!data.MediaContainer.Metadata) {
            return {
              items: data.MediaContainer.Metadata,
              error: null,
            };
          }
          consoledebug(data)();
          return { error: "unexpected", items: null };
        } catch (error) {
          // TODO: invalid json response
          return { error: error, items: null };
        }
      }
      // sync-error
      consoledebug(resp.status, await resp.text())();
      return { status: resp.status, error: "failed", items: null };
    } catch (error) {
      broadcastOnlineStatus(false);
    }
  };

  const getUserDevices = async (plexToken) => {
    try {
      let resp = await fetch(
        "https://plex.tv/devices.xml?" +
          stringify({
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            Accept: "application/xml",
          },
        }
      ).catch(throwError);
      // TODO: here plex.tv is offline not local plex instance
      // make it clear in the ui?
      broadcastOnlineStatus();
      let xml = await resp.text();
      let xmlData = txml.parse(xml);
      return { devices: xmlData, error: null };
    } catch (error) {
      broadcastOnlineStatus(false);
      return { devices: null, error: "offline" };
    }
  };

  const healthCheck = async () => {
    return false;
  };

  const getUserProfiles = async (plexToken) => {
    try {
      let resp = await fetch(
        "https://plex.tv/api/home/users?" +
          stringifyPlex({
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            accept: "application/xml",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        let xml = await resp.text();
        consoledebug(txml.parse(xml))();
        return;
      }
      consoledebug(resp.status)();
    } catch (error) {
      broadcastOnlineStatus(false);
    }
  };

  const getUserProfileInfo = async (plexToken) => {
    try {
      let resp = await fetch(
        "https://plex.tv/api/users?" +
          stringifyPlex({
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            accept: "application/json",
          },
          method: "GET",
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        let xml = await resp.text();
        consoledebug(txml.parse(xml))();
        return;
      }
      consoledebug(resp.status)();
    } catch (error) {
      broadcastOnlineStatus(false);
    }
  };

  const markMovieWatched = (
    { plexToken, plexApiBaseURL, movieKey, name },
    markUnwatched = false
  ) => {
    return scrobbleKey(
      {
        plexToken,
        plexApiBaseURL,
        plexRatingKey: movieKey,
        info: {
          type: "movie",
          name: name,
        },
      },
      markUnwatched
    );
  };

  const markEpisodeWatched = (
    { plexToken, plexApiBaseURL, episodeKey, name },
    markUnwatched = false
  ) => {
    return scrobbleKey(
      {
        plexToken,
        plexApiBaseURL,
        plexRatingKey: episodeKey,
        info: {
          type: "episode",
          name: name,
        },
      },
      markUnwatched
    );
  };

  const markSeasonWatched = (
    { plexToken, plexApiBaseURL, seasonKey, name },
    markUnwatched = false
  ) => {
    return scrobbleKey(
      {
        plexToken,
        plexApiBaseURL,
        plexRatingKey: seasonKey,
        info: {
          type: "season",
          name: name,
        },
      },
      markUnwatched
    );
  };

  const markShowWatched = (
    { plexToken, plexApiBaseURL, showKey, name },
    markUnwatched = false
  ) => {
    return scrobbleKey(
      {
        plexToken,
        plexApiBaseURL,
        plexRatingKey: showKey,
        info: {
          type: "show",
          name: name,
        },
      },
      markUnwatched
    );
  };

  const scrobbleKey = async (
    { plexToken, plexApiBaseURL, plexRatingKey, info },
    markUnwatched = false
  ) => {
    consolelog(
      `Marking ${info.type} ${info.name} with key ${plexRatingKey}: ${
        markUnwatched ? "un" : ""
      }watched`
    )();
    return;
    try {
      let resp = await fetch(
        `${plexApiBaseURL}:/${markUnwatched ? "un" : ""}scrobble?` +
          stringifyPlex({
            identifier: "com.plexapp.plugins.library",
            key: plexRatingKey,
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            accept: "application/json, text/plain, */*",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        consoledebug(await resp.text())();
      }
    } catch (error) {
      broadcastOnlineStatus(false);
    }
  };

  const lookupItemByGuid = async (guid) => {
    // guid can be of the form imdb://tt0944947, tmdb://1399, tvdb://121361
    // TODO this might not be needed
  };

  const matchItemBySearchTerm = async (
    { plexToken, plexApiBaseURL, plexRatingKey },
    term,
    year = ""
  ) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}library/metadata/${plexRatingKey}/matches?` +
          stringifyPlex({
            manual: 1,
            title: term,
            agent: "tv.plex.agents.movie",
            year: year,
            language: "en-US",
            "X-Plex-Token": plexToken,
            "X-Plex-Language": "en",
          }),
        {
          headers: {
            accept: "application/json",
          },
          body: null,
          method: "GET",
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        let data = await resp.json();
        return data;
      }
      return {};
    } catch (error) {
      broadcastOnlineStatus(false);
    }
  };

  // can rate episode, movie, season, show
  const rateMediaItem = async (
    { plexToken, plexApiBaseURL, plexRatingKey },
    rating
  ) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}:/rate?` +
          stringifyPlex({
            identifier: "com.plexapp.plugins.library",
            key: plexRatingKey,
            rating: rating,
          }),
        {
          headers: {
            accept: "application/json, text/plain, */*",
            "x-plex-text-format": "plain",
            "x-plex-token": plexToken,
          },
          method: "PUT",
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status == 200) {
        return { error: null };
      }
      return { status: resp.status, error: "failed" };
    } catch (error) {
      broadcastOnlineStatus(false);
      return { error };
    }
  };

  const plexThumbURL = (thumbUrl) => {
    return (
      "https://plex.tv/photo?" +
      stringify({
        url: thumbUrl + "&size=100",
        height: 120,
        minSize: 1,
        width: 120,
      })
    );
  };

  const getBgUrl = async (
    { plexToken, plexApiBaseURL, plexRatingKey },
    responseChannel = null,
    portrait = true
  ) => {
    let url =
      `${plexApiBaseURL}photo/:/transcode?` +
      stringify({
        width: portrait ? 800 : 1920,
        height: portrait ? 600 : 1080,
        minSize: 1,
        opacity: portrait ? 10 : 70,
        upscale: 1,
        background: "343a3f",
        url: portrait
          ? await getArtWorks({ plexToken, plexRatingKey, plexApiBaseURL })
          : await getPosters({ plexToken, plexRatingKey, plexApiBaseURL }),
        "X-Plex-Token": plexToken,
      });
    !!responseChannel && responseChannel(url);
    return url;
  };

  const getArtWorks = async ({ plexToken, plexApiBaseURL, plexRatingKey }) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}library/metadata/${plexRatingKey}/arts?` +
          stringifyPlex({
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            Accept: "application/json",
          },
        }
      ).catch(throwError);
      if (resp.status == 200) {
        let data = await resp.json();
        return data.MediaContainer.Metadata[0].key;
      }
      consoledebug(resp.status, await resp.text())();
      return null;
    } catch (error) {
      consoleerror(error)();
      return null;
    }
  };

  const getPosters = async ({ plexToken, plexApiBaseURL, plexRatingKey }) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}library/metadata/${plexRatingKey}/posters?` +
          stringifyPlex({
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            Accept: "application/json",
          },
        }
      ).catch(throwError);
      if (resp.status == 200) {
        let data = await resp.json();
        return data.MediaContainer.Metadata[0].key;
      }
      consoledebug(resp.status, await resp.text())();
      return null;
    } catch (error) {
      consoleerror(error)();
      return null;
    }
  };

  /* These api calls might not be useful at the end */

  const createSection = async ({ plexToken, plexApiBaseURL }) => {
    fetch(
      `${plexApiBaseURL}library/sections?` +
        stringifyPlex({
          name: "Simkl-Movies",
          type: "movie",
          agent: "tv.plex.agents.movie",
          scanner: "Plex Movie",
          language: "en-US",
          importFromiTunes: "",
          enableAutoPhotoTags: "",
          downloadMedia: "",
          location: "C:\\Users\\Rithvij\\AppData\\Local\\Temp\\simkl-movies",
          // TODO: this won't work as arrays aren't supported by `stringify`
          // location: "C:\\Users\\Rithvij\\AppData\\Local\\Temp\\simkl-movies2",
          "prefs[hidden]": 2,
          "prefs[useLocalAssets]": 0,
          "prefs[useExternalExtras]": 1,
          "X-Plex-Token": plexToken,
        }),
      {
        headers: {
          accept: "application/xml",
        },
        method: "POST",
      }
    );
  };

  const installedPlexAgents = async (
    { plexToken, plexApiBaseURL },
    mediaType = "movies"
  ) => {
    try {
      let resp = await fetch(
        `${plexApiBaseURL}system/agents?` +
          stringifyPlex({
            mediaType: mediaType == "movies" ? 1 : 2,
            "X-Plex-Token": plexToken,
          }),
        {
          headers: {
            Accept: "application/xml",
          },
        }
      ).catch(throwError);
      broadcastOnlineStatus();
      if (resp.status !== 200) {
        return {
          status: resp.status,
          error: await resp.text(),
          agents: null,
        };
      }
      try {
        let xml = await resp.text();
        let xmlData = txml.parse(xml);
        consoledebug(xmlData)();
        let agents = xmlData[1].children
          .filter((c) => c.tagName == "Agent")
          .map((c) => c.attributes.identifier);
        return {
          status: resp.status,
          error: null,
          agents,
        };
      } catch (err) {
        return {
          status: resp.status,
          error: err,
          agents: null,
        };
      }
    } catch (error) {
      broadcastOnlineStatus(false);
      consoleerror(error)();
      return {
        status: null,
        error,
        agents: null,
      };
    }
  };

  __API__.plex.oauth.oauthStart = oauthStart;
  __API__.plex.oauth.checkTokenValiditiy = checkTokenValiditiy;
  __API__.plex.oauth.getAuthToken = getAuthToken;

  __API__.plex.apis.getLocalServers = getLocalServers;
  __API__.plex.apis.getUserDevices = getUserDevices;
  __API__.plex.apis.getLibrarySections = getLibrarySections;
  __API__.plex.apis.getLibrarySectionAll = getLibrarySectionAll;
  __API__.plex.apis.healthCheck = healthCheck;
  __API__.plex.apis.getUserProfiles = getUserProfiles;
  __API__.plex.apis.getUserProfileInfo = getUserProfileInfo;
  __API__.plex.apis.markMovieWatched = markMovieWatched;
  __API__.plex.apis.markEpisodeWatched = markEpisodeWatched;
  __API__.plex.apis.markSeasonWatched = markSeasonWatched;
  __API__.plex.apis.markShowWatched = markShowWatched;
  __API__.plex.apis.lookupItemByGuid = lookupItemByGuid;
  __API__.plex.apis.matchItemBySearchTerm = matchItemBySearchTerm;
  __API__.plex.apis.rateMediaItem = rateMediaItem;
  __API__.plex.apis.plexThumbURL = plexThumbURL;
  __API__.plex.apis.getArtWorks = getArtWorks;
  __API__.plex.apis.getPosters = getPosters;
  __API__.plex.apis.getBgUrl = getBgUrl;
  __API__.plex.apis.installedPlexAgents = installedPlexAgents;
})();
