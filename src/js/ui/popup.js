const restartLibrarySync = async (durationHrs = DefaultSyncPeriod) => {
  if (!durationHrs) {
    durationHrs = DefaultSyncPeriod;
  }
  if (await isSyncRunning()) stopLibrarySync();
  console.debug("Starting library sync, duration", durationHrs, "hrs");
  chrome.alarms.create("plex-libray-sync", {
    when: Date.now() + 100, // start immediately
    // periodInMinutes: durationHrs * 60,
    periodInMinutes: 0.1,
  });
};

const stopLibrarySync = () => {
  console.debug("Stopping any running library sync");
  chrome.alarms.clear("plex-libray-sync");
};

const startLibrarySync = restartLibrarySync;

const isSyncRunning = async () => {
  return !!(await chrome.alarms.get("plex-libray-sync"));
};

const validateInputUrl = (inputUrl) => {
  // will always add a / at the end
  let url = inputUrl;
  try {
    url = new URL(inputUrl).href;
  } catch (error) {
    document.body.classList.add("error-url");
    return;
  }
  if (url.trim() != "") {
    if (
      (url.startsWith("http://") || url.startsWith("https://")) &&
      !!url.split("://")[1]
    ) {
      // remove any and all errors
      document.body.classList.remove("error-plex-url-unexpected");
      document.body.classList.remove("error-simkl-url-unexpected");
      document.body.classList.remove("sync-error-simkl");
      document.body.classList.remove("sync-error-plex");
      document.body.classList.remove("error-url");
      document.body.classList.add("url-added");
    } else {
      document.body.classList.add("error-url");
    }
  }
};

const handleHashRoutes = async () => {
  let windowHash = window.location.hash;
  if (windowHash == "") windowHash = "#"; // so that next line will result in ""
  // remove #plex-oauth or #simkl-oauth from url to be safe
  // remove #plex-perm or #simkl-perm from url to be safe
  if (windowHash.startsWith("plex-") || windowHash.startsWith("simkl-"))
    removeWindowHash();

  let loginType = windowHash.split("-")[0].split("#")[1];
  let permGranted = false;
  // #plex-perm or #simkl-perm
  if (windowHash.endsWith("perm")) {
    let webNavigationPerm = {
      permissions: ["webNavigation"],
    };
    let havePermission = false;
    havePermission = await chrome.permissions.contains(webNavigationPerm);
    if (!havePermission) {
      await iosAlert(
        "Permission was denied by you, but it is required to redirect back to the extension"
      );
      return;
    }
    permGranted = true;
  }
  // if hash is #plex-oauth or #simkl-oauth
  if (loginType == "plex") {
    // this won't request new pin and code this time
    startPlexOauth();
  } else {
    // request service worker to validate and save oauth tokens
    checkPlexAuthTokenValidity();
  }
  if (loginType == "simkl") {
    startSimklOauth();
  } else {
    // request service worker to validate and save oauth tokens
    checkSimklAuthTokenValidity();
  }
  if (permGranted) {
    if (chromeTabsUpdateBugVerCheck()) {
      let t = await chrome.tabs.getCurrent();
      console.debug("Chrome tabs update bug is applicable: closing tab", t);
      await chrome.tabs.remove(t.id);
    }
  }
};

const removePlexURIPermissions = async (plexUrl) => {
  let { allowedOrigins } = await chrome.storage.local.get({
    allowedOrigins: [],
  });
  await chrome.storage.local.set({
    allowedOrigins: removeItemOnce(allowedOrigins, plexUrl.originUrl()),
  });
};

const requestPlexURIPermissions = async (plexUrl) => {
  let { allowedOrigins } = await chrome.storage.local.get({
    allowedOrigins: [],
  });
  if (!allowedOrigins.includes(plexUrl.originUrl())) {
    let allowed = false;
    try {
      allowed = await chrome.permissions.request({
        origins: [plexUrl.originUrl()],
      });
    } catch (error) {
      alert(`Invalid Url: ${plexUrl}\n${error}`);
    }
    if (!allowed) {
      alert(`Access for: ${plexUrl} denined by you, it is required.`);
      return false;
    } else {
      allowedOrigins.push(plexUrl.originUrl());
      chrome.storage.local.set({ allowedOrigins });
    }
  }
  chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: 1,
        priority: 1,
        action: {
          type: "allowAllRequests",
        },
        condition: {
          urlFilter: "|http*",
          resourceTypes: ["main_frame"],
        },
      },
    ],
    removeRuleIds: [1],
  });
  return true;
};

