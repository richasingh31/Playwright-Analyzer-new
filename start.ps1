# Playwright Analyzer — Start both servers
Write-Host "`n🚀 Starting Playwright Analyzer..." -ForegroundColor Cyan

$backend  = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd backend; npm run dev" -PassThru
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -PassThru

Write-Host ""
Write-Host "  Backend  → http://localhost:4000" -ForegroundColor Green
Write-Host "  Frontend → http://localhost:5173" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C to stop." -ForegroundColor DarkGray

Wait-Process -Id $backend.Id, $frontend.Id
