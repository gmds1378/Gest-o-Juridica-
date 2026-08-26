@echo off
chcp 65001 >nul
title Servidor - Gestao Juridica (NAO FECHE esta janela)
cd /d "%~dp0"
call npm start
echo.
echo O servidor foi encerrado.
pause
