import { Scene, WebGLRenderer, LineLoop, LineBasicMaterial, BufferGeometry, Vector2, Vector3, Clock, MathUtils, Euler, Line, OrthographicCamera, Object3D, BufferAttribute, Vector4, LineDashedMaterial } from "three"

import WebGL from "three/addons/capabilities/WebGL.js"

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { FilmShader } from "./shaders/FilmShader.js"
import { BadTVShader } from "./shaders/BadTVShader.js"
import { StaticShader } from "./shaders/StaticShader.js"

import { Howl, Howler } from "howler"

Howler.volume(0.4)

// FIXME: Need to get this to play a random audio from the set of choices.
// const explosionCrunch = new Howl({
//     src: Array.from({length:5}).map((_,i) => `audio/explosionCrunch_00${i}.ogg`),
// })

// explosionCrunch.play()

// class MyHowl extends Howl {
//     constructor(args) {


//         super(args)
//     }

//     play()
// }

const { randFloat, randInt, clamp } = MathUtils

Array.prototype.random = function () {
    return this[randInt(0, this.length - 1)]
}

// TODO: Adjust volume for each

const s_explosionCrunchs = Array.from({ length: 5 }).map((_, i) => `audio/explosionCrunch_00${i}.ogg`).map(src => new Howl({ src }))

const s_impactMetals = Array.from({ length: 5 }).map((_, i) => `audio/impactMetal_00${i}.ogg`).map(src => new Howl({ src, volume: 1.6 }))

const s_laserRetros = Array.from({ length: 5 }).map((_, i) => `audio/laserRetro_00${i}.ogg`).map(src => new Howl({ src, volume: 0.8 }))

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

// TODO: Find good "zoom".
const zoom = 1
const width = canvas.clientWidth / 640 * 10 / zoom, height = canvas.clientHeight / 640 * 10 / zoom

const scene = new Scene()
const camera = new OrthographicCamera(-width, width, height, -height, 0)

camera.frustumCulled = false
camera.updateProjectionMatrix()

// FIXME: The canvas is not the same size as the window, causing the scroll bars to apear.
const renderer = new WebGLRenderer({ canvas })
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

BadTVPass.uniforms["distortion"].value = 2
BadTVPass.uniforms["distortion2"].value = 1.6
BadTVPass.uniforms["speed"].value = 0.06
BadTVPass.uniforms["rollSpeed"].value = 0

const StaticPass = new ShaderPass(StaticShader)
composer.addPass(StaticPass)

StaticPass.uniforms["amount"].value = 0.01
StaticPass.uniforms["size"].value = 4

const g_ship = new BufferGeometry().setFromPoints([
    new Vector3(0, 1),
    new Vector3(-.8, -1),
    new Vector3(-.3, -.6),
    new Vector3(.3, -.6),
    new Vector3(.8, -1),
])

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
        // TODO: Make flashing material to show that the object is invulnerable.
        // Or add force field sound effect.

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
}

class Ship extends Physical {
    #rotateSpeed = 3.5

    #canFire = true
    #fireCooldown = 0.2

    constructor(geometry, material) {
        super(geometry, material)

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())
        this._rigidBody.setAdditionalMass(0.1) // TODO: Adjust mass.

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
            this._rigidBody.applyImpulse(new Vector2(-sin(this.rotation.z), cos(this.rotation.z)).multiplyScalar(0.2))

        if (keyHandler.isKeyPressed("a"))
            this.rotation.z += this.#rotateSpeed * dt
        if (keyHandler.isKeyPressed("d"))
            this.rotation.z -= this.#rotateSpeed * dt

        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this._rigidBody.setRotation(this.rotation.z, true)

        {
            const { x, y } = this._rigidBody.linvel()
            const length = new Vector2(x, y).length()
            s_spaceEngineLow.rate(clamp(length / 10, 0, 3))
        }
    }

    #fire() {
        const bullet = new Bullet(m_green)

        bullet._rigidBody.setRotation(this.rotation.z)
        bullet._rigidBody.setTranslation(this.position.clone().add(new Vector3(0, 1, 0).applyEuler(this.rotation)))

        bullet._rigidBody.setLinvel(this._rigidBody.linvel())

        // FIXME: Need to find a better way to apply the initial force to the bullet to get it going.
        bullet._rigidBody.addForce(new Vector2(-sin(this.rotation.z), cos(this.rotation.z)).multiplyScalar(Bullet.BULLET_SPEED))

        scene.add(bullet)

        s_laserRetros.random().play()
    }

    update(dt) {
        this.#movement(dt)

        if (this.#canFire && keyHandler.isKeyPressed(" ")) {
            this.#fire()

            this.#canFire = false
            setTimeout(() => this.#canFire = true, this.#fireCooldown * 1000)
        }
    }

    takeHit() {
        super.takeHit()

        if (this._health > 0)
            s_impactMetals.random().play()
        else
            s_explosionCrunchs.random().play()
    }
}

const ASTEROIDS_CAP = 1//0
const ASTEROIDS_MAX_DISTANCE_FROM_PLAYER = 25

class Asteroid extends Physical {
    #asteroidSize

    constructor(material, s = 2) {
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
        this._rigidBody.setAdditionalMass(size) // TODO: Adjust mass.

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
            // TODO: Spawn new asteroids

            const size = this.#asteroidSize - 1

            if (size > 0) {
                const count = randInt(1, 3)//4)
                const angleStep = PI * 2 / count

                // BUG: Program crashes when objects spawn ontop of one another.
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

    // TODO: Make hit and kill system for asteroids.
    // The asteroids should split into 4 smaller asteroids that shoot out in 4 different directions when a big asteroid is killed.
    // Small asteroids just disapear when killed.
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
        this._rigidBody.setAdditionalMass(1) // TODO: Adjust mass.

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
            // BUG: This still causes crashes.
            if (!this._isDisposed)
                this.dispose()
        }, this.#aliveFor * 1000)
    }

