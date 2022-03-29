const restartLibrarySync = async (
  durationHours = DefaultSyncPeriod,
  runImmediately = true,
  runAfterMS = null
) => {
  if (!durationHours) {
    durationHours = DefaultSyncPeriod;
  }
  if (!runAfterMS) {
    runAfterMS = durationHours * 60 * 60 * 1000;
  }
  if (await isSyncEnabled()) stopLibrarySync();
  consoledebug("Starting library sync, duration", durationHours, "hrs")();
  chrome.alarms.create(AlarmKey, {
    when: runImmediately
      ? Date.now() + 100 // start immediately
      : Date.now() + runAfterMS,
    periodInMinutes: durationHours * 60,
    // for debugging
    // periodInMinutes: 0.1,
  });
};

const stopLibrarySync = () => {
  consoledebug("Stopping any running library sync")();
  chrome.alarms.clear(AlarmKey);
  let message = {
    type: CallType.call,
    method: CallType.bg.sync.stop,
  };
  chrome.runtime.sendMessage(message);
};

const startLibrarySync = restartLibrarySync;

const isSyncEnabled = async () => {
  return !!(await chrome.alarms.get(AlarmKey));
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
  consoledebug("Handling the url hashrouter logic", windowHash)();
  consoledebug("TabID for this url", (await chrome.tabs.getCurrent())?.id)();
  // remove #plex-oauth or #simkl-oauth from url to be safe
  if (windowHash.startsWith("#plex-") || windowHash.startsWith("#simkl-"))
    removeWindowHash();

  let loginType = windowHash.split("-")[0].split("#")[1];
  // if hash is #plex-oauth or #simkl-oauth
  if (loginType == "plex") {
    // this won't request new pin and code this time
    consoledebug("starting plex oauth second step")();
    startPlexOauth();
  } else {
    // request service worker to validate and save plex oauth token
    checkPlexAuthTokenValidity();
    pingServiceWorker();
  }
  if (loginType == "simkl") {
    consoledebug("starting simkl oauth second step")();
    startSimklOauth();
  } else {
    // request service worker to validate and save simkl oauth token
    // checkSimklAuthTokenValidity();
    checkSimklAuthTokenValidity();
    pingServiceWorker();
  }
};

// Sync UI

const uiSyncEnabled = () => {
  document.body.classList.add("sync-enabled");
};

const uiSyncDisabled = () => {
  document.body.classList.remove("sync-enabled");
  document.body.classList.remove("sync-waiting-for-next-sync");
};

const uiBroadcastSyncState = (enabled = true) => {
  let message = {
    action: enabled ? ActionType.ui.sync.enabled : ActionType.ui.sync.disabled,
    type: ActionType.action,
  };
  chrome.runtime.sendMessage(message);
};

