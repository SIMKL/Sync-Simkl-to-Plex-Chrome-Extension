self.addEventListener("install", () => {
  // service worker bug fix
  // after using this I wasn't able to reproduce the bug anymore
  // https://stackoverflow.com/a/38980776
  // Skip over the "waiting" lifecycle state, to ensure that our
  // new service worker is activated immediately, even if there's
  // another tab open controlled by our older service worker code.
  setTimeout(self.skipWaiting, 100);
});

// https://www.npmjs.com/package/txml/v/5.1.1
importScripts("../vendor/txml@5.1.1.min.js");

// Global state

// Api methods to use globally

let f = () => {};
// this structure is required
let __API__ = {
  plex: {
    oauth: {
      oauthStart: f,
      checkTokenValiditiy: f,
      getAuthToken: f,
    },
    apis: {
      getLocalServers: f,
      getUserDevices: f,
      getLibrarySections: f,
      getLibrarySectionAll: f,
      healthCheck: f,
      getUserProfiles: f,
      getUserProfileInfo: f,
      markEpisodeWatched: f,
      markSeasonWatched: f,
      markShowWatched: f,
      markMovieWatched: f,
      lookupItemByGuid: f,
      plexThumbURL: f,
      getArtWorks: f,
      getPosters: f,
      installedPlexAgents: f,
    },
  },
  simkl: {
    oauth: {
      oauthStart: f,
      checkTokenValiditiy: f,
    },
    apis: {
      getLastActivity: f,
      getAllItems: f,
      getUserInfo: f,
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // consoledebug("[SW] Got message:", message, "from:", sender)();
  switch (message.type) {
    case CallType.call:
      switch (message.method) {
        // Oauth
        case CallType.oauth.plex.oauthStart:
          __API__.plex.oauth.oauthStart(sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case CallType.oauth.plex.checkTokenValiditiy:
          // consoledebug("[SW] Got message for token validation:", message)();
          __API__.plex.oauth.checkTokenValiditiy(null, message.token);
          return true;
        case CallType.oauth.simkl.oauthStart:
          __API__.simkl.oauth.oauthStart(sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case CallType.oauth.simkl.checkTokenValiditiy:
          __API__.simkl.oauth.checkTokenValiditiy(null, message.token);
          return true;

        // bg handlers
        case CallType.bg.popupAfterPermissionPrompt:
          chrome.tabs.create({
            url: chrome.runtime.getURL(
              `popup.html?url=${message.plexUrl}#${message.hashRoute}`
            ),
          });
          return true;
        case CallType.bg.sync.start:
          self.aController = new AbortController();
          startBgSync(aController.signal);
          return true;
        case CallType.bg.sync.stop:
          !!self.aController && self.aController.abort();
          return true;
        case CallType.bg.sw.ping:
          let r = {
            action: ActionType.sw.pong,
            type: ActionType.action,
          };
          chrome.runtime.sendMessage(r);
          sendResponse(r);
          return true;

        // API methods
        case CallType.apis.plex.getBgUrl:
          __API__.plex.apis.getBgUrl(message, sendResponse, message.portrait);
          return true;
        default:
          consoledebug("Unknown message method", message)();
          break;
      }
      break;
    case ActionType.action:
      // ignore actions they will be handled by
      // all instances of popup.js
      break;
    default:
      consoledebug("Unknown message type", message.type)();
      break;
  }
  return true;
});

// Periodic background sync

importScripts("./sync.js");

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
    consoledebug(`Got pincode for simkl: ${simklPinCode}`)();
    chrome.storage.local.set({
      simklPinCode: simklPinCode,
    });
  }
};

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    consoledebug("On Before request")();
    consoledebug(details)();
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
