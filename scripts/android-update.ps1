[CmdletBinding()]
param([switch]$PreflightOnly)

$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'invoke-native.ps1')
$env:APP_VARIANT='stable'
$root=Split-Path -Parent $PSScriptRoot
$logDir=Join-Path $root 'logs';New-Item -ItemType Directory -Force -Path $logDir|Out-Null
$log=Join-Path $logDir 'android-update-latest.log';Remove-Item -LiteralPath $log -Force -ErrorAction SilentlyContinue
$phase='identity checkpoint';$rollback='NOT NEEDED';$original=$null;$originalBytes=$null;$buildCode=0;$installCode=0
function Write-Update([string]$message){$message|Tee-Object -FilePath $log -Append}
function Write-ProcessResult($result) {
  Write-Update "Command: $($result.Command)"
  if($result.StdOut){Write-Update $result.StdOut.TrimEnd()}
  if($result.StdErr){Write-Update "STDERR:`n$($result.StdErr.TrimEnd())"}
}
function Fail([string]$message,[int]$code=1){Write-Update "android:update FAILED`nPhase: $phase`nCommand: $failedCommand`nExit code: $code`nCause: $message`nLast process output: $lastProcessDetail`nVersion rollback: $rollback`nInstalled app untouched: YES`nLog: $log";exit $code}
$failedCommand='not started';$lastProcessDetail='none'
try {
  $identityRaw=& node (Join-Path $PSScriptRoot 'android-identity.cjs') --variant stable
  if($LASTEXITCODE -ne 0){throw 'Stable Expo identity preflight failed.'};$identity=$identityRaw|ConvertFrom-Json
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'android-variant.ps1') -Variant stable -CheckpointOnly
  if($LASTEXITCODE -ne 0){throw 'Stable Gradle identity checkpoint failed.'}
  $adb=Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe';if(-not(Test-Path -LiteralPath $adb)){throw 'ADB non trovato.'}
  $devices=& $adb devices;if(-not($devices|Select-String -Quiet '\sdevice(\s|$)')){throw 'Nessun dispositivo Android disponibile.'}
  $installed=& $adb shell dumpsys package $identity.androidPackage 2>$null|Select-String 'versionCode=(\d+)';$installedCode=if($installed){[int]$installed.Matches[0].Groups[1].Value}else{0}
  $configPath=Join-Path $root 'app.json';$originalBytes=[System.IO.File]::ReadAllBytes($configPath);$original=Get-Content $configPath -Raw;$config=$original|ConvertFrom-Json;$repoCode=[int]$config.expo.android.versionCode
  if($config.expo.version -notmatch '^(\d+)\.(\d+)\.(\d+)$'){throw 'Versione preview non semver valida.'}
  if($PreflightOnly){Write-Update "PRECHECK PASS`nPackage: $($identity.androidPackage)`nInstalled versionCode: $installedCode`nRepo versionCode: $repoCode`nBuild/install not started.";return}
  $phase='versioning';$m=[regex]::Match($config.expo.version,'^(\d+)\.(\d+)\.(\d+)$');$nextVersion="$($m.Groups[1].Value).$($m.Groups[2].Value).$([int]$m.Groups[3].Value+1)";$nextCode=[Math]::Max($repoCode,$installedCode)+1
  $config.expo.version=$nextVersion;$config.expo.android.versionCode=$nextCode;$config|ConvertTo-Json -Depth 20|Set-Content -LiteralPath $configPath -Encoding utf8
  $phase='stable release build';$apk=Join-Path $root "dist\$($identity.slug)-$nextVersion.apk"
  $releaseScript=Join-Path $PSScriptRoot 'android-release.ps1';$failedCommand="powershell -NoProfile -ExecutionPolicy Bypass -File `"$releaseScript`" -OutputPath `"$apk`""
  $result=Invoke-NativeForeground -FilePath (Get-Command powershell).Source -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$releaseScript,'-OutputPath',$apk) -WorkingDirectory $root -DisplayCommand $failedCommand
  Write-ProcessResult $result;$buildCode=$result.ExitCode;$lastProcessDetail=(($result.StdErr,$result.StdOut | Where-Object { $_ } | Select-Object -Last 1) -join "`n").Trim();if($buildCode -ne 0){throw "release pipeline exited $buildCode"}
  $phase='APK identity checkpoint';& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'android-variant.ps1') -Variant stable -ValidateApkPath $apk 2>&1|Tee-Object -FilePath $log -Append;if($LASTEXITCODE -ne 0){throw 'APK does not match Stable package.'}
  $phase='ADB install update';Write-Update "Running: adb install -r $apk";& $adb install -r $apk 2>&1|Tee-Object -FilePath $log -Append;$installCode=$LASTEXITCODE;if($installCode -ne 0){throw "adb install exited $installCode"}
  Write-Update "Quotivo updated successfully`nVersion: $nextVersion`nVersionCode: $nextCode`nPackage: $($identity.androidPackage)`nData preserved: update install (-r)"
} catch { if($originalBytes){[System.IO.File]::WriteAllBytes($configPath,$originalBytes);$rollback='OK'};$exitCode=if($buildCode){$buildCode}elseif($installCode){$installCode}else{1};Fail $_.Exception.Message $exitCode }
