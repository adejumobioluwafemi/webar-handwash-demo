// main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Stats from 'stats.js';

import {
    FilesetResolver,
    PoseLandmarker,
} from "@mediapipe/tasks-vision"
import { distance, getColorSpaceMethod } from 'three/src/nodes/TSL.js';

let scene, camera, renderer, model, stats;
let video, poseLandmarker;
let overlayResponseTimes = [];
let lastOverlayUpdate = performance.now();
let goodJobText;
let rubbingStartTime = null;
let showGoodJob = false;

init();
animate();

async function init() {
    // Scene setup
    scene = new THREE.Scene();

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 1;

    // Renderer setup — use WebGL + camera feed background
    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Add ambient light
    const light = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(light);

    // Load the overlay (arrow)
    const loader = new GLTFLoader();
    loader.load(
        '/direction_arrow/arrow.gltf',
        (gltf) => {
            model = gltf.scene;
            model.scale.set(0.3, 0.5, 0.3);
            model.position.set(0, -0.2, -1.2);
            scene.add(model);
        },
        (xhr) => {
            console.log(`Model ${(xhr.loaded / xhr.total) * 100}% loaded`);
        },
        (error) => console.error('Error loading model:', error)
    );

    // Add FPS monitor
    stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: memory
    document.body.appendChild(stats.dom);

    // Resize handler
    //window.addEventListener('resize', onWindowResize, false);
    window.addEventListener("resize", () => {
        poseCanvas.width = window.innerWidth;
        poseCanvas.height = window.innerHeight;
    });


    // Setup video background (rear camera)
    await setupCameraFeed();

    // setup pose detector
    await setupPoseLandmarker();

    // "Good Job" overlay text
    goodJobText = document.createElement('div');
    goodJobText.innerText = "✅ Good Job!";
    Object.assign(goodJobText.style, {
        position: 'fixed',
        top: '30%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        fontSize: '3em',
        color: 'lime',
        fontWeight: 'bold',
        textShadow: '0 0 10px black',
        display: 'none',
        zIndex: '20'
    });
    document.body.appendChild(goodJobText);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

async function setupCameraFeed() {
    try {
        video = document.createElement('video'); // global variable
        video.autoplay = true;
        video.playsInline = true;
        video.style.position = 'fixed';
        video.style.top = '0';
        video.style.left = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.zIndex = '-1';
        document.body.appendChild(video);

        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' } // "environment" = rear camera
        });
        video.srcObject = stream;

        await new Promise(resolve => {
            video.onloadedmetadata = () => resolve();
        });
        console.log("✅ Camera initialized");
    } catch (err) {
        console.error('Camera access denied:', err);
    }
}

// setup mediapipe pose landmarker
async function setupPoseLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            //modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
    });
    await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    console.log("✅ Pose model loaded");
}

// pose detection canvas overlay
const poseCanvas = document.createElement("canvas");
const ctx = poseCanvas.getContext("2d");
poseCanvas.width = window.innerWidth;
poseCanvas.height = window.innerHeight;
poseCanvas.style.position = "fixed";
poseCanvas.style.top = "0";
poseCanvas.style.left = "0";
poseCanvas.style.zIndex = "10";
poseCanvas.style.pointerEvents = "none";
document.body.appendChild(video);
document.body.appendChild(renderer.domElement);
document.body.appendChild(poseCanvas);

// main animation
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

    if (poseLandmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
            const start = performance.now();
            const results = poseLandmarker.detectForVideo(video, start);
            if (results.landmarks && results.landmarks.length > 0) {
                console.log("Pose detected!", results.landmarks[0].length, "keypoints");
            }

            drawPose(results);
        } catch (err) {
            console.error("Pose detection error:", err);
        }
    }
    stats.end();
    // Display FPS & overlay stats
    displayPerformanceInfo();


}

function detectPose() {
    const start = performance.now();
    if (video.videoWidth === 0) {
        console.warn("Video not ready yet");
        return;
    }
    try {
        const results = poseLandmarker.detectForVideo(video, start);
        drawPose(results);
    } catch (err) {
        console.error("Pose detection error:", err);
    }
}

// draw pose landmarks
function drawPose2(results) {
    ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

    if (!results.landmarks) return;
    console.log("Detected landmarks:", results.landmarks);

    ctx.fillStyle = "rgba(0, 255, 0, 0.7)";
    ctx.strokeStyle = "rgba(0, 255, 0, 0.4)";
    ctx.lineWidth = 2;

    for (const landmarks of results.landmarks) {
        for (const lm of landmarks) {
            const x = lm.x * poseCanvas.width;
            const y = lm.y * poseCanvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();

        }
    }

    // (later) connect landmarks lines, gestures
}

function drawPose(results) {
    ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);
    ctx.fillStyle = "rgba(0, 255, 0, 0.7)";

    results.landmarks.forEach(landmarks => {
        landmarks.forEach(lm => {
            const x = lm.x * poseCanvas.width;
            const y = lm.y * poseCanvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    });
}

// Detect when hands are rubbing together
function detectHandRubbing(landmarks) {
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftIndex = landmarks[19];
    const rightIndex = landmarks[20];

    if (!leftWrist || !rightWrist || !leftIndex || !rightIndex) return;

    const distWrist = distance_(leftWrist, rightWrist);
    const distIndex = distance_(leftIndex, rightIndex);

    console.log(`Wrists: ${distWrist.toFixed(3)}, Index: ${distIndex.toFixed(3)}`);

    // record for AI coach
    console.log({
        time: new Date().toISOString(),
        leftWrist,
        rightWrist,
        leftIndex,
        rightIndex,
    });

    const threshold = 0.07; // closer hands
    const bothClose = distWrist < threshold && distIndex < threshold;

    if (bothClose) {
        if (!rubbingStartTime) rubbingStartTime = performance.now();
        else if (performance.now() - rubbingStartTime > 300) {
            if (!showGoodJob) {
                showGoodJob = true;
                goodJobText.style.display = "block";
                setTimeout(() => {
                    goodJobText.style.display = "none";
                    showGoodJob = false;
                }, 2000);
            }
        }
    } else {
        rubbingStartTime = null;
        showGoodJob = false;
    }
}

// Helper to compute 3D distance between two keypoints
function distance_(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function displayPerformanceInfo() {
    let infoDiv = document.getElementById('perf-info');
    if (!infoDiv) {
        infoDiv = document.createElement('div');
        infoDiv.id = 'perf-info';
        Object.assign(infoDiv.style, {
            position: 'fixed',
            bottom: '10px',
            left: '10px',
            background: 'rgba(0,0,0,0.5)',
            color: 'white',
            padding: '8px',
            borderRadius: '8px',
            fontSize: '14px'
        });
        document.body.appendChild(infoDiv);
    }

    const avgOverlayLag = (
        overlayResponseTimes.reduce((a, b) => a + b, 0) / overlayResponseTimes.length
    ).toFixed(2);

    infoDiv.innerHTML = `FPS: ${stats.dom.children[0].textContent.replace('FPS', '').trim()} | Overlay lag: ${avgOverlayLag} ms`;
}
