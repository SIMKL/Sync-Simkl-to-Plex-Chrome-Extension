set -ex

rm -rf dist
cp -R -p src dist

# minify assets
go install github.com/tdewolff/minify/cmd/minify@latest
minify -r -o dist/ src

# remove dev stuff
sed -i "s/DEVELOPMENT=true/DEVELOPMENT=false/g" dist/js/common.js
sed -i -r "s/const DEVELOPMENT_FETCH_REQS=(true|false);//g" dist/js/common.js
sed -i -r "s/const devLoggerSetup=\(.*\};/const devloggerSetup=_=>_=>\{\}\;/g" dist/js/common.js

# validate generated js files for syntax
set +ex
for i in $(find dist -type f -name "*.js"); do
    echo + "node -c $i"
    env NO_COLOR=1 node -c $i
    if [ $? -ne 0 ]; then
        exit 1 # fail fast
    fi
done
set -ex
