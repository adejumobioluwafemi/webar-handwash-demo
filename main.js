import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const video = document.getElementById('video');
let scene, camera, renderer, arrowModel;
let lastFrameTime = performance.now();
let fpsDisplay;

// === Step 1: Start Camera ===
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
        console.log('Camera started');
    } catch (err) {
        console.error('Error accessing camera:', err);
    }
}

// === Step 2: Initialize Three.js Scene ===
function initThree() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        1000
    );
    camera.position.z = 2;

    renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('ar-canvas'),
        alpha: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 1);
    scene.add(light);

    const loader = new GLTFLoader();
    loader.load(
        '/public/direction_arrow/arrow.gltf',
        (gltf) => {
            console.log('Arrow model loaded:', gltf);
            arrowModel = gltf.scene;
            arrowModel.scale.set(0.5, 0.5, 0.5);
            arrowModel.position.set(0, 0, -1);
            scene.add(arrowModel);
        },
        undefined,
        (error) => console.error('Error loading arrow:', error)
    );

    // Create FPS overlay
    fpsDisplay = document.createElement('div');
    fpsDisplay.id = 'fps';
    document.body.appendChild(fpsDisplay);

    animate();
}

// === Step 3: Animation Loop + FPS Measure ===
function animate() {
    requestAnimationFrame(animate);

    // FPS measurement
    const now = performance.now();
    const delta = now - lastFrameTime;
    const fps = 1000 / delta;
    fpsDisplay.innerText = `FPS: ${fps.toFixed(1)}`;
    lastFrameTime = now;

    // Rotate arrow (placeholder for motion guidance)
    if (arrowModel) arrowModel.rotation.y += 0.01;

    renderer.render(scene, camera);
}

// === Step 4: Handle Resizing ===
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Start Everything ===
initCamera().then(initThree);
