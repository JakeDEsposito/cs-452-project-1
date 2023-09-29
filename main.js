import { Scene, WebGLRenderer, LineLoop, LineBasicMaterial, PerspectiveCamera, BufferGeometry, Vector3, Clock, MathUtils, Euler, Raycaster, BoxHelper, Sphere, Box3, Line } from "three"
import cannonEs from "cannonEs"
import WebGL from "three/addons/capabilities/WebGL.js"

const { randFloat } = MathUtils

const scene = new Scene()
// TODO: Change to orthographic camera
const camera = new PerspectiveCamera(75, 1, 0.1, 1000)

const renderer = new WebGLRenderer()
renderer.setSize(640, 640)

const geometry = new BufferGeometry().setFromPoints([
    new Vector3(0, 1),
    new Vector3(-.8, -1),
    new Vector3(-.3, -.6),
    new Vector3(.3, -.6),
    new Vector3(.8, -1),
])

const material = new LineBasicMaterial({ color: 0x00ff00 })
const ship = new LineLoop(geometry, material)
// TODO: Add plane to represent ship
scene.add(ship)

camera.position.z = 5

ship.geometry.computeBoundingBox()

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

class Physical {

}

class Ship extends Physical {

}

class Asteroid extends Physical {

}

function asteroidVertices(x, y) {
    const { sin, cos, PI } = Math

    const resolution = 12

    const angleStep = PI * 2 / resolution

    const vertices = []

    for (let i = 0; i < resolution; i++) {
        const theta = i * angleStep

        const vertex = new Vector3((cos(theta) + x), sin(theta) + y, 0)

        if (i % 3 === 0) {
            const e = new Euler(0, 0, theta)

            // x controls depth of crater.
            // y controls shift of crater.
            const v = new Vector3(randFloat(0.2, 0.5), randFloat(-0.4, 0.4), 0)

            vertex.sub(v.applyEuler(e))
        }

        vertices.push(vertex)
    }

    return vertices
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

const g = new BufferGeometry().setFromPoints(asteroidVertices(0, 0))
const a = new LineLoop(g, material)
scene.add(a)

const g_bullet = new BufferGeometry().setFromPoints([
    new Vector3(0, 0.2),
    new Vector3(),
])
const l_bullet = new Line(g_bullet, material)
scene.add(l_bullet)

// const bulletBoxHelper = new BoxHelper(l_bullet, 0xffffff)
// scene.add(bulletBoxHelper)

const keyHandler = new KeyHandler()

const clock = new Clock(true)

const vector = new Vector3()
const velocity = new Vector3()

const rotateSpeed = 2.5

function animate() {
    requestAnimationFrame(animate)

    const dt = clock.getDelta()

    // Ship Movement
    if (keyHandler.isKeyPressed("w"))
        vector.set(0, 1, 0).applyEuler(ship.rotation).multiplyScalar(0.1)
    else
        vector.set(0, 0, 0)

    if (keyHandler.isKeyPressed("a"))
        ship.rotation.z += rotateSpeed * dt
    if (keyHandler.isKeyPressed("d"))
        ship.rotation.z -= rotateSpeed * dt

    ship.position.z = 0

    velocity.addScaledVector(vector, dt)

    ship.position.add(velocity)
    // Ship Movement END

    // Ship HIT Asteroid Detection
    const gclone = geometry.clone()

    const worldPos = gclone.applyMatrix4(ship.matrixWorld)

    a.geometry.computeBoundingSphere()

    const arr = worldPos.attributes.position.array

    worldPos.dispose()

    const trianglePoints = [
        new Vector3(arr[0], arr[1], arr[2]),
        new Vector3(arr[3], arr[4], arr[5]),
        new Vector3(arr[12], arr[13], arr[14]),
    ]
    const c = collision.isIntersectionSphereTriangle(
        // FIXME: Position offset needs to be taken into account for the asteroid bounding sphere.
        a.geometry.boundingSphere,
        trianglePoints[0],
        trianglePoints[1],
        trianglePoints[2],
        new Vector3(0, 0, 1)
    )
    const some = trianglePoints.some((point) => a.geometry.boundingSphere.containsPoint(point))

    // console.log(!!c || some)
    // Ship HIT Asteroid Detection END



    
    l_bullet.geometry.computeBoundingBox()

    const collish = a.geometry.boundingSphere.intersectsBox(l_bullet.geometry.boundingBox)

    // console.log(collish)





    renderer.render(scene, camera)
}

if (WebGL.isWebGLAvailable()) {
    document.body.appendChild(renderer.domElement)

    animate()
}
else
    document.body.appendChild(WebGL.getWebGLErrorMessage())