import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { VignetteShader } from 'three/addons/shaders/VignetteShader.js';

let camera, scene, renderer, controls, composer, ambientLight, dirLight;
let objects = [];
let collectibles = []; // Store candies and carrots
let ghosts = []; // Store ghosts for animation
let candyScore = 0;
let carrotScore = 0;

// Game state
let isPlaying = false;
let inputMode = 'auto'; // 'auto', 'keyboard', 'touch'
let activeMode = 'keyboard';
let isTouchScreen = false;

// Controls state
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;

// Touch controls state
let joystickDeltaX = 0;
let joystickDeltaY = 0;
let lookMovementX = 0;
let lookMovementY = 0;

let prevTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();



// Texture loading setup
const textureLoader = new THREE.TextureLoader();

function loadTextureWithFallback(url, color) {
    const material = new THREE.MeshLambertMaterial({ color: color });
    textureLoader.load(
        url,
        // onLoad callback
        function(texture) {
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            material.map = texture;
            material.color.setHex(0xffffff);
            material.needsUpdate = true;
        },
        // onProgress callback currently not supported
        undefined,
        // onError callback
        function(err) {
            console.log(`Failed to load texture ${url}, using fallback color.`);
        }
    );
    return material;
}

// Global uniforms for custom fog
const fogUniforms = {
    fogColor: { value: new THREE.Color(0x1a1a2e) },
    fogNear: { value: 5.0 },
    fogFar: { value: 60.0 },
    fogDensity: { value: 0.15 },
    time: { value: 0.0 },
    fogEnabled: { value: 1.0 }
};

// Shader chunks for fog
const customFogParsVertex = `
    varying vec3 vCustomWorldPosition;
`;
const customFogVertex = `
    vCustomWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
`;
const customFogParsFragment = `
    uniform vec3 fogColor;
    uniform float fogNear;
    uniform float fogFar;
    uniform float fogDensity;
    uniform float time;
    uniform float fogEnabled;
    varying vec3 vCustomWorldPosition;

    // Simplex noise function
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i  = floor(v + dot(v, C.yy) );
      vec2 x0 = v -   i + dot(i, C.xx);
      vec2 i1;
      i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
      vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
      m = m*m ;
      m = m*m ;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
      vec3 g;
      g.x  = a0.x  * x0.x  + h.x  * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }
`;
const customFogFragment = `
    // Distance fog
    float depth = length(vCustomWorldPosition - cameraPosition);
    float fogFactor = smoothstep(fogNear, fogFar, depth);

    // Height and noise fog
    float heightFactor = 1.0 - smoothstep(-2.0, 10.0, vCustomWorldPosition.y);
    float noiseValue = snoise(vCustomWorldPosition.xz * 0.05 + time * 0.2) * 0.5 + 0.5;

    float finalFogFactor = fogFactor * heightFactor * (0.5 + noiseValue * 0.5);
    finalFogFactor = clamp(finalFogFactor, 0.0, 1.0);

    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, finalFogFactor * fogEnabled);
`;

function applyCustomFog(material) {
    material.onBeforeCompile = function (shader) {
        shader.uniforms.fogColor = fogUniforms.fogColor;
        shader.uniforms.fogNear = fogUniforms.fogNear;
        shader.uniforms.fogFar = fogUniforms.fogFar;
        shader.uniforms.fogDensity = fogUniforms.fogDensity;
        shader.uniforms.time = fogUniforms.time;
        shader.uniforms.fogEnabled = fogUniforms.fogEnabled;

        shader.vertexShader = shader.vertexShader.replace(
            '#include <common>',
            '#include <common>\n' + customFogParsVertex
        );
        shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n' + customFogVertex
        );

        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            '#include <common>\n' + customFogParsFragment
        );

        // Inject fog logic at the very end of the fragment shader
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            '#include <dithering_fragment>\n' + customFogFragment
        );
    };
}

init();
animate();

