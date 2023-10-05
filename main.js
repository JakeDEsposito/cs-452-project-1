import { Scene, WebGLRenderer, LineLoop, LineBasicMaterial, BufferGeometry, Vector3, Clock, MathUtils, Euler, Sphere, Line, OrthographicCamera, Object3D, PerspectiveCamera } from "three"

import WebGL from "three/addons/capabilities/WebGL.js"

import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js"
import { RenderPass } from "three/addons/postprocessing/RenderPass.js"
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js"
import { FilmShader } from "./shaders/FilmShader.js"
import { BadTVShader } from "./shaders/BadTVShader.js"
import { StaticShader } from "./shaders/StaticShader.js"

//import { World, Body, Sphere as CannonSphere, Trimesh } from "rapier2d"

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

const { randFloat } = MathUtils

const scene = new Scene()
const camera = new OrthographicCamera(-10, 10, 10, -10, 0)

camera.frustumCulled = false
camera.updateProjectionMatrix()

const renderer = new WebGLRenderer()
renderer.setSize(640, 640)

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
// const ship = new LineLoop(g_ship, m_green)
// scene.add(ship)

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

    _velocity = new Vector3()
    _health = 3
}

class Ship extends Physical {
    #rotateSpeed = 2.5

    #canFire = true
    #fireCooldown = 0.2

    constructor(geometry, material) {
        super(geometry, material)

        // world.addBody(new Trimesh([
        //     new Vector3(0, 1),
        //     new Vector3(-.8, -1),
        //     new Vector3(.8, -1),
        // ], [0, 1, 2]))

        this._rigidBody = world.createRigidBody(RigidBodyDesc.dynamic())
        // this._rigidBody.resetForces(true)

        // this._collider = world.createCollider(ColliderDesc.triangle(
        //     new Vector3(0, 1),
        //     new Vector3(-.8, -1),
        //     new Vector3(.8, -1)
        // ), this._rigidBody)

        this._rigidBody.addForce({ x: 1, y: 0}, true)

        console.log(this._collider)
    }

    #movement(dt) {
        const vector = new Vector3()
        if (keyHandler.isKeyPressed("w"))
            vector.set(0, 1, 0).applyEuler(this.rotation).multiplyScalar(0.1)
        else
            vector.set(0, 0, 0)

        if (keyHandler.isKeyPressed("a"))
            this.rotation.z += this.#rotateSpeed * dt
        if (keyHandler.isKeyPressed("d"))
            this.rotation.z -= this.#rotateSpeed * dt

        this.position.setZ(0)

        this._velocity.addScaledVector(vector, dt)

        console.log(this._rigidBody)

        // this.position.add(this._velocity, dt)
    }

    #fire() {
        const bullet = new Bullet(m_green)

        bullet.position.copy(this.position)
        bullet.rotation.copy(this.rotation)

        bullet._velocity = new Vector3(0, Bullet.BULLET_SPEED)
        bullet._velocity.applyEuler(this.rotation)
        bullet._velocity.add(this._velocity)

        scene.add(bullet)
    }

    update(dt) {
        this.#movement(dt)

        if (this.#canFire && keyHandler.isKeyPressed(" ")) {
            this.#fire()

            this.#canFire = false
            setTimeout(() => this.#canFire = true, this.#fireCooldown * 1000)
        }
    }
}

const ASTEROIDS_CAP = 10
const ASTEROIDS_MAX_DISTANCE_FROM_PLAYER = 25

class Asteroid extends Physical {
    constructor(material) {
        const { sin, cos, PI } = Math

        const resolution = 12

        const angleStep = PI * 2 / resolution

        const vertices = []

        for (let i = 0; i < resolution; i++) {
            const theta = i * angleStep

            // const vertex = new Vector3((cos(theta) + x), sin(theta) + y, 0)
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

        this.userData = {
            type: "asteroid"
        }

        this.geometry.computeBoundingSphere()

        // const body = new Body({
        //     mass: 1,
        //     shape: new CannonSphere(1)
        // })

        // world.addBody(body)
    }

    #movement(dt) {
        this.position.add(this._velocity, dt)
    }

    update(dt) {
        this.#movement(dt)
    }

    // TODO: Make hit and kill system for asteroids.
    // The asteroids should split into 4 smaller asteroids that shoot out in 4 different directions when a big asteroid is killed.
    // Small asteroids just disapear when killed.
}

class Bullet extends Physical {
    lifeTimer = 20

