rm -rf dist
cp -R -p src dist
go install "github.com/tdewolff/minify/cmd/minify@latest"
minify.exe -r -o dist/ src
