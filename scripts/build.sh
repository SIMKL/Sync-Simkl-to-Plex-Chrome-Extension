set -ex

rm -rf dist
cp -R -p src dist

# minify assets
if [ ! $(command -v minify) ]; then
    go install github.com/tdewolff/minify/cmd/minify@latest
fi
minify -r -o dist/ src

# remove dev stuff
# comment one of the following lines to enable debugging
# this will disable console logs
sed -i "s/DEVELOPMENT=true/DEVELOPMENT=false/g" dist/js/common.js
# this will disable uploading to logger
sed -i -r "s/const DEVELOPMENT_FETCH_REQS=(true|false);//g" dist/js/common.js
# this will remove the loggin logic entirely
sed -i -r "s/const devLoggerSetup=\(.*\};/const devloggerSetup=_=>_=>\{\}\;/g" dist/js/common.js

set +ex

if [ ! -f dist/js/background/env.js ]; then
cat << EOM > dist/js/background/env.js
const SimklClientID = "$SIMKL_CLIENT_ID";
const SimklClientSecret = "$SIMKL_CLIENT_SECRET";
EOM
fi

for i in $(find dist -type f -name "*.js"); do
    # removing consoledebug calls
    sed -i -r "s/consoledebug\([^;]*\)\(\);/;/g" "$i"
    sed -i -r "s/console.debug\([^;]*\);/;/g" "$i"
    minify -o $i $i
    # validate generated js files for syntax
    echo + "node -c $i"
    env NO_COLOR=1 node -c $i
    if [ $? -ne 0 ]; then
        exit 1 # fail fast
    fi
done

set -ex
