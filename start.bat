@echo off
chcp 65001
echo 启动 WebDAV P2P Chat...

REM 检查node_modules是否存在
if not exist "node_modules" (
    echo 错误: 未找到node_modules目录，请先运行 install.bat
    pause
    exit /b 1
)

REM 检查main.js是否存在
if not exist "main.js" (
    echo 错误: 未找到main.js文件
    pause
    exit /b 1
)

echo 正在启动应用...
npm start

if %errorlevel% neq 0 (
    echo 错误: 应用启动失败
    pause
    exit /b 1
)
