param(
  [string]$LibraryRoot = 'C:\mobius-games-tutorial-generator\data\rulebook-library',
  [double]$MinimumFreeGB = 20
)

$ErrorActionPreference = 'Stop'
$resolvedRoot = [System.IO.Path]::GetFullPath($LibraryRoot)
$volumeRoot = [System.IO.Path]::GetPathRoot($resolvedRoot)
if (-not $volumeRoot) {
  throw "Impossible de déterminer le volume Windows pour : $resolvedRoot"
}

$driveName = $volumeRoot.TrimEnd(':', '\\')
$drive = Get-PSDrive -Name $driveName -PSProvider FileSystem
$freeGB = [math]::Round($drive.Free / 1GB, 2)
$usedGB = [math]::Round($drive.Used / 1GB, 2)
$acceptable = $freeGB -ge $MinimumFreeGB

$result = [pscustomobject]@{
  LibraryRoot = $resolvedRoot
  Volume = $volumeRoot
  FreeGB = $freeGB
  UsedGB = $usedGB
  MinimumFreeGB = $MinimumFreeGB
  DownloadReady = $acceptable
  NextAction = if ($acceptable) {
    'Espace suffisant. La file peut être initialisée, mais aucun téléchargement ne doit commencer avant validation de la provenance des sources.'
  } else {
    'Espace insuffisant. Choisissez un autre disque ou augmentez la marge disponible avant tout téléchargement.'
  }
}

$result | Format-List
if (-not $acceptable) { exit 2 }
