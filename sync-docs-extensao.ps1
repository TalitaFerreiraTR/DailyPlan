# =====================================================================
# Sincroniza docs/extensao/ a partir de extensao/ (FONTE UNICA).
#
# Por que existe: a extensao tem 2 copias no repo:
#   - extensao/         -> fonte de verdade (empacotada no .zip pelo build-webstore.ps1)
#   - docs/extensao/    -> copia servida no site (GitHub Pages) para download/inspecao
# Elas PRECISAM ser identicas. Divergencia entre as duas ja causou bug
# (leitura de SS desatualizada). Rode este script sempre que mexer em
# qualquer arquivo de extensao/ para regenerar docs/extensao/.
#
# Uso:  powershell -ExecutionPolicy Bypass -File .\sync-docs-extensao.ps1
# =====================================================================

$ErrorActionPreference = 'Stop'
$src = Join-Path $PSScriptRoot 'extensao'
$dst = Join-Path $PSScriptRoot 'docs\extensao'

if (!(Test-Path $src)) { Write-Error "Pasta fonte nao encontrada: $src"; exit 1 }
if (!(Test-Path $dst)) { New-Item -ItemType Directory -Path $dst | Out-Null }

Copy-Item -Path (Join-Path $src '*') -Destination $dst -Recurse -Force

$count = (Get-ChildItem -Path $src -File).Count
Write-Host ""
Write-Host "  docs/extensao/ sincronizado a partir de extensao/ ($count arquivos)" -ForegroundColor Green
Write-Host "  Lembre de commitar as duas pastas juntas." -ForegroundColor DarkGray
Write-Host ""
