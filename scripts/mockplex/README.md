## Plex Mock Data

A plex mock library generator for testing the extension.

### TODO

- [ ] Generate movie, shows directory structures
  - [ ] by IDS
    - tvdb/tvdbslug
    - imdb/tmdb
    - anidb
    - simkl
  - [ ] get a random valid id

### Setup

Install [go](https://go.dev/doc/install)

```sh
# on windows
# install scoop in powershell
iwr -useb get.scoop.sh | iex
Set-ExecutionPolicy RemoteSigned -scope CurrentUser
scoop install go
```

### Run

```sh
cd scripts/plexMock
# unix
go build && ./mockplex
# windows
# go build && .\mockplex.exe
```
