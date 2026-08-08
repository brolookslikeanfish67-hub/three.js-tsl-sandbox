import GUI from 'lil-gui'
import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { 
    dot, cos, float, min, timerLocal, atan2, uniform, pass, bloom, 
    PI, PI2, color, positionLocal, rangeFog, sin, texture, tslFn, 
    uv, vec2, vec3, vec4 
} from 'three/webgpu'
import gridMaterial from './GridMaterial'
import Stats from 'stats-gl'

/**
 * Setup & Canvas
 */
const gui = new GUI({ width: 350 })
const canvas = document.querySelector('canvas.webgl')

const scene = new THREE.Scene()
scene.fogNode = rangeFog(color('#171617'), 2, 15)

/**
 * Loaders & Textures
 */
const textureLoader = new THREE.TextureLoader()

const loadTexture = (path, colorSpace = null) => {
    const tex = textureLoader.load(path)
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.RepeatWrapping
    if (colorSpace) tex.colorSpace = colorSpace
    return tex
}

const perlinTexture = loadTexture('./perlinTexture.png')
const uvCheckerTexture = loadTexture('./uvCheckerByValle.jpg', THREE.SRGBColorSpace)

/**
 * Stats
 */
const stats = new Stats({
    logsPerSecond: 20, 
    samplesLog: 100, 
    samplesGraph: 10, 
    precision: 2, 
    horizontal: true,
    minimal: false, 
    mode: 2
})
document.body.appendChild(stats.dom)

/**
 * TSL Helper Functions
 */
const toRadialUv = tslFn(([uv, multiplier, rotation, offset]) => {
    const centeredUv = uv.sub(0.5).toVar()
    const distanceToCenter = centeredUv.length()
    const angle = atan2(centeredUv.y, centeredUv.x)
    const radialUv = vec2(angle.add(PI).div(PI2), distanceToCenter).toVar()
    
    radialUv.mulAssign(multiplier)
    radialUv.x.addAssign(rotation)
    radialUv.y.addAssign(offset)

    return radialUv
})

const toSkewedUv = tslFn(([uv, skew]) => {
    return vec2(
        uv.x.add(uv.y.mul(skew.x)),
        uv.y.add(uv.x.mul(skew.y))
    )
})

const twistedCylinder = tslFn(([position, parabolStrength, parabolOffset, parabolAmplitude, time]) => {
    const angle = atan2(position.z, position.x)
    const elevation = position.y

    const radius = parabolStrength.mul(position.y.sub(parabolOffset)).pow(2).add(parabolAmplitude)
    const turbulence = sin(elevation.sub(time).mul(20).add(angle.mul(2))).mul(0.05)
    radius.addAssign(turbulence)

    return vec3(
        cos(angle).mul(radius),
        elevation,
        sin(angle).mul(radius)
    )
})

const luminance = tslFn(([color]) => {
    return dot(color, vec3(0.2126, 0.7152, 0.0722))
})

// Reusable noise combiner to DRY up material node calculations
const calculateNoiseLayers = tslFn(([timeOffset, channel1, channel2, scale1, scale2]) => {
    const time = timerLocal().mul(timeScale).add(timeOffset)

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
 * Uniforms & Geometries
 */
const emissiveColor = uniform(color('#ff8b4d'))
const timeScale = uniform(0.15)
const parabolStrength = uniform(1)
const parabolOffset = uniform(0.3)
const parabolAmplitude = uniform(0.2)

const cylinderGeometry = new THREE.CylinderGeometry(1, 1, 1, 20, 20, true)
cylinderGeometry.translate(0, 0.5, 0)

const planeGeometry = new THREE.PlaneGeometry(1, 1)

/**
 * Tornado Floor
 */
const floorMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true })
floorMaterial.outputNode = tslFn(() => {
    const time = timerLocal().mul(timeScale)

    const noise1Uv = toRadialUv(uv(), vec2(0.5, 0.5), time, time)
    noise1Uv.assign(toSkewedUv(noise1Uv, vec2(-1, 0)))
    noise1Uv.mulAssign(vec2(4, 1))
    const noise1 = texture(perlinTexture, noise1Uv, 1).r.remap(0.45, 0.7)

    const noise2Uv = toRadialUv(uv(), vec2(2, 8), time.mul(2), time.mul(8))
    noise2Uv.assign(toSkewedUv(noise2Uv, vec2(-0.25, 0)))
    noise2Uv.mulAssign(vec2(2, 0.25))
    const noise2 = texture(perlinTexture, noise2Uv, 1).b.remap(0.45, 0.7)

    const distanceToCenter = uv().sub(0.5).toVar()
    const outerFade = min(
        distanceToCenter.length().smoothstep(0.5, 0.1),
        distanceToCenter.length().smoothstep(0, 0.2)
    )

    const effect = noise1.mul(noise2).mul(outerFade).toVar()

    return vec4(
        emissiveColor.mul(float(0.2).step(effect)).mul(3),
        effect.smoothstep(0, 0.01)
    )
})()

