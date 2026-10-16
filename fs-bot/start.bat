@echo off
chcp 65001 >nul
cd /d %~dp0
title fs-bot 个人飞书转发
node relay.js
echo.
echo fs-bot 已退出。若窗口一闪而过说明启动失败，请检查 config.json。
pause
