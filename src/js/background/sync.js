chrome.alarms.onAlarm.addListener(async (alarm) => {
  // works even when the service work is inactive
  if (alarm.name == AlarmKey) {
    // plex libray sync
    self.aController = new AbortController();
    await startBgSync(self.aController.signal);
  }
});

class UIEvents {
  // TODO: <BUG> the Js ui is not updating
  // after these events fire, check why
  // Found it was due to css issues
  static tokenExpired = (api = "plex") => {
    UIEvents.connectDone(api);
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.sessionexpired
          : ActionType.ui.sync.simkl.sessionexpired,
    });
  };

  static connectFailed = (api = "plex") => {
    // clear start message in ui
    UIEvents.connectDone(api);
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.unexpected
          : ActionType.ui.sync.simkl.unexpected,
    });
  };

  static connectStarted = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connecting
          : ActionType.ui.sync.simkl.connecting,
    });
  };

  static connectDone = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connectdone
          : ActionType.ui.sync.simkl.connectdone,
    });
  };

  static syncStarted = (api = "plex") => {
    chrome.runtime.sendMessage({
      type: ActionType.action,
      action:
        api == "plex"
          ? ActionType.ui.sync.plex.connectdone
          : ActionType.ui.sync.simkl.connectdone,
    });
  };
}

const userConfig = async () => {
  return {
    ...(await chrome.storage.local.get({
      plexInstanceUrl: null,
      syncPeriod: DefaultSyncPeriod,
    })),
    ...(await chrome.storage.sync.get({
      plexOauthToken: null,
      simklOauthToken: null,
    })),
  };
};

const plexLibraryGuidLut = async (fullList, pconf) => {
  let guidLut = {};
  let unknownGuidList = [];
  let pAgents = await plexInstalledAgents(pconf);
  let pErr = null;
  if (pAgents.movies.error || pAgents.shows.error) {
    pErr = pAgents.movies.error;
  }
  pAgents.shows = pAgents.shows.agents || [];
  pAgents.movies = pAgents.movies.agents || [];
  console.debug("Agents list", pAgents);

  fullList.forEach((type) =>
    type.forEach((item) => {
      if (!!item.Guid) {
        let guids = item.Guid.map((guid) => guid.id);
        guids.forEach((guid) => {
          guidLut[guid] = item;
        });
      } else if (!!item.guid) {
        let parts = item.guid.split("://");
        if (item.guid.startsWith("local://")) {
          // TODO: do matching via title search or something else
        } else if ([...pAgents.shows, ...pAgents.movies].includes(parts[0])) {
          // remove ?query and get the first part of path
          // and it won't raise any exceptions as
          // `str.spilt('delim')[0]` will be `str` if `delim` not in `str`
          let idx = parts[1].split("?")[0].split("/")[0];
          // if using absolute-series-scanner or hama or tvdb
          // guid = "com.plexapp.agents.hama://tvdb-79895/6/332?lang=en"
          // guid = "com.plexapp.agents.themoviedb://73223/1/1?lang=en"
          // i.e. well known agents
          switch (parts[0]) {
            case "com.plexapp.agents.none":
              // personal media => ignore
              break;
            case "com.plexapp.agents.hama":
              // eg: parts[1] = tvdb-75897/6/2?lang=en
              // => idx = tvdb-75897
              let [sourceT, id_] = idx.split("-");
              guidLut[`${sourceT}://${id_}`] = item;
              break;
            case "com.plexapp.agents.imdb": // plex legacy
              guidLut[`imdb://${idx}`];
              break;
            case "com.plexapp.agents.themoviedb":
              guidLut[`tmdb://${idx}`];
              break;
            case "com.plexapp.agents.thetvdb":
              guidLut[`tvdb://${idx}`];
              break;
            case "tv.plex.agents.series":
            case "tv.plex.agents.movie":
              // these two would've been handled in
              // if (item.Guid) block instead of this
              // elseif (item.guid)  block
              console.debug("unreachable", item.guid);
              break;
            default:
              console.debug("Unknown agent", parts[0]);
              break;
          }
        } else if (pAgents.movies.length == 0 || pAgents.shows.length == 0) {
          // TODO: maybe plex instance is offline
          console.error(pErr);
        } else unknownGuidList.push(item.guid);
      }
    })
  );
  console.debug(unknownGuidList);
  return guidLut;
};

