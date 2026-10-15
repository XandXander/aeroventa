@echo off
setlocal
cd /d "%~dp0"
echo AEROVENTA BITRIX -- PUBLIC SOURCE CAPTURE V2, READ ONLY
echo Checking website before attempting 29 pages.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAPTURE_BITRIX_PUBLIC.ps1"
echo.
echo Attach AEROVENTA_BITRIX_PUBLIC_RETURN_*.zip from THIS directory in ChatGPT.
echo If site is unreachable the ZIP contains diagnostics, not invented page content.
pause
