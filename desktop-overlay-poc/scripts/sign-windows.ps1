param(
  [Parameter(Mandatory = $true)]
  [string]$Executable
)

$ErrorActionPreference = "Stop"

if (-not $env:CPCV_WINDOWS_CERTIFICATE_BASE64) {
  throw "CPCV_WINDOWS_CERTIFICATE_BASE64 is not configured."
}
if (-not $env:CPCV_WINDOWS_CERTIFICATE_PASSWORD) {
  throw "CPCV_WINDOWS_CERTIFICATE_PASSWORD is not configured."
}

$resolvedExecutable = (Resolve-Path $Executable).Path
$certificatePath = Join-Path $env:RUNNER_TEMP "cpcv-windows-signing.pfx"

try {
  [IO.File]::WriteAllBytes(
    $certificatePath,
    [Convert]::FromBase64String($env:CPCV_WINDOWS_CERTIFICATE_BASE64)
  )

  $kitsRoot = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
  $signTool = Get-ChildItem $kitsRoot -Filter "signtool.exe" -File -Recurse |
    Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } |
    Sort-Object FullName -Descending |
    Select-Object -First 1

  if (-not $signTool) {
    throw "signtool.exe was not found."
  }

  & $signTool.FullName sign `
    /fd SHA256 `
    /f $certificatePath `
    /p $env:CPCV_WINDOWS_CERTIFICATE_PASSWORD `
    /tr "http://timestamp.digicert.com" `
    /td SHA256 `
    $resolvedExecutable

  if ($LASTEXITCODE -ne 0) {
    throw "signtool.exe failed with exit code $LASTEXITCODE."
  }

  & $signTool.FullName verify /pa /v $resolvedExecutable
  if ($LASTEXITCODE -ne 0) {
    throw "Signature verification failed with exit code $LASTEXITCODE."
  }
}
finally {
  Remove-Item $certificatePath -Force -ErrorAction SilentlyContinue
}