const plexInstalledAgents = async (apiConf) => {
  return {
    shows: await __API__.plex.apis.installedPlexAgents(apiConf, "shows"),
    movies: await __API__.plex.apis.installedPlexAgents(apiConf, "movies"),
  };
};

const startBgSync = async (signal) => {
  await fetchAniDBTvDBMappings(signal);

  let config = await userConfig();
  let { plexInstanceUrl, syncPeriod, plexOauthToken, simklOauthToken } = config;
  if (!!plexInstanceUrl && !!plexOauthToken && !!simklOauthToken) {
    let pconf = {
      plexToken: plexOauthToken,
      plexApiBaseURL: plexInstanceUrl,
    };
    UIEvents.connectStarted("plex");
    let { libraries, error } = await __API__.plex.apis.getLibrarySections(
      pconf,
      false
    );
    if (!libraries) {
      console.error(error);
      // TODO: check if plex token expired
      UIEvents.connectFailed("plex");
      return;
    }
    console.debug(libraries);
    let fullLibraryList = await Promise.all(
      libraries.map(
        async (l) =>
          await __API__.plex.apis.getLibrarySectionAll(
            {
              ...pconf,
              libraryKey: l.key,
            },
            l.type
          )
      )
    );
    console.debug(fullLibraryList);
    // start processing the results
    let plexMediaList = fullLibraryList.map((l) => {
      if (l.error) {
        console.error(l.error);
        return [];
      }
      return l.items.filter((item) => !!item.Guid || !!item.guid);
    });
    console.debug(plexMediaList);

    // guid lut
    let guidLut = await plexLibraryGuidLut(plexMediaList, pconf);
    console.debug(guidLut);
    UIEvents.connectDone("plex");

    UIEvents.connectStarted("simkl");
    let { doFullSync } = await chrome.storage.local.get({
      doFullSync: false,
    });

    let dates = {};
    if (!doFullSync) {
      // get simkl last activity
      let la = await __API__.simkl.apis.getLastActivity(simklOauthToken);
      let { valid: simklTokenValid, info: simklLastActivity } = la;
      if (!simklTokenValid) {
        // session expired or some other error
        if (
          "error" in simklLastActivity &&
          simklLastActivity.error == "user_token_failed"
        ) {
          UIEvents.tokenExpired("simkl");
          return;
        }
        console.error(simklLastActivity);
        UIEvents.connectFailed("simkl");
        return;
      }
      console.debug(simklLastActivity);
      dates = {
        anime: simklLastActivity[MediaType.anime]["all"],
        movies: simklLastActivity[MediaType.movies]["all"],
        shows: simklLastActivity["tv_shows"]["all"], // is not shows but tv_shows
      };
    } else {
      console.debug("Doing a full sync");
    }

    // get simkl history
    console.debug(dates);
    let {
      success,
      data: simklChanges,
      serverTime,
      error: err,
    } = await __API__.simkl.apis.getAllItems(
      {
        dates,
        token: simklOauthToken,
      },
      null,
      signal
    );
    if (!success) {
      if (err instanceof DOMException) {
        console.debug("User canceled sync");
        return;
      }
      // TODO: sync failed, save error?
      console.error(err);
      return;
    }
    console.debug(simklChanges, serverTime);
    UIEvents.connectDone("simkl");

    for (let mediaType of Object.keys(simklChanges)) {
      if (!!signal && signal.aborted) {
        console.debug("User canceled sync");
        return;
      }
      // mediaType ∈ {'anime', 'movies', 'shows'}
      switch (mediaType) {
        case MediaType.movies:
          for (let movie of simklChanges[mediaType]) {
            if (!movie.movie.ids) {
              console.debug("Movie has no ids", movie);
              continue;
            }
            let mPlexids = simklIdsToPlexIds(movie.movie, mediaType);
            let plexMovie = mPlexids
              .map((id) => {
                guidLut[id];
              })
              .filter((m) => m);
            if (plexMovie.length > 0) {
              console.debug("Movie was found in plex library", plexMovie);
              return;
              // continue;
            } else {
              // console.debug(
              //   "Movie was not found in plex library",
              //   movie.movie.ids.slug
              // );
            }
            switch (movie.status) {
              case "completed":
                // await __API__.plex.apis.markMovieWatched({
                //   ...pconf,
                //   // movieKey: plexMovie[0].ra,
                // });
                break;
              case "plantowatch":
                break;
              case "notinteresting":
                break;
              default:
                break;
            }
            // console.debug(movie);
            // movie.status
            // movie.user_rating
            // movie.movie.ids.{imdb,tmdb,tvdb,tvdbslug}
            // break;
          }
          break;
        case MediaType.shows:
          for (let show of simklChanges[mediaType]) {
            if (!show.show.ids) {
              console.debug("Show has no ids", show);
              continue;
            }
            switch (show.status) {
              case "completed":
                break;
              case "watching":
                break;
              case "notinteresting":
                break;
              case "hold":
                break;
              case "plantowatch":
                break;
              default:
                break;
            }
            // console.debug(show);
            // show.status
            // show.user_rating
            // show.show.ids.{imdb,tmdb,tvdb,tvdbslug}
            // show.seasons
            // break;
          }
          break;
        case MediaType.anime:
          // TODO: handle anime differently, skip for now
          // use https://github.com/actsalgueiro/PlexSyncfromSimkl/blob/main/plexsync.py
          // as a reference
          let tvdbSlugsS = [];
          for (let anime of simklChanges[mediaType]) {
            if (!anime.show.ids) {
              console.debug("Show has no ids", anime);
              continue;
            }
            let keys = Object.keys(anime.show.ids);
            if (keys.includes("tvdbslug") && !keys.includes("tvdb")) {
              tvdbSlugsS.push(anime.show.ids);
            }
            switch (anime.status) {
              case "completed":
                break;
              case "watching":
                break;
              case "notinteresting":
                break;
              case "hold":
                break;
              case "plantowatch":
                break;
              default:
                break;
            }
          }
          console.log(tvdbSlugsS);
          break;
        default:
          break;
      }
    }

    let totalSyncCount = plexMediaList.reduce((accum, item) => {
      return accum + item.length;
    }, 0);
    console.log("Total sync count", totalSyncCount);
    // return;

    // TODOOOO: start sync
    let currentIdx = 0;
    let pMessage = {
      type: ActionType.action,
      action: ActionType.ui.sync.progress,
      value: currentIdx,
    };
    for (let mediaType of plexMediaList) {
      for (let _item of mediaType) {
        if (!!signal && signal.aborted) {
          console.debug("User canceled sync");
          return;
        }
        currentIdx++;
        pMessage.value = totalSyncCount - currentIdx;
        chrome.runtime.sendMessage(pMessage);
        await sleep(20);
      }
    }
    await syncDone(serverTime);
  } else {
    if (!simklOauthToken) {
      UIEvents.tokenExpired("simkl");
    }
    if (!plexOauthToken) {
      UIEvents.tokenExpired("plex");
    }
    if (!plexInstanceUrl) {
      UIEvents.connectFailed("plex");
    }
    // one of the required things is missing
    console.debug({
      plexInstanceUrl,
      syncPeriod,
      plexOauthToken,
      simklOauthToken,
    });
    console.error("Unreachable");
  }
};

