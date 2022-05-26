chrome.alarms.onAlarm.addListener(async (alarm) => {
  // works even when the service work is inactive
  if (alarm.name == AlarmKey) {
    // plex libray sync
    self.aController = new AbortController();
    await startBgSync(self.aController.signal);
  }
});

class UIEvents {
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

const plexLibraryShowsLut = async (fullList, pconf) => {
  let guidLut = {};
  let unknownGuidList = [];
  let pAgents = await plexInstalledAgents(pconf);
  let pErr = null;
  if (pAgents.movies.error || pAgents.shows.error) {
    pErr = pAgents.movies.error;
  }
  pAgents.shows = pAgents.shows.agents || [];
  pAgents.movies = pAgents.movies.agents || [];
  consoledebug("Agents list", pAgents)();

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
          // TODO(#20): do matching via title search or something else
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
              consoledebug("unreachable", item.guid)();
              break;
            default:
              consoledebug("Unknown agent", parts[0])();
              break;
          }
        } else if (pAgents.movies.length == 0 || pAgents.shows.length == 0) {
          // TODO(#21): maybe plex instance is offline
          consoleerror(pErr)();
        } else unknownGuidList.push(item.guid);
      } else {
        consoledebug("No Guid or guid for item", item)();
      }
    })
  );
  consoledebug(unknownGuidList)();
  return guidLut;
};

const plexLibraryShowS0mE0nLut = (fullList) => {
  // build a dict with keys showID-s0me0n and values episodes
  let lut = {};
  fullList.forEach((l) => {
    l.forEach((e) => {
      lut[`${e.grandparentRatingKey}-s${e.parentIndex}e${e.index}`] = e;
    });
  });
  return lut;
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
  consoledebug("Agents list", pAgents)();

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
          // TODO(#22): do matching via title search or something else
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
              consoledebug("unreachable", item.guid)();
              break;
            default:
              consoledebug("Unknown agent", parts[0])();
              break;
          }
        } else if (pAgents.movies.length == 0 || pAgents.shows.length == 0) {
          // TODO(#23): maybe plex instance is offline
          consoleerror(pErr)();
        } else unknownGuidList.push(item.guid);
      } else {
        consoledebug("No Guid or guid for item", item)();
      }
    })
  );
  consoledebug(unknownGuidList)();
  return guidLut;
};

const plexInstalledAgents = async (apiConf) => {
  return {
    shows: await __API__.plex.apis.installedPlexAgents(apiConf, "shows"),
    movies: await __API__.plex.apis.installedPlexAgents(apiConf, "movies"),
  };
};

// returns list of all episode and movie items
const getPlexMediaList = async (libraries, pconf) => {
  let fullLibraryList = await Promise.all(
    libraries.map(
      async (l) =>
        await __API__.plex.apis.getLibrarySectionAll(
          {
            ...pconf,
            libraryKey: l.key,
          },
          l.type == "show" ? "episode" : l.type
        )
    )
  );
  // consoledebug(fullLibraryList)();
  // start processing the results
  let plexMediaList = fullLibraryList.map((l) => {
    if (l.error) {
      consoleerror(l.error)();
      return [];
    }
    return l.items.filter((item) => !!item.Guid || !!item.guid);
  });
  return plexMediaList;
};

// returns list of all season items, no movies
const getPlexSeasonsList = async (libraries, pconf) =>
  getPlexShowList(libraries, pconf, true);

// returns list of all shows, no movies
const getPlexShowList = async (libraries, pconf, seasons = false) => {
  let fullLibraryList = await Promise.all(
    libraries
      .filter((l) => l.type == "show")
      .map(
        async (l) =>
          await __API__.plex.apis.getLibrarySectionAll(
            {
              ...pconf,
              libraryKey: l.key,
            },
            seasons ? "seasons" : l.type
          )
      )
  );
  // consoledebug(fullLibraryList)();
  // start processing the results
  let plexShowList = fullLibraryList.map((l) => {
    if (l.error) {
      consoleerror(l.error)();
      return [];
    }
    return l.items.filter((item) => !!item.Guid || !!item.guid);
  });
  return plexShowList;
};

