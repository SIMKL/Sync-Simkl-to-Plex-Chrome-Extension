/*
  Plex: API handling
  Guide for Oauth: https://forums.plex.tv/t/authenticating-with-plex/609370
*/

const PlexRedirectURI = `${HttpCrxRedirectStub}/popup.html#plex-oauth`;

(async () => {
  // Extension client Config for plex oauth
  // This is shown to user according to plex docs
  const PlexClientName = "Simkl>Plex(Dev)";
  const PlexClientNameHumanReadable = "Simkl to Plex";
  const PlexClientVersion = chrome.runtime.getManifest().version + ".dev";
  // This can be anything random but needs to be unique forever
  const PlexClientID =
    "ab13e1dbe1919ac4d775912da8d3e7a61c3d58cc3395980c2a183e1d9627ee8a174a48f926e728e6645c1b17d8da9299ed00887a6f3c45ee2f2d9d9e4c6ed802";
  // const PlexClientID = await sha512(`${PlexClientName} ${PlexClientVersion}`);

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
          "X-Plex-Device-Name": PlexClientNameHumanReadable,
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
          "X-Plex-Device-Name": PlexClientNameHumanReadable,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Version": PlexClientVersion,
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
        // We can't have a forwardURL to a chrome extension
        // so using webNavigation api to intercept http://<chrome_ext_id>
        // and using that as the forwardUrl
      });
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

  const plexGetLocalServers = async ({ plexToken, plexApiBaseURL }) => {
    let resp = await fetch(
      `${plexApiBaseURL}/servers?` +
        stringify({
          "X-Plex-Token": plexToken,
        }),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );
    console.debug(resp.status, await resp.json());
  };

  const plexGetLibrarySections = async ({ plexToken, plexApiBaseURL }) => {
    let resp = await fetch(
      `${plexApiBaseURL}/library/sections?` +
        stringify({
          "X-Plex-Product": PlexClientName,
          "X-Plex-Version": PlexClientVersion,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Features": "external-media,indirect-media",
          "X-Plex-Device-Name": PlexClientNameHumanReadable,
          "X-Plex-Token": plexToken,
        }),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      }
    );
    console.debug(resp.status, await resp.json());
  };

  const plexGetLibrarySectionAll = async ({
    plexToken,
    plexApiBaseURL,
    librarySectionID,
  }) => {
    let resp = await fetch(
      `${plexApiBaseURL}/library/sections/${librarySectionID}/all?` +
        stringify({
          type: 2,
          includeCollections: 1,
          includeExternalMedia: 1,
          includeAdvanced: 1,
          includeMeta: 1,
          "X-Plex-Container-Start": 0,
          "X-Plex-Container-Size": 50,
          "X-Plex-Text-Format": "plain",
          "X-Plex-Product": PlexClientName,
          "X-Plex-Version": PlexClientVersion,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Token": plexToken,
        }),
      {
        headers: {
          accept: "application/json",
        },
      }
    );
    if (resp.status == 200) {
      console.debug(resp.status, await resp.json());
      return;
    }
    console.debug(resp.status);
  };

  const plexGetUserDevices = async (plexToken) => {
    let resp = await fetch(
      "https://plex.tv/devices.xml?" +
        stringify({
          "X-Plex-Token": plexToken,
        }),
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
    console.debug(resp.status, await resp.text());
  };

  const plexHealthCheck = async () => {
    return false;
  };

  const plexGetUserProfiles = async (plexToken) => {
    let resp = await fetch(
      "https://plex.tv/api/home/users?" +
        stringify({
          "X-Plex-Product": PlexClientName,
          "X-Plex-Version": PlexClientVersion,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Token": plexToken,
        }),
      {
        headers: {
          accept: "application/xml",
        },
      }
    );
    if (resp.status == 200) {
      let xml = await resp.text();
      console.debug(txml.parse(xml));
      return;
    }
    console.debug(resp.status);
  };

  const plexGetUserProfileInfo = async (plexToken) => {
    let resp = await fetch(
      "https://plex.tv/api/users?" +
        stringify({
          "X-Plex-Product": PlexClientName,
          "X-Plex-Version": PlexClientVersion,
          "X-Plex-Client-Identifier": PlexClientID,
          "X-Plex-Token": plexToken,
        }),
      {
        headers: {
          accept: "application/json",
        },
        method: "GET",
      }
    );
    if (resp.status == 200) {
      let xml = await resp.text();
      console.debug(txml.parse(xml));
      return;
    }
    console.debug(resp.status);
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

  __API__.plex.oauth["plexOauthStart"] = plexOauthStart;
  __API__.plex.oauth["plexCheckTokenValiditiy"] = plexCheckTokenValiditiy;
  __API__.plex.oauth["plexGetAuthToken"] = plexGetAuthToken;

  __API__.plex.apis["plexGetLocalServers"] = plexGetLocalServers;
  __API__.plex.apis["plexGetUserDevices"] = plexGetUserDevices;
  __API__.plex.apis["plexGetLibrarySections"] = plexGetLibrarySections;
  __API__.plex.apis["plexGetLibrarySectionAll"] = plexGetLibrarySectionAll;
  __API__.plex.apis["plexHealthCheck"] = plexHealthCheck;
  __API__.plex.apis["plexGetUserProfiles"] = plexGetUserProfiles;
  __API__.plex.apis["plexGetUserProfileInfo"] = plexGetUserProfileInfo;
})();
