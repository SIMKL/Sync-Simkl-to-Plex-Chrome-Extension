### TODO

#### `@phanirithvij`

- [x] API methods
  - [x] Oauth
    - [x] Plex get authtoken
    - [x] Simkl get authtoken
    - [x] Control flow
      - [x] Connect APIs to Plex, Simkl buttons
      - [ ] Show errors/info messages in UI
      - [x] Reopening popup should resume state, use `localStorage` for persistance.
        - This is not an issue when in full tab
  - [x] Simkl
    - [x] Full history endpoint
    - [x] Query based on last synced timestamp
      - check what this endpoint is in docs
  - [x] Plex
    - [x] List out local libraries and their entries
    - [x] Update a library info and entry info and status
    - [ ] Decide on how content is matched in simkl and plex
- [x] Ask user to setup syncing options
  - [x] Every `x` hrs
- [x] Open popup in a full tab for the first time
  - [x] `chrome.runtime.onInstalled`
  - [x] concluded to be not needed ~~Add thanks for install message conditionally if in full tab.~~
- [x] Redirect to uninstalled feedback page once uninstalled.
- [ ] All the other minor todos and fixmes scattered across the code.

#### `@masyk`

- [x] UX/UI
- [ ] Extension uninstall feedback (internal simkl.com) page
- [ ] (maybe needed) Php code for proxying plex oauth requests
  - This would get rid of the warning message shown by plex's oauth screen.
- [ ] Extension icon, name, description

