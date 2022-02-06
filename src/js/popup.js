function setCssVar(property, value) {
  return document.documentElement.style.setProperty(property, value);
}

function getCssVar(property) {
  return document.documentElement.style.getPropertyValue(property);
}

function removeWindowHash() {
  // https://stackoverflow.com/a/5298684
  window.history.replaceState(
    "",
    document.title,
    window.location.pathname + window.location.search
  );
}

function debounce(func, timeout = 400) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      func.apply(this, args);
    }, timeout);
  };
}
// https://stackoverflow.com/a/16861050
/* const popupCenter = ({ url, title, w, h }) => {
  // Fixes dual-screen position                             Most browsers      Firefox
  const dualScreenLeft =
    window.screenLeft !== undefined ? window.screenLeft : window.screenX;
  const dualScreenTop =
    window.screenTop !== undefined ? window.screenTop : window.screenY;

  const width = window.innerWidth
    ? window.innerWidth
    : document.documentElement.clientWidth
    ? document.documentElement.clientWidth
    : screen.width;
  const height = window.innerHeight
    ? window.innerHeight
    : document.documentElement.clientHeight
    ? document.documentElement.clientHeight
    : screen.height;

  const systemZoom = width / window.screen.availWidth;
  const left = (width - w) / 2 / systemZoom + dualScreenLeft;
  const top = (height - h) / 2 / systemZoom + dualScreenTop;
  const newWindow = window.open(
    url,
    title,
    `
      popup=1
      scrollbars=yes,
      width=${w / systemZoom}, 
      height=${h / systemZoom}, 
      top=${top}, 
      left=${left}
      `
  );

  if (window.focus) newWindow.focus();
  return newWindow;
};
 */

const restartLibrarySync = (durationHrs = 12) => {
  if (!durationHrs) {
    durationHrs = 12;
  }
  stopLibrarySync();
  chrome.alarms.create("plex-libray-sync", {
    when: Date.now() + 100, // start immediately
    periodInMinutes: durationHrs * 60,
  });
};

const stopLibrarySync = () => {
  chrome.alarms.clear("plex-libray-sync");
};

const startLibrarySync = restartLibrarySync;

const onLoad = () => {
  const plexBtn = document.querySelector("sync-buttons-button.Plex");
  const simklBtn = document.querySelector("sync-buttons-button.Simkl");
  const syncBtn = document.querySelector("sync-form-button");
  const urlInput = document.querySelector("sync-form-plex-url>input");
  const durationInput = document.querySelector("sync-form-select-time>select");

  plexBtn.addEventListener("click", (_) => {
    chrome.storage.sync.get({ plexOauthToken: null }, ({ plexOauthToken }) => {
      console.debug(`plexOauthToken is: ${plexOauthToken}`);
      if (!plexOauthToken) {
        startPlexOauth();
      } else {
        logoutPlex();
      }
    });
  });
  simklBtn.addEventListener("click", (_) => {
    chrome.storage.sync.get(
      { simklOauthToken: null },
      ({ simklOauthToken }) => {
        console.debug(`simklOauthToken is: ${simklOauthToken}`);
        // console.debug(e);
        if (!simklOauthToken) {
          startSimklOauth();
        } else {
          logoutSimkl();
        }
      }
    );
  });
  urlInput.addEventListener(
    "input",
    debounce(() => {
      if (urlInput.value.trim() != "") {
        if (
          urlInput.value.startsWith("http://") ||
          urlInput.value.startsWith("https://")
        ) {
          document.body.classList.remove("error-url");
          document.body.classList.add("url-added");
        } else {
          document.body.classList.add("error-url");
        }
      }
    })
  );
  durationInput.addEventListener("change", (_) => {
    chrome.storage.sync.set({ syncPeriod: durationInput.value });
  });
  syncBtn.addEventListener("click", async (_) => {
    if (
      document.body.classList.contains("connected-plex") &&
      document.body.classList.contains("connected-simkl") &&
      document.body.classList.contains("url-added")
    ) {
      await chrome.storage.local.set({ plexInstanceUrl: urlInput.value });
      chrome.storage.sync.get({ syncPeriod: null }, ({ syncPeriod }) => {
        startLibrarySync(syncPeriod);
      });
    }
  });

  if (window.location.hash == "#plex-oauth") {
    // this won't request new pin, code this time
    startPlexOauth();
    // remove #plex-oauth from url to be safe
    removeWindowHash();
  } else {
    // request service worker to validate and save oauth tokens
    checkPlexAuthTokenValidity();
  }
  if (window.location.hash == "#simkl-oauth") {
    startSimklOauth();
    // remove #simkl-oauth from url to be safe
    removeWindowHash();
  } else {
    // request service worker to validate and save oauth tokens
    checkSimklAuthTokenValidity();
  }
};

window.addEventListener("load", onLoad);

// Registering UI event handlers (actions)

chrome.runtime.onMessage.addListener((message, sender) => {
  console.debug("Got message:", message, "from:", sender);
  switch (message.type) {
    case "action":
      switch (message.action) {
        case "oauth.plex.login":
          finishPlexOauth(message);
          break;
        case "oauth.plex.logout":
          finishLogoutPlex(message);
          break;
        case "oauth.simkl.login":
          finishSimklOauth(message);
          break;
        case "oauth.simkl.logout":
          finishLogoutSimkl(message);
          break;
        default:
          console.debug("Unknown message format", message);
      }
      break;
    case "call":
      // ignore calls (they will be recieved by background.js)
      break;

    default:
      console.debug("Unknown message type", message);
  }
  // required if we don't use sendResponse
  return true;
});
