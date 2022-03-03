Set-PSDebug -Trace 1

Remove-Item -Recurse -Force -ErrorAction SilentlyContinue dist
Copy-Item -Recurse src -Destination dist

if (-Not (Get-Command minify -errorAction SilentlyContinue)) {
    go install github.com/tdewolff/minify/cmd/minify@latest
}
minify -r -o dist/ src

$content = (Get-Content -Path dist\js\common.js)
# multiline regex with (?ms) or whatnot is not working at all
# so split them to two replaces one per match
# can't comment between ` escaped lines
$content `
    -replace 'DEVELOPMENT=true', 'DEVELOPMENT=false' `
    -replace 'const DEVELOPMENT_FETCH_REQS=(true|false)', '' `
    -replace 'const devLoggerSetup=\(.*', 'const devloggerSetup=_=>_=>{};' `
    -replace 'return Function.prototype.bind.*;};$', '' | `
    Out-File -FilePath dist\js\common.js

# prevent tests from bundling
Remove-Item -Recurse -ErrorAction SilentlyContinue dist\tests
Remove-Item -ErrorAction SilentlyContinue dist\js\vendor\quint-2.15.0.js
Remove-Item -ErrorAction SilentlyContinue dist\css\vendor\quint-2.8.0-dark.css

if (-Not (Test-Path dist\js\background\env.js) ) {
    $content = @"
const SimklClientID = "$env:SIMKL_CLIENT_ID";
const SimklClientSecret = "$env:SIMKL_CLIENT_SECRET";
"@
    $content | Out-File -FilePath dist\js\background\env.js
}

# validate generated js files for syntax
Set-PSDebug -Trace 0

$env:NO_COLOR = 1
Get-ChildItem -Path dist -Filter *.js -Recurse | Foreach-Object {
    Write-Host `n "node -c $($_.FullName)"
    (Get-Content $_.FullName) `
        -replace "consoledebug\([^;]*\)\(\);", ";" `
        -replace "console.debug\([^;]*\);", ";" | `
        Out-File -FilePath $_.FullName
    minify -o $_.FullName $_.FullName
    node -c $_.FullName
    if (-Not $?) {
        exit $?
    }
}

Set-PSDebug -Trace 0
