## Logger

A basic logger server written in go which accepts json encoded post requests and logs them.

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
cd scripts/logger
# unix
go build && ./logger
# windows
# go build && .\logger.exe
```
