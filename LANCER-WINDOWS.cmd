@echo off
setlocal
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
title CH8 - Serveur local - Garder cette fenetre ouverte
where node >nul 2>&1
if errorlevel 1 goto install_required
where npm.cmd >nul 2>&1
if errorlevel 1 goto install_required
if not exist "scripts\windows-preflight.cjs" goto incomplete
node scripts\windows-preflight.cjs environment
if errorlevel 1 goto failed
if not exist "node_modules\.bin\tsx.cmd" goto install_required
if not exist "dist\client\index.html" goto install_required
node scripts\windows-preflight.cjs native
if errorlevel 1 goto failed
node scripts\windows-preflight.cjs port
if errorlevel 1 goto failed
set "HOST=0.0.0.0"
set "PORT=3080"
echo.
echo CH8 : garder cette fenetre ouverte pendant la demonstration.
echo Attendre Serveur pret puis ouvrir http://localhost:3080/ecrans
echo Pour un autre ordinateur, utiliser une Adresse reseau affichee ci-dessous.
echo Pour arreter : cliquer dans cette fenetre, puis Ctrl+C et confirmer si demande.
echo.
call npm start
if errorlevel 1 goto server_failed
echo Serveur arrete.
pause
exit /b 0
:install_required
echo Premiere installation requise. Installer Node.js 24 LTS puis double-cliquer INSTALLER-WINDOWS.cmd avec Internet.
goto failed
:incomplete
echo Dossier incomplet. Extraire toute l'archive CH8. Ne pas deplacer ce lanceur seul.
goto failed
:server_failed
echo.
echo Le serveur s'est arrete sur une erreur. Photographier le message ci-dessus.
echo Ne pas effacer la base data\ch8.sqlite.
:failed
echo Appuyer sur une touche pour fermer.
pause >nul
exit /b 1
