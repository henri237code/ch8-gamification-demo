@echo off
setlocal
cd /d "%~dp0"
if exist "%ProgramFiles%\nodejs\node.exe" set "PATH=%ProgramFiles%\nodejs;%PATH%"
title CH8 - Premiere installation
echo CH8 - Installation sur cet ordinateur Windows
echo Une connexion Internet est necessaire. Garder cette fenetre ouverte.
echo.
where node >nul 2>&1
if errorlevel 1 goto node_missing
where npm.cmd >nul 2>&1
if errorlevel 1 goto node_missing
if not exist "scripts\windows-preflight.cjs" goto incomplete
if not exist "package-lock.json" goto incomplete
node scripts\windows-preflight.cjs environment
if errorlevel 1 goto failed
node scripts\windows-preflight.cjs port
if errorlevel 1 goto failed
echo.
echo Etape 1 sur 4 - Telechargement des composants. Cela peut prendre plusieurs minutes.
echo Details dans installation-windows.log.
call npm ci --include=dev --cache "%CD%\.npm-cache" > installation-windows.log 2>&1
if errorlevel 1 goto install_failed
echo Etape 2 sur 4 - Verification de SQLite et des photos.
node scripts\windows-preflight.cjs native >> installation-windows.log 2>&1
if errorlevel 1 goto install_failed
echo Etape 3 sur 4 - Verification de l'application.
call npm run typecheck >> installation-windows.log 2>&1
if errorlevel 1 goto install_failed
echo Etape 4 sur 4 - Preparation des ecrans.
call npm run build >> installation-windows.log 2>&1
if errorlevel 1 goto install_failed
echo.
echo INSTALLATION TERMINEE.
echo Appuyer sur une touche pour fermer, puis double-cliquer LANCER-WINDOWS.cmd.
pause >nul
exit /b 0
:node_missing
echo Installer Node.js 24 LTS pour Windows depuis https://nodejs.org/en/download
echo Fermer cette fenetre apres installation, puis rouvrir INSTALLER-WINDOWS.cmd.
goto failed
:incomplete
echo Dossier incomplet. Extraire toute l'archive CH8 avant de lancer ce fichier.
goto failed
:install_failed
echo.
echo INSTALLATION INTERROMPUE. Details dans installation-windows.log.
echo Verifier Internet et suivre le chapitre Depannage du guide Windows.
echo Ne pas supprimer le dossier data.
goto failed
:failed
echo.
echo Appuyer sur une touche pour fermer cette fenetre.
pause >nul
exit /b 1
