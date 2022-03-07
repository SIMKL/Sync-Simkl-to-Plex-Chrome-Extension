# devlog

This document describes the development workflow that went into this project.

#### `3/2/2022`

- `@phanirithvij` (4 hrs total)
  - Started with reading plex oauth docs, found out they don't exist
  - https://forums.plex.tv/t/is-there-no-official-documented-plex-api/647488
  - https://forums.plex.tv/t/authenticating-with-plex/609370
  - https://github.com/Arcanemagus/plex-api/wiki/Plex-Web-API-Overview
  - The third resource does username and password authentication, and requesting user to enter third-party credentials on our client when oauth exists is not a good idea.
  - Followed the second resource as it is by one of the plex developers
  - Implemented plex oauth using polling (mentioned) in resource #2.
  - Wanted to try it without using polling as polling frequency of 1 req per sec hit 429 in just ~20 secs.
  - Tried with `forwardUrl: "chrome-extension://<chrome_ext_id>/popup.html"` but plex oauth auto redirects to plex.tv so it seems like it doesn't allow anything except `http{s}` schemes for `forwardUrl`.
  - So tried with a mock node.js app running at 127.0.0.1:8080 `forwardUrl: "127.0.0.1:8080"` and it worked but there was no query param for authToken after redirect, something like `?code=<>`. It was a simple redirect with `referer` header as plex.tv.
  - Created a placeholder html UI to test plex oauth.
  - Works with polling but if extension popup is closed it will cancel all http requests thus when re-opening need to start the oauth process again.
  - Used background service worker for handling oauth requests. Thus popup closing won't effect the oauth flow.
- `@masyk`
  - Started working on the extension UI design on Adobe xd.
  - Finished working on design

---

#### `4/2/2022`