    #movement() {
        const { x, y } = this._rigidBody.translation()
        this.position.set(x, y, 0)

        this.rotation.z = this._rigidBody.rotation()
    }

    update(dt) {
        this.#movement()
    }
}

const { PI, cos, sin } = Math

const keyHandler = new KeyHandler()

const clock = new Clock(true)

// let ship = new Ship(g_ship, m_green)
// scene.add(ship)

let ship;

let score = 0

//FIXME: DEBUG
const m_white = new LineBasicMaterial({ color: 0xffffff })
const ll_debug = new Line(new BufferGeometry(), m_white)
scene.add(ll_debug)

let gameOver = true

function animate() {

    requestAnimationFrame(animate)

    // TODO: Make a background for the game so that it is easier to tell how fast the player is moving.
    // Maybe something with stars would be nice.

    if (gameOver) {

        // TODO: Give a few seconds of pause before letting the player restart.
        if (keyHandler.isKeyPressed(" ")) {
            document.getElementById("title").style.display = "none"
            document.getElementById("gameover").style.display = "none"
            document.getElementById("gameui").style.display = ""

            ship = new Ship(g_ship, m_green)
            scene.add(ship)

            s_spaceEngineLow.play()

            score = 0

            // TODO: Add animations and sounds.
            gameOver = false
        }
    }
    else
        if (ship._isDisposed) {
            document.getElementById("gameover").style.display = ""
            document.getElementById("gameui").style.display = "none"

            s_spaceEngineLow.stop()


            // TODO: Add animations and sounds.
            gameOver = true
        }
        else {
            const dt = clock.getDelta()

            world.step()

            if (false) {
                const debugRender = world.debugRender()

                ll_debug.geometry.setAttribute("position", new BufferAttribute(debugRender.vertices, 2))
            }

            ship.update(dt)

            /** @type {Bullet[]} */
            const bullets = scene.getObjectsByUserDataProperty("type", "bullet")

            for (const bullet of bullets) {
                bullet.update(dt)
            }

            /** @type {Asteroid[]} */
            const asteroids = scene.getObjectsByUserDataProperty("type", "asteroid")

            // asteroids that are 25 to 30 away should be removed.
            // asteroids should spawn in 20 away and be given a random direction

            // TODO: Need to work on this spawning system.
            // TODO: Change spawning so that the asteroids never spawn on screen.
            for (let i = 0; i < ASTEROIDS_CAP - asteroids.length; i++) {

                const theta = randFloat(0, PI * 2)

                const pos = ship.position.clone()

                const e = new Euler(0, 0, theta)

                pos.add(new Vector3(randFloat(10, 20), 0, 0).applyEuler(e))

                const a = new Asteroid(m_green)

                // TODO: Spawn asteroids in circle around center of destroyed asteroid.

                a._rigidBody.setTranslation(pos)

                a._rigidBody.setLinvel(ship._rigidBody.linvel())

                a._rigidBody.addForce(new Vector3(randFloat(1, 10), randFloat(-5, 5), 0).applyEuler(e).multiplyScalar(-1))

                scene.add(a)

                a.update()
            }

            const objectsWithColliderHandle = scene.getObjectsByUserDataName("colliderHandle")

            for (const asteroid of asteroids) {
                if (asteroid._isDisposed)
                    continue

                asteroid.update(dt)

                world.contactsWith(asteroid._collider, ({ handle }) => {
                    const otherObj = objectsWithColliderHandle.find(({ userData: { colliderHandle } }) => colliderHandle === handle)

                    // TODO: Deside if I want the two colliding objects to push each other.
                    // asteroid._rigidBody.applyImpulse(new Vector3(0, 1, 0).applyEuler(otherObj.rotation).multiplyScalar(otherObj._rigidBody.mass()))
                    // otherObj._rigidBody.applyImpulse(new Vector3(0, 1, 0).applyEuler(asteroid.rotation).multiplyScalar(asteroid._rigidBody.mass()))

                    if (otherObj.userData.type === "bullet") {
                        score += asteroid.getAsteroidSize()
                    }

                    // BUG: For whatever reason, the other object needs to take the hit first. I have no clue why.
                    otherObj.takeHit()
                    asteroid.takeHit()
                })
            }

            // FIXME: Asteroid is removed from scene but not from asteroids array so it is needlessly updated.
            // This is not the biggest issue as the game will run fine even with these extra calculations.
            // But, this could be a area to gain some performance, even if its minimal.
            asteroids
                .filter(({ position }) => ship.position.distanceTo(position) > ASTEROIDS_MAX_DISTANCE_FROM_PLAYER)
                .forEach((asteroid) => {
                    if (!asteroid._isDisposed)
                        asteroid.dispose()
                })

            // TODO: Get nicer camera movement working.
            camera.position.copy(ship.position)
            camera.position.z = 0.001

            // Rendering
            renderer.render(scene, camera)

            // FilmPass.uniforms["time"].value += dt
            // BadTVPass.uniforms["time"].value += dt
            // StaticPass.uniforms["time"].value += dt
            // composer.render(dt)
        }
}

if (WebGL.isWebGLAvailable()) {
    document.body.appendChild(renderer.domElement)

    animate()
}
else {
    document.body.appendChild(WebGL.getWebGLErrorMessage())
}