function init() {
    // Detect touch screen
    isTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // Set initial mode based on touch detection if 'auto'
    const savedMode = localStorage.getItem('candyRunInputMode') || 'auto';
    document.getElementById('input-mode').value = savedMode;
    setInputMode(savedMode);

    setupMenu();

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e); // Dark purplish night sky
    // scene.fog = new THREE.Fog(0x1a1a2e, 10, 50); // Using custom shader fog

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 2; // Height of Kaninis (rabbit)

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
    }
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; // Softer shadows
    document.body.appendChild(renderer.domElement);

    // 4. Lighting
    ambientLight = new THREE.AmbientLight(0xffffff); // Dimmer, more blue ambient light
    scene.add(ambientLight);

    dirLight = new THREE.DirectionalLight(0xffffff, 2.0); // Silver/blue Moonlight
    dirLight.position.set(50, 60, -100);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 300;
    dirLight.shadow.camera.left = -100;
    dirLight.shadow.camera.right = 100;
    dirLight.shadow.camera.top = 100;
    dirLight.shadow.camera.bottom = -100;
    scene.add(dirLight);

    // 5. Environment (Ground)
    const groundGeometry = new THREE.PlaneGeometry(200, 200);
    const groundMaterial = loadTextureWithFallback('textures/ground.jpg', 0x2b3a2a);
    applyCustomFog(groundMaterial);
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // 6. Spooky Trees and Gravestones
    createScenery();
    createMoon();
    createPumpkins();
    createGhosts();

    // 7. Controls Setup
    setupControls();
    setupTouchControls();

    // 8. Create Collectibles
    createCollectibles();

    // 9. Post-Processing Setup
    setupPostProcessing();

    // Handle Window Resize
    window.addEventListener('resize', onWindowResize);
}


function setupPostProcessing() {
    composer = new EffectComposer(renderer);

    const renderPass = new RenderPass(scene, camera);
    composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.2;
    bloomPass.strength = 0.5; // Glow intensity
    bloomPass.radius = 0.5;
    composer.addPass(bloomPass);

    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['offset'].value = 1.0;
    vignettePass.uniforms['darkness'].value = 1.0; // Spooky dark edges
    composer.addPass(vignettePass);
}

function setInputMode(mode) {
    inputMode = mode;
    localStorage.setItem('candyRunInputMode', mode);

    if (mode === 'auto') {
        activeMode = isTouchScreen ? 'touch' : 'keyboard';
    } else {
        activeMode = mode;
    }
}

function setupMenu() {
    const mainMenu = document.getElementById('main-menu');
    const settingsMenu = document.getElementById('settings-menu');
    const btnPlay = document.getElementById('btn-play');
    const btnSettings = document.getElementById('btn-settings');
    const btnBack = document.getElementById('btn-back');
    const inputModeSelect = document.getElementById('input-mode');
    const touchUI = document.getElementById('touch-ui');
    const btnPause = document.getElementById('btn-pause');


    const fogToggle = document.getElementById('fog-toggle');
    const savedFog = localStorage.getItem('candyRunFogEnabled');

    if (savedFog !== null) {
        const isFog = savedFog === 'true';
        fogToggle.checked = isFog;
        fogUniforms.fogEnabled.value = isFog ? 1.0 : 0.0;
    } else {
        fogToggle.checked = true;
        fogUniforms.fogEnabled.value = 1.0;
    }

    fogToggle.addEventListener('change', (e) => {
        const isFog = e.target.checked;
        localStorage.setItem('candyRunFogEnabled', isFog);
        fogUniforms.fogEnabled.value = isFog ? 1.0 : 0.0;
    });

    const ambientLightSlider = document.getElementById('ambient-light-slider');
    const moonLightSlider = document.getElementById('moon-light-slider');

    const savedAmbientLight = localStorage.getItem('candyRunAmbientLight');
    if (savedAmbientLight !== null) {
        ambientLightSlider.value = savedAmbientLight;
        ambientLight.intensity = parseFloat(savedAmbientLight);
    }

    const savedMoonLight = localStorage.getItem('candyRunMoonLight');
    if (savedMoonLight !== null) {
        moonLightSlider.value = savedMoonLight;
        dirLight.intensity = parseFloat(savedMoonLight);
    }

    ambientLightSlider.addEventListener('input', (e) => {
        ambientLight.intensity = parseFloat(e.target.value);
        localStorage.setItem('candyRunAmbientLight', e.target.value);
    });

    moonLightSlider.addEventListener('input', (e) => {
        dirLight.intensity = parseFloat(e.target.value);
        localStorage.setItem('candyRunMoonLight', e.target.value);
    });

    btnPlay.addEventListener('click', () => {
        mainMenu.style.display = 'none';
        isPlaying = true;

        if (activeMode === 'keyboard') {
            controls.lock();
            touchUI.style.display = 'none';
        } else {
            touchUI.style.display = 'block';
        }
    });

    btnSettings.addEventListener('click', () => {
        mainMenu.style.display = 'none';
        settingsMenu.style.display = 'flex';
    });

    btnBack.addEventListener('click', () => {
        settingsMenu.style.display = 'none';
        mainMenu.style.display = 'flex';
    });

    inputModeSelect.addEventListener('change', (e) => {
        setInputMode(e.target.value);
    });

    btnPause.addEventListener('click', () => {
        pauseGame();
    });
}

