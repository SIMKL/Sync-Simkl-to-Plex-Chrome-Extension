rm -rf dist
cp -R -p src dist

go install github.com/tdewolff/minify/cmd/minify@latest
minify -r -o dist/ src

sed -i "s/DEVELOPMENT=true/DEVELOPMENT=false/g" dist/js/common.js
sed -i -r "s/const DEVELOPMENT_FETCH_REQS=(true|false);//g" dist/js/common.js
sed -i -r "s/const devLoggerSetup=\(.*\};/const devloggerSetup=_=>_=>\{\}\;/g" dist/js/common.js

rem validate generated js files for syntax
pushd dist
setlocal enableDelayedExpansion

@echo off
set NO_COLOR=1
for /R %%f in (*.js) do (
    sed -i -r "s/consoledebug\([^;]*\)\(\);/;/g" "%%f"
    sed -i -r "s/console.debug\([^;]*\);/;/g" "%%f"
    minify -o %%f %%f
    echo node -c %%f
    node -c %%f
    rem https://stackoverflow.com/a/11692001
    if !ERRORLEVEL! GEQ 1 goto :fail_fast
)

:fail_fast
rem https://stackoverflow.com/a/18888375
endlocal
pushd ..
