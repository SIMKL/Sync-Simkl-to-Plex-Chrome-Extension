function setCssVar(property, value) {
  return document.documentElement.style.setProperty(property, value);
}

function getCssVar(property) {
  return document.documentElement.style.getPropertyValue(property);
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

const logoutPlex = () => {
  chrome.storage.sync.set({ plexOauthToken: null }, () => {
    document.body.classList.remove("connected-plex");
  });
};

const startPlexOauth = () => {
  chrome.runtime.sendMessage(
    { type: "call", method: "oauth.plex.plexOauthStart" },
    (response) => {
      if ("authToken" in response && response.authToken != null) {
        // if successful
        document.body.classList.add("connected-plex");
        chrome.storage.sync.set({ plexOauthToken: response.authToken });
      } else {
        // TODO: show errors
        console.debug(response);
      }
    }
  );
};

const checkPlexAuthTokenValidity = () => {
  chrome.runtime.sendMessage(
    { type: "call", method: "oauth.plex.plexCheckTokenValiditiy" },
    (response) => {
      const { authToken, valid } = response;
      if (valid) {
        // set plex button ui accordingly
        document.body.classList.add("connected-plex");
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
    // https://stackoverflow.com/a/5298684
    window.history.replaceState(
      "",
      document.title,
      window.location.pathname + window.location.search
    );
  } else {
    chrome.storage.local.set({ pincode: null, pinid: null});
    checkPlexAuthTokenValidity();
  }

  // request service worker to validate and return plex oauth token

  plexBtn.addEventListener("click", (e) => {
    chrome.storage.sync.get({ plexOauthToken: null }, ({ plexOauthToken }) => {
      console.debug(plexOauthToken);
      if (plexOauthToken == null) {
        startPlexOauth();
      } else {
        logoutPlex();
      }
    });
  });
};

window.addEventListener("load", onLoad);
