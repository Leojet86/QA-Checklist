#Requires -Version 5.1

[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8080,

    [ValidatePattern('^[a-z0-9][a-z0-9._/-]*$')]
    [string]$ImageName = 'qa-checklist',

    [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_.-]*$')]
    [string]$ContainerName = 'qa-checklist',

    [switch]$OpenBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-DockerCommand {
    param([Parameter(Mandatory = $true)][string[]]$Arguments)

    & docker @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Docker a echoue : docker $($Arguments -join ' ') (code $LASTEXITCODE)."
    }
}

function Get-DockerEngineType {
    # Windows PowerShell turns native stderr into errors. A stopped daemon is
    # expected here, so this probe handles the exit code without stopping.
    $ErrorActionPreference = 'Continue'
    $engineType = & docker info --format '{{.OSType}}' 2>$null
    if ($LASTEXITCODE -eq 0) {
        return "$engineType".Trim()
    }
    return ''
}

function Test-CommittedFile {
    param([Parameter(Mandatory = $true)][string]$ObjectName)

    $ErrorActionPreference = 'Continue'
    & git -C $repositoryPath cat-file -e $ObjectName 2>$null
    return $LASTEXITCODE -eq 0
}

function Wait-ForApplication {
    param([Parameter(Mandatory = $true)][string]$Url)

    $deadline = [DateTime]::UtcNow.AddSeconds(45)
    while ([DateTime]::UtcNow -lt $deadline) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($response.StatusCode -eq 200 -and $response.Content.Trim() -eq 'ok') {
                return
            }
        }
        catch {
            # Nginx may need a moment after the container starts.
        }
        Start-Sleep -Seconds 1
    }
    throw "L'application ne repond pas apres 45 secondes : $Url."
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'Git est requis. Installer Git pour Windows puis relancer le script.'
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'Docker est introuvable. Installer Docker Desktop puis relancer le script.'
}

$repositoryPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceCommit = & git -C $repositoryPath rev-parse --verify --quiet 'refs/heads/master^{commit}'
if ($LASTEXITCODE -ne 0) {
    throw 'La branche locale master est introuvable. Creer master avec les fichiers de cette application avant le deploiement.'
}
$sourceCommit = "$sourceCommit".Trim()

foreach ($requiredFile in @('Dockerfile', 'package.json', 'package-lock.json', 'docker/nginx.conf')) {
    if (-not (Test-CommittedFile -ObjectName "${sourceCommit}:$requiredFile")) {
        throw "Le commit de master ne contient pas $requiredFile. Committer d'abord les fichiers de l'application sur master. Le script ne deploie pas les modifications non commitees."
    }
}

