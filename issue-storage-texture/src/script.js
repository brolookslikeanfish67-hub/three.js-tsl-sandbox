import * as THREE from 'three/webgpu'
import { positionLocal, vec4, output, Fn, textureStore, uvec2, instanceIndex, textureLoad, storageTexture } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.webgl')

// Scene
const scene = new THREE.Scene()

/**
 * Sizes
 */
const sizes = {
    width: window.innerWidth,
    height: window.innerHeight
}

window.addEventListener('resize', () =>
{
    // Update sizes
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight

    // Update camera
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()

    // Update renderer
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Camera
 */
// Base camera
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 100)
camera.position.set(4, 2, 5)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    antialias: true
})
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor('#000000')
await renderer.init()

/**
 * Storage texture
 */
const resolution = 32
const theTexture = new THREE.StorageTexture(resolution, resolution)
const indexUV = uvec2(instanceIndex.mod(resolution), instanceIndex.div(resolution))

// Storing the UV in theTexture with textureStore() -> no problem
const computeTextureA = Fn(() =>
{
    const textureUV = indexUV.toVec2().div(resolution)
    textureStore(theTexture, indexUV, vec4(textureUV, 1, 1)).toReadWrite()
})().compute(resolution * resolution)
renderer.compute(computeTextureA)

// // Sampling theTexture with textureLoad() on a storageTexture() -> no problem
// const theTextureStorage = storageTexture(theTexture).setAccess(THREE.NodeAccess.READ_WRITE)
// const computeTextureC = Fn(() =>
// {
//     const color = textureLoad(theTextureStorage, indexUV).toReadWrite()
//     color.b.assign(0)
//     textureStore(theTextureStorage, indexUV, color).toReadWrite()
// })().compute(resolution * resolution)
// renderer.compute(computeTextureC)

// Sampling theTexture with textureLoad() -> error
const computeTextureB = Fn(() =>
{
    const color = textureLoad(theTexture, indexUV)// .toReadWrite()
    textureStore(theTexture, indexUV, color).toReadWrite()
})().compute(resolution * resolution)
renderer.compute(computeTextureB)

/**
 * Dummy
 */
const dummy = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshBasicNodeMaterial({ map: theTexture })
)
scene.add(dummy)

/**
 * Animate
 */
const tick = () =>
{
    // Update controls
    controls.update()

    // Render
    renderer.render(scene, camera)
}

renderer.setAnimationLoop(tick)