function pauseGame() {
    isPlaying = false;
    document.getElementById('touch-ui').style.display = 'none';
    document.getElementById('main-menu').style.display = 'flex';
    if (activeMode === 'keyboard' && controls.isLocked) {
        controls.unlock();
    }
}

function setupControls() {
    controls = new PointerLockControls(camera, document.body);

    controls.addEventListener('lock', function () {
        document.getElementById('main-menu').style.display = 'none';
        isPlaying = true;
    });

    controls.addEventListener('unlock', function () {
        if (activeMode === 'keyboard') {
            pauseGame();
        }
    });

    scene.add(controls.getObject());

    const onKeyDown = function (event) {
        if (!isPlaying || activeMode !== 'keyboard') return;
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
        if (!isPlaying || activeMode !== 'keyboard') return;
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

function setupTouchControls() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickBase = document.getElementById('joystick-base');
    const joystickStick = document.getElementById('joystick-stick');
    const lookZone = document.getElementById('look-zone');

    let joystickTouchId = null;
    let joystickBaseX = 0;
    let joystickBaseY = 0;
    const maxStickDistance = 40;

    let lookTouchId = null;
    let lastLookX = 0;
    let lastLookY = 0;

    // Joystick logic
    joystickZone.addEventListener('touchstart', (e) => {
        if (!isPlaying || activeMode !== 'touch') return;
        e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (joystickTouchId === null) {
                joystickTouchId = touch.identifier;
                joystickBaseX = touch.clientX;
                joystickBaseY = touch.clientY;

                joystickBase.style.display = 'block';
                joystickBase.style.left = `${joystickBaseX}px`;
                joystickBase.style.top = `${joystickBaseY}px`;
                joystickStick.style.transform = `translate(-50%, -50%)`;

                joystickDeltaX = 0;
                joystickDeltaY = 0;
            }
        }
    }, { passive: false });

    joystickZone.addEventListener('touchmove', (e) => {
        if (!isPlaying || activeMode !== 'touch') return;
        e.preventDefault();

        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === joystickTouchId) {
                let dx = touch.clientX - joystickBaseX;
                let dy = touch.clientY - joystickBaseY;

                const distance = Math.sqrt(dx * dx + dy * dy);
                if (distance > maxStickDistance) {
                    dx = (dx / distance) * maxStickDistance;
                    dy = (dy / distance) * maxStickDistance;
                }

                joystickStick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

                // Normalize for movement (-1 to 1)
                joystickDeltaX = dx / maxStickDistance;
                joystickDeltaY = dy / maxStickDistance;
            }
        }
    }, { passive: false });

    const endJoystick = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === joystickTouchId) {
                joystickTouchId = null;
                joystickBase.style.display = 'none';
                joystickDeltaX = 0;
                joystickDeltaY = 0;
            }
        }
    };
    joystickZone.addEventListener('touchend', endJoystick);
    joystickZone.addEventListener('touchcancel', endJoystick);

    // Look logic (simulating mouse move)
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    const PI_2 = Math.PI / 2;

    lookZone.addEventListener('touchstart', (e) => {
        if (!isPlaying || activeMode !== 'touch') return;
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (lookTouchId === null) {
                lookTouchId = touch.identifier;
                lastLookX = touch.clientX;
                lastLookY = touch.clientY;
            }
        }
    }, { passive: false });

    lookZone.addEventListener('touchmove', (e) => {
        if (!isPlaying || activeMode !== 'touch') return;
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            if (touch.identifier === lookTouchId) {
                const movementX = touch.clientX - lastLookX;
                const movementY = touch.clientY - lastLookY;

                lastLookX = touch.clientX;
                lastLookY = touch.clientY;

                // Adjust look sensitivity here
                const lookSpeed = 0.005;

                euler.setFromQuaternion(camera.quaternion);
                euler.y -= movementX * lookSpeed;
                euler.x -= movementY * lookSpeed;
                euler.x = Math.max(-PI_2, Math.min(PI_2, euler.x));
                camera.quaternion.setFromEuler(euler);
            }
        }
    }, { passive: false });

    const endLook = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === lookTouchId) {
                lookTouchId = null;
            }
        }
    };
    lookZone.addEventListener('touchend', endLook);
    lookZone.addEventListener('touchcancel', endLook);
}

