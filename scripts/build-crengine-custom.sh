#!/usr/bin/env bash
set -euo pipefail

# Build custom CREngine WASM from the vendor source tree.
# Produces web/crengine.js + web/crengine.wasm with embind bindings.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DIR="${PROJECT_DIR}/vendor/crengine-master"
BUILD_DIR="${PROJECT_DIR}/vendor/crengine-wasm-build"
OUT_DIR="${PROJECT_DIR}/web"
EMSDK_DIR="${PROJECT_DIR}/vendor/emsdk"
CMAKE_DIR="${PROJECT_DIR}/vendor/cmake"

# ── Activate emsdk if available ─────────────────────────────────────────
if [[ -f "${EMSDK_DIR}/emsdk_env.sh" ]]; then
    echo "==> Activating emsdk from ${EMSDK_DIR}"
    source "${EMSDK_DIR}/emsdk_env.sh" 2>/dev/null || true
fi

# Add local cmake to PATH if present
if [[ -d "${CMAKE_DIR}/bin" ]]; then
    export PATH="${CMAKE_DIR}/bin:${PATH}"
fi

# ── Verify tools ────────────────────────────────────────────────────────
if ! command -v emcmake >/dev/null 2>&1; then
    echo "error: emcmake not found. Please install/activate emsdk first."
    echo "  cd vendor/emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi

if ! command -v cmake >/dev/null 2>&1; then
    echo "error: cmake not found."
    exit 1
fi

# ── Verify source ──────────────────────────────────────────────────────
if [[ ! -f "${SRC_DIR}/CMakeLists.wasm.txt" ]]; then
    echo "error: ${SRC_DIR}/CMakeLists.wasm.txt not found."
    echo "Make sure vendor/crengine-master is extracted and patched."
    exit 1
fi

if [[ ! -f "${SRC_DIR}/wasm_binding.cpp" ]]; then
    echo "error: ${SRC_DIR}/wasm_binding.cpp not found."
    exit 1
fi

# ── Clean build dir ────────────────────────────────────────────────────
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"

# Use CMakeLists.wasm.txt as the project file via a thin wrapper dir
CMAKE_ENTRY="${BUILD_DIR}/_src"
mkdir -p "${CMAKE_ENTRY}"
cp "${SRC_DIR}/CMakeLists.wasm.txt" "${CMAKE_ENTRY}/CMakeLists.txt"

echo "==> Configuring in ${BUILD_DIR}"
emcmake cmake \
    -S "${CMAKE_ENTRY}" \
    -B "${BUILD_DIR}" \
    -DCR_ROOT="${SRC_DIR}" \
    -DCMAKE_BUILD_TYPE=Release \
    -G "Unix Makefiles" \
    2>&1 | tail -30

echo "==> Building (this may take a few minutes)..."
cmake --build "${BUILD_DIR}" --parallel "$(nproc 2>/dev/null || echo 4)" 2>&1

# ── Copy artifacts ─────────────────────────────────────────────────────
if [[ -f "${BUILD_DIR}/crengine.js" && -f "${BUILD_DIR}/crengine.wasm" ]]; then
    echo "==> Build successful! Copying artifacts..."
    
    # Back up originals
    if [[ -f "${OUT_DIR}/crengine.js" ]]; then
        cp "${OUT_DIR}/crengine.js" "${OUT_DIR}/crengine.js.bak"
    fi
    if [[ -f "${OUT_DIR}/crengine.wasm" ]]; then
        cp "${OUT_DIR}/crengine.wasm" "${OUT_DIR}/crengine.wasm.bak"
    fi
    
    cp "${BUILD_DIR}/crengine.js" "${OUT_DIR}/crengine.js"
    cp "${BUILD_DIR}/crengine.wasm" "${OUT_DIR}/crengine.wasm"
    
    echo "==> Done"
    echo "Wrote:"
    echo "  ${OUT_DIR}/crengine.js  ($(wc -c < "${OUT_DIR}/crengine.js") bytes)"
    echo "  ${OUT_DIR}/crengine.wasm ($(wc -c < "${OUT_DIR}/crengine.wasm") bytes)"
    echo ""
    echo "Originals backed up to *.bak"
else
    echo "error: crengine.js/crengine.wasm not found in build output."
    echo "Build output contents:"
    ls -la "${BUILD_DIR}/" | head -20
    exit 1
fi
