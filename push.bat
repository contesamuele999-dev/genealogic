@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

echo =========================================
echo         Git Push Automation Script
echo =========================================
echo.

:: Verifico se Git e' installato
git --version >nul 2>&1
if errorlevel 1 (
    echo [ERRORE] Git non e' installato o non e' presente nel PATH.
    echo.
    pause
    exit /b 1
)

:: Mostro lo stato attuale dei file modificati/nuovi
for /f "delims=" %%B in ('git branch --show-current') do set "current_branch=%%B"
if /I not "!current_branch!"=="main" (
    echo [ERRORE] Il branch corrente e' "!current_branch!". Il deploy e' consentito solo da main.
    pause
    exit /b 1
)

echo Stato attuale del repository:
echo -----------------------------------------
git status -s
echo -----------------------------------------
echo.

:: Richiesta messaggio di commit
set /p "commit_msg=Inserisci il messaggio di commit (Premi INVIO per messaggio predefinito): "

:: Se il messaggio e' vuoto, usa un messaggio automatico con data e ora
if "%commit_msg%"=="" (
    set "commit_msg=Update: %date% %time%"
)

echo.
echo [1/3] Aggiunta file in corso (git add .)...
git add .

git diff --cached --quiet
if errorlevel 1 (
    echo [2/3] Creazione commit con messaggio: "%commit_msg%"...
    git commit -m "%commit_msg%"
    if errorlevel 1 (
        echo [ERRORE] Creazione commit fallita.
        pause
        exit /b 1
    )
) else (
    echo [2/3] Nessuna nuova modifica da committare. Proseguo con il push.
)

echo [3/3] Invio modifiche al server remoto (git push)...
git push origin main

if errorlevel 1 (
    echo.
    echo [ERRORE] Il push e' fallito! Verifica la connessione, le credenziali o se ci sono conflitti da risolvere.
) else (
    echo.
    echo [SUCCESSO] Push completato. GitHub Actions sta eseguendo build e deploy.
    echo Controlla lo stato nella scheda Actions del repository.
)

echo.
pause
