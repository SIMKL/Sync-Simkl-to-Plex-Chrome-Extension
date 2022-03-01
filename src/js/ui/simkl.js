// (() => {
const setUISimklConnected = () => {
  document.body.classList.add("connected-simkl");
};

const setUISimklDisconnected = () => {
  document.body.classList.remove("connected-simkl");
};

const saveSimklAuthToken = (authToken, callback) => {
  chrome.storage.sync.set({ simklOauthToken: authToken }, callback);
};

const logoutSimkl = () => {
  let message = {
    action: ActionType.oauth.simkl.logout,
    type: ActionType.action,
  };
  // broadcast logout event to all clients
  chrome.runtime.sendMessage(message);
  finishLogoutSimkl(message);
};

const finishLogoutSimkl = (_message) => {
  chrome.storage.sync.remove("simklOauthToken", () => {
    setUISimklDisconnected();
  });
  uiSyncDisabled();
  stopLibrarySync();
};

const startSimklOauth = () => {
  consoledebug("Starting simkl authentication flow")();
  chrome.runtime.sendMessage(
    {
      type: CallType.call,
      method: CallType.oauth.simkl.oauthStart,
      inPopup: inPopup(),
    },
    (response) => {
      let message = {
        action: ActionType.oauth.simkl.login,
        type: ActionType.action,
        ...response,
      };
      // send broadcast message to others
      chrome.runtime.sendMessage(message);
      finishSimklOauth(message);
    }
  );
  // response will be sent back via chrome.tabs.sendMessage
  // it can be read from chrome.runtime.onMessage (handling it below)
};

const finishSimklOauth = (message) => {
  if ("authToken" in message && message.authToken != null) {
    // if successful
    setUISimklConnected();
    saveSimklAuthToken(message.authToken);
    return true;
  }
  // TODO: simkl oauth finish show any errors
  // Something like `setUIErrorMessage(message.error)` ?
  consoledebug(message)();
};

const checkSimklAuthTokenValidity = async () => {
  // Gets simklOauthToken from chrome.storage.sync
  // Checks whether it's valid and request user to login again if not

  // Note: broadcasting to other connected views is not needed for this
  await chrome.runtime.sendMessage({
    type: CallType.call,
    method: CallType.oauth.simkl.checkTokenValiditiy,
  });
};

// })();
