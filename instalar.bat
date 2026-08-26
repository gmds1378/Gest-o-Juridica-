@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ============================================
echo  Instalando o Sistema de Gestao Juridica...
echo  (isso pode levar 1-2 minutos na primeira vez)
echo ============================================
echo.
call npm install
if errorlevel 1 (
    echo.
    echo ERRO na instalacao. Verifique se o Node.js esta instalado
    echo ^(baixe em https://nodejs.org^) e tente novamente.
    pause
    exit /b 1
)

echo.
echo Criando o banco de dados e os 3 usuarios iniciais...
call npm run seed

echo.
echo ============================================
echo  Instalacao concluida!
echo  Agora abra o arquivo "2 - Iniciar sistema.bat"
echo ============================================
pause
