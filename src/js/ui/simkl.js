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
    action: "oauth.simkl.logout",
    type: "action",
  };
  // broadcast logout event to all clients
  chrome.runtime.sendMessage(message);
  finishLogoutSimkl(message);
};

const finishLogoutSimkl = (_message) => {
  chrome.storage.sync.set({ simklOauthToken: null }, () => {
    setUISimklDisconnected();
  });
};

const startSimklOauth = () => {
  console.debug("Starting simkl authentication flow");
  chrome.runtime.sendMessage(
    {
      type: "call",
      method: "oauth.simkl.simklOauthStart",
      inPopup:
        // https://stackoverflow.com/a/8921196
        chrome.extension.getViews({ type: "popup" })[0] !== undefined,
    },
    (response) => {
      let message = {
        action: "oauth.simkl.login",
        type: "action",
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
  // TODO: show errors
  // setUIErrorMessage(message.error);
  console.debug(message);
};

const checkSimklAuthTokenValidity = () => {
  // Gets simklOauthToken from chrome.storage.sync
  // Checks whether it's valid and request user to login again if not

  // Note: broadcasting to other connected views is not needed for this
  chrome.runtime.sendMessage(
    { type: "call", method: "oauth.simkl.simklCheckTokenValiditiy" },
    (response) => {
      const { authToken, valid } = response;
      if (valid) {
        // set simkl button ui accordingly
        setUISimklConnected();
        saveSimklAuthToken(authToken);
      } else {
        // TODO: show login prompt again
        // auth_token was revoked
        // with message describing that the old session expired
        console.debug(response);
      }
    }
  );
};

const fetchSimklFullHistory = () => {
  chrome.runtime.sendMessage(
    { type: "call", method: "apis.simkl.simklGetAllItems" },
    (response) => {
      console.debug(response);
    }
  );
};

// })();
