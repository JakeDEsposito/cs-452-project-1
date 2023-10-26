import { Scene, WebGLRenderer, LineLoop, LineBasicMaterial, BufferGeometry, Vector2, Vector3, Clock, MathUtils, Euler, Line, OrthographicCamera, Object3D, BufferAttribute, TextureLoader, RepeatWrapping } from "three"

import WebGL from "three/addons/capabilities/WebGL.js"

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { FilmShader } from "./shaders/FilmShader.js"
import { BadTVShader } from "./shaders/BadTVShader.js"
import { StaticShader } from "./shaders/StaticShader.js"

import { Howl, Howler } from "howler"

import { getGPUTier } from "detect-gpu"

const gpuTier = await getGPUTier()

Howler.volume(0.4)

const { randFloat, randInt, clamp } = MathUtils

Array.prototype.random = function () {
    return this[randInt(0, this.length - 1)]
}

let allowGameRestart = true

const s_gameover = new Howl({
    src: "audio/Undertale_OST-Determination.mp3"
})

const s_explosionCrunchs = Array.from({ length: 5 }).map((_, i) => `audio/explosionCrunch_00${i}.ogg`).map(src => new Howl({
    src, onend: () => {
        s_gameover.play()
        setTimeout(() => allowGameRestart = true, 5500)
        document.getElementById("gameover").style.display = ""
        document.getElementById("gameui").style.display = "none"
    }
}))

const s_impactMetals = Array.from({ length: 5 }).map((_, i) => `audio/impactMetal_00${i}.ogg`).map(src => new Howl({ src, volume: 1.6 }))

const s_forceFields = Array.from({ length: 5 }).map((_, i) => `audio/forceField_00${i}.ogg`).map(src => new Howl({ src, volume: 1.4 }))

const s_laserRetros = Array.from({ length: 5 }).map((_, i) => `audio/laserRetro_00${i}.ogg`).map(src => new Howl({ src, volume: 0.4 }))

const s_lowFrequencyExplosions = Array.from({ length: 2 }).map((_, i) => `audio/lowFrequency_explosion_00${i}.ogg`).map(src => new Howl({ src, volume: 2 }))

const s_spaceEngineLow = new Howl({
    src: "audio/spaceEngineLow_000.ogg",
    loop: true,
    volume: 0.5,
})
s_spaceEngineLow.rate(0)

import { init, World, RigidBodyDesc, ColliderDesc } from "@dimforge/rapier2d"

await init()

/**
 * @author https://discourse.threejs.org/t/getobject-by-any-custom-property-present-in-userdata-of-object/3378/2#post_2
 * Modified by @JakeDEsposito
 */
Object3D.prototype.getObjectsByUserDataProperty = function (name, value) {
    if (this.userData[name] === value)
        return this

    const objects = []

    for (var i = 0, l = this.children.length; i < l; i++) {
        var child = this.children[i]
        var object = child.getObjectsByUserDataProperty(name, value)

        if (object !== undefined && object.length !== 0) {
            objects.push(object)
        }
    }

    return objects
}

Object3D.prototype.getObjectsByUserDataName = function (name) {
    if (this.userData[name] !== undefined)
        return this

    const objects = []

    for (let i = 0, l = this.children.length; i < l; i++) {
        const child = this.children[i]
        const object = child.getObjectsByUserDataName(name)

        if (object !== undefined && object.length !== 0)
            objects.push(object)
    }

    return objects
}

const canvas = document.getElementById("canvas")

canvas.width = document.body.clientWidth
canvas.height = document.body.clientHeight

const zoom = 0.5
const width = canvas.clientWidth / 640 * 10 / zoom, height = canvas.clientHeight / 640 * 10 / zoom

const scene = new Scene()

// BUG: Due to performance issues, painting takes a log time on lower end systems.
// Removing the background seems to fix some of those issues.
// FIXME: I would like to bring back the background and get rid of the performance overheads it comes with.
if (gpuTier.tier > 1) {
    scene.background = new TextureLoader().load("textures/space.png")
    scene.background.wrapS = scene.background.wrapT = RepeatWrapping

    const aspectRatio = width / height
    scene.background.repeat.set(1 / zoom * aspectRatio, 1 / zoom)
}