const requestRedirectInterceptPermissions = async (loginType = "simkl") => {
  let webNavigationPerm = {
    permissions: ["webNavigation"],
  };
  let havePermission = false;
  havePermission = await chrome.permissions.contains(webNavigationPerm);
  if (!havePermission) {
    // request permission
    await iosAlert(
      "Chrome will request for reading your browser history. Don't worry we need it to only to reopen extension after authentication"
    );
    havePermission = await chrome.permissions.request(webNavigationPerm);
    console.debug("Allowed?", havePermission);
    if (inPopup()) {
      // check if in popup and open new tab and resume flow
      // Due to a bug in chrome: after permission is requested popup closes
      // https://bugs.chromium.org/p/chromium/issues/detail?id=952645
      let message = {
        method: CallType.bg.popupAfterPermissionPrompt,
        type: CallType.call,
        loginType: loginType, // plex|simkl
      };
      await chrome.runtime.sendMessage(message);
    }
  }
  if (!havePermission) {
    await iosAlert(
      "Permission was denied by you, but it is required to redirect back to the extension"
    );
    // TODO: if [chrome.webRequest](https://developer.chrome.com/docs/extensions/reference/webRequest/#event-onBeforeRedirect)
    // can be used, use it or here we need to handle the redirect differently
    // shouldn't use http://chrome_ext_id
    return false;
  }
  let message = {
    method: CallType.bg.addInterceptListeners,
    type: CallType.call,
  };
  await chrome.runtime.sendMessage(message);
  return true;
};

const uiSyncEnabled = () => {
  document.body.classList.add("sync-enabled");
};

const uiSyncDisabled = () => {
  document.body.classList.remove("sync-enabled");
};

const uiBroadcastSyncState = (enabled = true) => {
  let message = {
    action: enabled ? ActionType.ui.sync.enabled : ActionType.ui.sync.disabled,
    type: ActionType.action,
  };
  chrome.runtime.sendMessage(message);
};

// Background image

const uiSetLandscapeUrl = async (url) => {
  if (!url) {
    let { landScapeUrl } = await chrome.storage.local.get({
      landScapeUrl: null,
    });
    url = landScapeUrl;
    if (!url) {
      return;
    }
  }
  // TODO: check if not 404 or reachable and set it.
  setCssVar("--background-image-url", `url('${url}')`);
};

const uiSetPortraitUrl = async (url) => {
  // read from local storage
  if (!url) {
    let { portraitUrl } = await chrome.storage.local.get({
      portraitUrl: null,
    });
    url = portraitUrl;
    if (!url) {
      return;
    }
  }

  setCssVar("--background-image-url", `url('${url}')`);
};

const updateBackgroundURL = async (
  plexApiBaseURL,
  plexRatingKey,
  plexToken
) => {
  let message = {
    type: CallType.call,
    method: CallType.apis.plex.getBgUrl,
    plexToken: plexToken,
    plexApiBaseURL: plexApiBaseURL,
    plexRatingKey: plexRatingKey,
  };
  chrome.storage.local.set({
    landScapeUrl: await chrome.runtime.sendMessage({
      ...message,
      portrait: false,
    }),
    portraitUrl: await chrome.runtime.sendMessage({
      ...message,
      portrait: true,
    }),
  });
};

const uiHandleBackgroundImg = () => {
  let aspectRatio = document.body.clientWidth / document.body.clientHeight;
  Math.round(aspectRatio - 0.5) >= 1 ? uiSetLandscapeUrl() : uiSetPortraitUrl();
};

// END: Background image

const uiSetPopupViewState = () => {
  if (inPopup()) {
    document.documentElement.classList.add("popupview");
  }
};

const onLoad = async () => {
  const plexBtn = document.querySelector("sync-buttons-button.Plex");
  const simklBtn = document.querySelector("sync-buttons-button.Simkl");
  const syncBtn = document.querySelector("sync-form-button");
  const urlInput = document.querySelector("sync-form-plex-url>input");
  const durationInput = document.querySelector("sync-form-select-time>select");

  plexBtn.addEventListener("click", async (_) => {
    let { plexOauthToken } = await chrome.storage.sync.get({
      plexOauthToken: null,
    });
    console.debug(`plexOauthToken is: ${plexOauthToken}`);
    if (!plexOauthToken) {
      if (!(await requestRedirectInterceptPermissions("plex"))) return;
      startPlexOauth();
    } else {
      logoutPlex();
    }
  });
  simklBtn.addEventListener("click", async (_) => {
    let { simklOauthToken } = await chrome.storage.sync.get({
      simklOauthToken: null,
    });
    console.debug(`simklOauthToken is: ${simklOauthToken}`);
    if (!simklOauthToken) {
      if (!(await requestRedirectInterceptPermissions("simkl"))) return;
      startSimklOauth();
    } else {
      logoutSimkl();
    }
  });
  urlInput.addEventListener(
    "input",
    debounce(() => validateInputUrl(urlInput.value))
  );
  syncBtn.addEventListener("click", async (_) => {
    if (
      document.body.classList.contains("connected-plex") &&
      document.body.classList.contains("connected-simkl") &&
      document.body.classList.contains("url-added") &&
      !document.body.classList.contains("error-url")
    ) {
      let normalizedUrl = new URL(urlInput.value).href;
      let { plexInstanceUrl: oldPlexUrl } = await chrome.storage.local.get({
        plexInstanceUrl: null,
      });
      await chrome.storage.local.set({
        plexInstanceUrl: normalizedUrl,
        syncPeriod: durationInput.value,
      });
      if (await isSyncRunning()) {
        // sync enabled; stop it
        uiSyncDisabled();
        stopLibrarySync();
        uiBroadcastSyncState(false);
        if (oldPlexUrl.originUrl() != normalizedUrl.originUrl()) {
          // remove permissions for old url
          removePlexURIPermissions(oldPlexUrl);
        }
      } else {
        // https://stackoverflow.com/questions/27669590/chrome-extension-function-must-be-called-during-a-user-gesture
        if (await requestPlexURIPermissions(urlInput.value)) {
          uiSyncEnabled();
          // TODO: remove the sync-errors
          startLibrarySync(durationInput.value);
          uiBroadcastSyncState(true);
          await chrome.storage.local.set({
            doFullSync: true,
          });
        }
      }
    }
  });

  handleHashRoutes();
  // load settings from local storage and update UI
  (async () => {
    let { plexInstanceUrl, syncPeriod } = await chrome.storage.local.get({
      plexInstanceUrl: null,
      syncPeriod: DefaultSyncPeriod,
    });
    if (!!plexInstanceUrl) {
      urlInput.value = plexInstanceUrl;
      validateInputUrl(urlInput.value);
      // updateBackgroundURL(plexInstanceUrl, , 2681);
    }
    if (!!syncPeriod) {
      durationInput.value = syncPeriod;
    }
    if (await isSyncRunning()) {
      uiSyncEnabled();
    }
  })();

  uiSetPopupViewState();
  uiHandleBackgroundImg();
};