- `@phanirithvij` (7 hrs total)

  - Worked on chrome extension's (crx) on install open popup in a full tab.
  - Worked on all the error cases for plex oauth API responses.
  - Tried experimenting with popup style oauth (like spotify)
    - crx popup.js does a `chrome.runtime.sendMessage` call to start the plex oauth flow in the service worker.
    - From now on it is all done in the service worker script.
    - open a new window using `chrome.windows.create` with height and width params.
    - start a `setInterval` call to see when plex pincode times out (it is 1800 sec)
    - register on window removed callback to monitor when the window is closed.
    - then return `true` back to crx client js (popup.js) via a response to `chrome.runtime.sendMessage`
  - Determined the popup flow is not ideal because users are generally against popups and also the url bar needs to be shown to not allow for any phishing attacks.
  - Found `chrome.windows.create` when called via the SW script can't show the url bar not matter what.
  - Tried using the normal `window.open` js api from the popup.js script as `window` is not accessible to the SW (service worker)
  - But now the state can be lost when the crx popup is closed.
    - The same issue as above, if crx popup is closed in the middle of a task/request/popup flow the plex popup window stays open and we need to redo the oauth from start on crx popup re-open.
    - So no choice but to use SW to handle the window opening.
  - But now we have to implement bi-directional message passing from SW and crx client js to listen to when the window closes.
  - Switched back to the trying out the redirect flow to avoid this added complexity.
  - In the redirect flow, the idea was for the crx to intercept a request made to to particual redirect url (`forwardUrl`) like [this](https://simkl.com/apps/plex/sync/connected) `https://simkl.com/apps/plex/sync/connected` and open `popup.html` in full tab.
    - Tried implemented it using chrome manifest `webRequest` and `webRequestBlocking` for `*://simkl.com/` but it turns out that this way of doing things was deprecated in manifest `v2`.
    - Discussed about this and concluded manifest `v2` was not an option as `v2` reached eol on `17-1-2022`. [Ref](https://developer.chrome.com/docs/extensions/mv3/mv2-sunset/)
  - Decided to stick with popup method for now.
  - Worked on some UI and css, added darkmode.js to allow switching themes.
    - Discussed and concluded to stick with dark theme and removed the darkmode switching logic
  - Turns out plex oauth requires the same domain as redirect url for oauth endpoint as the origin header of initiator (first pin-allocation request) or it will reject the oauth request.
    - So can't use `simkl.com/.../connected` as the `forwardUrl` when doing requests from the crx which sets origin as `chrome-extension://<chrome_ext_id>`
      - Need to proxy the plex oauth requests to be able to use `simkl.com/.../connected` as `forwardUrl`.
      - I decided to stick with `http://<chrome_ext_id>/popup.html#plex-oauth` (note the http protocol) as the `forwardUrl` even if it is invalid. As it can be intercepted immediately and can be redirected to `chrome-extension://<chrome_ext_id>/popup.html#plex-oauth`
    - I tried the url intercepting again after reading manifest `v3` docs on how to do it.
      - Need to use [`chrome.declarativeNetRequest`](https://developer.chrome.com/docs/extensions/reference/declarativeNetRequest/#example)
      - Implemented it and hit a roadblock because chrome shows `ERR_BLOCKED_BY_CLIENT` page when it intercepts the request in the middle of a redirect (url redirect) which plex does. A related [chrome bug](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/QJ3y_EhkhG4).
      - Got rid of the `declarativeNetRequest` handling.
      - Decided to intercept the tabs directly instead. Using `chrome.tabs.onUpdated.addListener`
        - This requires the `tabs` manifest permission if we need info on the tab's url, title
        - We require the url to check if it is `http://<chrome_ext_id>/popup.html#plex-oauth`
        - So added that to the manifest
      - Redirect flow works now. But there is a catch because of how plex oauth flow works.
        - Plex doesn't return `?code=<>` so we need to request a specific endpoint to get the `authToken` after entering the extension again.
        - For this the logic coded was save `pincode,pinid` to localstorage after the intial request and before the redirect if the url hash is `plex-oauth` then load `pincode,pinid` from localstorage and get the `authToken` and remove them from localstorage and remove the url hash, i.e., `popup.html`
        - TODO(#2): Also may need to add expire time to localstorage to invalidate expired `pincode,pinid` from localstorage.
    - Got the html UI from Andrew and connected the plex oaut flow to the `connect plex` button, via the css classlist toggle logic as suggested by Andrew.
    - Sent PR [#1](https://github.com/SIMKL/Sync-Simkl-to-Plex-Chrome-Extension/pull/1)

- `@masyk`
  - Started working on the html/css for chrome extension.
  - Finished working with the html/css
  - Chrome extension disallows the popup dimensions to exceed `800px x 600px` and the final height was `662px`
  - Made the changes required to get it to `599px`
    - FIXME(#3): But it still shows a scroll bar - @phanirithvij
      - @masyk said it's fine if it scrolls because the bottom text which is obscured is not worth re-adjusting the ui for.

---

#### `5/2/2022`

- `@phanirithvij` (3 hrs)
  - Added this devlog file
  - Added support for allowing multiple instances to recieve ui updates
    - It is done using `chrome.runtime.sendMessage` and `chrome.runtime.onMessage.addListener`.
    - sendMessage broadcasts it
    - onMessage listener listens for any _external_ messages.
    - sendMessage calls from same js thread won't be recieved in that thread's message listener
    - This leads to slight code duplication
    - Need to do required action using the message and do `sendMessage` so others can do the exact same action with the recieved message.
    - Background script also recieves these messages but that can't be avoided because `onMessage` doesn't support any filtering.
      - But the events can be seperated to allow popup.js and background script to distinguish what's what.
      - This was done using two types of events specifically `call` and `action`. `call` is for requesting something from background script. `action` is for self and broadcasts (all available instances).
      - If we make sure every `action` is idempotent (doesn't have any side effects on multiple calls) then this seperation won't taint the extension's flow.

#### `6/2/2022`

- `@phanirithvij` (4:15 hrs total)
  - [x] Simkl Oauth methods
  - [x] Connect to UI
  - [x] Implement oauth flow for simkl
  - [ ] Refactor to use classes
    - Didn't happen yet
  - Removed `tabs` permission from the manifest and started using `chrome.webNavigation.onBeforeNavigate` and `chrome.webNavigation.onErrorOccurred` instead.
    - These were seo, stackoverflow unfriendly and I only stumbled across them while reading docs about background pages to know how to get periodic background sync to work [here](https://developer.chrome.com/docs/extensions/mv2/background_pages/#filters)
  - Discussed on how to do the full initial sync for all the user items from the simkl api.
    - Conclusion was to make 3 api calls one for each media type (`anime, shows, movies`)
    - To reduce each network call's load on the server and browser processing time.
    - This had to be done because there is not pagination support for the all-times endpoint.
  - @ekleop may need to add a server-time field to the response of all-times api call.
    - Or use a common time server for everything to solve the age old problem of not trusting client's clock time for anything important.
    - This is to avoid errors and corrupting any resources (user's plex library in this case)
    - Can use server's Date response header
  - Started working on these simkl activity api calls

#### `8/2/2022`

- `@phanirithvij` (4:44 hrs total)
  - [x] gitignore client secrets for now (env.js)
    - Format as of now
      ```js
      const SimklClientID = "xxx";
      const SimklClientSecret = "xxx";
      ```
    - [ ] auto generate above script at build time
      - using github actions and repo secrets
  - [x] Api calls
    - [x] finalize plex api calls
      - [x] Plex network sniff
      - Cors blocked for local plex instances
        - To unblock cors
          - https://stackoverflow.com/a/67646077
        - `declarativeNetRequest` can't be an optional_permission
        - it is required to allow cors
      - Useful resources:
        - [gist](https://gist.github.com/philipjewell/2b721ccde6f251f67454dd04829cef4b) gets user's plex clients (outdated)
          - new way is `&X-Plex-Token` and `https://plex.tv/devices.xml`
    - [x] finalize simkl api calls
  - Added show/hide animations for sync-form element depending on whether both services are logged in.
  - Discussed about how to handle settings changes.
    - @masyk suggested, if url input changes stop sync automatically

#### `9/2/2022`

- `@phanirithvij` (4 hrs total)
  - Some plex endpoints don't return JSON even if `accept: application/json` is specified
    - So xml needs to be parsed in the background script where `DOMParser` isn't available.
    - I chose to use txml (tiny xml) parser
  - plex.tv also auto closes the devtools when inspecting
    - `"C:\Program Files (x86)\Google\Chrome Beta\Application\chrome.exe" "https://app.plex.tv/desktop/#!/" --remote-debugging-port=9222 --user-data-dir="C:\Users\Rithvij\AppData\Local\Temp"`
    - Discovered the above command to kinda work in combination with `chrome://inspect`

#### `10/2/2022-14/2/2022`

- `@phanirithvij`
  - [x] Sync done
    - [x] Error handling for UI
    - [ ] Content matching by episode, season, show, movie
      - Simkl returns ...
  - TODO(#4): Show a warning message before user starts syncing for the very first time that their plex library must be perfectly organized and each movie/show/season/episode needs to be recognized by plex as something. If the episodes and seasons recognized are erroneous then syncing will be erroneous.
    - eg. if `S01` for some reason is recognised as `S02` in plex, then it will have `S02` episodes status marked.
  - mention the official plex guide?

#### `21/2/2022`

- `@phanirithvij`

  - I propose an idea:

    - To generate the user's simkl watch history and create folder structure with episodes and movies filled.
    - We ask the user to enter a location (in their filesystem) where they want to store the simkl synced items.
    - The user can download this file (archive) and extract it to that location.
    - The structure will strictly follow plex's guide.
    - Each episode and movie file will be a tiny [mp4](https://github.com/mathiasbynens/small/blob/master/Mpeg4.mp4)/[webm](https://github.com/mathiasbynens/small/blob/master/webm.webm) file named very simply `{tmdb-<id>}.webm` according to the plex guide.
      - Plex supported video [formats](https://support.plex.tv/articles/203824396-what-media-formats-are-supported/)
      - Webm is not listed in above but works on my plex instance.
      - Plex tvshow and movie naming [guides](https://support.plex.tv/articles/categories/your-media/).
      - This is required instead of having an empty file because plex validates the video file before adding it to the library.
    - A folder hierarchy is generated via js in memory and the result is archived.
      - e.g.
      ```sh
        $ tree
      ```
    - The user doesn't need to do anything with the generated output except extract it to the location.
    - This step can be even simplified if using chrome filesystem apis. In that case the user only needs to give access to that directory and we can extract the file to that directory. (even compression isn't required as file hierarchy can be generated by code)
      - [API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
      - But there is a new issue of not being able to use hardlinks because chrome filesystem api has no such feature.
      - So this will be a compromise
    - Tried using jszip to generate the folder structure as a zip file. It was very slow (~2 mins per 10000 files). And it also generated a zip file with size `O(N)` (here N is 10000).
      - But as the file content is extractly same the compressed file should be very small and get generated very fast.
      - The proper solution for this is to simply do this in simkl backend and download the file.
        - But keeping this as a last resort and I will try implementing it completely on the client side.
        - Doing it in client side will have a lot for pros.
          - No need for handling an extra
          - progress updates can be shown very easily.
        - But that can't be done by me (@phanirithvij).
      - Looked at the file formats which support this. From this [so](https://stackoverflow.com/a/8859822) post only 7z works.
        - Found no 7z compression js library.
        - Lzma will also work, i.e. xz. But xz has no concept for multiple files, so first we must .tar
          - Found js lib for tar tarball.js gh repo.
        - Tried looking at wasm to get xz format working on the web. But it isn't possible because of webm-unsafe-eval CSP not rolled out (only in canary) for manifest v3
        - Wasm is not allowed in manifest v3 as of today. https://crbug.com/1173354

#### `26/2/2022`

- `@phanirithvij`
  - Added ios styled alert box logic following simkl.com (css) and a codepen (js).
  - Workaround for an extreme chromium bug.
    - Found out that when ext popup is open after we prompt for any permissions, after the permission prompt is closed the popup will be closed. https://crbug.com/952645
    - And as we are requesting webNavigation permission, I added permission handling flow.
      - If in a popup when requesting permissions we know for a fact popup closes after prompt closes
      - So open a specific route in a new tab depending on the login type i.e. `/popup.html#{plex,simkl}-perm`
      - When resolving hash routes on document load, if it is `#*-perm` handle it.
        - First remove window hash
        - check if permission granted and show alert if not.
        - if permission granted (`webNavigation`) then add intercept listeners.
        - auto handle oauth based on hash route's login type.
      - In this flow, on Brave browser (which I was using), when handling the oauth, in background `simkl.js` and `plex.js` the `chrome.tabs.update` is working as `chrome.tabs.create`.
      - Tried passing `tabId` and debugging but it could still be reproduced.
      - I assumed it was an issue with Brave browser specifically so tried testing the extension on google chrome, I had google chrome beta installed.
      - It (`chrome.tabs.update`) worked properly as intended when using chrome.
      - Added brave browser detection js logic to client and closed the extra opened tab if we are using brave.
      - But I installed google chrome stable version to test just to be sure.
      - Unexpectedly it was not a brave specific issue but chromium issue as it could be reproduced.
      - So searched a lot online regarding this bug to no avail and went to chrome release channels and refs (tags). Found the beta version (99.0.4844.45 (latest beta)) and 98.0.4758.102 (latest stable) and tried grepping the tag diff log for `tabs/update` but to no avail.
      - So started binary search for the version manually.
        - Download a specific chromium version.
        - Go through the steps of installing the extension (load unpacked) and reproducing the bug
        - if found update the lower bound to this version
        - if bug not found update the upper bound to this version
        - go to roughly the middle version
      - Finally after 2 hours found the version where the bug was fixed
        `99.0.4783.0` - works
        `99.0.4782.1` - doesn't work
        `98.0.4758.103+` - no downloads available
        `98.0.4758.102` - Does not work
      - Went through the diff of release tag commit log for these two beta versions (82.1 and 83.0) but found no commit describing this bug fix.
      - Can use string compare to compare installed version and this version to determine if the bug is applicable and handle it accordingly (as chrome follows semvers)
      - Handled it.
  - Added en-US strings for any strings which might be used via js.
    - `js/ui/language/{en-us,main}.js`
    - Refactored popup.js a bit.
  - Tried working with `chrome.webRequest.onBeforeRequest` again.
    - It was trivial if we ignore `webRequestBlocking` permission and use `chrome.tabs.update`.
  - As `webRequest` logic was working removed `webNavigation` logic and another unrelated obsolete `declarativeNetRequest` logic.
    - But after this permission flow was removed entirely.
    - With the removal of permission flow logic, the above manual work of finding the buggy chromium version barrier went down the drain.
    - Removed all of the chromium bug logic. (just version check)
    - Now en-us.js is not needed as only permission alert strings were hardcoded. Every other string is from en-us.css.
    - Removed en-us.js code.
    - Alert is being used for handling `origin` permission request flow for each plex url input by the user.

#### `28/2/2022`

- `@phanirithvij`
  - Only domains listed in `host_permissions` can make cors requests ignoring cors headers.
    - But plex.tv has cors enabled always, [related article](https://www.tenable.com/security/research/tra-2020-35)
    - All plex server endpoints also allow cors to the requested origin. i.e. `chrome-extension://<chrome_ext_id>` in our case.
      - plex server returns `Access-Control-Allow-Origin: chrome-extension://<chrome_ext_id>`
    - This calls for not requesting permissions for resources which allow cors.
      - [ ] TODO(#5): send a request to the provided plex server endpoint
      - If cors is enabled, the don't request permission for that origin.
      - If not, show user an error that the provided plex server has cors disabled. So it is not possible to send requests to it. If this case ever arises then we should use `*://*/*` as an optional host permission and request permissions.
      - [x] Thus following the above permission request for plex origins and related was removed.
  - The `chrome.webRequest` API which we use to redirect back to the extension page after oauth **requires** `host_permissions` to be specified in the manifest.
  - Currently using `"*://*/*"` as a host permission to allow `http://<chrome_ext_id>/*` as it is not possible to know the extension id before publishing it.
  - But it can't be changed to something other than `http://<chrome_ext_id>` because plex requires the origin to be same as the one requesting for the oauth. i.e. `<chrome_ext_id>`.
    - So we can't do something like hardcoded `http://simkl2plex/` in manifest.
    - Related issues https://github.com/w3c/webextensions/issues/119
      - Until this is implemented by google it is impossible to avoid `*://*/*`.
    - https://developer.chrome.com/docs/extensions/mv3/manifest/key/
    - Optional host permissions is a feature request which is in limbo
      - https://groups.google.com/a/chromium.org/g/chromium-extensions/c/EnUmtHWOI9o
      - https://crbug.com/1265064
      - https://crbug.com/1152255
      - https://gist.github.com/guest271314/74f35ff0a1271592d6f7e3cf792b357f
  - There is a 5 minute auto kill for service workers.
    - To bypass it, it is not easy to do so according to this [answer](https://stackoverflow.com/a/66618269)
    - Using <all_urls> or something that triggers manual review is unacceptable. (we are already being forced to use `*://*/*` above)
    - So maybe use alarms in a small frequency like a watchdog wake up and force it wake up once every minute as long as the sync isn't finished?
      - To test this it is not possible to use `console.debug` and wait for more than 5 mins on a tab because if a chrome extension view is open it will not be killed by chrome as mentioned on `2. "Forever", via a dedicated tab, while the tab is open` in the above answer.
        - So the only option to debug this is, to proxy `console.debug` and send them to some localhost logging server.

#### `1/3/2022`

- `@phanirithvij` (7 hours total)
  - Implemented a basic remote logging service to debug service worker lifecycle requests in the middle of syncing.
    - If sync takes > 5 mins we need to split the work.
    - This limit should not exist for extension service workers but it is unreasonable to expect google will fix any bugs related to chrome. [related article](https://www.eff.org/deeplinks/2021/12/chrome-users-beware-manifest-v3-deceitful-and-threatening)
  - Service workers have many bugs, and we are hitting one of them when checking for token validity
    - Plex oauth button will stay as not connected because when two `chrome.runtime.sendMessage` calls are issued immediately one of them is not firing.
    - Made some changes to avoid this buy forcefully synchronizing the requests.
    - And removed responseChannel (sendResponse) usage but using bidirectional message passing instead.
    - To debug service worker state chrome://serviceworker-internals/
    - Related questions on stackoverflow and crbugs
      - https://stackoverflow.com/q/66031376
      - https://crbug.com/1175696
      - https://stackoverflow.com/q/46348907
      - https://stackoverflow.com/q/57348446
    - Snitch todos with a seperate issue repo
      - This is the `.gitconfig`
        ```gitconfig
        [remote "bugs"]
          url = https://github.com/phanirithvij/sample_snitch_testbed.git
          fetch = +refs/heads/*:refs/remotes/bugs/*
        [remote "origin"]
          url = https://github.com/phanirithvij/Sync-Simkl-to-Plex-Chrome-Extension.git
          fetch = +refs/heads/*:refs/remotes/origin/*
        [remote "upstream"]
          url = https://github.com/SIMKL/Sync-Simkl-to-Plex-Chrome-Extension.git
          fetch = +refs/heads/*:refs/remotes/upstream/*
        ```

#### `2/3/2/2022`

- `@phanirithvij`
  - There is a `"homepage_url": "https://github.com/SIMKL/Sync-Simkl-to-Plex-Chrome-Extension"` field in the manifest which shows up as the extension icon right click first item.
  - Added context menu options for opening in a new tab and focusing on an active tab
  - package.json use `run-script-os` https://stackoverflow.com/a/53197655.
  - TODO(#6): move away from go, and use node.js scripts for everything instead. I used go initially intending the scripts written to be temporary but they are kind of required now.
    - Using `minify` go binary to minify things in the build script, use gulp instead.
      - A reference for building cross-platform browser extensions[here](https://github.com/dessant/search-by-image/blob/master/gulpfile.js)
    - It is important to have build scripts and to not write everything in github actions, because migrating to another hosting will require writing build scripts then.
      - Only have setup steps in github actions, use build scripts (makefile/bash/bat or something else) for everything else.
  - Setup github actions and create extension release.
    - Just tag a new release and ci will build the extension and upload it to the tagged release's assets.
    - The build script is `scripts/build.sh` which runs on github actions in a `ubuntu-20.0` container.
      - There is `scripts/build.bat` as well but it is only for local development on windows (I use windows). Not meant to be used in production or in the github actions (yet).
    - [ ] check if uploading to chrome web store can be automated and add it to the release workflow.
      - Yet to be done.

#### `3/3/2/2022`

- `@phanirithvij`
  - [ ] Finish with the sync
    - [x] Movies
    - [ ] Shows
      - [ ] Anime
        - Anime requires special care
  - Used the handy snitch tool (another go binary) and posted all the stay todos and fixmes into a separate repo to not pollute my fork.
  - Then squashed all the 37 generated commits into one.
    - Squashing commits https://stackoverflow.com/a/5190323
  - Looked at how we can add unit and integration tests to the extension.
    - One option is [`Qunit`](https://qunitjs.com/intro/) which can run tests directly in the browser, combining with puppeteer after installing our chrome extension.
      - [x] Implemented
    - We can capture screenshots and all of this can be run in a `ci.yml` workflow that runs on `push/pr/workflow_dispatch/etc.`.
      - [x] Implemented
    - Other things to take note of in ci.yml
      - Lint
        - auto fmt
        - [maybe use this](https://github.com/marketplace/actions/lint-action#supported-tools)
        - `web-ext lint` is not useful for us.
          - It assumes firefox and firefox has yet to have manifest v3 support.
            - `innerHTML` should be avoided is the only relevant suggestion web-ext lint gave.
            - There is also `chrome.sync` warnings which require some attention if we want to support firefox.
            - and `chrome.runtime.onSuspend` is not available on firefox and is not working at all on chrome either, so can't detect when the service worker is about to be killed by chrome using this. Removed any refrences.
          - This also concluded that to support firefox, safari etc. A lot more work needs to be done to properly seperate files, methods and use `browser.*` calls when appropriate. And all other browsers except chrome needs a manifest **v2** logic.
          - [search-by-image](https://github.com/dessant/search-by-image) is an excellent reference for supporting cross-browser webextensions.
      - Misspell
  - [x] Move away from windows batch file and use powershell
    - Implemented this, it had an issue with multiline regex using `(?ms)` or something which did not work at all. (refer the script for more comments on this)
    - Tried running the build on github actions on a `windows-latest` runner but it choked and got stuck for 3 hours, not sure what the issue is. But ignore it for now as the build.ps1 script works fine locally and thus serves its purpose.
  - TODO:
    - [ ] Finish sync the next thing tomorrow
      - [ ] Refactor `sync.js` methods properly
    - [ ] Prepare a document for general users to beta test the extension.
    - [ ] Add unit tests
      - Maybe unit tests can be included in the beta test for others?

#### `4/3/2/2022`

- `@phanirithvij`

  - Everything was going smoothly (not really) and then boom, the chrome update to latest stable version `99.0.4844.51` broke service worker message passing.

    - Lots of `Uncaught (in promise) Error: The message port closed before a response was received.` errors with the exact same code as before.
    - And it runs perfectly fine with no errors on the previous stable chrome version `98.0.4758.102`.
    - maybe related https://crbug.com/1296492
    - [update channel](https://chromereleases.googleblog.com/2022/03/stable-channel-update-for-desktop.html)
    - [x] Fixed this
      - Might require massive restructuring and removing the uses of `chrome.runtime.sendMessage`, maybe use `chrome.tabs.sendMessage`idk.
        - Nope, it was trivial
      - If using `chrome.tabs.sendMessage` instead of `chrome.runtime.sendMessage` and also manifest v2 thus background page instead of service workers, we won't be affected.
      - Solution was to use `sendResponse` everytime and never miss sending a response back, even if it is empty.
        - In case of async methods, `sendResponse` need not be used and `return true` still keeps the port open.

  - Found another bug with chrome service workers (how surprising)
    - `webRequest.onBeforeRequest` won't trigger when service worker is inactive.
      - https://stackoverflow.com/q/66104520
      - Can be easily verified by heading to `chrome://serviceworker-internals/` and making service worker inactive (or waiting for a few seconds before chrome kills the service worker) and then testing the redirect logic by manually visiting `http://<chrome_ext_id>/something`.
      - Found a [solution](https://stackoverflow.com/a/66106191)
        - Use `declarativeNetRequest` (again) but this time it works because it is defined in the manifest and chrome extension id can be fixed and hardcoded in the manifest and `rules.json`.
        - This combined with `onBeforeRequest` should do the trick.
        - It did indeed `do the trick` like I thought but there was the issue of `ERR_BLOCKED_BY_CLIENT` with `declarativeNetRequest` combined with server redirect.
          - Luckily this was solved from `wOxxOm`'s feedback
            - https://groups.google.com/a/chromium.org/g/chromium-extensions/c/QJ3y_EhkhG4
            - https://crbug.com/1238301#c3
            - https://stackoverflow.com/a/66638224
            - Related:
              - https://crbug.com/1241397
          - It did not come without any added burden though,
            now user sees `Block content on any page` for our extension permission because of `declarativeNetRequest`, which makes no sense to regular users on why simkl needs to block requests.
  - TODO:
    - Document every function
    - Refactor all functions so that
      - they feel systematic and clean
      - they allow proper modular unit testing
    - [x] Make sure sync works in the background when no client views are active.
      - Works, tested it by
        - enabling dev log server
        - reducing the sync interval to 0.1 mins, for debugging purposes.
        - reload extension.
        - Start sync
        - closing all clients
      - Using dev log server instead of using devtools on service worker, because when devtools is open service workers will never get killed by chrome.
        - So to remove this conditional behavior, a dev log server is used to test it.
    - [ ] Beta testing guide doc.

#### Notes (`@phanirithvij`)

- Oauth endpoints need to be handled in background.js because popup might close and we might lose the state.
- Never use js `innerHTML` to modify content but use css vars
  - This in combination with css `::before{content}` allows to switch translations, views etc., effortlessly.
- Try gitignore client_id+secret in the repo.
  - Chrome Extension policy disallows js obfuscation.
- References:
  - [Netflix enhancer](https://chrome.google.com/webstore/detail/enhancer-for-netflix-crun/dbpjfmehfpcgmlpfnfilcnhbckmecmca)
  - [Plex-Web-API-Overview](https://github.com/Arcanemagus/plex-api/wiki/Plex-Web-API-Overview)
  - [DeWolfRobin/ReverseSyncPlex](https://github.com/DeWolfRobin/ReverseSyncPlex)
- More to come.
- Important: manifest `key` field should be removed when uploading to chrome webstore and also the key.pem file should be also zipped and uploaded the very first time.
  - So no need to automate the key.pem zipping in release workflow.
  - Publish to store
  - key
    ```json
      "key": "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAs5UgzBFazS+AO+RJV5f7OaKe9wYM5d6Ozjw7TkHEvgDDHyUmI23dVSF18dR96bX7JgY2Weh9wSDyz26JqgnUBvD4zUKrpURadira3vdvD0Hft3RlCc+GE53dlXFiugbDLzWIB+TmqxlF0N1sBbodyU7oc4FXz4nP0buR/PzqVrBE1hh1wfR9X7HBwN2RJf1bT5QRYQYGLZr3KxofwPLRMPLqCphAjmP1mzL+wiwxrCjBFQLGHQs/Ki0R2DL+RxCeK3fufDyIx6xmrjRHeuCL70asfUjfGU0ehsZgT3sO+4DKtoo2JaK7j1owuywqrlHkAuZ8IUVI5JiM0k4Lyp3cTwIDAQAB",
    ```
