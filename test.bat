@echo off
cd /d "%~dp0"
echo Starting Genealogic App dev server...
echo.

echo Checking Node.js...
node --version
if errorlevel 1 (
    echo ERROR: Node.js not found. Install it first.
    pause
    exit /b 1
)

echo.
echo Checking dependencies...
if not exist "node_modules\" (
    echo Installing dependencies...
    call npm install
    if errorlevel 1 (
        echo ERROR: Dependency installation failed.
        pause
        exit /b 1
    )
)

echo.
echo Starting dev server...
echo Open http://localhost:5173 in your browser
call npm run dev
