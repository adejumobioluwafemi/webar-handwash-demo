// main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Stats from 'stats.js';

let scene, camera, renderer, model, stats;
let overlayResponseTimes = [];
let lastOverlayUpdate = performance.now();

init();
animate();

function init() {
    // 1️⃣ Scene setup
    scene = new THREE.Scene();

    // 2️⃣ Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 1;

    // 3️⃣ Renderer setup — use WebGL + camera feed background
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // 4️⃣ Add ambient light
    const light = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(light);

    // 5️⃣ Load the overlay (arrow)
    const loader = new GLTFLoader();
    loader.load(
        '/direction_arrow/arrow.gltf',
        (gltf) => {
            model = gltf.scene;
            model.scale.set(0.6, 0.6, 0.6);
            model.position.set(0, -0.2, -1.2);
            scene.add(model);
        },
        (xhr) => {
            console.log(`Model ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        (error) => console.error('Error loading model:', error)
    );

    // 6️⃣ Add FPS monitor
    stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: memory
    document.body.appendChild(stats.dom);

    // 7️⃣ Resize handler
    window.addEventListener('resize', onWindowResize, false);

    // 8️⃣ Setup video background (rear camera)
    setupCameraFeed();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

async function setupCameraFeed() {
    try {
        const video = document.createElement('video');
        video.autoplay = true;
        video.playsInline = true;
        video.style.position = 'fixed';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.zIndex = '-1'; // behind canvas
        document.body.appendChild(video);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // use rear camera
        });
        video.srcObject = stream;
    } catch (err) {
        console.error('Camera access denied:', err);
    }
}

function animate() {
    requestAnimationFrame(animate);
    stats.begin();

    // Overlay update simulation — measure responsiveness
    const now = performance.now();
    const overlayLag = now - lastOverlayUpdate;
    overlayResponseTimes.push(overlayLag);
    if (overlayResponseTimes.length > 60) overlayResponseTimes.shift();
    lastOverlayUpdate = now;

    // Animate the arrow slightly (demo)
    if (model) {
        model.rotation.y += 0.02;
    }

    renderer.render(scene, camera);
    stats.end();

    // Display FPS & overlay stats
    displayPerformanceInfo();
}

function displayPerformanceInfo() {
    let infoDiv = document.getElementById('perf-info');
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'perf-info';
        infoDiv.style.position = 'fixed';
        infoDiv.style.bottom = '10px';
        infoDiv.style.left = '10px';
        infoDiv.style.background = 'rgba(0,0,0,0.5)';
        infoDiv.style.color = 'white';
        infoDiv.style.padding = '8px';
        infoDiv.style.borderRadius = '8px';
        infoDiv.style.fontSize = '14px';
        document.body.appendChild(infoDiv);
    }

    const avgOverlayLag = (
        overlayResponseTimes.reduce((a, b) => a + b, 0) / overlayResponseTimes.length
    ).toFixed(2);

    infoDiv.innerHTML = `FPS: ${stats.dom.children[0].textContent.replace('FPS', '').trim()} | Overlay lag: ${avgOverlayLag} ms`;
}
