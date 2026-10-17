Set-StrictMode -Version Latest

function ConvertTo-NativeArgument([string]$Value) {
  '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-NativeForeground {
  [CmdletBinding()]
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [string[]]$ArgumentList = @(),
    [Parameter(Mandatory=$true)][string]$WorkingDirectory,
    [Parameter(Mandatory=$true)][string]$DisplayCommand
  )

  $stdout = [System.IO.Path]::GetTempFileName()
  $stderr = [System.IO.Path]::GetTempFileName()
  try {
    $arguments = ($ArgumentList | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' '
    $process = Start-Process -FilePath $FilePath -ArgumentList $arguments -WorkingDirectory $WorkingDirectory -Wait -PassThru -NoNewWindow -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    [pscustomobject]@{
      Command = $DisplayCommand
      ExitCode = $process.ExitCode
      StdOut = [System.IO.File]::ReadAllText($stdout)
      StdErr = [System.IO.File]::ReadAllText($stderr)
    }
  } finally {
    Remove-Item -LiteralPath $stdout,$stderr -Force -ErrorAction SilentlyContinue
  }
}