const startBgSync = async (signal) => {
  let { anidbtvdbIdsLut, anidbtvdbS0mE0nMappings } =
    await fetchAniDBTvDBMappings(signal);
  // consoledebug(anidbtvdbIdsLut, anidbtvdbS0mE0nMappings)();
  // globalThis.AnimeListXMLInfo = { anidbtvdbIdsLut, anidbtvdbS0mE0nMappings };

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
      consoleerror(error)();
      // TODO(#24): check if plex token expired
      UIEvents.connectFailed("plex");
      return;
    }
    console.log("plex libraries", libraries);
    let plexMediaList = await getPlexMediaList(libraries, pconf);
    const plexMovieList = plexMediaList.map((l) =>
      l.filter((item) => item.type == "movie")
    );
    console.log("movies", plexMovieList);
    const plexEpisodesList = plexMediaList.map((l) =>
      l.filter((item) => item.type == "episode")
    );
    console.log("episodes", plexEpisodesList);
    let plexShowList = await getPlexShowList(libraries, pconf);
    console.log("shows", plexShowList);
    let plexSeasonList = await getPlexSeasonsList(libraries, pconf);
    console.log("seasons", plexSeasonList);

    // guid look up tables
    let moviesGuidLut = await plexLibraryGuidLut(plexMediaList, pconf);
    consoledebug(moviesGuidLut)();
    let showsGuidLut = await plexLibraryGuidLut(plexShowList, pconf);
    consoledebug(showsGuidLut)();
    let episodeSeasonS0mE0nLut = plexLibraryShowS0mE0nLut(
      plexEpisodesList,
      pconf
    );
    consoledebug(episodeSeasonS0mE0nLut)();

    UIEvents.connectDone("plex");

    // Simkl

    UIEvents.connectStarted("simkl");
    let { doFullSync, lastSynced } = await chrome.storage.local.get({
      // assume full sync by default
      doFullSync: true,
      // assume we never synced before
      lastSynced: null,
    });

    let dates = null;
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
        consoleerror(simklLastActivity)();
        UIEvents.connectFailed("simkl");
        return;
      }
      consoledebug(simklLastActivity)();
      if (lastSynced) {
        consoledebug("last sucessful sync on", lastSynced)();
        /* 
          Simkl has 2 endpoints
            - one to get user's last activity and
            - the other to get a user's all items.
          The all items endpoint takes in a date (optionally) and
          the last activity endpoint returns last activity time for each section.
        */
        dates = {};
        [MediaType.anime, MediaType.movies, MediaType.shows].forEach((type) => {
          let lastActiveTime =
            simklLastActivity[type == MediaType.shows ? "tv_shows" : type][
              "all"
            ];
          /*
            do not use direct ISO string comparison
            because they could be in a different timezones
              - if server deployment changes
              - or if we are falling back to local users's time
          */
          if (new Date(lastActiveTime) > new Date(lastSynced)) {
            dates[type] = lastSynced;
          } else {
            // last activity was older than when we last synced
            // so no need to fetch anything for this type.
          }
        });
        console.log("Doing a sync of all items from", lastSynced);
      } else {
        doFullSync = true;
      }
    }
    if (doFullSync) {
      console.log("Doing a full sync");
    }
    consoledebug(dates)();

    // get simkl history
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
        consoledebug("User canceled sync")();
        return;
      }
      // TODO(#25): sync failed, save error?
      consoleerror(err)();
      return;
    }
    consoledebug(simklChanges, serverTime)();
    UIEvents.connectDone("simkl");

    {
      // for each simkl change sync with plex
      let totalSyncCount = Object.keys(simklChanges)
        .map((mediaType) => simklChanges[mediaType])
        .reduce((accum, item) => {
          return accum + item.length;
        }, 0);
      consolelog("Total simkl changes", totalSyncCount)();
      let currentIdx = 0;
      let pMessage = {
        type: ActionType.action,
        action: ActionType.ui.sync.progress,
        value: currentIdx,
      };
      for (let mediaType of Object.keys(simklChanges)) {
        if (!!signal && signal.aborted) {
          consoledebug("User canceled sync")();
          return;
        }
        // mediaType ∈ {'anime', 'movies', 'shows'}
        switch (mediaType) {
          case MediaType.movies:
            for (let smkMovie of simklChanges[mediaType]) {
              if (!smkMovie.movie.ids) {
                consoledebug("Movie has no ids", smkMovie)();
                continue;
              }
              currentIdx++;
              pMessage.value = totalSyncCount - currentIdx;
              chrome.runtime.sendMessage(pMessage);

              let mPlexids = simklIdsToPlexIds(smkMovie.movie, mediaType);
              let plexMovie = mPlexids
                .map((id) => moviesGuidLut[id])
                .filter((m) => m);
              if (plexMovie.length > 0) {
                // consoledebug(
                //   "Movie",
                //   plexMovie[0].title,
                //   "was found in plex library"
                // )();
              } else {
                // Movie was not found in plex library
                continue;
              }
              switch (smkMovie.status) {
                case "completed":
                  await __API__.plex.apis.markMovieWatched({
                    ...pconf,
                    movieKey: plexMovie[0].ratingKey,
                    name: plexMovie[0].title,
                    userRating: smkMovie.user_rating,
                  });
                  break;
                case "plantowatch":
                  // TODO: next release, add non-existant library entries
                  break;
                case "notinteresting":
                  // not possible to do anything here
                  // we can't delete a single item
                  // or mark it as notinteresting in a plex library
                  break;
                default:
                  // TODO: there is no deleted events from /all-items
                  // i.e if a movie or show is removed from user's list in simkl
                  // then we can't know of it.
                  // unless we cache the full history and compare it with user's history everytime
                  // (using `unlimitedStorage` https://developer.chrome.com/docs/extensions/reference/storage/#property)
                  // `unlimitedStorage` might not be needed as only ids can be stored in chrome.storage.sync
                  break;
              }
            }
            break;
          case MediaType.shows:
            for (let smkShow of simklChanges[mediaType]) {
              if (!smkShow.show.ids) {
                consoledebug("Show has no ids", smkShow)();
                continue;
              }
              currentIdx++;
              pMessage.value = totalSyncCount - currentIdx;
              chrome.runtime.sendMessage(pMessage);

              let mPlexids = simklIdsToPlexIds(smkShow.show, mediaType);
              let plexShow = mPlexids
                .map((id) => showsGuidLut[id])
                .filter((s) => s);
              if (plexShow.length > 0) {
                // console.log(
                //   "Show",
                //   plexShow[0].title,
                //   "was found in plex library",
                //   plexShow[0]
                // );
              } else {
                // consoledebug(
                //   "Show was not found in plex library",
                //   show.show.ids.slug
                // )();
                continue;
              }
              // show.status
              // show.user_rating
              // show.seasons
              switch (smkShow.status) {
                case "completed":
                  // mark whole thing as watched
                  await __API__.plex.apis.markShowWatched({
                    ...pconf,
                    showKey: plexShow[0].ratingKey,
                    name: plexShow[0].title,
                    userRating: smkShow.user_rating,
                    isAnime: false,
                  });
                  break;
                case "watching":
                // The next 3 cases can't be handled by us
                // Because in plex there is no concept of these
                // But all these states can have watched episodes and seasons
                // so tream them as though they are same as `watching`
                case "notinteresting":
                case "hold":
                case "plantowatch":
                  // see what items are watched
                  // and efficiently mark them as watched
                  // i.e. if a whole season is done use season watched plex api method
                  // consoledebug(
                  //   "Show",
                  //   plexShow[0].title,
                  //   "was found in plex library"
                  // )();
                  let plexShowSeasons = plexSeasonList.map((l) =>
                    l.filter((s) => s.parentRatingKey == plexShow[0].ratingKey)
                  );
                  if (
                    smkShow.watched_episodes_count +
                      smkShow.not_aired_episodes_count ==
                    smkShow.total_episodes_count
                  ) {
                    // mark all aired seasons as watched
                    plexShowSeasons.forEach((l) => {
                      l.forEach((s) => {
                        __API__.plex.apis.markSeasonWatched({
                          ...pconf,
                          seasonKey: s.ratingKey,
                          name: `${plexShow[0].title}: ${s.title}`,
                        });
                      });
                    });
                  } else {
                    // season by season or episode by episode
                    // detect if a season has been fully watched
                    // if so need to be careful with sending too many requests to plex
                    console.log(`Show ${plexShow[0].title}`);
                    if ("seasons" in smkShow) {
                      smkShow.seasons.forEach(async (smkSeason) => {
                        console.log(`Season ${smkSeason.number}`);
                        // TODO: `total` field is not available on backend, this is future proofing
                        if ("total" in smkSeason) {
                          if (smkSeason.total == smkSeason.episodes.length) {
                            await __API__.plex.apis.markSeasonWatched({
                              ...pconf,
                              seasonKey: smkSeason.ratingKey,
                              name: `${plexShow[0].title}: ${smkSeason.title}`,
                            });
                            return;
                          }
                        }
                        smkSeason.episodes.forEach(async (smkEpisode) => {
                          let plexEpkey = `${plexShow[0].ratingKey}-s${smkSeason.number}e${smkEpisode.number}`;
                          if (plexEpkey in episodeSeasonS0mE0nLut) {
                            await __API__.plex.apis.markEpisodeWatched({
                              ...pconf,
                              episodeKey:
                                episodeSeasonS0mE0nLut[plexEpkey].ratingKey,
                              name: `${smkShow.show.title} S${smkSeason.number}E${smkEpisode.number}`,
                            });
                          }
                        });
                      });
                    }
                  }
                  if (smkShow.user_rating) {
                    await __API__.plex.apis.rateMediaItem(
                      {
                        ...pconf,
                        plexRatingKey: plexShow[0].ratingKey,
                        info: {
                          name: smkShow.show.title,
                          type: "show",
                        },
                      },
                      smkShow.user_rating
                    );
                  }
                  break;
                default:
                  break;
              }
            }
            break;
          case MediaType.anime:
            // handle anime differently
            // use https://github.com/actsalgueiro/PlexSyncfromSimkl/blob/main/plexsync.py
            // as a reference
            for (let smkAnime of simklChanges[mediaType]) {
              if (!smkAnime.show.ids) {
                consoledebug("Show has no ids", smkAnime)();
                continue;
              }
              currentIdx++;
              pMessage.value = totalSyncCount - currentIdx;
              chrome.runtime.sendMessage(pMessage);

              let mPlexids = simklIdsToPlexIds(smkAnime.show, mediaType);
              let anidbId = mPlexids.filter((id) => id.startsWith("anidb://"));
              if (anidbtvdbIdsLut[anidbId]) {
                // Anime's anidbid is in lut
                mPlexids.push(...anidbtvdbIdsLut[anidbId]);
                // remove duplicate entries
                mPlexids = [...new Set(mPlexids)];
              } else {
                if (mPlexids.length < 2)
                  consolewarn(
                    "Panic: Anime's anidbid is not in anime-list.xml file",
                    mPlexids,
                    smkAnime.show.ids
                  )();
              }

              if (smkAnime.anime_type === "movie") {
                // handle anime movies
                let plexAnimeMovie = mPlexids
                  .map((id) => moviesGuidLut[id])
                  .filter((a) => a);
                if (plexAnimeMovie.length > 0) {
                  // consoledebug(
                  //   "Anime Movie was found in plex library",
                  //   plexAnimeMovie,
                  //   mPlexids
                  // )();
                  switch (smkAnime.status) {
                    case "completed":
                      await __API__.plex.apis.markMovieWatched({
                        ...pconf,
                        movieKey: plexAnimeMovie[0].ratingKey,
                        name: plexAnimeMovie[0].title,
                        userRating: smkAnime.user_rating,
                      });
                      break;
                    // none of these apply to movies in plex
                    // watching can apply if simkl knows the watching timestamp
                    case "watching":
                    case "notinteresting":
                    case "hold":
                    // TODO: next release can have this after library entries can be created
                    case "plantowatch":
                      break;
                    default:
                      break;
                  }
                }
                continue;
              }

              let plexAnime = mPlexids
                .map((id) => showsGuidLut[id])
                .filter((a) => a);
              if (plexAnime.length > 0) {
                // consoledebug(
                //   "Anime was found in plex library",
                //   plexAnime,
                //   mPlexids
                // )();
                // if (anidbtvdbS0mE0nMappings[anidbId]) {
                //   consoledebug(
                //     anidbtvdbS0mE0nMappings[anidbId],
                //     anidbEpisodeMapping(anidbtvdbS0mE0nMappings[anidbId], 0)
                //   )();
                // }
              } else {
                // Anime was not found in plex library
                continue;
              }
              switch (smkAnime.status) {
                case "completed":
                  // mark whole thing as watched
                  await __API__.plex.apis.markShowWatched({
                    ...pconf,
                    showKey: plexAnime[0].ratingKey,
                    name: plexAnime[0].title,
                    userRating: smkAnime.user_rating,
                    isAnime: true,
                  });
                  break;
                case "watching":
                // The next 3 cases can't be handled by us
                // Because in plex there is no concept of these
                // handle these two as watching and mark episodes
                case "notinteresting":
                case "hold":
                case "plantowatch":
                  // see what items are watched
                  // and efficiently mark them as watched
                  // i.e. if a whole season is done use season watched plex api method
                  let plexAnimeSeasons = plexSeasonList.map((l) =>
                    l.filter((s) => s.parentRatingKey == plexAnime[0].ratingKey)
                  );
                  // consoledebug(
                  //   "Anime",
                  //   plexAnime[0].title,
                  //   "was found in plex library",
                  //   plexAnime,
                  //   plexAnimeSeasons
                  // )();
                  // TODO: anidb <-> tvdb magic
                  // season by season or episode by episode
                  // detect if a season has been fully watched
                  // if so need to be careful with sending too many requests to plex
                  // console.log(
                  //   `Anime ${plexAnime[0].title}`,
                  //   plexAnime,
                  //   smkAnime
                  // );
                  console.log(
                    `Anime [Plex: ${plexAnime[0].title}, Simkl: ${smkAnime.show.title}]`
                  );
                  if ("seasons" in smkAnime) {
                    smkAnime.seasons.forEach(async (smkSeason) => {
                      // console.log(`Simkl Season ${smkSeason.number}`);
                      // TODO: `total` field is not available on backend, this is future proofing
                      if ("total" in smkSeason) {
                        if (smkSeason.total == smkSeason.episodes.length) {
                          await __API__.plex.apis.markSeasonWatched({
                            ...pconf,
                            seasonKey: smkSeason.ratingKey,
                            name: `${plexAnime[0].title}: ${smkSeason.title}`,
                          });
                          return;
                        }
                      }
                      smkSeason.episodes.forEach(async (smkEpisode) => {
                        let tvdbmappedInfo = anidbEpisodeMapping(
                          anidbtvdbS0mE0nMappings[anidbId],
                          smkEpisode.number
                        );
                        let parts = tvdbmappedInfo.split("/");
                        let [_, __, ___, actualSeasonNo, actualEpNo] = parts;
                        let plexEpkey = `${plexAnime[0].ratingKey}-s${actualSeasonNo}e${actualEpNo}`;
                        if (plexEpkey in episodeSeasonS0mE0nLut) {
                          await __API__.plex.apis.markEpisodeWatched({
                            ...pconf,
                            episodeKey:
                              episodeSeasonS0mE0nLut[plexEpkey].ratingKey,
                            name: `${smkAnime.show.title} S${actualSeasonNo}E${actualEpNo}`,
                          });
                        }
                      });
                    });
                  }
                  // Handle rating
                  if (smkAnime.user_rating) {
                    await __API__.plex.apis.rateMediaItem(
                      {
                        ...pconf,
                        plexRatingKey: plexAnime[0].ratingKey,
                        info: {
                          name: smkAnime.show.title,
                          type: "anime",
                        },
                      },
                      smkAnime.user_rating
                    );
                  }
                  break;
                default:
                  break;
              }
            }
            break;
          default:
            break;
        }
      }
    }

    // TODO: plex to simkl sync
    let { smkAdditions, smkHistory, smkRatings } =
      prepareSimklSyncHistAddandRatings(
        {
          plexEpisodesList,
          plexSeasonList,
          plexMovieList,
          plexShowList,
        },
        simklChanges
      );
    consoledebug(smkAdditions, smkHistory, smkRatings)();
    // let [resp1, resp2, resp3] = await Promise.all([
    //   __API__.simkl.apis.syncItemsToSimklList(simklOauthToken, smkAdditions),
    //   __API__.simkl.apis.syncAddItemsToHistory(simklOauthToken, smkHistory),
    //   __API__.simkl.apis.syncAddItemRatings(simklOauthToken, smkRatings),
    // ]);
    // consoledebug(resp1, resp2, resp3)();

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
    consoledebug({
      plexInstanceUrl,
      syncPeriod,
      plexOauthToken,
      simklOauthToken,
    })();
    consoleerror("Unreachable")();
  }
};

