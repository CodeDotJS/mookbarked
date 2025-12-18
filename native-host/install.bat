@echo off
REM Installation script for Windows
REM This script installs the native messaging host manifest

echo ==========================================
echo Native Messaging Host Installer (Windows)
echo ==========================================
echo.

REM Check if extension ID is provided
if "%~1"=="" (
    echo Warning: No extension ID provided
    echo Usage: %~nx0 ^<extension-id^>
    echo.
    echo To get your extension ID:
    echo 1. Load the unpacked extension in Chrome
    echo 2. Go to chrome://extensions/
    echo 3. Enable 'Developer mode'
    echo 4. Copy the extension ID
    echo.
    set /p EXTENSION_ID="Enter your extension ID (or press Enter for placeholder): "
    
    if "!EXTENSION_ID!"=="" (
        set EXTENSION_ID=YOUR_EXTENSION_ID_HERE
        echo Using placeholder ID. You'll need to update the registry later.
    )
) else (
    set EXTENSION_ID=%~1
)

echo Extension ID: %EXTENSION_ID%
echo.

REM Get absolute path to native host script
set SCRIPT_DIR=%~dp0
set HOST_PATH=%SCRIPT_DIR%native_host.py

if not exist "%HOST_PATH%" (
    echo Error: native_host.py not found at %HOST_PATH%
    exit /b 1
)

echo Native host script: %HOST_PATH%
echo.

REM Check Python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Error: python not found
    echo Please install Python 3.7 or higher from python.org
    exit /b 1
)

for /f "tokens=*" %%i in ('python --version') do set PYTHON_VERSION=%%i
echo Python: %PYTHON_VERSION%
echo.

REM Check keyring library
python -c "import keyring" >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Warning: keyring library not installed
    echo Installing keyring...
    pip install keyring keyrings.alt
    echo.
)

REM Create manifest in temp location
set TEMP_MANIFEST=%TEMP%\com.bookmarks.native_host.json

echo Creating manifest file...
(
echo {
echo   "name": "com.bookmarks.native_host",
echo   "description": "Native messaging host for bookmarks extension",
echo   "path": "%HOST_PATH:\=\\%",
echo   "type": "stdio",
echo   "allowed_origins": [
echo     "chrome-extension://%EXTENSION_ID%/"
echo   ]
echo }
) > "%TEMP_MANIFEST%"

echo Manifest created at: %TEMP_MANIFEST%
echo.

REM Register in Windows Registry
echo Registering in Windows Registry...

set REG_KEY=HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.bookmarks.native_host

reg add "%REG_KEY%" /ve /t REG_SZ /d "%TEMP_MANIFEST%" /f >nul

if %ERRORLEVEL% EQU 0 (
    echo Registry key created successfully
) else (
    echo Error: Failed to create registry key
    exit /b 1
)

echo.
echo ==========================================
echo Installation complete!
echo ==========================================
echo.
echo Manifest location: %TEMP_MANIFEST%
echo Host script: %HOST_PATH%
echo Registry key: %REG_KEY%
echo.

echo Next steps:
echo 1. Load your extension in Chrome (chrome://extensions/)
echo 2. If you used a placeholder ID, run this script again with the real ID
echo 3. Restart Chrome
echo 4. Test the connection from your extension
echo.

pause