const uiSetPopupViewState = () => {
  if (inPopup()) {
    document.documentElement.classList.add("popupview");
  }
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
  // TODO(#31): check if not 404 or reachable and set it.
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

const onLoad = async () => {
  const plexBtn = document.querySelector("sync-buttons-button.Plex");
  const simklBtn = document.querySelector("sync-buttons-button.Simkl");
  const syncBtn = document.querySelector("sync-form-button");
  const urlInput = document.querySelector("sync-form-plex-url>input");
  const durationInput = document.querySelector("sync-form-select-time>select");
  const syncNowBtn = document.querySelector("sync-desc-line-2");

  plexBtn.addEventListener("click", async (_) => {
    let { plexOauthToken } = await chrome.storage.sync.get({
      plexOauthToken: null,
    });
    consoledebug(`plexOauthToken is: ${plexOauthToken}`)();
    if (!plexOauthToken) {
      startPlexOauth();
    } else {
      logoutPlex();
    }
  });
  simklBtn.addEventListener("click", async (_) => {
    let { simklOauthToken } = await chrome.storage.sync.get({
      simklOauthToken: null,
    });
    consoledebug(`simklOauthToken is: ${simklOauthToken}`)();
    if (!simklOauthToken) {
      startSimklOauth();
    } else {
      logoutSimkl();
    }
  });
  urlInput.addEventListener(
    "input",
    debounce(() => validateInputUrl(urlInput.value))
  );
  durationInput.addEventListener("change", async (_) => {
    chrome.storage.local.set({
      syncPeriod: durationInput.value,
    });
    if (await isSyncEnabled()) {
      restartLibrarySync(durationInput.value, false);
      startNextSyncTimer();
    }
  });
  syncBtn.addEventListener("click", async (_) => {
    if (
      document.body.classList.contains("connected-plex") &&
      document.body.classList.contains("connected-simkl") &&
      document.body.classList.contains("url-added") &&
      !document.body.classList.contains("error-url")
    ) {
      let normalizedUrl = new URL(urlInput.value).href;
      await chrome.storage.local.set({
        plexInstanceUrl: normalizedUrl,
        syncPeriod: durationInput.value,
      });
      if (await isSyncEnabled()) {
        // sync enabled; stop it
        uiSyncDisabled();
        stopLibrarySync();
        uiBroadcastSyncState(false);
      } else {
        // https://stackoverflow.com/q/27669590
        uiSyncEnabled();
        // TODO(#32): remove the sync-errors
        startLibrarySync(durationInput.value);
        uiBroadcastSyncState(true);
        await chrome.storage.local.set({
          doFullSync: true,
        });
      }
    }
  });
  syncNowBtn.addEventListener(
    "click",
    debounce(async () => {
      if (!document.body.classList.contains("sync-waiting-for-next-sync")) {
        return;
      }
      // Force sync
      consoledebug("starting syncing manually before next scheduled sync")();
      let message = {
        type: CallType.call,
        method: CallType.bg.sync.start,
      };
      await chrome.runtime.sendMessage(message);
    })
  );

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
    if (await isSyncEnabled()) {
      uiSyncEnabled();
      // next sync timer
      startNextSyncTimer();
    }
    // service worker healthCheck
    pingServiceWorker();
  })();

  uiSetPopupViewState();
  uiHandleBackgroundImg();
};

window.addEventListener("load", onLoad);
window.addEventListener("resize", uiHandleBackgroundImg);

