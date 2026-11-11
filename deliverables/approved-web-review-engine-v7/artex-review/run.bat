@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Install Node.js 22 or later: https://nodejs.org/
  pause
  exit /b 1
)
node -e "if(Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 (
  echo [ERROR] Node.js 22 or later is required.
  pause
  exit /b 1
)
if /i "%~1"=="--check" (
  node --version
  echo [OK] Launcher and Node.js are ready.
  exit /b 0
)
echo.
echo 1. Basic web review
echo 2. Start ARTEX engine and open its web UI
echo 3. Stop ARTEX engine
echo 4. ARTEX engine status
echo 5. Show ARTEX first-run setup token
echo 6. ARTEX engine logs
echo 7. LLM API format and model ID guide
echo 8. User manual
echo 9. Simple LLM connection settings
set "REVIEW_PAGE=http://127.0.0.1:8787"
choice /c 123456789 /n /m "Select [1-9]: "
if errorlevel 9 goto simple_llm
if errorlevel 8 goto user_manual
if errorlevel 7 goto llm_guide
if errorlevel 6 goto engine_logs
if errorlevel 5 goto engine_setup
if errorlevel 4 goto engine_status
if errorlevel 3 goto engine_stop
if errorlevel 2 goto engine_start
goto basic
:simple_llm
set "REVIEW_PAGE=http://127.0.0.1:8787/llm-settings.html"
goto basic
:user_manual
start "" "%~dp0web\manual.html"
goto finish
:llm_guide
start "" "%~dp0web\llm-guide.html"
goto finish
:engine_logs
node engine-control.mjs logs
goto finish
:engine_setup
node engine-control.mjs setup
goto finish
:engine_status
node engine-control.mjs status
goto finish
:engine_stop
node engine-control.mjs stop
goto finish
:engine_start
node engine-control.mjs start
if errorlevel 1 goto finish
start "" http://127.0.0.1:8790
goto finish
:basic
node -e "const n=require('node:net');const s=n.createServer();s.on('error',()=>process.exit(1));s.listen(8787,'127.0.0.1',()=>s.close());"
if errorlevel 1 (
  echo [ERROR] Port 8787 is already in use. Check the existing server window.
  pause
  exit /b 1
)
echo Starting Web Review. Keep this window open.
echo URL: http://127.0.0.1:8787
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "$u='%REVIEW_PAGE%'; for($i=0;$i -lt 30;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri $u -TimeoutSec 1; if($r.StatusCode -eq 200){Start-Process $u; exit}}catch{}; Start-Sleep -Milliseconds 500}"
node server.mjs
echo Server stopped.
:finish
pause
