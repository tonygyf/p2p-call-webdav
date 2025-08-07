#!/bin/bash

echo "正在安装 WebDAV P2P Chat 依赖..."

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "错误: 未找到Node.js，请先安装Node.js"
    exit 1
fi

# 检查npm是否可用
if ! command -v npm &> /dev/null; then
    echo "错误: npm不可用"
    exit 1
fi

echo "正在安装依赖包..."
npm install

if [ $? -ne 0 ]; then
    echo "错误: 依赖安装失败"
    exit 1
fi

echo "依赖安装完成！"
echo "现在可以运行 'npm start' 启动应用"
