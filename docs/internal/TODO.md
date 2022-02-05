### TODO

#### `@phanirithvij`

- [ ] API methods
  - [ ] Oauth
    - [x] Plex get authtoken
    - [ ] Simkl get authtoken
    - [ ] Control flow
      - [ ] Connect APIs to Plex, Simkl buttons
      - [ ] Show errors/info messages in UI
      - [x] Reopening popup should resume state, use `localStorage` for persistance.
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
  - [x] concluded to be not needed ~~Add thanks for install message conditionally if in full tab.~~
- [ ] Redirect to uninstalled feedback page once uninstalled.
- [ ] All the other minor todos and fixmes scattered across the code.

#### `@andrewmasyk`

- [x] UX/UI
- [ ] Extension uninstall feedback (internal simkl.com) page
- [ ] (maybe needed) Php code for proxying plex oauth requests
  - This would get rid of the warning message shown by plex's oauth screen.