$engineType = Get-DockerEngineType
if (-not $engineType) {
    $desktopCandidates = @(
        (Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\frontend\Docker Desktop.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Docker\Docker Desktop.exe')
    )
    $desktopPath = $desktopCandidates |
        Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
        Select-Object -First 1
    if (-not $desktopPath) {
        throw 'Le moteur Docker ne repond pas. Demarrer Docker Desktop en mode conteneurs Linux puis relancer le script.'
    }
    Write-Host 'Demarrage de Docker Desktop...'
    Start-Process -FilePath $desktopPath -WindowStyle Hidden
    $dockerDeadline = [DateTime]::UtcNow.AddSeconds(180)
    do {
        Start-Sleep -Seconds 3
        $engineType = Get-DockerEngineType
    } while (-not $engineType -and [DateTime]::UtcNow -lt $dockerDeadline)
    if (-not $engineType) {
        throw 'Docker Desktop ne repond pas apres 180 secondes. Verifier son demarrage et WSL 2, puis relancer le script.'
    }
}
if ($engineType -ne 'linux') {
    throw 'Docker Desktop doit utiliser les conteneurs Linux. Changer le moteur dans Docker Desktop puis relancer le script.'
}

$containerNamePattern = [Regex]::Escape($ContainerName)
$existingContainerIds = @(Invoke-DockerCommand -Arguments @('container', 'ls', '--all', '--filter', "name=^/$containerNamePattern`$", '--format', '{{.ID}}'))
$existingContainerId = $existingContainerIds | Select-Object -First 1
$previousWasRunning = $false
if ($existingContainerId) {
    $existingContainer = @(Invoke-DockerCommand -Arguments @('container', 'inspect', $existingContainerId) | ConvertFrom-Json)[0]
    $managedLabel = $null
    if ($existingContainer.Config.Labels) {
        $managedLabel = $existingContainer.Config.Labels.PSObject.Properties['io.qa-checklist.managed']
    }
    if (-not $managedLabel -or $managedLabel.Value -ne 'true') {
        throw "Un conteneur non gere par ce script porte deja le nom $ContainerName. Utiliser -ContainerName avec un autre nom."
    }
    $previousWasRunning = [bool]$existingContainer.State.Running
}

$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd([IO.Path]::DirectorySeparatorChar)
$temporaryName = 'qa-checklist-deploy-' + [Guid]::NewGuid().ToString('N')
$temporaryPath = Join-Path $temporaryRoot $temporaryName
$archivePath = Join-Path $temporaryPath 'master.zip'
$buildContext = Join-Path $temporaryPath 'source'
$imageTag = "${ImageName}:master-$($sourceCommit.Substring(0, 12))"
$backupName = "$ContainerName-previous-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$applicationUrl = "http://localhost:$Port"
$previousRenamed = $false
$previousStopped = $false
$newContainerId = $null

try {
    New-Item -ItemType Directory -Path $temporaryPath | Out-Null
    Write-Host "Preparation de master ($($sourceCommit.Substring(0, 12)))..."
    & git -C $repositoryPath archive --format=zip --output=$archivePath $sourceCommit
    if ($LASTEXITCODE -ne 0) {
        throw 'Impossible de preparer le contexte Docker depuis master.'
    }
    Expand-Archive -LiteralPath $archivePath -DestinationPath $buildContext

    Write-Host "Construction de l'image $imageTag..."
    Invoke-DockerCommand -Arguments @('build', '--tag', $imageTag, '--label', "org.opencontainers.image.revision=$sourceCommit", $buildContext)

    try {
        if ($existingContainerId) {
            if ($previousWasRunning) {
                Invoke-DockerCommand -Arguments @('container', 'stop', $existingContainerId) | Out-Null
                $previousStopped = $true
            }
            Invoke-DockerCommand -Arguments @('container', 'rename', $existingContainerId, $backupName)
            $previousRenamed = $true
        }

        $newContainerId = Invoke-DockerCommand -Arguments @(
            'container', 'create', '--name', $ContainerName,
            '--label', 'io.qa-checklist.managed=true',
            '--label', "org.opencontainers.image.revision=$sourceCommit",
            '--restart', 'unless-stopped', '--publish', "127.0.0.1:${Port}:80", $imageTag
        )
        Invoke-DockerCommand -Arguments @('container', 'start', "$newContainerId") | Out-Null
        Wait-ForApplication -Url "http://127.0.0.1:$Port/health"
    }
    catch {
        $deploymentError = $_
        Write-Warning 'Le nouveau conteneur ne fonctionne pas. Restauration du conteneur precedent si disponible.'
        try {
            if ($newContainerId) {
                Invoke-DockerCommand -Arguments @('container', 'rm', '--force', "$newContainerId") | Out-Null
            }
            if ($previousRenamed) {
                Invoke-DockerCommand -Arguments @('container', 'rename', $existingContainerId, $ContainerName)
            }
            if ($previousWasRunning -and $previousStopped) {
                Invoke-DockerCommand -Arguments @('container', 'start', $existingContainerId) | Out-Null
            }
        }
        catch {
            Write-Warning "Restauration incomplete : $($_.Exception.Message). Le conteneur precedent porte l'identifiant $existingContainerId."
        }
        throw $deploymentError
    }

    if ($previousRenamed) {
        try {
            Invoke-DockerCommand -Arguments @('container', 'rm', $existingContainerId) | Out-Null
        }
        catch {
            Write-Warning "L'application fonctionne, mais l'ancien conteneur $backupName n'a pas pu etre supprime."
        }
    }
    Write-Host "Application disponible : $applicationUrl" -ForegroundColor Green
    Write-Host 'Dans Chrome ou Edge, connecter Documents\QAChecklist pour enregistrer les checklists en JSON sur le PC.'
    if ($OpenBrowser) {
        Start-Process $applicationUrl
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryPath) {
        $resolvedTemporaryPath = (Resolve-Path -LiteralPath $temporaryPath).Path
        $allowedPrefix = $temporaryRoot + [IO.Path]::DirectorySeparatorChar
        if ($resolvedTemporaryPath.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase) -and
            [IO.Path]::GetFileName($resolvedTemporaryPath) -eq $temporaryName) {
            Remove-Item -LiteralPath $resolvedTemporaryPath -Recurse -Force
        }
        else {
            Write-Warning "Nettoyage ignore : le chemin temporaire est inattendu ($resolvedTemporaryPath)."
        }
    }
}