const syncDone = async (serverTime) => {
  // sync done
  await chrome.storage.local.set({
    lastSynced: serverTime,
  });
  await chrome.storage.local.remove("doFullSync");
  let doneMsg = {
    type: ActionType.action,
    action: ActionType.ui.sync.finished,
  };
  await chrome.runtime.sendMessage(doneMsg);
};

/*
  Possible ids
  common:
    simkl, slug
    fb, imdb, instagram, tw
    offen
    tmdb
  movies:
  shows:
    tvdb, tvdbslug, zap2it
  anime:
    allcin, anfo, anidb, ann, crunchyroll, mal, offjp
    tvdbslug, vndb, wikien, wikijp, zap2it
*/
const simklIdsToPlexIds = (mediaInfo, mediaType) => {
  let ids = [];
  let allIds = Object.keys(mediaInfo.ids);
  switch (mediaType) {
    case MediaType.movies:
      ids = allIds.filter((id) => ["imdb", "tmdb", "tvdb"].includes(id));
      break;
    case MediaType.shows:
      ids = allIds.filter((id) => ["tvdb", "imdb", "tmdb"].includes(id));
      break;
    case MediaType.anime:
      ids = allIds.filter((id) =>
        ["tvdb", "tvdbslug", "imdb", "anidb"].includes(id)
      );
      break;
    default:
      ids = allIds;
      break;
  }
  ids = ids.map((id) => `${id}://${mediaInfo.ids[id]}`);
  return ids;
};