// Registering UI event handlers (actions)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!("HandledMessagePorts" in window)) window.HandledMessagePorts = {};
  let msgIdx = Object.keys(window.HandledMessagePorts).length;
  window.HandledMessagePorts[msgIdx] = {
    message,
    sender,
  };
  // consoledebug("[popup] got message:", message, "from:", sender)();
  switch (message.type) {
    case ActionType.action:
      switch (message.action) {
        case ActionType.oauth.plex.login:
          finishPlexOauth(message);
          break;
        case ActionType.oauth.plex.loginCheck:
          // consoledebug(message)();
          var { authToken, valid, error } = message;
          if (error) {
            // TODO: offline maybe
            // show error to user
            consoleerror(error)();
            break;
          }
          if (valid) {
            // set plex button ui accordingly
            setUIPlexConnected();
            savePlexAuthToken(authToken);
          } else {
            // TODO(#33): show login prompt
            // with message describing that the old session expired
            logoutPlex();
            consoledebug(message)();
          }
          break;
        case ActionType.oauth.plex.logout:
          finishLogoutPlex(message);
          uiSyncDisabled();
          stopLibrarySync();
          break;
        case ActionType.oauth.simkl.login:
          finishSimklOauth(message);
          break;
        case ActionType.oauth.simkl.loginCheck:
          var { authToken, valid, error } = message;
          if (error) {
            // TODO: offline maybe
            // show error to user
            consoleerror(error)();
            break;
          }
          if (valid) {
            // set simkl button ui accordingly
            setUISimklConnected();
            saveSimklAuthToken(authToken);
          } else {
            // TODO(#34): simkl auth_token revoked handle ux
            // Show login prompt again
            // with message describing that the old session expired
            logoutSimkl();
            consoledebug(message)();
          }
          break;
        case ActionType.oauth.simkl.logout:
          uiSyncDisabled();
          stopLibrarySync();
          finishLogoutSimkl(message);
          break;
        case ActionType.oauth.simkl.redirect:
          let { url, tabId } = message;
          let parts = url.split("?");
          let simklPinCode = parts[parts.length - 1].split("=")[1];
          consoledebug(`Got pincode for simkl: ${simklPinCode}`)();
          (async (pincode) => {
            await chrome.storage.local.set({
              simklPinCode: pincode,
            });
            let { simklPinCode } = await chrome.storage.local.get({
              simklPinCode: null,
            });
            consoledebug(`Saved simkl pincode: ${simklPinCode}`)();
            handleHashRoutes();
            // consoledebug("Reloading tab with tabid", tabId)();
            // console.log(chrome.tabs?.reload);
            // await chrome.tabs.reload(tabId);
            // consoledebug("Done reloading tab with tabid", tabId)();
          })(simklPinCode);
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
          retrySyncWithBackoff("error-plex-url-offline");
          break;
        case ActionType.ui.sync.simkl.online:
          document.body.classList.remove("error-simkl-url-offline");
          break;
        case ActionType.ui.sync.simkl.offline:
          retrySyncWithBackoff("error-simkl-url-offline");
          break;
        case ActionType.ui.sync.plex.connecting:
          document.body.classList.add("sync-connecting-to-plex");
          break;
        case ActionType.ui.sync.plex.connectdone:
          document.body.classList.remove("sync-connecting-to-plex");
          break;
        case ActionType.ui.sync.plex.unexpected:
          retrySyncWithBackoff("error-plex-url-unexpected");
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
          retrySyncWithBackoff("error-simkl-url-unexpected");
          break;
        case ActionType.ui.sync.simkl.sessionexpired:
          document.body.classList.add("sync-error-simkl");
          uiSyncDisabled();
          stopLibrarySync();
          break;
        case ActionType.ui.sync.progress:
          // handle earch progress item
          if (message.value <= 0) {
            // don't return here, an sendResponse needs to be called
            break;
          }
          document.body.classList.add("sync-in-progress-plex");
          document.body.classList.remove("sync-waiting-for-next-sync");
          // must be a string, css won't parse int type in var
          setCssVar("--plex-items-count", `"${message.value}"`);
          break;
        case ActionType.ui.sync.finished:
          consoledebug("Sync finished")();
          // sync finished
          setCssVar("--plex-items-count", 0);
          document.body.classList.remove("sync-in-progress-plex");
          document.body.classList.add("sync-waiting-for-next-sync");
          startNextSyncTimer();
          break;
        case ActionType.sw.pong:
          window.swPong = message;
          break;
        case ActionType.sw.tabFocus:
          (async () => {
            chrome.tabs.update(
              (await chrome.tabs.getCurrent())?.id,
              { active: true },
              (_) => {}
            );
          })();
          break;
        default:
          consoledebug("Unknown action", message)();
      }
      break;
    case CallType.call:
      // ignore calls (they will be recieved by background.js)
      break;

    default:
      consoledebug("Unknown message type", message)();
  }
  // consoledebug(
  //   "[popup] Sending null response back",
  //   message.type,
  //   message.method,
  //   message.action
  // )();
  sendResponse();
  window.HandledMessagePorts[msgIdx] = {
    ...window.HandledMessagePorts[msgIdx],
    sendResponse: true,
  };
});

