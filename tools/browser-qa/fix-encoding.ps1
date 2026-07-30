param([Parameter(Mandatory)][string]$Path)

# Repairs a file whose UTF-8 bytes were read as CP1252 and re-saved as UTF-8
# (classic PowerShell 5.1 Get-Content/Set-Content round-trip damage), and
# rewrites it as UTF-8 WITHOUT a BOM, which is this repo's convention.

$before = [IO.File]::ReadAllText($Path)
$marker = [string][char]0x00E2 + [string][char]0x20AC   # the "a-hat euro" prefix of the mojibake
$countBefore = ([regex]::Matches($before, [regex]::Escape($marker))).Count
Write-Output ("mojibake sequences before: {0}" -f $countBefore)

$bytes = [Text.Encoding]::GetEncoding(1252).GetBytes($before)
$fixed = [Text.Encoding]::UTF8.GetString($bytes)
[IO.File]::WriteAllText($Path, $fixed, (New-Object Text.UTF8Encoding($false)))

$after = [IO.File]::ReadAllText($Path)
$countAfter = ([regex]::Matches($after, [regex]::Escape($marker))).Count
$emDash = ([regex]::Matches($after, [string][char]0x2014)).Count
Write-Output ("mojibake sequences after:  {0}" -f $countAfter)
Write-Output ("em-dashes restored:        {0}" -f $emDash)

$fb = [IO.File]::ReadAllBytes($Path)
$hasBom = ($fb.Length -ge 3 -and $fb[0] -eq 0xEF -and $fb[1] -eq 0xBB -and $fb[2] -eq 0xBF)
Write-Output ("has BOM: {0}" -f $hasBom)