const camera = new OrthographicCamera(-width, width, height, -height, 0)

camera.frustumCulled = false
camera.updateProjectionMatrix()

const renderer = new WebGLRenderer({ canvas, alpha: true })
renderer.setSize(canvas.clientWidth, canvas.clientHeight)

const composer = new EffectComposer(renderer)

const renderPass = new RenderPass(scene, camera)
composer.addPass(renderPass)

const FilmPass = new ShaderPass(FilmShader)
composer.addPass(FilmPass)

FilmPass.uniforms.grayscale.value = 0
FilmPass.uniforms["sCount"].value = 800
FilmPass.uniforms["sIntensity"].value = 1.2
FilmPass.uniforms["nIntensity"].value = 0.4

const BadTVPass = new ShaderPass(BadTVShader)
composer.addPass(BadTVPass)

BadTVPass.uniforms["distortion"].value = 0.4
BadTVPass.uniforms["distortion2"].value = .2
BadTVPass.uniforms["speed"].value = 0.06
BadTVPass.uniforms["rollSpeed"].value = 0

const StaticPass = new ShaderPass(StaticShader)
composer.addPass(StaticPass)

StaticPass.uniforms["amount"].value = 0.01
StaticPass.uniforms["size"].value = 4

const shipPoints = [
    new Vector3(0, 1),
    new Vector3(-.8, -1),
    new Vector3(-.3, -.6),
    new Vector3(.3, -.6),
    new Vector3(.8, -1),
]
const g_ship = new BufferGeometry().setFromPoints(shipPoints)

const m_green = new LineBasicMaterial({ color: 0x00ff00 })

camera.position.z = 1

/**
 * Handles key press events.
 * @author Jake D'Esposito
 */
class KeyHandler {
    /** @type {boolean | undefined} */
    #keysPressed = []

    constructor() {
        document.addEventListener("keydown", this.#handleKeys)
        document.addEventListener("keyup", this.#handleKeys)
    }

    /**
     * Handles the keydown and keyup events.
     * @param {KeyboardEvent} event Passthrough variables from event.
     */
    #handleKeys = ({ key, type }) => this.#keysPressed[key] = type === "keydown"

    /**
     * Is the given key pressed.
     * @param {KeyboardEvent["key"]} key The key that you want to see is pressed. Refer to KeyboardEvent key.
     * @returns {boolean} Is the key pressed.
     */
    isKeyPressed = (key) => !!this.#keysPressed[key]
}

const world = new World({ x: 0, y: 0 })

class Physical extends LineLoop {
    _collider;
    _rigidBody;

    _health = 3

    #damageGracePeriod = 5
    #invulnerable = false

    _isDisposed = false

    takeHit() {
        if (!this.#invulnerable) {
            this._health--

            if (this._health <= 0) {
                this.dispose()
            }

            this.#invulnerable = true
            setTimeout(() => {
                this.#invulnerable = false
            }, this.#damageGracePeriod * 1000)
        }

    }

    dispose() {
        this._isDisposed = true

        world.removeCollider(this._collider)
        world.removeRigidBody(this._rigidBody)
        scene.remove(this)
    }

    disposeSafe = (function () {
        let executed = false
        return function () {
            if (!executed) {
                executed = true
                if (!this._isDisposed)
                    this.dispose()
            }
        }
    })()
}

class ShipPart extends Physical {
    constructor(points, material) {
        super(
            new BufferGeometry().setFromPoints(points),
            material
        )

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())
        this._rigidBody.setAdditionalMass(0.01)
        this._rigidBody.setAngularDamping(0.1)

        this._collider = world.createCollider(
            ColliderDesc.segment(
                points[0],
                points[1]
            ),
            this._rigidBody
        )

        this.userData = {
            type: "shippart",
            rigidBodyHandle: this._rigidBody.handle,
            colliderHandle: this._collider.handle,
        }

        this._health = 999
    }

    #movement() {
        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this.rotation.z = this._rigidBody.rotation()
    }

    update() {
        this.#movement()
    }
}

class Ship extends Physical {
    #rotateSpeed = 4.5