// TODOO: move this logic to service worker
// or else retry logic will only work when a tab is open
const retrySyncWithBackoff = async (
  className = "error-simkl-url-unexpected",
  maxRetries = MaxRetryCount
) => {
  document.body.classList.add(className);
  let { failedTries } = await chrome.storage.local.get({ failedTries: 1 });
  consoledebug(
    "Retry sync with backoff",
    className,
    `${failedTries}/${maxRetries}`
  )();
  await chrome.storage.local.set({
    failedTries: failedTries + 1,
  });
  if (failedTries >= maxRetries) {
    uiSyncDisabled();
    stopLibrarySync();
    await chrome.storage.local.remove("failedTries");
    return;
  }
  let backOffmult = Math.min(Math.pow(2, failedTries), 30);
  restartLibrarySync(
    (await chrome.storage.local.get({ syncPeriod: DefaultSyncPeriod }))[
      "syncPeriod"
    ],
    false,
    backOffmult * 1000 || BackoffMaxLimit
  );
  setTimeout(() => {
    // auto dismiss in 10 secs
    // the other way to dismiss is to modify the url
    document.body.classList.remove(className);
  }, backOffmult * 1000 || BackoffMaxLimit);
};

const startNextSyncTimer = async () => {
  let signal = null;
  if (!!window.timerAbortC) {
    // TODO(#35): to comibne multiple signals
    // https://github.com/whatwg/fetch/issues/905#issuecomment-491970649
    window.timerAbortC.abort();
    window.timerAbortC = null;
  }
  window.timerAbortC = new AbortController();
  signal = window.timerAbortC.signal;
  let { lastSynced, syncPeriod } = await chrome.storage.local.get({
    lastSynced: null,
    syncPeriod: DefaultSyncPeriod,
  });
  let now = () => new Date();
  let lastSyncedTime = new Date(lastSynced);
  let scheduledSyncTime = new Date(
    (await chrome.alarms.get(AlarmKey)).scheduledTime
  );
  let remainingMS = () => scheduledSyncTime.getTime() - now().getTime();
  if (lastSyncedTime > now()) {
    // if somehow we synced in the future (because client's clock is wrong)
    // set the last synced time to now
    lastSyncedTime = now();
    await chrome.storage.local.set({
      lastSynced: lastSyncedTime.toISOString(),
      lastSyncedSource: "client",
    });
  }
  consoledebug("Timer times", now(), lastSyncedTime, scheduledSyncTime)();
  consoledebug(
    "Timer conditions",
    now() > lastSyncedTime,
    now() < scheduledSyncTime
  )();
  if (now() > lastSyncedTime && now() < scheduledSyncTime) {
    document.body.classList.add("sync-waiting-for-next-sync");
    let totSecs = parseInt(syncPeriod) * 60 * 60;
    setCssVar("--plex-timer", `"${msToHMS(remainingMS())}"`);
    let interval = setInterval(() => {
      totSecs--;
      setCssVar("--plex-timer", `"${msToHMS(remainingMS())}"`);
      if (totSecs === 0 || (!!signal && signal.aborted)) {
        clearInterval(interval);
      }
    }, 1000);
  } else {
    document.body.classList.remove("sync-waiting-for-next-sync");
  }
};

const pingServiceWorker = () => {
  consoledebug("ping service worker")();
  // ping service worker every 2 minutes
  window.pingerHandle && clearInterval(pingerHandle);
  window.pingerHandle = setInterval(
    pingServiceWorker,
    ServiceWorkerPingInterval
  );
  let m = {
    type: CallType.call,
    method: CallType.bg.sw.ping,
  };
  chrome.runtime.sendMessage(m);
  window.pingerTimeout && clearTimeout(window.pingerTimeout);
  window.pingerTimeout = setTimeout(() => {
    if (window.swPong) {
      consoledebug("service worker responded", window.swPong)();
      window.swPong = null;
      return;
    }
    consoledebug("service worker did not respond after 6sec", window.swPong)();
    unresponsiveServiceWorkerAlert();
  }, ServiceWorkerPingTimeout);
};
