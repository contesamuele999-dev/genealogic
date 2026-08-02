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

echo [2/3] Creazione commit con messaggio: "%commit_msg%"...
git commit -m "%commit_msg%"
if errorlevel 1 (
    echo.
    echo [INFO] Nessuna modifica da sottoporre a commit o errore nel commit.
    pause
    exit /b 0
)

echo [3/3] Invio modifiche al server remoto (git push)...
git push

if errorlevel 1 (
    echo.
    echo [ERRORE] Il push e' fallito! Verifica la connessione, le credenziali o se ci sono conflitti da risolvere.
) else (
    echo.
    echo [SUCCESSO] Push completato con successo!
)

echo.
pause
