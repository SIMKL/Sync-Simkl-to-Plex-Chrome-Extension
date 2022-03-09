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

let f = async () => {};
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
      getShowEpisodeList: f,
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
  if (!("HandledMessagePorts" in self)) self.HandledMessagePorts = {};
  let msgIdx = Object.keys(self.HandledMessagePorts).length;
  self.HandledMessagePorts[msgIdx] = {
    message,
    sender,
  };
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
          break;
        case CallType.oauth.simkl.oauthStart:
          __API__.simkl.oauth.oauthStart(sendResponse, message.inPopup);
          return true;
        case CallType.oauth.simkl.checkTokenValiditiy:
          __API__.simkl.oauth.checkTokenValiditiy(null, message.token);
          break;
        // bg handlers
        case CallType.bg.popupAfterPermissionPrompt:
          chrome.tabs.create({
            url: chrome.runtime.getURL(
              `popup.html?url=${message.plexUrl}#${message.hashRoute}`
            ),
          });
          break;
        case CallType.bg.sync.start:
          self.aController = new AbortController();
          startBgSync(aController.signal);
          break;
        case CallType.bg.sync.stop:
          !!self.aController && self.aController.abort();
          break;
        case CallType.bg.sw.ping:
          let r = {
            action: ActionType.sw.pong,
            type: ActionType.action,
          };
          chrome.runtime.sendMessage(r);
          sendResponse(r);
          return;

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
  // consoledebug(
  //   "[SW] Sending null response back",
  //   message.type,
  //   message.method,
  //   message.action
  // )();
  sendResponse();
  self.HandledMessagePorts[msgIdx] = {
    ...self.HandledMessagePorts[msgIdx],
    sendResponse: true,
  };
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
    // FIXME(#19): instead of reloading the tab chrome.runtime.sendMessage can be used
    // await chrome.tabs.reload(tabId);
    let m = {
      type: ActionType.action,
      action: ActionType.oauth.simkl.redirect,
      url,
      tabId,
    };
    chrome.runtime.sendMessage(m);
  }
};

// FIXED:
// Bug when chrome kills the service worker this handler is dead immediately
// so users will reach the http://chrome_ext_id page and it won't redirect back to chrome-extension
// Can be reproduced by logging out of simkl first (at https://simkl.com/logout)
// and then try connect simkl, then do simkl login (email/fb/whatever)
// then the next redirect will be the page with DNS_PROBE_FINISHED_NXDOMAIN
// SOLUTION:
// Was solved by using `declarativeNetRequest` and `web_accessible_resources`
// read the devlog entry for 4/3/2022
// TODO: move the above comments along with other BUGLOCs
// to github issues
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

// might use browser_action (chrome.action) so not using
// default_popup for now
chrome.action.setPopup({ popup: "/popup.html" });
// chrome.action.onClicked.addListener((_) => {
//   consoledebug("On Clicked")();
//   chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
//   chrome.action.setPopup({ popup: "/popup.html" });
// });

const rootid = "simkl>plex-root";
const fulltabid = "simkl>plex-full";
const focustabid = "simkl>plex-focus";

chrome.contextMenus.removeAll(() => {
  chrome.contextMenus.create({
    title: "Open",
    contexts: ["action"],
    id: rootid,
  });
  chrome.contextMenus.create({
    title: "Open in New Tab",
    contexts: ["action"],
    id: fulltabid,
    parentId: rootid,
  });
  chrome.contextMenus.create({
    title: "Focus on Opened Tab",
    contexts: ["action"],
    id: focustabid,
    parentId: rootid,
  });
});

chrome.contextMenus.onClicked.addListener(({ menuItemId }) => {
  consoledebug(menuItemId, fulltabid, focustabid)();
  switch (menuItemId) {
    case fulltabid:
      chrome.tabs.create({
        url: chrome.runtime.getURL("popup.html"),
      });
      break;
    case focustabid:
      let message = {
        action: ActionType.sw.tabFocus,
        type: ActionType.action,
      };
      chrome.runtime.sendMessage(message);
      break;

    default:
      break;
  }
});

// const setBadgeText = (text, color) => {
//   chrome.action.setBadgeText({ text });
//   if (color == "" || !color) return;
//   chrome.action.setBadgeBackgroundColor({ color });
// };

// const SuccessText = "\u2713"; //       ✓
// const SyncingText = "\ud83d\udd04"; // 🔄
// const PlexText = "plex";
// const SimklText = "simkl";

// setBadgeText(SimklText, "#000000");
// setBadgeText(PlexText, "#b7800a");
// setBadgeText(SuccessText);
// chrome.action.setTitle({ title: "Simkl>Plex - Sync done" });
