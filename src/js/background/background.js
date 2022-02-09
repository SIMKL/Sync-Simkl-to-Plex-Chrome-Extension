self.addEventListener('install', () => {
  // https://stackoverflow.com/a/38980776
  // Skip over the "waiting" lifecycle state, to ensure that our
  // new service worker is activated immediately, even if there's
  // another tab open controlled by our older service worker code.
  self.skipWaiting();
});

// https://www.npmjs.com/package/txml/v/5.1.1
importScripts("../vendor/txml@5.1.1.min.js")

// Global state

// api methods to use globally

let __API__ = {
  plex: {
    oauth: {},
    apis: {},
  },
  simkl: {
    oauth: {},
    apis: {},
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

// TODO: Periodic background sync

chrome.alarms.onAlarm.addListener((alarm) => {
  // works even when the service work is inactive
  if (alarm.name == "plex-libray-sync") {
    // TODO: plex libray sync
    console.debug(alarm);
  }
});

// Registering callbacks (calls)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.debug("[SW] Got message:", message, "from:", sender);
  switch (message.type) {
    case "call":
      switch (message.method) {
        case "oauth.plex.plexOauthStart":
          __API__.plex.oauth["plexOauthStart"](sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case "oauth.plex.plexCheckTokenValiditiy":
          __API__.plex.oauth["plexCheckTokenValiditiy"](
            sendResponse,
            message.token
          );
          return true;
        case "oauth.simkl.simklOauthStart":
          __API__.simkl.oauth["simklOauthStart"](sendResponse, message.inPopup);
          // https://stackoverflow.com/a/57608759
          return true;
        case "oauth.simkl.simklCheckTokenValiditiy":
          __API__.simkl.oauth["simklCheckTokenValiditiy"](
            sendResponse,
            message.token
          );
          return true;
        case "apis.simkl.simklGetLastActivity":
          __API__.simkl.apis["simklGetLastActivity"](
            sendResponse,
            message.token
          );
          return true;
        case "apis.simkl.simklGetAllItems":
          __API__.simkl.apis["simklGetAllItems"](
            sendResponse,
            message.dateFrom,
            message.token
          );
          return true;
        case "bg.addInterceptListeners":
          addInterceptListeners();
          return true;
        default:
          console.debug("Unknown message call", message);
          break;
      }
      break;
    case "action":
      // ignore actions they will be handled by
      // all instances of popup.js
      break;
    default:
      console.debug("Unknown message type", message.type);
      break;
  }
  return true;
});

// Intercept and redirect to chrome-extension://

const handleOauthIntercepts = () => {
  return ({ tabId, url }) => {
    if (url == PlexRedirectURI) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("/popup.html#plex-oauth"),
      });
    } else if (url.startsWith(SimklRedirectURI)) {
      chrome.tabs.update(tabId, {
        url: chrome.runtime.getURL("/popup.html#simkl-oauth"),
      });
      let parts = url.split("?");
      let simklPinCode = parts[parts.length - 1].split("=")[1];
      console.debug(`got pincode for simkl: ${simklPinCode}`);
      chrome.storage.local.set({
        simklPinCode: simklPinCode,
      });
    }
  };
};

const addInterceptListeners = () => {
  console.debug("Adding intercept listeners...");
  // This had to be done because declarativeNetRequest is not working
  // in combination with server redirect (explained in devlog.md/4-2-22)

  // also capture errors because for plex ?code= is making onBeforeNavigate take way too long
  chrome.webNavigation.onErrorOccurred.addListener(handleOauthIntercepts(), {
    url: [{ urlPrefix: HttpCrxRedirectStub }],
  });

  chrome.webNavigation.onBeforeNavigate.addListener(handleOauthIntercepts(), {
    url: [{ urlPrefix: HttpCrxRedirectStub }],
  });

  chrome.storage.local.set({ registerdInterceptListeners: true });
};

// Extension on install register
{
  chrome.runtime.onInstalled.addListener(({ reason }) => {
    // TODO: check if updating extension stops existing alarms
    // and do they need to be restarted?

    // reason can be one of chrome.runtime.OnInstalledReason
    // can show different ui based on this
    // let { reason } = details;
    // if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    // }
    // reason can be install or update
    chrome.tabs.create({
      url: chrome.runtime.getURL(`popup.html#fresh-install`),
    });
    // clear some storage properties
    // chrome.storage.local.set({ registerdInterceptListeners: null });
  });

  // TODO: change this to the feedback url once done
  const UNINSTALL_URL =
    "https://google.com/?q=why+u+remove+such+nice+things+,+madness";

  chrome.runtime.setUninstallURL(UNINSTALL_URL);
}

// TODO: might use browser_action (chrome.action) so not using
// default_popup for now
chrome.action.setPopup({ popup: "/popup.html" });
