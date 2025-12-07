/**
 * DFFLoader - RenderWare DFF model loader for Three.js
 *
 * Loads .dff files from GTA San Andreas, Vice City, III and other RenderWare games.
 *
 * @author andrewixz (original)
 * @author modernized for Three.js r150+
 */

import * as THREE from 'three';
import DFFReader from './Reader.js';

class DFFLoader extends THREE.Loader {
    constructor(manager) {
        super(manager);
        this.textureDictionary = null;
    }

    /**
     * Set a texture dictionary (Map) loaded from TXD file
     * @param {Map<string, THREE.Texture>} textures - Map of texture name -> THREE.Texture
     */
    setTextureDictionary(textures) {
        this.textureDictionary = textures;
        return this;
    }

    load(url, onLoad, onProgress, onError) {
        const loader = new THREE.FileLoader(this.manager);
        loader.setResponseType('arraybuffer');
        loader.setPath(this.path);
        loader.setRequestHeader(this.requestHeader);
        loader.setWithCredentials(this.withCredentials);

        loader.load(url, (buffer) => {
            try {
                onLoad(this.parse(buffer));
            } catch (e) {
                if (onError) {
                    onError(e);
                } else {
                    console.error(e);
                }
                this.manager.itemError(url);
            }
        }, onProgress, onError);
    }