    static BULLET_SPEED = 0.5

    constructor(material) {
        super(new BufferGeometry().setFromPoints([
            new Vector3(0, 0.8),
            new Vector3(),
        ]), material)

        this.userData = {
            type: "bullet"
        }
    }

    #movement(dt) {
        const vector = new Vector3()

        this.position.setZ(0)

        this._velocity.addScaledVector(vector, dt)

        this.position.add(this._velocity, dt)
    }

    update(dt) {
        this.#movement(dt)

        this.lifeTimer -= dt

        if (this.lifeTimer <= 0) {
            scene.remove(this)
            // No need to dispose because geometry is reused for other bullets.
            // this.dispose()
        }
    }
}

const collision = {}

/** 
 * Based on http://realtimecollisiondetection.net/blog/?p=103
 * @param {Sphere} sphere 
 * @param {Vector3} a vertex of a triangle
 * @param {Vector3} b vertex of a triangle
 * @param {Vector3} c vertex of a triangle
 * @param {Vector3} normal normal of a triangle
 * @returns 
 * @author https://gist.github.com/yomotsu/d845f21e2e1eb49f647f
 */
collision.isIntersectionSphereTriangle = function (sphere, a, b, c, normal) {

    // vs plane of traiangle face
    var A = new Vector3(),
        B = new Vector3(),
        C = new Vector3(),
        rr,
        V = new Vector3(),
        d,
        e;

    A.subVectors(a, sphere.center);
    B.subVectors(b, sphere.center);
    C.subVectors(c, sphere.center);
    rr = sphere.radius * sphere.radius;
    V.crossVectors(B.clone().sub(A), C.clone().sub(A));
    d = A.dot(V);
    e = V.dot(V);

    if (d * d > rr * e) {

        return false;

    }

    // vs triangle vertex
    var aa,
        ab,
        ac,
        bb,
        bc,
        cc;

    aa = A.dot(A);
    ab = A.dot(B);
    ac = A.dot(C);
    bb = B.dot(B);
    bc = B.dot(C);
    cc = C.dot(C);

    if (
        (aa > rr) & (ab > aa) & (ac > aa) ||
        (bb > rr) & (ab > bb) & (bc > bb) ||
        (cc > rr) & (ac > cc) & (bc > cc)
    ) {

        return false;

    }

    // vs edge
    var AB = new Vector3(),
        BC = new Vector3(),
        CA = new Vector3(),
        d1,
        d2,
        d3,
        e1,
        e2,
        e3,
        Q1 = new Vector3(),
        Q2 = new Vector3(),
        Q3 = new Vector3(),
        QC = new Vector3(),
        QA = new Vector3(),
        QB = new Vector3();

    AB.subVectors(B, A);
    BC.subVectors(C, B);
    CA.subVectors(A, C);
    d1 = ab - aa;
    d2 = bc - bb;
    d3 = ac - cc;
    e1 = AB.dot(AB);
    e2 = BC.dot(BC);
    e3 = CA.dot(CA);
    Q1.subVectors(A.multiplyScalar(e1), AB.multiplyScalar(d1));
    Q2.subVectors(B.multiplyScalar(e2), BC.multiplyScalar(d2));
    Q3.subVectors(C.multiplyScalar(e3), CA.multiplyScalar(d3));
    QC.subVectors(C.multiplyScalar(e1), Q1);
    QA.subVectors(A.multiplyScalar(e2), Q2);
    QB.subVectors(B.multiplyScalar(e3), Q3);

    if (
        (Q1.dot(Q1) > rr * e1 * e1) && (Q1.dot(QC) >= 0) ||
        (Q2.dot(Q2) > rr * e2 * e2) && (Q2.dot(QA) >= 0) ||
        (Q3.dot(Q3) > rr * e3 * e3) && (Q3.dot(QB) >= 0)
    ) {

        return false;

    }

    var distance = Math.sqrt(d * d / e) - sphere.radius,
        contactPoint = new Vector3(),
        negatedNormal = new Vector3(-normal.x, -normal.y, -normal.z);

    contactPoint.copy(sphere.center).add(negatedNormal.multiplyScalar(distance));

    return {
        distance: distance,
        contactPoint: contactPoint
    };

};

const { PI } = Math

// const g_asteroid = new BufferGeometry().setFromPoints(vertices)
// const a = new LineLoop(g_asteroid, m_green)
// scene.add(a)

const keyHandler = new KeyHandler()

const clock = new Clock(true)

