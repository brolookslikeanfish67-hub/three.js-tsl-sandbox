import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { SkyMesh } from 'three/addons/objects/SkyMesh.js'
import { GLTFLoader } from 'three/examples/jsm/Addons.js'
import { Inspector } from 'three/addons/inspector/Inspector.js'
import { color, convertToTexture, Fn, mrt, normalWorld, output, packNormalToRGB, pass, positionWorld, renderOutput, texture, time, uniform, uv, vec2, vec3, vec4 } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'
import { chromaticAberration } from 'three/addons/tsl/display/chromaticAberrationNode.js'
import { pixelationPass } from 'three/addons/tsl/display/PixelationPassNode.js'
import { sobel } from 'three/addons/tsl/display/SobelOperatorNode.js'
import { fxaa } from 'three/addons/tsl/display/FXAANode.js'

/**
 * Base
 */
// Canvas
const canvas = document.querySelector('canvas.threejs')

// Scene
const scene = new THREE.Scene()

// Loaders
const textureLoader = new THREE.TextureLoader()
const gltfLoader = new GLTFLoader()

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
camera.position.set(5, 2.5, 2.5)
scene.add(camera)

// Controls
const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 1.25, 0)
controls.enableDamping = true

/**
 * Renderer
 */
const renderer = new THREE.WebGPURenderer({
    canvas: canvas,
    antialias: false
})
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFShadowMap
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor(0x111111)
renderer.inspector = new Inspector()

/**
 * Post processing
 */
const renderPipeline = new THREE.RenderPipeline(renderer)
renderPipeline.outputColorTransform = false

// Scene pass
const scenePass = pass(scene, camera)
scenePass.setMRT(mrt({
    output: output,
    normal: normalWorld
}))
// renderPipeline.outputNode = scenePass.getTextureNode('output') // Doesn't work
renderPipeline.outputNode = scenePass.getTextureNode('normal') // Works

// Bloom pass
const bloomPass = bloom(renderPipeline.outputNode)
bloomPass.threshold.value = 0.25
bloomPass.strength.value = 1
renderPipeline.outputNode = renderPipeline.outputNode.add(bloomPass)

// Color transform pass
renderPipeline.outputNode = renderOutput(renderPipeline.outputNode)

// FXAA pass
const fxaaPass = fxaa(renderPipeline.outputNode)
renderPipeline.outputNode = fxaaPass

/**
 * Floor
 */
{
    const texture = textureLoader.load('./floor-color.jpg')
    texture.colorSpace = THREE.SRGBColorSpace
    const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(10, 10),
        new THREE.MeshStandardNodeMaterial({ map: texture, transparent: true })
    )
    mesh.material.opacityNode = uv().sub(0.5).length().smoothstep(0.5, 0.2)
    mesh.material.mrtNode = mrt({
        output: output,
        normal: vec4(1)
    })
    // mesh.material.colorNode = vec3(uv().x.mul(10).fract().step(0.5))
    mesh.rotation.x = - Math.PI * 0.5
    mesh.receiveShadow = true
    scene.add(mesh)
}

/**
 * Model
 */
const model = await gltfLoader.loadAsync('./anvil.glb')
model.scene.traverse(child =>
{
    if(child.isMesh)
    {
        child.material.side = THREE.FrontSide
        child.material.shadowSide = THREE.FrontSide
        child.castShadow = true
        child.receiveShadow = true
    }
})
model.scene.position.y = 0.001
scene.add(model.scene)

/**
 * Lights
 */
const directionalLight = new THREE.DirectionalLight(0xffffff, 3)
directionalLight.castShadow = true
directionalLight.position.set(2, 1, -0.75).normalize().multiplyScalar(10)
directionalLight.shadow.camera.near = 0.01
directionalLight.shadow.camera.far = 30
directionalLight.shadow.radius = 5
directionalLight.shadow.normalBias = 0.1
directionalLight.shadow.side
scene.add(directionalLight)

const ambientLight = new THREE.AmbientLight(0x859dff, 0.75)
scene.add(ambientLight)

/**
 * Animate
 */
const tick = () =>
{
    // Update controls
    controls.update()

    // Render
    // renderer.render(scene, camera)
    renderPipeline.render()
}

renderer.setAnimationLoop(tick)
