[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][ValidateSet('stable','dev')][string]$Variant,
  [ValidateSet('debug','release')][string]$BuildType = 'debug',
  [switch]$Install,
  [switch]$CheckpointOnly,
  [string]$ValidateApkPath
)

$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$env:APP_VARIANT=$Variant

function Get-Identity {
  $raw=& node (Join-Path $PSScriptRoot 'android-identity.cjs') --variant $Variant
  if($LASTEXITCODE -ne 0){throw 'Expo identity preflight failed.'}
  return ($raw | ConvertFrom-Json)
}
function Assert-GradleIdentity($identity) {
  Push-Location (Join-Path $root 'android')
  try { $output=& .\gradlew.bat :app:printQuotivoVariantConfig --no-daemon 2>&1 } finally { Pop-Location }
  if($LASTEXITCODE -ne 0){throw 'Gradle identity checkpoint failed.'}
  $expected=@("QUOTIVO_VARIANT=$Variant","QUOTIVO_NAME=$($identity.name)","QUOTIVO_APPLICATION_ID=$($identity.androidPackage)","QUOTIVO_SCHEME=$($identity.scheme)","QUOTIVO_EXPO_SCHEME=exp+$($identity.slug)")
  foreach($line in $expected){if(-not($output | Select-String -SimpleMatch -Quiet $line)){throw "Gradle identity mismatch: $line"}}
  Write-Host "CHECKPOINT PASS: $($identity.name) / $($identity.androidPackage) / $($identity.scheme)"
}
function Find-Aapt {
  $sdk=Join-Path $env:LOCALAPPDATA 'Android\Sdk\build-tools'
  $candidate=Get-ChildItem -LiteralPath $sdk -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'aapt.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if(-not $candidate){throw 'aapt.exe non trovato nel Android SDK.'}; return $candidate
}
function Assert-ApkIdentity($apk,$identity) {
  if(-not(Test-Path -LiteralPath $apk)){throw "APK non prodotto: $apk"}
  $badging=& (Find-Aapt) dump badging $apk 2>&1
  if($LASTEXITCODE -ne 0 -or -not($badging | Select-String -SimpleMatch -Quiet "package: name='$($identity.androidPackage)'")){throw "APK package mismatch: atteso $($identity.androidPackage)."}
}

$identity=Get-Identity
Assert-GradleIdentity $identity
if($ValidateApkPath){Assert-ApkIdentity $ValidateApkPath $identity;Write-Host "APK CHECKPOINT PASS: $($identity.androidPackage)";return}
if($CheckpointOnly){return}
$task=if($BuildType -eq 'debug'){':app:assembleDebug'}else{':app:assembleRelease'}
Push-Location (Join-Path $root 'android')
try { & .\gradlew.bat $task --no-daemon; if($LASTEXITCODE -ne 0){throw "Gradle $task failed ($LASTEXITCODE)."} } finally { Pop-Location }
$apk=Join-Path $root "android\app\build\outputs\apk\$BuildType\app-$BuildType.apk"
Assert-ApkIdentity $apk $identity
if($Install){
  $adb=Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe';if(-not(Test-Path -LiteralPath $adb)){throw 'ADB non trovato.'}
  & $adb install -r $apk;if($LASTEXITCODE -ne 0){throw "adb install -r failed ($LASTEXITCODE)."}
  Write-Host "INSTALLED IN-PLACE: $($identity.androidPackage)"
}