    #canFire = true
    #fireCooldown = 0.2

    constructor(geometry, material) {
        super(geometry, material)

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())

        this._collider = world.createCollider(ColliderDesc.triangle(
            new Vector3(0, 1),
            new Vector3(-.8, -1),
            new Vector3(.8, -1)
        ), this._rigidBody)

        this.userData = {
            type: "ship",
            rigidBodyHandle: this._rigidBody.handle,
            colliderHandle: this._collider.handle,
        }
    }

    #movement(dt) {
        const { cos, sin } = Math

        if (keyHandler.isKeyPressed("w"))
            this._rigidBody.applyImpulse(new Vector2(-sin(this.rotation.z), cos(this.rotation.z)).multiplyScalar(0.6), true)

        this._rigidBody.setRotation(this._rigidBody.rotation() + (keyHandler.isKeyPressed("a") - keyHandler.isKeyPressed("d")) * this.#rotateSpeed * dt, true)

        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this.rotation.z = this._rigidBody.rotation()

        {
            const { x, y } = this._rigidBody.linvel()
            const length = new Vector2(x, y).length()
            s_spaceEngineLow.rate(clamp(length / 20, 0, 3))
        }
    }

    #fire() {
        const bullet = new Bullet(m_green)

        bullet._rigidBody.setRotation(this.rotation.z)
        bullet._rigidBody.setTranslation(this.position.clone().add(new Vector3(0, 1.2, 0).applyEuler(this.rotation)))

        bullet._rigidBody.setLinvel(this._rigidBody.linvel())

        // FIXME: Need to find a better way to apply the initial force to the bullet to get it going.
        bullet._rigidBody.addForce(new Vector2(-sin(this.rotation.z), cos(this.rotation.z)).multiplyScalar(Bullet.BULLET_SPEED))

        scene.add(bullet)

        s_laserRetros.random().play()
    }

    update(dt) {
        this.#movement(dt)

        // TODO: Consider adding cooldown to shooting so that it wont get abused.
        if (this.#canFire && keyHandler.isKeyPressed(" ")) {
            this.#fire()

            this.#canFire = false
            setTimeout(() => this.#canFire = true, this.#fireCooldown * 1000)
        }
    }

    takeHit() {
        const priorHealth = this._health

        const linvel = this._rigidBody.linvel()

        super.takeHit()

        if (priorHealth === this._health)
            s_forceFields.random().play()
        else if (this._health > 0) {
            s_impactMetals.random().play()

            // TODO: Change material to some sort of flashing material.
        }
        else {
            const resolution = shipPoints.length
            const angleStep = PI * 2 / resolution

            for (let i = 0; i < resolution; i++) {
                const points = i !== shipPoints.length - 1 ? [
                    shipPoints[i],
                    shipPoints[i + 1]
                ] : [
                    shipPoints[i],
                    shipPoints[0]
                ]

                const shippart = new ShipPart(
                    points,
                    this.material
                )

                shippart._rigidBody.setTranslation(this.position)
                shippart._rigidBody.setRotation(this.rotation.z)

                shippart._rigidBody.setLinvel(linvel)

                const theta = i * angleStep

                const force = new Vector2((cos(theta)), sin(theta)).multiplyScalar(1.2)

                shippart._rigidBody.applyImpulseAtPoint(force, this.position, true)

                scene.add(shippart)

                shippart.update()
            }

            s_explosionCrunchs.random().play()
            allowGameRestart = false
            s_spaceEngineLow.stop()
            gameOver = true
        }
    }
}

const { PI, cos, sin, sqrt, floor } = Math

const ASTEROIDS_BASE_COUNT = 10
let ASTEROIDS_CAP = ASTEROIDS_BASE_COUNT
setInterval(() => ASTEROIDS_CAP += floor(score / 10) + 1, 10 * 1000)

const MAX_ASTEROID_SIZE = 2
const ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_LOWER = sqrt(width * width + height * height) + MAX_ASTEROID_SIZE
const ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_UPPER = ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_LOWER * 1.5
const ASTEROIDS_MAX_DISTANCE_FROM_PLAYER = ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_LOWER * 3

