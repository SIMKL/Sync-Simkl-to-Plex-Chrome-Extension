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

// https://stackoverflow.com/a/16861050
const popupCenter = ({ url, title, w, h }) => {
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

const setUIPlexConnected = () => {
  document.body.classList.add("connected-plex");
};

const setUIPlexDisconnected = () => {
  document.body.classList.remove("connected-plex");
};

const saveAuthToken = (authToken, callback) => {
  chrome.storage.sync.set({ plexOauthToken: authToken }, callback);
};

const logoutPlex = () => {
  let message = {
    action: "oauth.plex.logout",
    type: "action",
  };
  // broadcast logout event to all clients
  chrome.runtime.sendMessage(message);
  finishLogout(message);
};

const finishLogout = (_message) => {
  chrome.storage.sync.set({ plexOauthToken: null }, () => {
    setUIPlexDisconnected();
  });
};

const startPlexOauth = () => {
  console.debug("Starting plex authentication flow");
  chrome.runtime.sendMessage(
    {
      type: "call",
      method: "oauth.plex.plexOauthStart",
      inPopup:
        // https://stackoverflow.com/a/8921196
        chrome.extension.getViews({ type: "popup" })[0] !== undefined,
    },
    (response) => {
      let message = {
        action: "oauth.plex.login",
        type: "action",
        ...response,
      };
      // send broadcast message to others
      chrome.runtime.sendMessage(message);
      finishPlexOauth(message);
    }
  );
  // response will be sent back via chrome.tabs.sendMessage
  // it can be read from chrome.runtime.onMessage (handling it below)
};

const finishPlexOauth = (message) => {
  if ("authToken" in message && message.authToken != null) {
    // if successful
    setUIPlexConnected();
    saveAuthToken(message.authToken);
    return true;
  }
  // TODO: show errors
  // setUIErrorMessage(message.error);
  console.debug(message);
};

const checkPlexAuthTokenValidity = () => {
  // broadcast not needed for this
  chrome.runtime.sendMessage(
    { type: "call", method: "oauth.plex.plexCheckTokenValiditiy" },
    (response) => {
      const { authToken, valid } = response;
      if (valid) {
        // set plex button ui accordingly
        setUIPlexConnected();
        saveAuthToken(authToken);
      } else {
        console.debug(response);
      }
    }
  );
};

const onLoad = () => {
  const plexBtn = document.querySelector("sync-buttons-button.Plex");

  if (window.location.hash == "#plex-oauth") {
    // this won't request new pin, code this time
    startPlexOauth();
    // remove #plex-oauth from url to be safe
    removeWindowHash();
  } else {
    chrome.storage.local.set({ pincode: null, pinid: null });
    checkPlexAuthTokenValidity();
  }

  // request service worker to validate and return plex oauth token

  plexBtn.addEventListener("click", (e) => {
    chrome.storage.sync.get({ plexOauthToken: null }, ({ plexOauthToken }) => {
      console.debug(`plexOauthToken is: ${plexOauthToken}`);
      if (!plexOauthToken) {
        startPlexOauth();
      } else {
        logoutPlex();
      }
    });
  });
};

window.addEventListener("load", onLoad);

// Registering event handlers (actions)

chrome.runtime.onMessage.addListener((message, sender, _sendResponse) => {
  console.debug("Got message:", message, "from:", sender);
  switch (message.type) {
    case "action":
      switch (message.action) {
        case "oauth.plex.login":
          finishPlexOauth(message);
          break;
        case "oauth.plex.logout":
          finishLogout(message);
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
