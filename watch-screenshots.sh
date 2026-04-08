#!/data/data/com.termux/files/usr/bin/bash
# Watches for new Android screenshots and copies the latest to ~/yapify/latest-screenshot.png

DEST="$HOME/yapify/latest-screenshot.png"

# Common screenshot locations on Android
DIRS=(
  "/sdcard/DCIM/Screenshots"
  "/sdcard/Pictures/Screenshots"
  "/sdcard/Pictures/screenshot"
)

while true; do
    for dir in "${DIRS[@]}"; do
        if [ -d "$dir" ]; then
            latest=$(ls -t "$dir"/*.png "$dir"/*.jpg 2>/dev/null | head -1)
            if [ -n "$latest" ]; then
                cp "$latest" "$DEST" 2>/dev/null
            fi
            break
        fi
    done
    sleep 2
done
