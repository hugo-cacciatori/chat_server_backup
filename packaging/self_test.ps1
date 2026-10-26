param(
    [Parameter(Mandatory = $true)]
    [string]$Exe
)

$ErrorActionPreference = "Stop"

# Standalone gate (AGENTS.md rule 9, SPEC 6.4): run the exe from a fresh folder outside the repository.
if (-not (Test-Path $Exe)) {
    throw "Self-test executable not found: $Exe"
}

$TestDir = Join-Path ([System.IO.Path]::GetTempPath()) ("ChatServerBackup-selftest-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TestDir | Out-Null
try {
    $TestExe = Join-Path $TestDir "ChatServerBackup.exe"
    Copy-Item $Exe $TestExe
    $OutFile = Join-Path $TestDir "self-test.out.txt"
    $ErrFile = Join-Path $TestDir "self-test.err.txt"

    $Proc = Start-Process -FilePath $TestExe -ArgumentList "--self-test" -WorkingDirectory $TestDir `
        -RedirectStandardOutput $OutFile -RedirectStandardError $ErrFile -NoNewWindow -Wait -PassThru

    Get-Content $OutFile | ForEach-Object { Write-Output "  $_" }
    $ErrText = Get-Content $ErrFile -Raw
    if ($ErrText) {
        Write-Output "  stderr: $ErrText"
    }

    if ($Proc.ExitCode -ne 0) {
        throw "Self-test failed with exit code $($Proc.ExitCode)"
    }
}
finally {
    Remove-Item -Recurse -Force $TestDir -ErrorAction SilentlyContinue
}
