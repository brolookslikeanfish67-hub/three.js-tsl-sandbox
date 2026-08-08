import GUI from 'lil-gui'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { 
    dot, cos, float, min, timerLocal, atan2, uniform, pass, bloom, 
    PI, PI2, color, positionLocal, rangeFog, sin, texture, tslFn, 
    uv, vec2, vec3, vec4, attribute, instanceIndex, modelInstanceMatrix 
} from 'three/webgpu'
import gridMaterial from './GridMaterial'
import Stats from 'stats-gl'

/**
 * Setup & Canvas
 */
const INSTANCE_COUNT = 50
const gui = new GUI({ width: 350 })
const canvas = document.querySelector('canvas.webgl')

const scene = new THREE.Scene()
scene.fogNode = rangeFog(color('#171617'), 5, 45)

/**
 * Textures
 */
const textureLoader = new THREE.TextureLoader()
const perlinTexture = textureLoader.load('./perlinTexture.png')
perlinTexture.wrapS = THREE.RepeatWrapping
perlinTexture.wrapT = THREE.RepeatWrapping

/**
 * Stats
 */
const stats = new Stats({ logsPerSecond: 20, precision: 2, horizontal: true, mode: 2 })
document.body.appendChild(stats.dom)

/**
 * Instanced Attributes Setup
 */
const strengthArray = new Float32Array(INSTANCE_COUNT)
const offsetArray = new Float32Array(INSTANCE_COUNT)
const amplitudeArray = new Float32Array(INSTANCE_COUNT)
const speedArray = new Float32Array(INSTANCE_COUNT)
const colorArray = new Float32Array(INSTANCE_COUNT * 3)

const dummyColor = new THREE.Color()
const palette = ['#ff8b4d', '#4d9eff', '#ff4d6d', '#4dffaa', '#ffd04d']

for (let i = 0; i < INSTANCE_COUNT; i++) {
    strengthArray[i] = 0.5 + Math.random() * 1.0
    offsetArray[i] = 0.1 + Math.random() * 0.4
    amplitudeArray[i] = 0.1 + Math.random() * 0.25
    speedArray[i] = 0.1 + Math.random() * 0.2

    dummyColor.set(palette[Math.floor(Math.random() * palette.length)])
    dummyColor.toArray(colorArray, i * 3)
}

// Instanced Geometry Attributes
const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 20, 20, true)
cylinderGeometry.translate(0, 0.5, 0)

cylinderGeometry.setAttribute('aParabolStrength', new THREE.InstancedBufferAttribute(strengthArray, 1))
cylinderGeometry.setAttribute('aParabolOffset', new THREE.InstancedBufferAttribute(offsetArray, 1))
cylinderGeometry.setAttribute('aParabolAmplitude', new THREE.InstancedBufferAttribute(amplitudeArray, 1))
cylinderGeometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(speedArray, 1))
cylinderGeometry.setAttribute('aEmissiveColor', new THREE.InstancedBufferAttribute(colorArray, 3))

// TSL Attribute Nodes
const parabolStrengthNode = attribute('aParabolStrength', 'float')
const parabolOffsetNode = attribute('aParabolOffset', 'float')
const parabolAmplitudeNode = attribute('aParabolAmplitude', 'float')
const speedNode = attribute('aSpeed', 'float')
const instanceColorNode = attribute('aEmissiveColor', 'vec3')

/**
 * TSL Shader Logic
 */
const toSkewedUv = tslFn(([uv, skew]) => vec2(
    uv.x.add(uv.y.mul(skew.x)),
    uv.y.add(uv.x.mul(skew.y))
))

const twistedCylinder = tslFn(([position]) => {
    // Transform position through the instance matrix first
    const worldPosition = modelInstanceMatrix.mul(vec4(position, 1.0)).xyz
    
    const angle = atan2(worldPosition.z, worldPosition.x)
    const elevation = worldPosition.y
    const time = timerLocal().mul(speedNode)

    const radius = parabolStrengthNode.mul(elevation.sub(parabolOffsetNode)).pow(2).add(parabolAmplitudeNode)
    const turbulence = sin(elevation.sub(time).mul(20).add(angle.mul(2))).mul(0.05)
    radius.addAssign(turbulence)

    return vec3(
        cos(angle).mul(radius).add(worldPosition.x),
        elevation,
        sin(angle).mul(radius).add(worldPosition.z)
    )
})

const luminance = tslFn(([c]) => dot(c, vec3(0.2126, 0.7152, 0.0722)))