class Asteroid extends Physical {
    #asteroidSize

    constructor(material, s = MAX_ASTEROID_SIZE) {
        const size = randInt(1, s)

        const { sin, cos, PI } = Math

        const resolution = 12

        const angleStep = PI * 2 / resolution

        const vertices = []

        for (let i = 0; i < resolution; i++) {
            const theta = i * angleStep
            const vertex = new Vector3((cos(theta)), sin(theta), 0)

            if (i % 3 === 0) {
                const e = new Euler(0, 0, theta)

                // x controls depth of crater.
                // y controls shift of crater.
                const v = new Vector3(randFloat(0.2, 0.5), randFloat(-0.4, 0.4), 0)

                vertex.sub(v.applyEuler(e))
            }

            vertices.push(vertex)
        }

        super(new BufferGeometry().setFromPoints(vertices), material)

        this.geometry.scale(size, size, size)

        this.#asteroidSize = size

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())
        this._rigidBody.setAdditionalMass(size)

        this._collider = world.createCollider(
            ColliderDesc.ball(size),
            this._rigidBody
        )

        this.userData = {
            type: "asteroid",
            rigidBodyHandle: this._rigidBody.handle,
            colliderHandle: this._collider.handle,
        }

        this._health = 1
    }

    #movement() {
        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this.rotation.z = this._rigidBody.rotation()
    }

    update(dt) {
        this.#movement()
    }

    getAsteroidSize = () => this.#asteroidSize

    takeHit() {
        s_lowFrequencyExplosions.random().play()

        if (this._health - 1 <= 0) {
            const size = this.#asteroidSize - 1

            if (size > 0) {
                const count = randInt(1, 3)
                const angleStep = PI * 2 / count

                for (let i = 0; i < count; i++) {
                    const theta = i * angleStep
                    const pos = new Vector3((cos(theta) * (size + 1)), sin(theta) * (size + 1), 0)

                    pos.add(this.position)

                    const e = new Euler(0, 0, theta)

                    const a = new Asteroid(this.material, size)

                    a._rigidBody.setTranslation(pos)

                    a._rigidBody.setLinvel(this._rigidBody.linvel())

                    a._rigidBody.addForce(new Vector3(randFloat(1, 10), 0, 0).applyEuler(e))

                    scene.add(a)

                    a.update()
                }
            }
        }

        super.takeHit()
    }
}

class Bullet extends Physical {
    #aliveFor = 4

    static BULLET_SPEED = 200

    constructor(material) {
        super(new BufferGeometry().setFromPoints([
            new Vector3(0, 0.8),
            new Vector3(),
        ]), material)

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())
        this._rigidBody.setAdditionalMass(1)

        this._collider = world.createCollider(
            ColliderDesc.segment(
                new Vector3(0, 0.8),
                new Vector3()
            ),
            this._rigidBody
        )
        this._collider.isSensor(true)

        this.userData = {
            type: "bullet",
            rigidBodyHandle: this._rigidBody.handle,
            colliderHandle: this._collider.handle,
        }

        this._health = 1

        setTimeout(() => {
            if (!this._isDisposed)
                this.disposeSafe()
        }, this.#aliveFor * 1000)
    }

    #movement() {
        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this.rotation.z = this._rigidBody.rotation()
    }

    update() {
        this.#movement()
    }
}

const keyHandler = new KeyHandler()

const clock = new Clock(true)

let ship;

let score = 0

const m_white = new LineBasicMaterial({ color: 0xffffff })
const ll_debug = new Line(new BufferGeometry(), m_white)
scene.add(ll_debug)

let gameOver = true

let isPaused = false
let previousPauseButtonState = false

const DEBUG = false
const POST_PROCESSING = gpuTier.tier > 1

setInterval(() => world.step(), world.integrationParameters.dt * 1000)

