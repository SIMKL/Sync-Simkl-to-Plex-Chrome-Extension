set -ex

rm -rf dist
cp -R -p src dist
go install github.com/tdewolff/minify/cmd/minify@latest
minify -r -o dist/ src