const calculateNoiseLayers = tslFn(([timeOffset, channel1, channel2, scale1, scale2]) => {
    const time = timerLocal().mul(speedNode).add(timeOffset)

    const noise1Uv = uv().add(vec2(time, time.negate())).toVar()
    noise1Uv.assign(toSkewedUv(noise1Uv, vec2(-1, 0)))
    noise1Uv.mulAssign(scale1)
    const noise1 = texture(perlinTexture, noise1Uv, 1)[channel1]().remap(0.45, 0.7)

    const noise2Uv = uv().add(vec2(time.mul(0.5), time.negate())).toVar()
    noise2Uv.assign(toSkewedUv(noise2Uv, vec2(-1, 0)))
    noise2Uv.mulAssign(scale2)
    const noise2 = texture(perlinTexture, noise2Uv, 1)[channel2]().remap(0.45, 0.7)

    return noise1.mul(noise2)
})

/**
 * Unified Material Output Node
 */
const unifiedTornadoMaterial = new THREE.MeshBasicNodeMaterial({ 
    transparent: true, 
    side: THREE.DoubleSide 
})

unifiedTornadoMaterial.positionNode = twistedCylinder(positionLocal)

unifiedTornadoMaterial.outputNode = tslFn(() => {
    // Emissive noise layer
    const emissiveNoise = calculateNoiseLayers(0, 'r', 'g', vec2(2, 0.25), vec2(5, 1))
    const emissiveFade = min(uv().y.smoothstep(0, 0.1), uv().y.smoothstep(1, 0.6))
    const emissiveAlpha = emissiveNoise.mul(emissiveFade).smoothstep(0, 0.1)

    // Dark noise layer
    const darkNoise = calculateNoiseLayers(123.4, 'g', 'b', vec2(2, 0.25), vec2(5, 1))
    const darkFade = min(uv().y.smoothstep(0, 0.2), uv().y.smoothstep(1, 0.6))
    const darkAlpha = darkNoise.mul(darkFade).smoothstep(0, 0.01)

    // Combine emissive and dark layers in a single pass
    const luma = luminance(instanceColorNode)
    const brightColor = instanceColorNode.mul(1.2).div(luma)
    
    // Blend layers: dark layer cuts over the emissive layer
    const finalColor = brightColor.mul(float(1.0).sub(darkAlpha))
    const finalAlpha = max(emissiveAlpha, darkAlpha)

    return vec4(finalColor, finalAlpha)
})()

/**
 * Instanced Mesh Creation & Positioning
 */
const tornadoInstancedMesh = new THREE.InstancedMesh(cylinderGeometry, unifiedTornadoMaterial, INSTANCE_COUNT)
const dummy = new THREE.Object3D()

// Scatter tornadoes across a grid field
const gridSize = Math.ceil(Math.sqrt(INSTANCE_COUNT))
const spacing = 4

for (let i = 0; i < INSTANCE_COUNT; i++) {
    const row = Math.floor(i / gridSize)
    const col = i % gridSize

    dummy.position.set(
        (col - gridSize / 2) * spacing + (Math.random() - 0.5) * 1.5,
        0,
        (row - gridSize / 2) * spacing + (Math.random() - 0.5) * 1.5
    )
    
    const scaleY = 1.5 + Math.random() * 2.0
    const scaleXZ = 0.8 + Math.random() * 0.6
    dummy.scale.set(scaleXZ, scaleY, scaleXZ)
    dummy.rotation.y = Math.random() * Math.PI * 2
    dummy.updateMatrix()

    tornadoInstancedMesh.setMatrixAt(i, dummy.matrix)
}

tornadoInstancedMesh.instanceMatrix.needsUpdate = true
scene.add(tornadoInstancedMesh)

/**
 * Grid & Camera Setup
 */
const grid = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), gridMaterial)
grid.rotation.x = -Math.PI * 0.5
scene.add(grid)

const sizes = { width: window.innerWidth, height: window.innerHeight }
const camera = new THREE.PerspectiveCamera(35, sizes.width / sizes.height, 0.1, 150)
camera.position.set(12, 12, 25)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.target.set(0, 2, 0)
controls.enableDamping = true

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
renderer.setSize(sizes.width, sizes.height)
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setClearColor('#171617')

window.addEventListener('resize', () => {
    sizes.width = window.innerWidth
    sizes.height = window.innerHeight
    camera.aspect = sizes.width / sizes.height
    camera.updateProjectionMatrix()
    renderer.setSize(sizes.width, sizes.height)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
})

/**
 * Post Processing
 */
const postProcessing = new THREE.PostProcessing(renderer)
const scenePass = pass(scene, camera)
const scenePassColor = scenePass.getTextureNode('output')
const bloomPass = bloom(scenePassColor, 0.8, 0.2, 0.8)

postProcessing.outputNode = scenePassColor.add(bloomPass)

/**
 * Render Loop
 */
renderer.setAnimationLoop(() => {
    stats.begin()
    controls.update()
    postProcessing.renderAsync()
    stats.end()
})
