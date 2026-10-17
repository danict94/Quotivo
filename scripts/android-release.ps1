[CmdletBinding()]
param([switch]$CheckOnly,[string]$OutputPath)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'invoke-native.ps1')
$env:APP_VARIANT = 'stable'
$projectRoot = Split-Path -Parent $PSScriptRoot
$identityRaw=& node (Join-Path $PSScriptRoot 'android-identity.cjs') --variant stable
if($LASTEXITCODE -ne 0){throw 'Stable Expo identity preflight failed.'}
$identity=$identityRaw|ConvertFrom-Json
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'android-variant.ps1') -Variant stable -CheckpointOnly
if($LASTEXITCODE -ne 0){throw 'Stable Gradle identity checkpoint failed.'}

$envFile = Join-Path $projectRoot '.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw '.env is required for an Android release build.' }
$required = @('EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_KEY')
$values = @{}
foreach ($line in Get-Content -LiteralPath $envFile) { if ($line -match '^\s*([^#=]+)=(.*)$') { $values[$Matches[1].Trim()] = $Matches[2].Trim() } }
foreach ($name in $required) { if ([string]::IsNullOrWhiteSpace($values[$name])) { throw "Missing required environment variable: $name" }; [Environment]::SetEnvironmentVariable($name, $values[$name], 'Process') }
& git -C $projectRoot check-ignore -q .env
if ($LASTEXITCODE -ne 0) { throw '.env must be gitignored.' }
if (-not (Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'Android\Sdk'))) { throw 'Android SDK was not found.' }
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) { throw 'JDK 17 is required.' }
$previousErrorAction = $ErrorActionPreference;$ErrorActionPreference = 'Continue';$javaVersion = (& $java.Source -version 2>&1 | Out-String);$ErrorActionPreference = $previousErrorAction
if ($javaVersion -notmatch 'version "17\.') { throw 'JDK 17 is required.' }

Push-Location $projectRoot
try {
  $jni = Join-Path $projectRoot 'node_modules/@react-native-async-storage/async-storage/android/build/generated/source/codegen/jni/CMakeLists.txt'
  if (-not (Test-Path -LiteralPath $jni)) { & node node_modules/react-native/scripts/generate-codegen-artifacts.js --path . --targetPlatform android --outputPath android; if (-not (Test-Path -LiteralPath $jni)) { throw 'React Native Codegen did not produce AsyncStorage JNI artifacts.' } }
  $androidDir=Join-Path $projectRoot 'android';$gradle=Join-Path $androidDir 'gradlew.bat'
  $bundleCommand='.\\gradlew.bat :app:createBundleReleaseJsAndAssets --rerun-tasks --no-daemon'
  $bundleResult=Invoke-NativeForeground -FilePath $gradle -ArgumentList @(':app:createBundleReleaseJsAndAssets','--rerun-tasks','--no-daemon') -WorkingDirectory $androidDir -DisplayCommand $bundleCommand
  if($bundleResult.StdOut){Write-Host $bundleResult.StdOut.TrimEnd()};if($bundleResult.StdErr){Write-Host $bundleResult.StdErr.TrimEnd()}
  if($bundleResult.ExitCode -ne 0){throw "Release bundle failed (exit $($bundleResult.ExitCode)). Command: $bundleCommand`n$($bundleResult.StdErr)"}
  $bundle = Join-Path $projectRoot 'android/app/build/generated/assets/react/release/index.android.bundle'
  $apk = Join-Path $projectRoot 'android/app/build/outputs/apk/release/app-release.apk'
  if (-not (Test-Path $bundle)) { throw 'Release bundle was not produced.' }
  $bundleText = Get-Content -LiteralPath $bundle -Raw
  if (-not $bundleText.Contains($env:EXPO_PUBLIC_SUPABASE_URL) -or -not $bundleText.Contains($env:EXPO_PUBLIC_SUPABASE_KEY)) { throw 'Release bundle does not contain the configured Supabase public configuration.' }
  Write-Host 'PASS env; PASS codegen; PASS bundle'
  if ($CheckOnly) { return }
  $assembleCommand='.\\gradlew.bat :app:assembleRelease --no-daemon'
  $assembleResult=Invoke-NativeForeground -FilePath $gradle -ArgumentList @(':app:assembleRelease','--no-daemon') -WorkingDirectory $androidDir -DisplayCommand $assembleCommand
  if($assembleResult.StdOut){Write-Host $assembleResult.StdOut.TrimEnd()};if($assembleResult.StdErr){Write-Host $assembleResult.StdErr.TrimEnd()}
  if($assembleResult.ExitCode -ne 0){throw "Release APK build failed (exit $($assembleResult.ExitCode)). Command: $assembleCommand`n$($assembleResult.StdErr)"}
  if (-not (Test-Path $apk)) { throw 'Release APK was not produced.' }
  if(-not $OutputPath){$OutputPath=Join-Path $projectRoot "dist\$($identity.slug)-$($identity.version).apk"}
  New-Item -ItemType Directory -Path (Split-Path -Parent $OutputPath) -Force | Out-Null
  Copy-Item -LiteralPath $apk -Destination $OutputPath -Force
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'android-variant.ps1') -Variant stable -ValidateApkPath $OutputPath
  if($LASTEXITCODE -ne 0){throw 'Stable APK identity checkpoint failed.'}
  Write-Host "BUILD SUCCESSFUL`nAPK: $OutputPath`nPackage: $($identity.androidPackage)"
} finally { Pop-Location }
