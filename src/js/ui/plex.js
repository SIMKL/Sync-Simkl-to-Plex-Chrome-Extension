const setUIPlexConnected = () => {
  document.body.classList.add("connected-plex");
};

const setUIPlexDisconnected = () => {
  document.body.classList.remove("connected-plex");
};

const savePlexAuthToken = (authToken, callback) => {
  chrome.storage.sync.set({ plexOauthToken: authToken }, callback);
};

const logoutPlex = () => {
  let message = {
    action: ActionType.oauth.plex.logout,
    type: ActionType.action,
  };
  // broadcast logout event to all clients
  chrome.runtime.sendMessage(message);
  finishLogoutPlex(message);
};

const finishLogoutPlex = (_message) => {
  chrome.storage.sync.remove("plexOauthToken", () => {
    setUIPlexDisconnected();
  });
  uiSyncDisabled();
  stopLibrarySync();
};

const startPlexOauth = () => {
  console.debug("Starting plex authentication flow");
  chrome.runtime.sendMessage(
    {
      type: CallType.call,
      method: CallType.oauth.plex.oauthStart,
      inPopup: inPopup(),
    },
    (response) => {
      let message = {
        action: ActionType.oauth.plex.login,
        type: ActionType.action,
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
    savePlexAuthToken(message.authToken);
    // remove pincode and pinid
    chrome.storage.local.set({ pincode: null, pinid: null });
    return true;
  }
  // TODO: show errors
  // setUIErrorMessage(message.error);
  console.debug(message);
};

const checkPlexAuthTokenValidity = () => {
  // Gets plexOauthToken from chrome.storage.sync
  // Checks whether it's valid and request user to login again if not

  // Note: broadcasting to other connected views is not needed for this
  chrome.runtime.sendMessage(
    {
      type: CallType.call,
      method: CallType.oauth.plex.checkTokenValiditiy,
    },
    (response) => {
      const { authToken, valid } = response;
      if (valid) {
        // set plex button ui accordingly
        setUIPlexConnected();
        savePlexAuthToken(authToken);
      } else {
        // TODO: show login prompt
        // with message describing that the old session expired
        console.debug(response);
      }
    }
  );
};
