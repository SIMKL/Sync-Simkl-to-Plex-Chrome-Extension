class UIEvents {
  // TODO: <BUG> the Js ui is not updating
  // after these events fire, check why
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

const plexLibraryGuidLut = (fullList) => {
  let guidLut = {};
  fullList.forEach((type) =>
    type.forEach((item) => {
      let guids = item.Guid.map((guid) => guid.id);
      guids.forEach((guid) => {
        guidLut[guid] = item;
      });
    })
  );
  return guidLut;
};

const startBgSync = async () => {
  await fetchAniDBTvDBMappings();

  let config = await userConfig();
  let { plexInstanceUrl, syncPeriod, plexOauthToken, simklOauthToken } = config;
  if (!!plexInstanceUrl && !!plexOauthToken && !!simklOauthToken) {
    let pconf = {
      plexToken: plexOauthToken,
      plexApiBaseURL: plexInstanceUrl,
    };
    UIEvents.connectStarted("plex");
    let { libraries, error } = await __API__.plex.apis.getLibrarySections(
      pconf
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
    let fullList = fullLibraryList.map((l) => {
      if (l.error) {
        console.error(l.error);
        return [];
      }
      return l.items.filter((item) => !!item.Guid);
    });
    console.debug(fullList);

    // TODO guid lut
    let guidLut = plexLibraryGuidLut(fullList);
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
        anime: simklLastActivity["anime"]["all"],
        movies: simklLastActivity["movies"]["all"],
        shows: simklLastActivity["tv_shows"]["all"],
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
    } = await __API__.simkl.apis.getAllItems({
      dates,
      token: simklOauthToken,
    });
    if (!success) {
      console.error(err);
      // TODO: this shouldn't be done. remove it later
      syncDone(serverTime);
      // TODO: sync failed, save error?
      return;
    }
    console.debug(simklChanges, serverTime);
    UIEvents.connectDone("simkl");

    const simklMovieIdstoPlexIds = (media) => {
      return simklIdsToPlexIds(media).filter((x) =>
        ["imdb", "tmdb"].includes(x.split(":")[0])
      );
    };

    let idTypes = {
      ids: {
        movies: {},
        anime: {},
        shows: {},
      },
      totals: {
        movies: 0,
        anime: 0,
        shows: 0,
      },
    };
    for (let k of Object.keys(simklChanges)) {
      if (k == "movies") {
        for (let movie of simklChanges[k]) {
          if (!movie.movie.ids) {
            console.debug("Movie has no ids", movie);
            continue;
          }
          idTypes.totals.movies += 1;
          Object.keys(movie.movie.ids).forEach((id) => {
            id in idTypes.ids[k]
              ? (idTypes.ids[k][id] += 1)
              : (idTypes.ids[k][id] = 1);
          });
          // let ids = simklMovieIdstoPlexIds(movie);
          if (movie.status == "completed") {
            // await __API__.plex.apis.markMovieWatched({
            //   ...pconf,
            //   // movieKey: guidLut[2]
            // });
          }
          // console.debug(movie);
          // movie.status
          // movie.user_rating
          // movie.movie.ids.{imdb,tmdb,tvdb,tvdbslug}
          // break;
        }
      } else {
        // TODO: handle anime differently, skip for now
        // use https://github.com/actsalgueiro/PlexSyncfromSimkl/blob/main/plexsync.py
        // as a reference
        let tvdbSlugsS = [];
        for (let show of simklChanges[k]) {
          if (!show.show.ids) {
            console.debug("Show has no ids", show);
            continue;
          }
          if (k == "anime") {
            let keys = Object.keys(show.show.ids);
            if (keys.includes("tvdbslug") && !keys.includes("tvdb")) {
              tvdbSlugsS.push(show.show.ids);
            }
          }

          idTypes.totals[k] += 1;
          Object.keys(show.show.ids).forEach((id) => {
            id in idTypes.ids[k]
              ? (idTypes.ids[k][id] += 1)
              : (idTypes.ids[k][id] = 1);
          });
          // console.debug(show);
          // show.status
          // show.user_rating
          // show.show.ids.{imdb,tmdb,tvdb,tvdbslug}
          // show.seasons
          // break;
        }

        console.log(tvdbSlugsS);
      }
    }
    console.debug(idTypes);
    return;

    // TODO: start sync
    for (let type of fullList) {
      for (let item of type) {
        console.debug(item);
        break;
      }
    }

    syncDone(serverTime);
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

const syncDone = (serverTime) => {
  // sync done
  chrome.storage.local.set({
    lastSynced: serverTime,
  });
  chrome.storage.local.remove("doFullSync");
};

const fetchAniDBTvDBMappings = async () => {
  try {
    let resp = await fetch(
      "https://raw.githubusercontent.com/Anime-Lists/anime-lists/master/anime-list.xml"
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
    console.error(error);
  }
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
const simklIdsToPlexIds = (media) => {
  return Object.keys(media.ids).map(
    (id) =>
      // ["imdb", "tmdb", "tvdb", "tvdbslug", "anidb"].includes(id)
      //   ? `${id}://${media.ids[id]}`
      //   : null
      `${id}://${media.ids[id]}`
  );
  // // remove nulls
  // .filter((x) => x)
};