window.addEventListener("load", onLoad);
window.addEventListener("resize", uiHandleBackgroundImg);

// Registering UI event handlers (actions)

chrome.runtime.onMessage.addListener((message, sender) => {
  // console.debug("Got message:", message, "from:", sender);
  switch (message.type) {
    case ActionType.action:
      switch (message.action) {
        case ActionType.oauth.plex.login:
          finishPlexOauth(message);
          break;
        case ActionType.oauth.plex.logout:
          finishLogoutPlex(message);
          uiSyncDisabled();
          stopLibrarySync();
          break;
        case ActionType.oauth.simkl.login:
          finishSimklOauth(message);
          break;
        case ActionType.oauth.simkl.logout:
          uiSyncDisabled();
          stopLibrarySync();
          finishLogoutSimkl(message);
          break;
        case ActionType.ui.sync.enabled:
          uiSyncEnabled();
          break;
        case ActionType.ui.sync.disabled:
          uiSyncDisabled();
          break;
        case ActionType.ui.sync.plex.online:
          document.body.classList.remove("error-plex-url-offline");
          break;
        case ActionType.ui.sync.plex.offline:
          document.body.classList.add("error-plex-url-offline");
          break;
        case ActionType.ui.sync.simkl.online:
          document.body.classList.remove("error-simkl-url-offline");
          break;
        case ActionType.ui.sync.simkl.offline:
          document.body.classList.add("error-simkl-url-offline");
          break;
        case ActionType.ui.sync.plex.connecting:
          document.body.classList.add("sync-connecting-to-plex");
          break;
        case ActionType.ui.sync.plex.connectdone:
          document.body.classList.remove("sync-connecting-to-plex");
          break;
        case ActionType.ui.sync.plex.unexpected:
          document.body.classList.add("error-plex-url-unexpected");
          setTimeout(() => {
            // TODO: can this be avoided?
            // auto dismiss in 10 secs
            // the other way to dismiss is to modify the url
            document.body.classList.remove("error-plex-url-unexpected");
          }, 10000);
          break;
        case ActionType.ui.sync.plex.sessionexpired:
          document.body.classList.add("sync-error-plex");
          uiSyncDisabled();
          stopLibrarySync();
          break;
        case ActionType.ui.sync.simkl.connecting:
          document.body.classList.add("sync-connecting-to-simkl");
          break;
        case ActionType.ui.sync.simkl.connectdone:
          document.body.classList.remove("sync-connecting-to-simkl");
          break;
        case ActionType.ui.sync.simkl.unexpected:
          document.body.classList.add("error-simkl-url-unexpected");
          setTimeout(() => {
            // TODO: can this be avoided?
            // auto dismiss in 10 secs
            // the other way to dismiss is to modify the url
            document.body.classList.remove("error-simkl-url-unexpected");
          }, 10000);
          break;
        case ActionType.ui.sync.simkl.sessionexpired:
          document.body.classList.add("sync-error-simkl");
          uiSyncDisabled();
          stopLibrarySync();
          break;
        case ActionType.ui.sync.progress:
          // TODO: handle earch progress item
          break;
        default:
          console.debug("Unknown action", message);
      }
      break;
    case CallType.call:
      // ignore calls (they will be recieved by background.js)
      break;

    default:
      console.debug("Unknown message type", message);
  }
  // required if we don't use sendResponse
  return true;
});
