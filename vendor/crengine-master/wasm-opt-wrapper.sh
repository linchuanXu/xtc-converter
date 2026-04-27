#!/usr/bin/env bash
# Wrapper for wasm-opt that skips the --fpcast-emu pass
# to avoid the max-func-params error, while keeping other optimizations.
# The fpcast-emu emulation is handled at the Emscripten compiler level instead.

REAL_WASM_OPT="$(dirname "$0")/wasm-opt.real"

# Filter out --fpcast-emu from arguments
ARGS=()
for arg in "$@"; do
    if [[ "$arg" == "--fpcast-emu" ]]; then
        continue
    fi
    ARGS+=("$arg")
done

exec "$REAL_WASM_OPT" "${ARGS[@]}"
