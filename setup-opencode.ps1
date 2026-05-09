# Fyso Plugin — OpenCode Setup (Windows/PowerShell)
# Usage: irm https://raw.githubusercontent.com/fyso-dev/fyso-plugin/main/setup-opencode.ps1 | iex

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "@fyso/opencode-plugin setup" -ForegroundColor Cyan
Write-Host ""
Write-Host "Project: $(Get-Location)"
Write-Host ""

$tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) "fyso-plugin-setup"
if (Test-Path $tmpDir) { Remove-Item $tmpDir -Recurse -Force }

Write-Host "Downloading fyso-plugin..."
git clone --depth 1 --quiet https://github.com/fyso-dev/fyso-plugin.git $tmpDir

try {
    # Agents
    Write-Host "Copying agents..."
    $agentsDir = ".opencode\agents"
    New-Item -ItemType Directory -Path $agentsDir -Force | Out-Null
    Copy-Item "$tmpDir\.opencode\agents\*.md" $agentsDir -Force
    $agentCount = (Get-ChildItem "$agentsDir\*.md").Count
    Write-Host "  $agentCount agents"

    # Skills
    Write-Host "Copying skills..."
    $skillsDir = ".opencode\skills"
    New-Item -ItemType Directory -Path $skillsDir -Force | Out-Null
    Get-ChildItem "$tmpDir\skills" -Directory | ForEach-Object {
        $skillName = $_.Name
        $skillFile = Join-Path $_.FullName "SKILL.md"
        if (Test-Path $skillFile) {
            $destSkill = Join-Path $skillsDir $skillName
            New-Item -ItemType Directory -Path $destSkill -Force | Out-Null
            Copy-Item "$($_.FullName)\*" $destSkill -Recurse -Force
        }
    }
    $skillCount = (Get-ChildItem $skillsDir -Directory).Count
    Write-Host "  $skillCount skills"

    # Reference
    Write-Host "Copying reference docs..."
    Copy-Item "$tmpDir\FYSO-REFERENCE.md" ".\FYSO-REFERENCE.md" -Force
    Write-Host "  FYSO-REFERENCE.md"

    # opencode.json
    Write-Host "Updating opencode.json..."
    $configPath = "opencode.json"
    if (Test-Path $configPath) {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
    } else {
        $cfg = [PSCustomObject]@{}
    }

    # Add plugin
    $plugins = @()
    if ($cfg.PSObject.Properties["plugin"]) {
        $plugins = @($cfg.plugin)
    }
    if ("@fyso/opencode-plugin" -notin $plugins) {
        $plugins += "@fyso/opencode-plugin"
    }
    $cfg | Add-Member -NotePropertyName "plugin" -NotePropertyValue $plugins -Force

    # Add MCP
    if (-not $cfg.PSObject.Properties["mcp"]) {
        $cfg | Add-Member -NotePropertyName "mcp" -NotePropertyValue ([PSCustomObject]@{}) -Force
    }
    if (-not $cfg.mcp.PSObject.Properties["fyso"]) {
        $cfg.mcp | Add-Member -NotePropertyName "fyso" -NotePropertyValue ([PSCustomObject]@{
            type = "remote"
            url = "https://mcp.fyso.dev/mcp"
        }) -Force
    }

    $cfg | ConvertTo-Json -Depth 10 | Set-Content $configPath
    Write-Host "  opencode.json"

    Write-Host ""
    Write-Host "Done! Restart OpenCode to activate." -ForegroundColor Green
    Write-Host ""
    Write-Host "Available:"
    Write-Host "  Skills:  via skill tool (plan, build, verify, ui, ...)"
    Write-Host "  Agents:  @architect, @builder, @designer, @verifier, @ui-architect"
    Write-Host "  Tools:   fyso-sync-team (sync your Fyso team agents)"
    Write-Host "  MCP:     Fyso server (80+ operations via OAuth)"
    Write-Host ""
} finally {
    Remove-Item $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}