const syncDone = (serverTime) => {
  // sync done
  consoledebug("Saving server time", serverTime);
  chrome.storage.local.set({
    lastSynced: serverTime.st,
    lastSyncedSource: serverTime.source,
    // can set this to true to always do a full sync
    // when using the sync now button
    doFullSync: false,
  });
  let doneMsg = {
    type: ActionType.action,
    action: ActionType.ui.sync.finished,
  };
  chrome.runtime.sendMessage(doneMsg);
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
        ["tvdb", "tvdbslug", "imdb", "anidb", "tmdb"].includes(id)
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

const fetchAnimeListXML = async (signal) => {
  if ("AnimeListXML" in globalThis) return globalThis.AnimeListXML;
  try {
    let resp = await fetch(AnidbXMLSourceURL, { signal }).catch((err) => {
      throw err;
    });
    let data = await resp.text();
    globalThis.AnimeListXML = data;
    return data;
  } catch (error) {
    consoleerror(error, typeof error)();
  }
  return null;
};

const fetchAniDBTvDBMappings = async (signal) => {
  let xmlData = await fetchAnimeListXML(signal);
  xmlData = txml.parse(xmlData);
  consoledebug(xmlData)();

  let anidbtvdbIdsLut = {};
  let anidbtvdbS0mE0nMappings = {};

  for (let animNode of xmlData[1]["children"]) {
    let anidbId = `anidb://${animNode.attributes["anidbid"]}`;
    anidbtvdbIdsLut[anidbId] = Object.keys(animNode.attributes)
      .filter((k) => k.endsWith("id"))
      // imdbid="...", tmdbid, tvdbid etc. will become `imdb://...` etc.
      .map((key) => `${key.replace(/id$/, "")}://${animNode.attributes[key]}`);
    anidbtvdbS0mE0nMappings[anidbId] = animNode;
  }
  return { anidbtvdbIdsLut, anidbtvdbS0mE0nMappings };
};

const anidbEpisodeMapping = (anime, episode = 0) => {
  if ("tvdbid" in anime.attributes && isNumeric(anime.attributes["tvdbid"])) {
    if (!("defaulttvdbseason" in anime.attributes)) {
      return anime.attributes;
    }
    if (anime.attributes["defaulttvdbseason"] === "a") {
      // consoledebug(anime)();
      let mappingList = anime.children.filter(
        (c) => c.tagName === "mapping-list"
      );
      if (mappingList.length > 0) {
        mappingList = mappingList[0];
        const mappingLists = mappingList.children.filter(
          (mapping) => mapping.attributes["anidbseason"] == "1"
        );
        for (map of mappingLists) {
          if (map.children.length > 0) {
            l = map.children[0].split(";");
            for (eps of l.slice(1, -1)) {
              eps = eps.split("-");
              if (parseInt(eps[0]) == episode) {
                return (
                  "tvdb://" +
                  [
                    parseInt(anime.attributes["tvdbid"]),
                    parseInt(map.attributes["tvdbseason"]),
                    parseInt(eps[1]),
                  ].join("/")
                );
              }
            }
          }
        }
        if ("start" in map.attributes) {
          if (
            parseInt(map.attributes["start"]) <= episode &&
            episode <= parseInt(map.attributes["end"])
          ) {
            if ("offset" in map.attributes) {
              return (
                "tvdb://" +
                [
                  parseInt(anime.attributes["tvdbid"]),
                  parseInt(map.attributes["tvdbseason"]),
                  episode + parseInt(map.attributes["offset"]),
                ].join("/")
              );
            } else {
              return (
                "tvdb://" +
                [
                  parseInt(anime.attributes["tvdbid"]),
                  parseInt(map.attributes["tvdbseason"]),
                  episode,
                ].join("/")
              );
            }
          }
        }
      }
    } else if (isNumeric(anime.attributes["defaulttvdbseason"])) {
      let mappingList = anime.children.filter(
        (c) => c.tagName === "mapping-list"
      );
      if (mappingList.length > 0) {
        mappingList = mappingList[0];
        const mappingLists = mappingList.children.filter(
          // simkl uses anidb for anime
          // and anidb will only have one season
          // season 0 is specials so there are no seasons 2+
          (mapping) => mapping.attributes["anidbseason"] == "1"
        );
        for (map of mappingLists) {
          if (map.children.length > 0) {
            l = map.children[0].split(";");
            for (eps of l.slice(1, -1)) {
              eps = eps.split("-");
              if (parseInt(eps[0]) == episode) {
                return (
                  "tvdb://" +
                  [
                    parseInt(anime.attributes["tvdbid"]),
                    parseInt(map.attributes["tvdbseason"]),
                    parseInt(eps[1]),
                  ].join("/")
                );
              }
            }
          }
          if ("start" in map.attributes) {
            if (
              parseInt(map.attributes["start"]) <= episode &&
              episode <= parseInt(map.attributes["end"])
            ) {
              return (
                "tvdb://" +
                [
                  parseInt(anime.attributes["tvdbid"]),
                  parseInt(map.attributes["tvdbseason"]),
                  episode + parseInt(map.attributes["offset"]),
                ].join("/")
              );
            }
          }
        }
      }
      if ("episodeoffset" in anime.attributes) {
        return (
          "tvdb://" +
          [
            parseInt(anime.attributes["tvdbid"]),
            parseInt(anime.attributes["defaulttvdbseason"]),
            episode + parseInt(anime.attributes["episodeoffset"]),
          ].join("/")
        );
      } else {
        return (
          "tvdb://" +
          [
            parseInt(anime.attributes["tvdbid"]),
            parseInt(anime.attributes["defaulttvdbseason"]),
            episode,
          ].join("/")
        );
      }
    }
  }
  if ("tmdbid" in anime.attributes) {
    return `tmdb://${anime.attributes["tmdbid"]}`;
  }
  if ("imdbid" in anime.attributes) {
    return `imdb://${anime.attributes["imdbid"]}`;
  }
  return null;
};

const prepareSimklSyncHistAddandRatings = (
  plexLibraryItems,
  smkLibraryItems
) => {
  consoledebug(plexLibraryItems, smkLibraryItems)();
  let smkAdditions = {},
    smkHistory = {},
    smkRatings = {};
  let { plexEpisodesList, plexSeasonList, plexMovieList, plexShowList } =
    plexLibraryItems;
  let { anime: smkAnime, movies: smkMovies, shows: smkShows } = smkLibraryItems;
  // Additions (shows|anime, movies)
  // for (let smkM of smkMovies) {
  //   consoledebug(smkM)();
  // }
  // for (let library of plexMovieList) {
  //   for (let item of library) {
  //     consoledebug("library:", library, "item:", item)();
  //     break;
  //   }
  // }

  // History (shows|anime/seasons/episodes, movies)

  // Ratings (shows|anime, movies)
  let tempAnimeandShows = smkAnime;
  tempAnimeandShows = tempAnimeandShows.concat(smkShows);
  return { smkAdditions, smkHistory, smkRatings };
};

// unused might required for later

const plexDiscover = async () => {
  let config = await userConfig();
  let { plexInstanceUrl, plexOauthToken } = config;
  var { servers, error } = await __API__.plex.apis.getLocalServers({
    plexApiBaseURL: plexInstanceUrl,
    plexToken: plexOauthToken,
  });
  if (!servers) {
    consoleerror(error)();
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
    consoleerror(error)();
  }
  consoledebug(servers, devices)();
};

const zipSimklLibrary = async () => {
  // create a zip file with all the simkl library entries
  if (!JSZip) return;
  let webm = await (
    await fetch(chrome.runtime.getURL("assets/sample.webm"))
  ).blob();
  consolelog(webm)();
  let zip = new JSZip();
  let moviesZ = zip.folder("Simkl Movies");
  moviesZ.file("{tmdb-634649}.webm", webm, { binary: true });
  let showsZ = zip.folder("Simkl TV Shows");
  let showDir = showsZ.folder("{tvdb-323168}");
  for (let eno = 0; eno < 10000; eno += 1) {
    if (eno % 1000 == 0) consoledebug("Added", eno, "files")();
    showDir.file(`s01e${eno}.webm`, webm, { binary: true });
  }
  return zip;
};

const saveZipFile = async (zip, type = "blob") => {
  const logLabel = `save_zip_${type}`;
  consoletime(logLabel)();
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
  // consoledebug(`${endTime} ended ${type} zipping`)();
  // consoledebug(`${type} took ${endTime - startTime} millisecs`)();
  consoletimeEnd(logLabel)();
  return blobdata;
};