function animate() {
    requestAnimationFrame(animate)

    if (!previousPauseButtonState & keyHandler.isKeyPressed("Escape") & !gameOver)
        isPaused = !isPaused

    previousPauseButtonState = keyHandler.isKeyPressed("Escape")

    document.getElementById("pausedui").style.display = isPaused ? "" : "none"

    if (isPaused)
        return

    const dt = clock.getDelta()

    if (gameOver) {
        const objectsToUpdate = scene.getObjectsByUserDataName("type")

        for (const obj of objectsToUpdate) {
            obj.update()
        }

        if (allowGameRestart && keyHandler.isKeyPressed(" ")) {
            scene.getObjectsByUserDataName("type").forEach(obj => obj.disposeSafe())

            s_gameover.stop()

            document.getElementById("title").style.display = "none"
            document.getElementById("gameover").style.display = "none"
            document.getElementById("gameui").style.display = ""

            ship = new Ship(g_ship, m_green)
            scene.add(ship)

            s_spaceEngineLow.play()

            score = 0

            gameOver = false
        }
    }
    else {
        if (DEBUG) {
            const debugRender = world.debugRender()

            ll_debug.geometry.setAttribute("position", new BufferAttribute(debugRender.vertices, 2))
        }

        if (!ship._isDisposed)
            ship.update(dt)

        /** @type {Bullet[]} */
        const bullets = scene.getObjectsByUserDataProperty("type", "bullet")

        for (const bullet of bullets) {
            bullet.update()
        }

        /** @type {Asteroid[]} */
        const asteroids = scene.getObjectsByUserDataProperty("type", "asteroid")

        for (let i = 0; i < ASTEROIDS_CAP - asteroids.length; i++) {

            const theta = randFloat(0, PI * 2)

            const pos = ship.position.clone()

            const e = new Euler(0, 0, theta)

            pos.add(new Vector3(randFloat(ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_LOWER, ASTEROIDS_SPAWN_DISTANCE_FROM_PLAYER_UPPER), 0, 0).applyEuler(e))

            const a = new Asteroid(m_green)

            a._rigidBody.setTranslation(pos)

            a._rigidBody.addForce(new Vector3(randFloat(1, 10), randFloat(-5, 5), 0).applyEuler(e).multiplyScalar(-1))

            scene.add(a)

            a.update()
        }

        const objectsWithColliderHandle = scene.getObjectsByUserDataName("colliderHandle")

        for (const asteroid of asteroids) {
            if (asteroid._isDisposed)
                continue

            if (ship.position.distanceTo(asteroid.position) > ASTEROIDS_MAX_DISTANCE_FROM_PLAYER) {
                asteroid.disposeSafe()
                continue
            }

            asteroid.update(dt)

            world.contactsWith(asteroid._collider, ({ handle }) => {
                if (asteroid._isDisposed)
                    return

                const otherObj = objectsWithColliderHandle.find(({ userData: { colliderHandle } }) => colliderHandle === handle)

                if (otherObj.userData.type === "bullet") {
                    score++

                    if (!(score % 25)) {
                        ship._health++
                    }
                }

                if (!(otherObj.userData.type === "asteroid" | otherObj.userData.type === "shippart")) {
                    // BUG: For whatever reason, the other object needs to take the hit first. I have no clue why.
                    otherObj.takeHit()
                    asteroid.takeHit()
                }
            })
        }

        camera.position.copy(ship.position)
        camera.position.setZ(0.001)

        scene.background?.offset.copy(ship.position).divideScalar(50)

        const scoreString = new String(score)
        if (4 - scoreString.length >= 0)
            document.getElementById("score").textContent = "0".repeat(4 - scoreString.length) + scoreString
        else
            document.getElementById("score").textContent = scoreString

        document.getElementById("lives").textContent = "♡".repeat(ship._health)


    }

    // Rendering
    if (POST_PROCESSING) {
        FilmPass.uniforms["time"].value += dt
        BadTVPass.uniforms["time"].value += dt
        StaticPass.uniforms["time"].value += dt
        composer.render(dt)
    }
    else
        renderer.render(scene, camera)

}

if (WebGL.isWebGLAvailable()) {
    document.body.appendChild(renderer.domElement)

    document.getElementById("readytoplay").textContent = "Press Space to Play"

    animate()
}
else {
    document.body.appendChild(WebGL.getWebGLErrorMessage())
}