# Custom CREngine WASM Build

This project normally consumes prebuilt `web/crengine.js` and `web/crengine.wasm`.
If all CJK fonts crash inside `getPageCount()` with errors like
`RuntimeError: function signature mismatch`, you likely need a custom CREngine
build with updated FreeType and safer WASM memory settings.

## Why rebuild

- The crash happens inside precompiled WASM (not normal JS logic).
- This repo does not include CoolReader/CREngine source code.
- Rebuilding lets you change:
  - `INITIAL_MEMORY`
  - `MAXIMUM_MEMORY`
  - `ALLOW_MEMORY_GROWTH`
  - upstream FreeType/CREngine patches

## Prerequisites

- Emscripten SDK (`emcmake`, `emcc`, etc.)
- `cmake`
- External CREngine source checkout

## Build command

Use the helper script:

```bash
CRENGINE_SRC_DIR=/path/to/crengine/source \
CRENGINE_BUILD_DIR=/tmp/crengine-build \
CRENGINE_INITIAL_MEMORY=256MB \
CRENGINE_MAX_MEMORY=2GB \
bash scripts/build-crengine-custom.sh
```

On success it overwrites:

- `web/crengine.js`
- `web/crengine.wasm`

Then run:

```bash
npm run build
```

## Applying patches

After extracting `crengine-master.zip` into `vendor/crengine-master/`, apply
the saved patches:

```bash
cd vendor/crengine-master
patch -p1 < ../../scripts/patches/crengine-wasm.patch
```

The patch covers:
- **FreeType `ftoption.h`**: disable macOS resource-fork probing (`FT_CONFIG_OPTION_MAC_FONTS`)
- **`crsetup.h`**: disable HarfBuzz/fontconfig/libpng/libjpeg/gif for Emscripten
- **`lvstring.cpp`**: add missing `#include <limits.h>`
- **`lvtinydom.cpp`**: xxhash fallback when `<xxhash.h>` is unavailable
- **`CMakeLists.txt`**: remove `BUILD_LITE` to keep full rendering symbols

## Notes

- Upstream build layouts vary; if artifacts are not auto-detected, adjust the
  script's artifact lookup section.
