#!/usr/bin/env bash
#
# upgrade-plugins.sh — chạy TRÊN một NocoBase server để cài/nâng cấp các plugin
# @tuanla90 từ GitHub Packages. Publish 1 lần ở máy dev, rồi chạy script này trên
# từng server (hoặc qua ssh) là mọi server có bản mới.
#
# CHUẨN BỊ 1 LẦN / server (xem PUBLISH-GITHUB-PACKAGES.md Phần 3):
#   export GITHUB_READ_TOKEN=ghp_xxx           # token chỉ-đọc (read:packages)
#   cp npmrc.consumer.example ~/.npmrc          # cho npm biết registry + token
#
# DÙNG:
#   bash deploy/upgrade-plugins.sh              # cài/cập nhật các plugin liệt kê dưới
#
set -e

# 1) Sửa danh sách này cho đúng các plugin server NÀY dùng (bỏ # ở dòng bạn cần):
PLUGINS=(
  # plugin-formula
  # plugin-block-custom-html
  # plugin-branding
  # plugin-global-search
  # plugin-menu-enhancements
  # plugin-line-generator
  # ... thêm/bớt tuỳ server
)

# 2) Cách khởi động lại NocoBase của bạn (sửa cho khớp môi trường):
RESTART_CMD="pm2 restart index"     # ví dụ khác: "yarn start" / "docker restart nocobase"

if [ ${#PLUGINS[@]} -eq 0 ]; then
  echo "Chưa chọn plugin nào — mở deploy/upgrade-plugins.sh và bỏ # ở các dòng cần."
  exit 1
fi

for p in "${PLUGINS[@]}"; do
  pkg="@tuanla90/$p"
  echo ">>> $pkg"
  # 'pm add' kéo bản mới nhất từ registry. (Nếu bản này đã cài, có thể cần gỡ rồi
  #  add lại, hoặc dùng nút Upgrade trong Plugin Manager UI.)
  yarn nocobase pm add "$pkg"
  yarn nocobase pm enable "$pkg" || true
done

echo ""
echo "Khởi động lại NocoBase để nạp bản mới..."
eval "$RESTART_CMD"
echo "Xong."
