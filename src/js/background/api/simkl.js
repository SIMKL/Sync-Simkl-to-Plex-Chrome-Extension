const SimklRedirectURI = `${HttpCrxRedirectStub}/popup.html#simkl-oauth`;

(() => {
  importScripts("./env.js");

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
      return { valid: true, info: data };
    }
    console.debug(resp.status, resp.statusText);
    let data = await resp.text();
    console.debug("Error: Last Activity:", data);
    !!responseChannel && responseChannel(makeErrorResponse(data));
    return { valid: false, info: data };
  };

  const simklCheckTokenValiditiy = async (responseChannel, token) => {
    if (!!token) {
      let { valid } = await simklGetLastActivity(null, token);
      responseChannel(makeSuccessResponse({ authToken: token, valid }));
      return;
    }
    let syncedData = await chromeSyncGetAsync("simklOauthToken");
    console.debug("Simkl:TokenValidatity:localstorage", syncedData);
    let { simklOauthToken } = syncedData;
    if (!!simklOauthToken) {
      let { valid } = await simklGetLastActivity(null, simklOauthToken);
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
