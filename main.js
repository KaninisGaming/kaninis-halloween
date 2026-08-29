import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

let camera, scene, renderer, controls;
let objects = [];
let collectibles = []; // Store candies and carrots
let candyScore = 0;
let carrotScore = 0;

// Controls state
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();

init();
animate();

function init() {
    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Dark purplish night sky
    scene.fog = new THREE.Fog(0x1a1a2e, 10, 50); // Spooky fog

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 2; // Height of Kaninis (rabbit)

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x5555aa, 1.5); // Moonlight
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // 5. Environment (Ground)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: 0x2b3a2a }); // Dark muddy green
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 6. Spooky Trees and Gravestones
    createScenery();

    // 7. Controls Setup
    setupControls();

    // 8. Create Collectibles
    createCollectibles();

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize);
}

function setupControls() {
    controls = new PointerLockControls(camera, document.body);

    const instructions = document.getElementById('instructions');

    instructions.addEventListener('click', function () {
        controls.lock();
    });

    controls.addEventListener('lock', function () {
        instructions.style.display = 'none';
    });

    controls.addEventListener('unlock', function () {
        instructions.style.display = 'flex';
    });

    scene.add(controls.getObject());

    const onKeyDown = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = true;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = true;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = true;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = true;
                break;
        }
    };

    const onKeyUp = function (event) {
        switch (event.code) {
            case 'ArrowUp':
            case 'KeyW':
                moveForward = false;
                break;
            case 'ArrowLeft':
            case 'KeyA':
                moveLeft = false;
                break;
            case 'ArrowDown':
            case 'KeyS':
                moveBackward = false;
                break;
            case 'ArrowRight':
            case 'KeyD':
                moveRight = false;
                break;
        }
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
}

function createCollectibles() {
    // Carrot Geometry (Orange cone with green top)
    const carrotGeo = new THREE.ConeGeometry(0.2, 1, 8);
    carrotGeo.translate(0, 0.5, 0); // shift pivot to bottom
    const carrotMat = new THREE.MeshLambertMaterial({ color: 0xff8800 });

    // Candy Geometry (Small wrapped candy - simple cylinder or sphere for now)
    const candyGeo = new THREE.SphereGeometry(0.3, 8, 8);
    const candyColors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff];

    for (let i = 0; i < 30; i++) {
        // Create Carrots
        const carrot = new THREE.Mesh(carrotGeo, carrotMat);
        carrot.position.x = (Math.random() - 0.5) * 180; // Keep within map bounds
        carrot.position.y = 0; // On the ground
        carrot.position.z = (Math.random() - 0.5) * 180;

        // Random tilt for a more natural look
        carrot.rotation.z = (Math.random() - 0.5) * 0.5;
        carrot.rotation.x = (Math.random() - 0.5) * 0.5;
        carrot.castShadow = true;

        carrot.userData = { type: 'carrot' };
        scene.add(carrot);
        collectibles.push(carrot);

        // Create Candies
        const candyMat = new THREE.MeshLambertMaterial({
            color: candyColors[Math.floor(Math.random() * candyColors.length)]
        });
        const candy = new THREE.Mesh(candyGeo, candyMat);
        candy.position.x = (Math.random() - 0.5) * 180;
        candy.position.y = 0.3; // Slightly above ground
        candy.position.z = (Math.random() - 0.5) * 180;
        candy.castShadow = true;

        candy.userData = { type: 'candy' };
        scene.add(candy);
        collectibles.push(candy);
    }
}

function createScenery() {
    const treeGeo = new THREE.ConeGeometry(2, 8, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x112211 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x332211 });

    const graveGeo = new THREE.BoxGeometry(1.5, 2, 0.5);
    const graveMat = new THREE.MeshLambertMaterial({ color: 0x555555 });

    for (let i = 0; i < 50; i++) {
        // Create Trees
        if (Math.random() > 0.3) {
            const tree = new THREE.Group();

            const leaves = new THREE.Mesh(treeGeo, treeMat);
            leaves.position.y = 5;
            leaves.castShadow = true;

            const trunk = new THREE.Mesh(trunkGeo, trunkMat);
            trunk.position.y = 1;
            trunk.castShadow = true;

            tree.add(leaves);
            tree.add(trunk);

            tree.position.x = (Math.random() - 0.5) * 100;
            tree.position.z = (Math.random() - 0.5) * 100;

            // Don't place right at start
            if (Math.abs(tree.position.x) > 5 && Math.abs(tree.position.z) > 5) {
                scene.add(tree);
                objects.push(tree); // Add to objects for potential collision later
            }
        }
        // Create Gravestones
        else {
            const grave = new THREE.Mesh(graveGeo, graveMat);
            grave.position.x = (Math.random() - 0.5) * 100;
            grave.position.y = 1;
            grave.position.z = (Math.random() - 0.5) * 100;

            grave.rotation.y = Math.random() * Math.PI;
            grave.rotation.z = (Math.random() - 0.5) * 0.2; // slightly tilted

            grave.castShadow = true;
            grave.receiveShadow = true;

            if (Math.abs(grave.position.x) > 5 && Math.abs(grave.position.z) > 5) {
                scene.add(grave);
                objects.push(grave);
            }
        }
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();

    if (controls.isLocked === true) {
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize(); // this ensures consistent movements in all directions

        if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        // Optional: keep within bounds
        const pos = controls.getObject().position;
        if (pos.x < -95) pos.x = -95;
        if (pos.x > 95) pos.x = 95;
        if (pos.z < -95) pos.z = -95;
        if (pos.z > 95) pos.z = 95;

        // Collection Logic
        checkCollisions(pos);
    }

    prevTime = time;

    // Optional: Animate collectibles (make candies float/spin)
    collectibles.forEach(item => {
        if (item.userData.type === 'candy') {
            item.rotation.y += 0.02;
            item.position.y = 0.3 + Math.sin(time * 0.003 + item.position.x) * 0.2;
        }
    });

    renderer.render(scene, camera);
}

function checkCollisions(playerPos) {
    const collectDistance = 2.0; // Distance to collect an item

    for (let i = collectibles.length - 1; i >= 0; i--) {
        const item = collectibles[i];

        // Calculate 2D distance (ignore Y for easier collection)
        const dx = playerPos.x - item.position.x;
        const dz = playerPos.z - item.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < collectDistance) {
            // Collect the item
            scene.remove(item);

            if (item.userData.type === 'candy') {
                candyScore++;
                document.getElementById('candy-count').textContent = candyScore;
            } else if (item.userData.type === 'carrot') {
                carrotScore++;
                document.getElementById('carrot-count').textContent = carrotScore;
            }

            // Remove from array
            collectibles.splice(i, 1);
        }
    }
}