function createCollectibles() {
    // Carrot Geometry (Orange cone with green top)
    const carrotGeo = new THREE.ConeGeometry(0.2, 1, 8);
    carrotGeo.translate(0, 0.5, 0); // shift pivot to bottom
    const carrotMat = new THREE.MeshLambertMaterial({ color: 0xff8800 });
    applyCustomFog(carrotMat);

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
        applyCustomFog(candyMat);
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

function createGhosts() {
    const ghostGeo = new THREE.CylinderGeometry(0.5, 0.5, 1.5, 16);
    // Make the top rounded
    const topGeo = new THREE.SphereGeometry(0.5, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    topGeo.translate(0, 0.75, 0);

    // Merge geometries manually for a simple ghost shape
    const ghostMat = new THREE.MeshLambertMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.6
    });
    applyCustomFog(ghostMat);

    const eyeGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    applyCustomFog(eyeMat);

    for (let i = 0; i < 15; i++) {
        const ghost = new THREE.Group();

        const body = new THREE.Mesh(ghostGeo, ghostMat);
        const head = new THREE.Mesh(topGeo, ghostMat);

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.2, 0.9, 0.4);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.2, 0.9, 0.4);

        ghost.add(body);
        ghost.add(head);
        ghost.add(leftEye);
        ghost.add(rightEye);

        ghost.position.x = (Math.random() - 0.5) * 150;
        ghost.position.y = 2 + Math.random() * 2; // Float above ground
        ghost.position.z = (Math.random() - 0.5) * 150;

        // Store original Y for bobbing animation
        ghost.userData = { originalY: ghost.position.y, bobSpeed: 0.002 + Math.random() * 0.002, bobOffset: Math.random() * Math.PI * 2 };

        scene.add(ghost);
        ghosts.push(ghost);
    }
}

function createPumpkins() {
    const pumpkinGeo = new THREE.SphereGeometry(0.8, 16, 16);
    // Flatten pumpkin slightly
    pumpkinGeo.scale(1, 0.8, 1);

    const pumpkinMat = loadTextureWithFallback('textures/pumpkin.jpg', 0xff7700);
    applyCustomFog(pumpkinMat);
    const stemGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.5, 8);
    const stemMat = new THREE.MeshLambertMaterial({ color: 0x228b22 });
    applyCustomFog(stemMat);

    for (let i = 0; i < 20; i++) {
        const pumpkin = new THREE.Group();

        const body = new THREE.Mesh(pumpkinGeo, pumpkinMat);
        body.castShadow = true;

        const stem = new THREE.Mesh(stemGeo, stemMat);
        stem.position.y = 0.7;

        pumpkin.add(body);
        pumpkin.add(stem);

        pumpkin.position.x = (Math.random() - 0.5) * 150;
        pumpkin.position.y = 0.6; // Rest on ground
        pumpkin.position.z = (Math.random() - 0.5) * 150;

        pumpkin.rotation.y = Math.random() * Math.PI;

        scene.add(pumpkin);
        objects.push(pumpkin);
    }
}

