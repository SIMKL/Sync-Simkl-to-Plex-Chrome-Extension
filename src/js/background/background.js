self.addEventListener("install", () => {
  // service worker bug fix
  // after using this I wasn't able to reproduce the bug anymore
  // https://stackoverflow.com/a/38980776
  // Skip over the "waiting" lifecycle state, to ensure that our
  // new service worker is activated immediately, even if there's
  // another tab open controlled by our older service worker code.
  self.skipWaiting();
});

// https://www.npmjs.com/package/txml/v/5.1.1
importScripts("../vendor/txml@5.1.1.min.js");
// https://www.npmjs.com/package/jszip/v/3.7.1
// https://github.com/Stuk/jszip/blob/master/dist/jszip.min.js
// importScripts("../vendor/jszip@3.7.1.min.js");
// https://www.npmjs.com/package/jszip-utils/v/0.1.0
// https://cdn.jsdelivr.net/npm/jszip-utils@0.1.0/dist/jszip-utils.min.js
// importScripts("../vendor/jszip-utils@0.1.0.min.js");
// https://www.npmjs.com/package/lzma/v/2.3.2
// https://cdn.jsdelivr.net/npm/lzma@2.3.2/src/
// importScripts("../vendor/lzma-c-min@2.3.2.js");
// importScripts("../vendor/lzma_worker-min@2.3.2.js");
// importScripts("../vendor/lzma-min@2.3.2.js");
// https://www.npmjs.com/package/file-saver/v/2.0.5
// https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js
// importScripts("../vendor/FileSaver@2.0.5.min.js");

// Global state

// Api methods to use globally

// TODO: remove these after migrating to typescript
// or after done developing with this part
// these solely exist for IDE auto completions
const n_1 = (_) => {};
const n_2 = (_, __) => {};
const _1 = async (_) => {};
const _2 = async (_, __) => {};

// this structure is required
// but _1, _2, n_1, n_2, etc. can be replaced with null.
let __API__ = {
  plex: {
    oauth: {
      oauthStart: _2,
      checkTokenValiditiy: _2,
      getAuthToken: _2,
    },
    apis: {
      getLocalServers: _1,
      getUserDevices: _1,
      getLibrarySections: _1,
      getLibrarySectionAll: _1,
      healthCheck: _1,
      getUserProfiles: _1,
      getUserProfileInfo: _1,
      markEpisodeWatched: _2,
      markSeasonWatched: _2,
      markShowWatched: _2,
      markMovieWatched: _2,
      lookupItemByGuid: _1,
      plexThumbURL: n_1,
      getArtWorks: _1,
      getPosters: _1,
      installedPlexAgents: _2,
    },
  },
  simkl: {
    oauth: {
      oauthStart: _2,
      checkTokenValiditiy: _2,
    },
    apis: {
      getLastActivity: _2,
      getAllItems: _2,
      getUserInfo: _1,
    },
  },
};

// this is used to intercept and open the extension page
const HttpCrxRedirectStub = `http://${chrome.runtime.id}`;

// Utility functions
importScripts("./utils.js");

// Plex: API handling
importScripts("./api/plex.js");

// Simkl: API handling
importScripts("./api/simkl.js");

// Registering callbacks (calls)
// for any connected clients to use
importScripts("../common.js");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // console.debug("[SW] Got message:", message, "from:", sender);
  switch (message.type) {
    case CallType.call:
      switch (message.method) {
        // Oauth
        case CallType.oauth.plex.oauthStart:
          __API__.plex.oauth.oauthStart(sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case CallType.oauth.plex.checkTokenValiditiy:
          __API__.plex.oauth.checkTokenValiditiy(sendResponse, message.token);
          return true;
        case CallType.oauth.simkl.oauthStart:
          __API__.simkl.oauth.oauthStart(sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case CallType.oauth.simkl.checkTokenValiditiy:
          __API__.simkl.oauth.checkTokenValiditiy(sendResponse, message.token);
          return true;

        // bg handlers
        case CallType.bg.popupAfterPermissionPrompt:
          chrome.tabs.create({
            url: chrome.runtime.getURL(
              `popup.html?url=${message.plexUrl}#${message.hashRoute}`
            ),
          });
          return true;

        // API methods
        case CallType.apis.plex.getBgUrl:
          __API__.plex.apis.getBgUrl(message, sendResponse, message.portrait);
          return true;
        default:
          console.debug("Unknown message method", message);
          break;
      }
      break;
    case ActionType.action:
      // ignore actions they will be handled by
      // all instances of popup.js
      break;
    default:
      console.debug("Unknown message type", message.type);
      break;
  }
  return true;
});

// Periodic background sync

importScripts("./sync.js");

chrome.alarms.onAlarm.addListener(async (alarm) => {
  // works even when the service work is inactive
  if (alarm.name == "plex-libray-sync") {
    // TODO: plex libray sync
    await startBgSync();
  }
});

// Intercept and redirect to chrome-extension://

const handleOauthIntercepts = async ({ tabId, url }) => {
  if (url == PlexRedirectURI) {
    chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("/popup.html#plex-oauth"),
    });
  } else if (url.startsWith(SimklRedirectURI)) {
    await chrome.tabs.update(tabId, {
      url: chrome.runtime.getURL("/popup.html#simkl-oauth"),
    });
    // FIXME: instead of reloading the tab chrome.runtime.sendMessage can be used
    await chrome.tabs.reload(tabId);
    let parts = url.split("?");
    let simklPinCode = parts[parts.length - 1].split("=")[1];
    console.debug(`Got pincode for simkl: ${simklPinCode}`);
    chrome.storage.local.set({
      simklPinCode: simklPinCode,
    });
  }
};

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    console.debug("On Before request");
    console.debug(details);
    handleOauthIntercepts(details);
  },
  {
    urls: [`${HttpCrxRedirectStub}/*`],
  }
);

// Extension on install register
{
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    // check if updating extension stops existing alarms
    // and do they need to be restarted?
    // found out, they still run

    // reason can be one of chrome.runtime.OnInstalledReason
    // can show different ui based on this
    // let { reason } = details;
    // if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // }
    // reason can be install or update
    chrome.tabs.create({
      url: chrome.runtime.getURL(`popup.html#fresh-install`),
    });
  });

  chrome.runtime.setUninstallURL(UNINSTALL_URL);
}

// TODO: might use browser_action (chrome.action) so not using
// default_popup for now
chrome.action.setPopup({ popup: "/popup.html" });
