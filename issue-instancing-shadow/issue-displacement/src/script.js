import GUI from 'lil-gui'
import * as THREE from 'three/webgpu'
import { sin, positionLocal, time, vec2, vec3, vec4, uv, uniform, color, fog, rangeFogFactor, pass, renderOutput, Fn, instanceIndex, float, instance } from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js';

/**
 * Base
 */
// Debug
const gui = new GUI({
    width: 400
})

const textureLoader = new THREE.TextureLoader()

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
const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
camera.position.x = 6
camera.position.y = 3
camera.position.z = 10
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    forceWebGL: false
})
renderer.shadowMap.enabled = true
// renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x000000)

/**
 * Object
 */
{
    const displacementTexture = textureLoader.load('./test.png')

    const geometry = new THREE.SphereGeometry(1, 32, 32)
    const material = new THREE.MeshStandardNodeMaterial({
        displacementMap: displacementTexture
    })
    
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.y = 2
    mesh.castShadow = true
    mesh.receiveShadow = true
    scene.add(mesh)
}

/**
 * Floor
 */
{
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshStandardNodeMaterial())
    floor.rotation.x = - Math.PI * 0.5
    floor.receiveShadow = true
    scene.add(floor)
}

/**
 * Lights
 */
{
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(2, 4, 0)
    directionalLight.castShadow = true
    directionalLight.shadow.radius = 2
    scene.add(directionalLight)
}

/**
 * Animate
 */
const timer = new THREE.Timer()
const tick = () =>
{
    timer.update()

    // Update controls
    controls.update()

    // // Mesh
    // mesh.position.y = (Math.sin(timer.getElapsed()) + 1)

    // Render
    renderer.render(scene, camera)
}
renderer.setAnimationLoop(tick)