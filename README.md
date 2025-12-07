# DFFLoader for Three.js

A modern Three.js loader for RenderWare DFF 3D models and TXD texture dictionaries from GTA San Andreas, Vice City, III and other RenderWare-powered games.

## Features

- **Three.js r150+ compatible** (tested with r170)
- **ES Module syntax** with proper exports
- **TXD Texture Dictionary support** - Load textures directly from .txd files
- **DXT compression support** - DXT1, DXT3, DXT5 texture decompression
- **Multi-material meshes** - Proper material assignment via BinMesh PLG
- **Complete geometry support** - Positions, normals, UVs, vertex colors
- **Skeletal animation data** - Bones and skin weights
- **Modern dev setup** - Vite-based development server with hot reload

## Installation

```bash
npm install
```

## Quick Start

### Development Server

```bash
npm run dev
```

Open http://localhost:3000 and drag & drop .dff and .txd files to view models with textures.

### Basic Usage

```javascript
import * as THREE from 'three';
import { DFFLoader } from './src/DFFLoader.js';

const loader = new DFFLoader();

loader.load('model.dff', (model) => {
    scene.add(model);
});
```

### With TXD Textures

```javascript
import { DFFLoader } from './src/DFFLoader.js';
import { TXDLoader } from './src/TXDLoader.js';

// First load the texture dictionary
const txdLoader = new TXDLoader();
txdLoader.load('textures.txd', (textures) => {
    // Then load the model with textures
    const dffLoader = new DFFLoader();
    dffLoader.setTextureDictionary(textures);

    dffLoader.load('model.dff', (model) => {
        scene.add(model);
    });
});
```

### Parse from ArrayBuffer

```javascript
// For DFF
const dffLoader = new DFFLoader();
const model = dffLoader.parse(dffArrayBuffer);

// For TXD
const txdLoader = new TXDLoader();
const textures = txdLoader.parse(txdArrayBuffer);
```

## Supported Formats

### DFF (3D Models)

| Feature | Status |
|---------|--------|
| Geometry (vertices, faces) | Complete |
| Materials | Complete |
| UV Coordinates | Complete |
| Vertex Colors | Complete |
| Normals | Complete |
| BinMesh PLG (material splits) | Complete |
| Bone Hierarchy | Complete |
| Skin Weights | Complete |
| Morph Targets | Partial |
| Collision Data | Not supported |
| 2DFX Effects | Not supported |

### TXD (Texture Dictionaries)

| Format | Status |
|--------|--------|
| DXT1 (BC1) | Complete |
| DXT3 (BC2) | Complete |
| DXT5 (BC3) | Complete |
| Uncompressed (A8R8G8B8, X8R8G8B8) | Complete |
| Uncompressed (R5G6B5, A1R5G5B5) | Complete |
| Paletted (P8, PAL8) | Complete |
| Paletted (PAL4) | Complete |
| Mipmaps | Skipped (uses base level) |

## API Reference

### DFFLoader

Extends `THREE.Loader`

```javascript
const loader = new DFFLoader(manager);
```

#### Methods

- `load(url, onLoad, onProgress, onError)` - Load DFF from URL
- `parse(arrayBuffer)` - Parse DFF from ArrayBuffer, returns `THREE.Group`
- `setPath(path)` - Set base path for fallback texture loading
- `setTextureDictionary(map)` - Set texture Map from TXDLoader

### TXDLoader

Extends `THREE.Loader`

```javascript
const loader = new TXDLoader(manager);
```

#### Methods

- `load(url, onLoad, onProgress, onError)` - Load TXD from URL
- `parse(arrayBuffer)` - Parse TXD from ArrayBuffer, returns `Map<string, {texture, hasAlpha}>`

## Getting Game Files

DFF and TXD files can be extracted from:

- **GTA San Andreas** - `models/gta3.img`, `models/player.img`
- **GTA Vice City** - `models/gta3.img`
- **GTA III** - `models/gta3.img`
- Community mods from [GTAInside](https://gtainside.com)

### Extraction Tools

- [OpenIV](https://openiv.com/) - Modern tool for GTA modding
- [IMG Tool](http://www.gtagarage.com/mods/show.php?id=2310) - Classic IMG archive tool
- [TXD Workshop](https://www.gtagarage.com/mods/show.php?id=11478) - TXD texture editor

## Technical Notes

### RenderWare Chunk Structure

DFF files use the RenderWare binary chunk format:
- Each chunk has a 12-byte header (type, size, version)
- Main chunks: Clump, FrameList, GeometryList, Atomic
- Extensions: BinMesh PLG, Skin PLG, HAnim PLG

### BinMesh PLG

GTA SA models use BinMesh PLG extension for material assignment instead of per-triangle material IDs. This loader properly handles both formats.

### Texture Formats

TXD textures store D3D format information. The loader automatically detects and decodes:
- Compressed formats via S3TC/DXT decompression
- Various uncompressed pixel formats with correct channel ordering

## Browser Compatibility

Requires browsers with:
- ES2020+ support (async/await, optional chaining)
- WebGL 2.0 for Three.js rendering
- ArrayBuffer and TypedArray support

## License

MIT

## Credits

- **Original DFFLoader** by [andrewixz](https://github.com/andrewixz/DFFLoader)
- **Modernization & TXD Support** - Complete rewrite for Three.js r150+

### References

- [RenderWare Binary Stream](https://gtamods.com/wiki/RenderWare_binary_stream)
- [TXD File Format](https://gtamods.com/wiki/Texture_Native_Struct)
- [DFF File Format](https://gtamods.com/wiki/DFF)