const floor = new THREE.Mesh(planeGeometry, floorMaterial)
floor.scale.setScalar(2)
floor.position.y = 0.01
floor.rotation.x = -Math.PI * 0.5
scene.add(floor)

/**
 * Emissive Layer
 */
const emissiveMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide })
emissiveMaterial.positionNode = twistedCylinder(positionLocal, parabolStrength, parabolOffset, parabolAmplitude.sub(0.05), timerLocal().mul(timeScale))

emissiveMaterial.outputNode = tslFn(() => {
    const noise = calculateNoiseLayers(0, 'r', 'g', vec2(2, 0.25), vec2(5, 1))
    const outerFade = min(uv().y.smoothstep(0, 0.1), uv().y.smoothstep(1, 0.6))
    const effect = noise.mul(outerFade)
    const emissiveLuminance = luminance(emissiveColor)

    return vec4(
        emissiveColor.mul(1.2).div(emissiveLuminance),
        effect.smoothstep(0, 0.1)
    )
})()

const emissive = new THREE.Mesh(cylinderGeometry, emissiveMaterial)
scene.add(emissive)

/**
 * Dark Layer
 */
const darkMaterial = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide })
darkMaterial.positionNode = twistedCylinder(positionLocal, parabolStrength, parabolOffset, parabolAmplitude, timerLocal().mul(timeScale))

darkMaterial.outputNode = tslFn(() => {
    const noise = calculateNoiseLayers(123.4, 'g', 'b', vec2(2, 0.25), vec2(5, 1))
    const outerFade = min(uv().y.smoothstep(0, 0.2), uv().y.smoothstep(1, 0.6))
    const effect = noise.mul(outerFade)

    return vec4(vec3(0), effect.smoothstep(0, 0.01))
})()

const dark = new THREE.Mesh(cylinderGeometry, darkMaterial)
scene.add(dark)

/**
 * Floor Grid
 */
const grid = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), gridMaterial)
grid.rotation.x = -Math.PI * 0.5
scene.add(grid)

/**
 * Screen / Camera / Renderer
 */
const sizes = { width: window.innerWidth, height: window.innerHeight }

const camera = new THREE.PerspectiveCamera(25, sizes.width / sizes.height, 0.1, 100)
camera.position.set(1, 1, 3)
scene.add(camera)

const controls = new OrbitControls(camera, canvas)
controls.target.y = 0.4
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
const bloomPass = bloom(scenePassColor, 1, 0.1, 1)

postProcessing.outputNode = scenePassColor.add(bloomPass)

/**
 * GUI Integration
 */
const tornadoGui = gui.addFolder('Tornado Settings')
tornadoGui.addColor({ color: emissiveColor.value.getHexString(THREE.SRGBColorSpace) }, 'color')
    .name('Color')
    .onChange(v => emissiveColor.value.set(v))
tornadoGui.add(timeScale, 'value', -1, 1, 0.01).name('Time Scale')
tornadoGui.add(parabolStrength, 'value', 0, 2, 0.01).name('Parabola Strength')
tornadoGui.add(parabolOffset, 'value', 0, 1, 0.01).name('Parabola Offset')
tornadoGui.add(parabolAmplitude, 'value', 0, 2, 0.01).name('Parabola Amplitude')

const bloomGui = gui.addFolder('Bloom Settings')
bloomGui.add(bloomPass.strength, 'value', 0, 10, 0.01).name('Strength')
bloomGui.add(bloomPass.radius, 'value', 0, 1, 0.01).name('Radius')
bloomGui.add(bloomPass.threshold, 'value', 0, 1, 0.01).name('Threshold')

/**
 * Animation Loop
 */
renderer.setAnimationLoop(() => {
    stats.begin()
    controls.update()
    postProcessing.renderAsync()
    stats.end()
})
