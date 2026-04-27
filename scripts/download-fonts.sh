#!/bin/bash
# Download all fonts from Google Fonts to web/fonts/
# Mirrors (tried in order): jsDelivr (China CDN) -> ghproxy -> raw.githubusercontent
# Run from project root: ./scripts/download-fonts.sh

set -e
DIR="web/fonts"
mkdir -p "$DIR"

# Mirrors (tried in order): raw -> jsDelivr -> gh-proxy
# 实测 raw 稳定; 加 User-Agent 避免部分环境 403
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
BASE_RAW="https://raw.githubusercontent.com/google/fonts/main/ofl"
BASE_JSDELIVR="https://cdn.jsdelivr.net/gh/google/fonts@main/ofl"
BASE_GHPROXY="https://gh-proxy.com/https://raw.githubusercontent.com/google/fonts/main/ofl"

download() {
    local path="$1"
    local out="$2"
    if [ -f "$out" ]; then
        # 校验：字体应 >100KB，否则可能是 HTML 错误页
        local sz=$(stat -c%s "$out" 2>/dev/null || stat -f%z "$out" 2>/dev/null)
        if [ "$sz" -gt 100000 ] 2>/dev/null; then
            echo "Skip (exists): $out"
            return 0
        fi
        rm -f "$out"
    fi
    for base in "$BASE_RAW" "$BASE_JSDELIVR" "$BASE_GHPROXY"; do
        echo "Try: $out <- ${base%%/ofl*}"
        if curl -sfSL -A "$UA" --connect-timeout 15 --max-time 120 -o "$out" "$base/$path" 2>/dev/null; then
            local sz=$(stat -c%s "$out" 2>/dev/null || stat -f%z "$out" 2>/dev/null)
            if [ -n "$sz" ] && [ "$sz" -gt 10000 ]; then
                # 排除 HTML 错误页 (以 <! 开头)
                if ! head -c2 "$out" | grep -q '<!'; then
                    echo "OK: $out ($sz bytes)"
                    return 0
                fi
            fi
            rm -f "$out"
        fi
    done
    echo "FAIL: $out"
    return 1
}

# Literata
download "literata/Literata%5Bopsz%2Cwght%5D.ttf" "$DIR/Literata-Regular.ttf"
download "literata/Literata-Italic%5Bopsz%2Cwght%5D.ttf" "$DIR/Literata-Italic.ttf"

# Lora
download "lora/Lora%5Bwght%5D.ttf" "$DIR/Lora-Regular.ttf"
download "lora/Lora-Italic%5Bwght%5D.ttf" "$DIR/Lora-Italic.ttf"

# Merriweather (variable fonts)
download "merriweather/Merriweather%5Bopsz%2Cwdth%2Cwght%5D.ttf" "$DIR/Merriweather-Regular.ttf"
download "merriweather/Merriweather-Italic%5Bopsz%2Cwdth%2Cwght%5D.ttf" "$DIR/Merriweather-Italic.ttf"

# Source Serif 4
download "sourceserif4/SourceSerif4%5Bopsz%2Cwght%5D.ttf" "$DIR/SourceSerif4-Regular.ttf"

# Noto Serif (variable fonts)
download "notoserif/NotoSerif%5Bwdth%2Cwght%5D.ttf" "$DIR/NotoSerif-Regular.ttf"
download "notoserif/NotoSerif-Italic%5Bwdth%2Cwght%5D.ttf" "$DIR/NotoSerif-Italic.ttf"

# Noto Sans
download "notosans/NotoSans%5Bwdth%2Cwght%5D.ttf" "$DIR/NotoSans-Regular.ttf"

# Open Sans
download "opensans/OpenSans%5Bwdth%2Cwght%5D.ttf" "$DIR/OpenSans-Regular.ttf"

# Roboto
download "roboto/Roboto%5Bwdth%2Cwght%5D.ttf" "$DIR/Roboto-Regular.ttf"

# EB Garamond
download "ebgaramond/EBGaramond%5Bwght%5D.ttf" "$DIR/EBGaramond-Regular.ttf"
download "ebgaramond/EBGaramond-Italic%5Bwght%5D.ttf" "$DIR/EBGaramond-Italic.ttf"

# Crimson Pro
download "crimsonpro/CrimsonPro%5Bwght%5D.ttf" "$DIR/CrimsonPro-Regular.ttf"
download "crimsonpro/CrimsonPro-Italic%5Bwght%5D.ttf" "$DIR/CrimsonPro-Italic.ttf"

# Noto Sans SC
download "notosanssc/NotoSansSC%5Bwght%5D.ttf" "$DIR/NotoSansSC-Regular.ttf"

# Noto Serif SC
download "notoserifsc/NotoSerifSC%5Bwght%5D.ttf" "$DIR/NotoSerifSC-Regular.ttf"

# Alegreya Sans SC / Alegreya SC (适合阅读，中英)
download "alegreyasanssc/AlegreyaSansSC-Regular.ttf" "$DIR/AlegreyaSansSC-Regular.ttf"
download "alegreyasc/AlegreyaSC-Regular.ttf" "$DIR/AlegreyaSC-Regular.ttf"

# 霞鹜文楷屏幕版 (电纸书优化，锯齿少)
download_lxgw() {
    local url="https://github.com/lxgw/LxgwWenKai-Screen/releases/download/v1.521/LXGWWenKaiGBScreen.ttf"
    local out="$DIR/LXGWWenKaiGBScreen.ttf"
    if [ -f "$out" ] && [ "$(stat -c%s "$out" 2>/dev/null)" -gt 100000 ]; then
        echo "Skip (exists): $out"
        return 0
    fi
    echo "Try: $out <- GitHub Release"
    if curl -sfSL -A "$UA" --connect-timeout 15 --max-time 120 -o "$out" "$url" 2>/dev/null && [ -s "$out" ]; then
        local sz=$(stat -c%s "$out" 2>/dev/null)
        if [ -n "$sz" ] && [ "$sz" -gt 100000 ]; then
            echo "OK: $out ($sz bytes)"
            return 0
        fi
    fi
    rm -f "$out"
    echo "FAIL: $out"
    return 1
}
download_lxgw

# ZCOOL XiaoWei
download "zcoolxiaowei/ZCOOLXiaoWei-Regular.ttf" "$DIR/ZCOOLXiaoWei-Regular.ttf"

# ZCOOL QingKe HuangYou
download "zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf" "$DIR/ZCOOLQingKeHuangYou-Regular.ttf"

# Ma Shan Zheng
download "mashanzheng/MaShanZheng-Regular.ttf" "$DIR/MaShanZheng-Regular.ttf"

# Long Cang
download "longcang/LongCang-Regular.ttf" "$DIR/LongCang-Regular.ttf"

echo "Done. Fonts saved to $DIR/"
