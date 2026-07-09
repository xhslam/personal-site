#!/bin/bash
# 本地压缩背景视频后用于 Vercel 部署（需安装 ffmpeg: brew install ffmpeg）
set -e
SRC="/Users/apple/Documents/视频区/6月26日.mov"
OUT="$(dirname "$0")/../public/video/hero-bg.mp4"

echo "压缩中… 约需 1–3 分钟"
ffmpeg -i "$SRC" \
  -c:v libx264 -crf 28 -preset slow -vf "scale=-2:720" -an \
  -movflags +faststart \
  -y "$OUT"

ls -lh "$OUT"
echo "完成 → public/video/hero-bg.mp4"
