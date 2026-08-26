@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  Iniciando o Sistema de Gestao Juridica...
echo ============================================
echo.
echo Uma nova janela preta vai abrir e DEVE FICAR ABERTA
echo enquanto voce estiver usando o sistema (e o servidor).
echo Para desligar o sistema, feche aquela janela.
echo.

start "" "_servidor.bat"

timeout /t 3 /nobreak >nul
start "" http://localhost:3000

exit