const ship = new Ship(g_ship, m_green)
scene.add(ship)

function animate() {
    requestAnimationFrame(animate)

    const dt = clock.getDelta()

    world.step()

    ship.update(dt)

    /** @type {Bullet[]} */
    const bullets = scene.getObjectsByUserDataProperty("type", "bullet")

    for (const bullet of bullets) {
        bullet.update(dt)
    }

    // TODO: Create asteroid spawning system.

    const shipDir = ship._velocity.clone().normalize()

    /** @type {Asteroid[]} */
    const asteroids = scene.getObjectsByUserDataProperty("type", "asteroid")

    // asteroids that are 25 to 30 away should be removed.
    // asteroids should spawn in 20 away and be given a random direction

    // TODO: Need to work on this spawning system.
    for (let i = 0; i < ASTEROIDS_CAP - asteroids.length; i++) {
        // Do a different spawning method for when the ship is at 0, 0.

        const a = new Asteroid(m_green)

        a.position.copy(shipDir).multiplyScalar(20).add(ship.position)

        const e = new Euler(0, 0, randFloat(0, 2 * PI))

        a._velocity.setX(randFloat(0.01, 0.05)).applyEuler(e)

        scene.add(a)
    }

    // FIXME: Asteroid is removed from scene but not from asteroids array so it is needlessly updated.
    // This is not the biggest issue as the game will run fine even with these extra calculations.
    // But, this could be a area to gain some performance, even if its minimal.
    asteroids
        .filter(({ position }) => ship.position.distanceTo(position) > ASTEROIDS_MAX_DISTANCE_FROM_PLAYER)
        .forEach((asteroid) => scene.remove(asteroid))

    for (const asteroid of asteroids) {
        asteroid.update(dt)

        // for (const bullet of bullets) {


        //     // asteroid.geometry.bounding
        // }

        // const isColliding = collision.isIntersectionSphereTriangle(

        // )
    }

    // console.log(shipDir.multiplyScalar(20).add(ship.position))

    // console.log(asteroid.position)

    // asteroid.position.y = 10

    // Ship HIT Asteroid Detection
    /*
    const gclone = g_ship.clone()

    const worldPos = gclone.applyMatrix4(ship.matrixWorld)

    asteroid.geometry.computeBoundingSphere()

    const arr = worldPos.attributes.position.array

    worldPos.dispose()
    // BUG: Applying the matrix in this way causes the asteroid to pop in and out. Do it a different way.
    asteroid.geometry.boundingSphere.applyMatrix4(asteroid.matrixWorld)

    // TODO: Get collisions with asteroids - ships and asteroids - bullets working.
    const trianglePoints = [
        new Vector3(arr[0], arr[1], arr[2]),
        new Vector3(arr[3], arr[4], arr[5]),
        new Vector3(arr[12], arr[13], arr[14]),
    ]
    const c = collision.isIntersectionSphereTriangle(
        asteroid.geometry.boundingSphere,
        trianglePoints[0],
        trianglePoints[1],
        trianglePoints[2],
        new Vector3(0, 0, 1)
    )
    const some = trianglePoints.some((point) => asteroid.geometry.boundingSphere.containsPoint(point))

    // console.log(a.geometry.boundingSphere)

    // console.log(!!c || some)
    */
    // Ship HIT Asteroid Detection END

    // if (ship.position.distanceTo(camera.position) > 4 || cameraLerpCounter < 1) {
    //     cameraLerpCounter += dt
    //     // const t = cameraLerpClock.getElapsedTime()
    //     camera.position.lerp(ship.position, cameraLerpCounter)
    //     // camera.position.copy(ship.position)
    //     if (cameraLerpCounter > 1)
    //     cameraLerpCounter = 0
    // }
    // TODO: Get nicer camera movement working.
    camera.position.copy(ship.position)

    camera.position.z = 0.001

    // l_bullet.geometry.computeBoundingBox()

    // const collish = a.geometry.boundingSphere.intersectsBox(l_bullet.geometry.boundingBox)

    // console.log(collish)





    renderer.render(scene, camera)

    // FilmPass.uniforms["time"].value += dt
    // BadTVPass.uniforms["time"].value += dt
    // StaticPass.uniforms["time"].value += dt
    // composer.render(dt)
}

if (WebGL.isWebGLAvailable()) {
    document.body.appendChild(renderer.domElement)

    animate()
}
else
    document.body.appendChild(WebGL.getWebGLErrorMessage())