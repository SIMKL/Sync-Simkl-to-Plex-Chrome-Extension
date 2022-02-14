class UIEvents {
  static tokenExpired = (api = "plex") => {
    UIEvents.connectDone(api);
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.sessionexpired
          : ActionType.ui.sync.simkl.sessionexpired,
    });
  };

  static connectFailed = (api = "plex") => {
    // clear start message in ui
    UIEvents.connectDone(api);
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.unexpected
          : ActionType.ui.sync.simkl.unexpected,
    });
  };

  static connectStarted = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connecting
          : ActionType.ui.sync.simkl.connecting,
    });
  };

  static connectDone = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connectdone
          : ActionType.ui.sync.simkl.connectdone,
    });
  };

  static syncStarted = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connectdone
          : ActionType.ui.sync.simkl.connectdone,
    });
  };
}

const userConfig = async () => {
  return {
    ...(await chrome.storage.local.get({
      plexInstanceUrl: null,
      syncPeriod: DefaultSyncPeriod,
    })),
    ...(await chrome.storage.sync.get({
      plexOauthToken: null,
      simklOauthToken: null,
    })),
  };
};

const startBgSync = async () => {
  let config = await userConfig();
  let { plexInstanceUrl, syncPeriod, plexOauthToken, simklOauthToken } = config;
  if (!!plexInstanceUrl && !!plexOauthToken && !!simklOauthToken) {
    let pconf = {
      plexToken: plexOauthToken,
      plexApiBaseURL: plexInstanceUrl,
    };
    UIEvents.connectStarted();
    let { libraries, error } = await __API__.plex.apis.getLibrarySections(
      pconf
    );
    if (!libraries) {
      console.error(error);
      // TODO: check if plex token expired
      UIEvents.connectFailed("plex");
      return;
    }
    console.debug(libraries);
    let fullLibraryList = await Promise.all(
      libraries.map(
        async (l) =>
          await __API__.plex.apis.getLibrarySectionAll(
            {
              ...pconf,
              libraryKey: l.key,
            },
            l.type
          )
      )
    );
    await sleep(1000);
    UIEvents.connectDone();
    console.debug(fullLibraryList);
    // start processing the results
    let data = fullLibraryList.map((l) => {
      if (l.error) {
        console.error(l.error);
        return [];
      }
      return l.items.filter((item) => !!item.Guid);
    });
    console.debug(data);

    // get simkl last activity
    UIEvents.connectStarted("simkl");
    let la = await __API__.simkl.apis.getLastActivity(null, simklOauthToken);
    let { valid: simklTokenValid, info: simklLastActivity } = la;
    if (!simklTokenValid) {
      // session expired or some other error
      if (
        "error" in simklLastActivity &&
        simklLastActivity.error == "user_token_failed"
      ) {
        UIEvents.tokenExpired("simkl");
        return;
      }
      console.error(simklLastActivity);
      UIEvents.connectFailed("simkl");
      return;
    }
    await sleep(1000);
    UIEvents.connectDone("simkl");
    console.debug(simklLastActivity);
  } else {
    if (!simklOauthToken) {
      UIEvents.tokenExpired("simkl");
    }
    if (!plexOauthToken) {
      UIEvents.tokenExpired("plex");
    }
    if (!plexInstanceUrl) {
      UIEvents.connectFailed("plex");
    }
    // one of the required things is missing
    console.debug({
      plexInstanceUrl,
      syncPeriod,
      plexOauthToken,
      simklOauthToken,
    });
    console.error("Unreachable");
  }
};

const plexDiscover = async () => {
  let config = await userConfig();
  let { plexInstanceUrl, plexOauthToken } = config;
  var { servers, error } = await __API__.plex.apis.getLocalServers({
    plexApiBaseURL: plexInstanceUrl,
    plexToken: plexOauthToken,
  });
  if (!servers) {
    console.error(error);
    let message = {
      type: ActionType.action,
      action: ActionType.ui.sync.plex.unexpected,
    };
    chrome.runtime.sendMessage(message);
  }
  var { devices, error } = await __API__.plex.apis.getUserDevices(
    plexOauthToken
  );
  if (!devices) {
    console.error(error);
  }
  console.debug(servers, devices);
};
