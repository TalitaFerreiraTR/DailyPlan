$extDir  = Join-Path $PSScriptRoot 'extensao'
$outDir  = Join-Path $PSScriptRoot 'dist'
$zipName = 'dailyplan-extension.zip'
$zipPath = Join-Path $outDir $zipName

if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
if (Test-Path $zipPath)   { Remove-Item $zipPath -Force }

$files = @(
    'manifest.json',
    'background.js',
    'logic.js',
    'painel.html',
    'sync-to-web.js',
    'content-ss-scraper.js',
    'content-psai-scraper.js',
    'injetor-psai.js',
    'injector-ss.js',
    'injector-sai.js',
    'icon16.png',
    'icon48.png',
    'icon128.png'
)

$tempDir = Join-Path $env:TEMP "dp-ext-build-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tempDir | Out-Null

foreach ($f in $files) {
    $src = Join-Path $extDir $f
    if (!(Test-Path $src)) { Write-Warning "Arquivo nao encontrado: $f"; continue }
    Copy-Item $src (Join-Path $tempDir $f)
}

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

$ver = (Get-Content (Join-Path $extDir 'manifest.json') | ConvertFrom-Json).version
$size = [math]::Round((Get-Item $zipPath).Length / 1KB, 1)

Write-Host ""
Write-Host "  Pacote criado com sucesso!" -ForegroundColor Green
Write-Host "  Versao:  $ver"
Write-Host "  Arquivo: $zipPath"
Write-Host "  Tamanho: ${size} KB"
Write-Host ""
Write-Host "  Proximo passo: envie '$zipName' no Chrome Web Store Developer Dashboard"
Write-Host "  https://chrome.google.com/webstore/devconsole"
Write-Host ""