const simklMovieIdstoPlexIds = (media) =>
  simklIdsToPlexIds(media.movie, MediaType.movies);

const simklShowIdstoPlexIds = (media) =>
  simklIdsToPlexIds(media.show, MediaType.shows);

const simklAnimeIdstoPlexIds = (media) =>
  simklIdsToPlexIds(media.show, MediaType.anime);

// unused might required for later

const fetchAniDBTvDBMappings = async (signal) => {
  try {
    let resp = await fetch(
      "https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list.xml",
      { signal }
    ).catch((err) => {
      throw err;
    });
    let data = await resp.text();
    let ret = [];
    for (let anime of txml.parse(data)[1]["children"]) {
      ret.push(
        [
          anime.attributes.anidbid,
          anime.attributes.tvdbid,
          anime.attributes.defaulttvdbseason,
        ].join(",")
      );
    }
    console.debug(ret);
  } catch (error) {
    console.error(error, typeof error);
  }
};

const plexDiscover = async () => {
  let config = await userConfig();
  let { plexInstanceUrl, plexOauthToken } = config;
  var { servers, error } = await __API__.plex.apis.getLocalServers({
    plexApiBaseURL: plexInstanceUrl,
    plexToken: plexOauthToken,
  });
  if (!servers) {
    console.error(error);
    let message = {
      type: ActionType.action,
      action: ActionType.ui.sync.plex.unexpected,
    };
    chrome.runtime.sendMessage(message);
  }
  var { devices, error } = await __API__.plex.apis.getUserDevices(
    plexOauthToken
  );
  if (!devices) {
    console.error(error);
  }
  console.debug(servers, devices);
};

const zipSimklLibrary = async () => {
  // create a zip file with all the simkl library entries
  if (!JSZip) return;
  let webm = await (
    await fetch(chrome.runtime.getURL("assets/sample.webm"))
  ).blob();
  console.log(webm);
  let zip = new JSZip();
  let moviesZ = zip.folder("Simkl Movies");
  moviesZ.file("{tmdb-634649}.webm", webm, { binary: true });
  let showsZ = zip.folder("Simkl TV Shows");
  let showDir = showsZ.folder("{tvdb-323168}");
  for (let eno = 0; eno < 10000; eno += 1) {
    if (eno % 1000 == 0) console.debug("Added", eno, "files");
    showDir.file(`s01e${eno}.webm`, webm, { binary: true });
  }
  return zip;
};

var saveZipFile = async (zip, type = "blob") => {
  const logLabel = `save_zip_${type}`;
  console.time(logLabel);
  let donee = false;
  let blobdata = await zip.generateAsync(
    {
      type: type,
      compression: "DEFLATE",
      compressionOptions: {
        level: 9,
      },
    },
    // update callback
    (metadata) => {
      if (donee) return;
      donee = true;
      console.timeLog(
        logLabel,
        metadata.percent
        // "progress: " + metadata.percent.toFixed(2) + " %"
      );
      if (metadata.currentFile) {
        console.timeLog(logLabel, "current file = " + metadata.currentFile);
      }
    }
  );
  // let endTime = performance.now();
  // console.debug(`${endTime} ended ${type} zipping`);
  // console.debug(`${type} took ${endTime - startTime} millisecs`);
  console.timeEnd(logLabel);
  return blobdata;
};
