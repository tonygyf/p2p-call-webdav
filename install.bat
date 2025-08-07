@echo off
echo 正在安装 WebDAV P2P Chat 依赖...

REM 检查Node.js是否安装
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: 未找到Node.js，请先安装Node.js
    pause
    exit /b 1
)

REM 检查npm是否可用
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo 错误: npm不可用
    pause
    exit /b 1
)

echo 正在安装依赖包...
npm install

if %errorlevel% neq 0 (
    echo 错误: 依赖安装失败
    pause
    exit /b 1
)

echo 依赖安装完成！
echo 现在可以运行 "npm start" 启动应用
pause
