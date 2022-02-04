### Notes (for self)

- Oauth endpoints need to be handled in background.js because popup might close and we might lose the state.
- Never use js `innerHTML` to modify content but use css vars
  - This in combination with css `::before{content}` allows to switch translations, views etc., effortlessly.
- Try gitignore client_id+secret in the repo.
  - Chrome Extension policy disallows js obfuscation.
- References:
  - [Netflix enhancer](https://chrome.google.com/webstore/detail/enhancer-for-netflix-crun/dbpjfmehfpcgmlpfnfilcnhbckmecmca)
  - [Plex-Web-API-Overview](https://github.com/Arcanemagus/plex-api/wiki/Plex-Web-API-Overview)
  - [DeWolfRobin/ReverseSyncPlex](https://github.com/DeWolfRobin/ReverseSyncPlex)

### TODO

#### `@phanirithvij`

- [ ] API methods
  - [ ] Oauth
    - [x] Plex get authtoken
    - [ ] Simkl get authtoken
    - [ ] Control flow
      - [ ] Connect APIs to Plex, Simkl buttons
      - [ ] Show errors/info messages in UI
      - [ ] Reopening popup should resume state, use `localStorage` for persistance.
        - This is not an issue when in full tab
  - [ ] Simkl
    - [ ] Full history endpoint
    - [ ] Query based on last synced timestamp
      - check what this endpoint is in docs
  - [ ] Plex
    - [ ] List out local libraries and their entries
    - [ ] Update a library info and entry info and status
    - [ ] Decide on how content is matched in simkl and plex
- [ ] Ask user to setup syncing options
  - [ ] Every `x` hrs
- [x] Open popup in a full tab for the first time
  - [x] `chrome.runtime.onInstalled`
  - [ ] Add thanks for install message conditionally if in full tab.
- [ ] Redirect to uninstalled feedback page once uninstalled.
- [ ] All the other minor todos and fixmes scattered across the code.

#### `@andrewmasyk`

- [ ] UX/UI
- [ ] Extension uninstall feedback (internal simkl.com) page
- [ ] (optional) Php code to add a plex oauth endpoint to remove the plex oauth warning.