function createMoon() {
    const moonGeo = new THREE.SphereGeometry(15, 32, 32);
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xffffee }); // Slightly warm white
    textureLoader.load('textures/moon.jpg', function(texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        moonMat.map = texture;
        moonMat.needsUpdate = true;
    }, undefined, function(err) {
        console.log("Failed to load moon texture, using fallback color.");
    });
    const moon = new THREE.Mesh(moonGeo, moonMat);
    moon.position.set(50, 60, -100);
    scene.add(moon);
}

function createScenery() {
    const treeGeo = new THREE.ConeGeometry(2, 8, 8);
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.5, 2, 8);
    const treeMat = loadTextureWithFallback('textures/leaves.png', 0x112211);
    applyCustomFog(treeMat);
    const trunkMat = loadTextureWithFallback('textures/bark.jpg', 0x332211);
    applyCustomFog(trunkMat);

    const graveGeo = new THREE.BoxGeometry(1.5, 2, 0.5);
    const graveMat = loadTextureWithFallback('textures/grave.jpg', 0x555555);
    applyCustomFog(graveMat);

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

    if (typeof fogUniforms !== 'undefined') {
        fogUniforms.time.value = time * 0.001;
    }

    if (isPlaying) {
        const delta = (time - prevTime) / 1000;

        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        if (activeMode === 'keyboard') {
            direction.z = Number(moveForward) - Number(moveBackward);
            direction.x = Number(moveRight) - Number(moveLeft);
            direction.normalize();

            if (moveForward || moveBackward) velocity.z -= direction.z * 40.0 * delta;
            if (moveLeft || moveRight) velocity.x -= direction.x * 40.0 * delta;
        } else if (activeMode === 'touch') {
            // Forward/backward mapped to Y joystick
            direction.z = -joystickDeltaY;
            // Left/right mapped to X joystick
            direction.x = joystickDeltaX;

            // Optional: normalize if pushing diagonally to limit max speed
            const len = Math.sqrt(direction.x * direction.x + direction.z * direction.z);
            if (len > 1) {
                direction.x /= len;
                direction.z /= len;
            }

            if (Math.abs(direction.z) > 0.01) velocity.z -= direction.z * 40.0 * delta;
            if (Math.abs(direction.x) > 0.01) velocity.x -= direction.x * 40.0 * delta;
        }

        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        const pos = controls.getObject().position;
        if (pos.x < -95) pos.x = -95;
        if (pos.x > 95) pos.x = 95;
        if (pos.z < -95) pos.z = -95;
        if (pos.z > 95) pos.z = 95;

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

    // Animate ghosts
    const playerPos = controls.getObject().position;
    ghosts.forEach(ghost => {
        // Bobbing animation
        ghost.position.y = ghost.userData.originalY + Math.sin(time * ghost.userData.bobSpeed + ghost.userData.bobOffset) * 0.5;

        // Turn to look at player
        ghost.lookAt(playerPos.x, ghost.position.y, playerPos.z);

        // Slowly move towards player if close
        const dx = playerPos.x - ghost.position.x;
        const dz = playerPos.z - ghost.position.z;
        const distance = Math.sqrt(dx * dx + dz * dz);

        if (distance < 20 && distance > 2) { // Don't get too close
            const moveSpeed = 0.02; // adjust ghost speed here
            ghost.position.x += (dx / distance) * moveSpeed;
            ghost.position.z += (dz / distance) * moveSpeed;
        }
    });

    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
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