    parse(arraybuffer) {
        const reader = new DFFReader();
        const group = new THREE.Group();
        const clump = reader.parse(arraybuffer);

        if (!clump) {
            console.warn('DFFLoader: No clump found in file');
            return group;
        }

        const meshes = [];

        // Process each geometry
        clump.RWGeometryList.forEach((rwGeometry) => {
            const geometry = new THREE.BufferGeometry();

            // Check for BinMesh extension (GTA SA uses this for material splits)
            const binMesh = rwGeometry.RWExtension?.CHUNK_BINMESH;
            let materialSplits = [];

            if (binMesh && binMesh.splits && binMesh.splits.length > 0) {
                // Use BinMesh splits for material assignment
                

                // Check if BinMesh has embedded indices or just counts
                const hasEmbeddedIndices = binMesh.splits.some(s => s.indices && s.indices.length > 0);

                if (hasEmbeddedIndices) {
                    // Use embedded indices from BinMesh
                    binMesh.splits.forEach((split, i) => {
                        if (split.indices && split.indices.length > 0) {
                            const triangles = [];
                            if (binMesh.faceType === 0) {
                                for (let j = 0; j < split.indices.length; j += 3) {
                                    triangles.push([
                                        split.indices[j],
                                        split.indices[j + 1],
                                        split.indices[j + 2]
                                    ]);
                                }
                            } else {
                                for (let j = 0; j < split.indices.length - 2; j++) {
                                    if (j % 2 === 0) {
                                        triangles.push([
                                            split.indices[j],
                                            split.indices[j + 1],
                                            split.indices[j + 2]
                                        ]);
                                    } else {
                                        triangles.push([
                                            split.indices[j + 1],
                                            split.indices[j],
                                            split.indices[j + 2]
                                        ]);
                                    }
                                }
                            }
                            materialSplits.push({
                                matIndex: split.matIndex,
                                triangles: triangles
                            });
                            
                        }
                    });
                } else {
                    // No embedded indices - use native triangles grouped by split numIndices
                    
                    let triangleOffset = 0;
                    binMesh.splits.forEach((split, i) => {
                        const numTriangles = Math.floor((split.numIndices || 0) / 3);
                        const triangles = [];
                        for (let j = 0; j < numTriangles && (triangleOffset + j) < rwGeometry.triangles.length; j++) {
                            const tri = rwGeometry.triangles[triangleOffset + j];
                            triangles.push([tri.vertex1, tri.vertex2, tri.vertex3]);
                        }
                        if (triangles.length > 0) {
                            materialSplits.push({
                                matIndex: split.matIndex,
                                triangles: triangles
                            });
                            
                        }
                        triangleOffset += numTriangles;
                    });
                }
            }

            // Fallback to triangle.materialId if no BinMesh
            if (materialSplits.length === 0) {
                
                const triangleGroups = {};
                rwGeometry.triangles.forEach((triangle) => {
                    const matId = triangle.materialId || 0;
                    if (!triangleGroups[matId]) {
                        triangleGroups[matId] = [];
                    }
                    triangleGroups[matId].push([
                        triangle.vertex1,
                        triangle.vertex2,
                        triangle.vertex3
                    ]);
                });

                for (const [matIndex, triangles] of Object.entries(triangleGroups)) {
                    materialSplits.push({
                        matIndex: Number(matIndex),
                        triangles: triangles
                    });
                }
            }

            const triangleCount = materialSplits.reduce(
                (sum, split) => sum + split.triangles.length,
                0
            );

            // Create buffer attributes
            const positionBuffer = new THREE.BufferAttribute(
                new Float32Array(triangleCount * 3 * 3), 3
            );

            const hasNormals = rwGeometry.morphTargets[0].hasNormals;
            const normalBuffer = hasNormals
                ? new THREE.BufferAttribute(new Float32Array(triangleCount * 3 * 3), 3)
                : null;

            const hasColors = !!rwGeometry.prelitcolor;
            const colorBuffer = hasColors
                ? new THREE.BufferAttribute(new Float32Array(triangleCount * 3 * 4), 4)
                : null;

            const hasUVs = rwGeometry.texCoords;
            const uvBuffer = hasUVs
                ? new THREE.BufferAttribute(new Float32Array(triangleCount * 3 * 2), 2)
                : null;

            let vertexPos = 0;
            const newVertexIndices = {};

            // Process triangles grouped by material
            for (const split of materialSplits) {
                const groupStart = vertexPos;

                for (const indices of split.triangles) {
                    for (const index of indices) {
                        const vertex = rwGeometry.morphTargets[0].vertices[index];
                        positionBuffer.setXYZ(vertexPos, vertex.x, vertex.y, vertex.z);

                        newVertexIndices[index] = newVertexIndices[index] || [];
                        newVertexIndices[index].push(vertexPos);

                        if (normalBuffer) {
                            const normal = rwGeometry.morphTargets[0].normals[index];
                            normalBuffer.setXYZ(vertexPos, normal.x, normal.y, normal.z);
                        }

                        if (uvBuffer) {
                            const uv = rwGeometry.texCoords[0][index];
                            // V-flip for OpenGL/Three.js coordinate system
                            uvBuffer.setXY(vertexPos, uv.u, uv.v);
                        }

                        if (colorBuffer) {
                            const color = rwGeometry.prelitcolor[index];
                            colorBuffer.setXYZW(
                                vertexPos,
                                color.r / 255,
                                color.g / 255,
                                color.b / 255,
                                color.a / 255
                            );
                        }

                        vertexPos++;
                    }
                }

                geometry.addGroup(groupStart, vertexPos - groupStart, split.matIndex);
            }

            // Set geometry attributes (Three.js r125+ uses setAttribute)
            geometry.setAttribute('position', positionBuffer);

            if (normalBuffer) {
                geometry.setAttribute('normal', normalBuffer);
            } else {
                geometry.computeVertexNormals();
            }

            if (colorBuffer) {
                geometry.setAttribute('color', colorBuffer);
            }

            if (uvBuffer) {
                geometry.setAttribute('uv', uvBuffer);
            }

            geometry.computeBoundingSphere();

            // Create materials
            const materials = rwGeometry.RWMaterialList.map((material) => {
                const matData = material.RWMaterial;

                const result = new THREE.MeshStandardMaterial({
                    vertexColors: hasColors,
                    roughness: matData.diffuse !== undefined ? matData.diffuse : 0.8,
                    metalness: 0.1,
                    color: new THREE.Color(
                        matData.color.r / 255,
                        matData.color.g / 255,
                        matData.color.b / 255
                    ),
                    transparent: matData.color.a < 255,
                    opacity: matData.color.a / 255
                });

                if (matData.isTextured && matData.RWTexture) {
                    const textureName = matData.RWTexture.name;
                    const maskName = matData.RWTexture.maskName;

                    console.log(`DFFLoader: Material requests texture "${textureName}"${maskName ? ` (mask: ${maskName})` : ''}`);

                    // First try texture dictionary (from TXD)
                    if (textureName && this.textureDictionary) {
                        const txdEntry = this.textureDictionary.get(textureName.toLowerCase());
                        if (txdEntry) {
                            const txdTexture = txdEntry.texture || txdEntry; // Support both old and new format
                            result.map = txdTexture.clone();
                            // Enable transparency for textures with alpha
                            if (txdEntry.hasAlpha) {
                                result.transparent = true;
                                result.alphaTest = 0.1;
                            }
                            result.map.needsUpdate = true;
                            console.log(`DFFLoader: Found TXD texture "${textureName}"`);
                        } else {
                            console.warn(`DFFLoader: Texture "${textureName}" not found in TXD (available: ${this.textureDictionary.size})`);
                        }
                    }

                    // Fallback to file loading if no TXD texture found
                    if (!result.map && textureName) {
                        const textureLoader = new THREE.TextureLoader();
                        if (this.path) {
                            textureLoader.setPath(this.path);
                        }

                        result.map = textureLoader.load(
                            textureName + '.png',
                            () => { result.needsUpdate = true; },
                            undefined,
                            () => {
                                result.map = textureLoader.load(
                                    textureName + '.jpg',
                                    () => { result.needsUpdate = true; },
                                    undefined,
                                    () => {
                                        result.map = textureLoader.load(
                                            textureName + '.bmp',
                                            () => { result.needsUpdate = true; }
                                        );
                                    }
                                );
                            }
                        );
                    }

                    if (result.map) {
                        result.map.wrapS = THREE.RepeatWrapping;
                        result.map.wrapT = THREE.RepeatWrapping;
                        result.map.colorSpace = THREE.SRGBColorSpace;
                    }

                    // Alpha/mask texture
                    if (maskName) {
                        // Try TXD first
                        if (this.textureDictionary) {
                            const txdMask = this.textureDictionary.get(maskName.toLowerCase());
                            if (txdMask) {
                                result.alphaMap = txdMask.clone();
                                result.alphaMap.needsUpdate = true;
                            }
                        }

                        // Fallback to file
                        if (!result.alphaMap) {
                            const textureLoader = new THREE.TextureLoader();
                            if (this.path) {
                                textureLoader.setPath(this.path);
                            }
                            result.alphaMap = textureLoader.load(
                                maskName + '.png',
                                () => { result.needsUpdate = true; }
                            );
                        }

                        if (result.alphaMap) {
                            result.alphaMap.wrapS = THREE.RepeatWrapping;
                            result.alphaMap.wrapT = THREE.RepeatWrapping;
                            result.transparent = true;
                            result.alphaTest = 0.05;
                        }
                    }
                }

                return result;
            });

            // Handle skinning data
            if (rwGeometry.RWExtension && rwGeometry.RWExtension.CHUNK_SKIN) {
                const skinExtension = rwGeometry.RWExtension.CHUNK_SKIN;

                const indicesBuffer = new THREE.Float32BufferAttribute(
                    new Float32Array(positionBuffer.count * 4), 4
                );
                const weightsBuffer = new THREE.Float32BufferAttribute(
                    new Float32Array(positionBuffer.count * 4), 4
                );

                for (let index = 0; index < rwGeometry.numVertices; index++) {
                    if (newVertexIndices[index]) {
                        newVertexIndices[index].forEach((newIndex) => {
                            const boneIndices = skinExtension.vertexBoneIndices[index];
                            const boneWeights = skinExtension.vertexBoneWeights[index];

                            indicesBuffer.setXYZW(
                                newIndex,
                                boneIndices.x,
                                boneIndices.y,
                                boneIndices.z,
                                boneIndices.w
                            );
                            weightsBuffer.setXYZW(
                                newIndex,
                                boneWeights.x,
                                boneWeights.y,
                                boneWeights.z,
                                boneWeights.w
                            );
                        });
                    }
                }

                geometry.setAttribute('skinIndex', indicesBuffer);
                geometry.setAttribute('skinWeight', weightsBuffer);
            }

            // Debug: Log groups and materials
            
            

            meshes.push({ geometry, materials });
        });

        // Process atomics and create skeleton hierarchy
        clump.RWAtomicList.forEach((atomic) => {
            const meshData = meshes[atomic.geometryIndex];
            if (!meshData) return;

            const { geometry, materials } = meshData;
            const nodelist = new Array(clump.RWFrameList.length);
            let nodeInfo = null;
            let parentNode = null;

            // Build bone hierarchy
            clump.RWFrameList.forEach((frame, i) => {
                const rwFrame = frame.RWFrame;
                const bone = new THREE.Bone();
                bone.name = frame.RWExtension?.CHUNK_FRAME || `bone_${i}`;

                const transform = new THREE.Matrix4();
                transform.set(
                    rwFrame.rotationMatrix[0], rwFrame.rotationMatrix[3], rwFrame.rotationMatrix[6], rwFrame.position[0],
                    rwFrame.rotationMatrix[1], rwFrame.rotationMatrix[4], rwFrame.rotationMatrix[7], rwFrame.position[1],
                    rwFrame.rotationMatrix[2], rwFrame.rotationMatrix[5], rwFrame.rotationMatrix[8], rwFrame.position[2],
                    0, 0, 0, 1
                );

                bone.applyMatrix4(transform);

                if (rwFrame.parentIndex >= 0 && nodelist[rwFrame.parentIndex]) {
                    nodelist[rwFrame.parentIndex].add(bone);
                }

                const hAnim = frame.RWExtension?.CHUNK_HANIM;
                if (hAnim) {
                    bone.userData.nodeId = hAnim.nodeId;
                    bone.userData.nodeIndex = i;

                    if (hAnim.numNodes > 0) {
                        parentNode = bone;
                        nodeInfo = hAnim.nodes.map((node, idx) => ({
                            id: node.nodeId,
                            index: idx,
                            flags: node.flags,
                            frame: null
                        }));
                    }
                }

                nodelist[i] = bone;
            });

            // Create skeleton if animation data exists
            if (nodeInfo) {
                const bones = new Array(nodeInfo.length);

                const findUnattachedById = (node, id, visited = new Set()) => {
                    if (!node || visited.has(node)) return null;
                    visited.add(node);

                    if (node.userData.nodeId >= 0 && node.userData.nodeId === id && getIndex(node) === -1) {
                        return node;
                    }

                    for (const child of node.children) {
                        const found = findUnattachedById(child, id, visited);
                        if (found) return found;
                    }

                    const nextIndex = node.userData.nodeIndex + 1;
                    if (nextIndex < nodelist.length) {
                        return findUnattachedById(nodelist[nextIndex], id, visited);
                    }

                    return null;
                };

                const getIndex = (node) => {
                    for (let i = 0; i < nodeInfo.length; i++) {
                        if (nodeInfo[i].node === node) return i;
                    }
                    return -1;
                };

                for (let i = 0; i < nodeInfo.length; i++) {
                    nodeInfo[i].node = findUnattachedById(parentNode, nodeInfo[i].id);
                    bones[i] = nodeInfo[i].node;
                }

                if (bones.every(b => b !== null)) {
                    meshData.skeleton = new THREE.Skeleton(bones);
                }
            }
        });

        // Create final meshes
        meshes.forEach((meshData) => {
            let mesh;

            if (meshData.skeleton) {
                mesh = new THREE.SkinnedMesh(meshData.geometry, meshData.materials);
                mesh.add(meshData.skeleton.bones[0]);
                mesh.bind(meshData.skeleton);
            } else {
                mesh = new THREE.Mesh(meshData.geometry, meshData.materials);
            }

            // Apply RenderWare to Three.js coordinate system transformation
            mesh.rotation.set(-Math.PI / 2, 0, Math.PI);

            group.add(mesh);
        });

        return group;
    }
}

export { DFFLoader };
export default DFFLoader;
