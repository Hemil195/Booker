$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "Starting Bookar web app on http://localhost:3000"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\apps\web'; npm run dev"
)

Write-Host "Starting Bookar MCP server on http://localhost:3001"
Start-Process powershell -ArgumentList @(
  "-NoExit",
  "-Command",
  "Set-Location '$root\apps\mcp-server'; npm start"
)

Write-Host ""
Write-Host "Web:  http://localhost:3000"
Write-Host "MCP:  http://localhost:3001/api/mcp"
Write-Host "Health: http://localhost:3001/health"
