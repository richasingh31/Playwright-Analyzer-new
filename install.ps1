# Install dependencies for both workspaces
Write-Host "`n📦 Installing backend dependencies..." -ForegroundColor Cyan
Set-Location backend; npm install; Set-Location ..

Write-Host "`n📦 Installing frontend dependencies..." -ForegroundColor Cyan
Set-Location frontend; npm install; Set-Location ..

Write-Host "`n✅  Done! Run .\start.ps1 to launch the app." -ForegroundColor Green
