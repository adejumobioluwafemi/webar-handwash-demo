// main.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import Stats from 'stats.js';

import {
    FilesetResolver,
    //PoseLandmarker,
    HandLandmarker,
    PoseLandmarker
} from "@mediapipe/tasks-vision"
import { distance, getColorSpaceMethod } from 'three/src/nodes/TSL.js';

let scene, camera, renderer, model, stats;
let video, poseLandmarker;
let handLandmarker;
let overlayResponseTimes = [];
let lastOverlayUpdate = performance.now();
let goodJobText;
let rubbingStartTime = null;
let showGoodJob = false;
let lastDistance = null;     // store previous distance between hands
let velocity = 0;            // to measure hand motion speed
let lastUpdateTime = performance.now();

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
            model.scale.set(1, 1, 1);
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
    window.addEventListener('resize', onWindowResize, false);
    //window.addEventListener("resize", () => {
    //    poseCanvas.width = window.innerWidth;
    //    poseCanvas.height = window.innerHeight;
    //});


    // setup video background 
    await setupCameraFeed();

    // setup pose detector
    // await setupPoseLandmarker();
    // hand detector
    await setupHandLandmarker();

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
    handCanvas.width = window.innerWidth;
    handCanvas.height = window.innerHeight;
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
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
            //modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"
            //modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task"
        },
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.8,
        minTrackingConfidence: 0.8,
    });
    // await poseLandmarker.setOptions({ runningMode: "VIDEO" });
    console.log("✅ Pose model loaded");
}

// Hand Landmarker setup
async function setupHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
    });

    console.log("✅ Hand Landmarker loaded");
}

// pose detection canvas overlay
//const poseCanvas = document.createElement("canvas");
//const ctx = poseCanvas.getContext("2d");
//poseCanvas.width = window.innerWidth;
//poseCanvas.height = window.innerHeight;
//poseCanvas.style.position = "fixed";
//poseCanvas.style.top = "0";
//poseCanvas.style.left = "0";
//poseCanvas.style.zIndex = "10";
//poseCanvas.style.pointerEvents = "none";
//document.body.appendChild(video);
//document.body.appendChild(renderer.domElement);
//document.body.appendChild(poseCanvas);

// Canvas overlay for landmarks
const handCanvas = document.createElement("canvas");
const ctx = handCanvas.getContext("2d");
handCanvas.width = window.innerWidth;
handCanvas.height = window.innerHeight;
handCanvas.style.position = "fixed";
handCanvas.style.top = "0";
handCanvas.style.left = "0";
handCanvas.style.zIndex = "10";
handCanvas.style.pointerEvents = "none";
document.body.appendChild(handCanvas);

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

    //if (poseLandmarker && video.readyState >= 2 && video.videoWidth > 0) {
    //    try {
    //        const start = performance.now();
    //        const results = poseLandmarker.detectForVideo(video, start);
    //        if (results.landmarks && results.landmarks.length > 0) {
    //            console.log("Pose detected!", results.landmarks[0].length, "keypoints");
    //        }

    //        drawPose(results);
    //    } catch (err) {
    //        console.error("Pose detection error:", err);
    //    }
    //}
    if (handLandmarker && video.readyState >= 2 && video.videoWidth > 0) {
        try {
            const start = performance.now();
            const results = handLandmarker.detectForVideo(video, start);
            if (results.landmarks && results.landmarks.length > 0) {
                drawHands(results);
            }
        } catch (err) {
            console.error("Hand detection error:", err);
        }
    }
    stats.end();
    // Display overlay stats
    displayPerformanceInfo();


}

// draw hand keypoints & detect rubbing
function drawHands(results) {
    ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);
    const landmarksList = results.landmarks;

    landmarksList.forEach((landmarks) => {
        ctx.strokeStyle = "rgba(0, 255, 0, 0.5)";
        ctx.lineWidth = 2;
        ctx.fillStyle = "lime";

        // draw points
        for (const lm of landmarks) {
            const x = lm.x * handCanvas.width;
            const y = lm.y * handCanvas.height;
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, 2 * Math.PI);
            ctx.fill();
        }

        connectHandLandmarks(ctx, landmarks);
    });

    if (landmarksList.length === 2) {
        detectHandRubbing(landmarksList);
    }
}

// Draw hand bone structure
function connectHandLandmarks(ctx, landmarks) {
    const fingers = [
        [0, 1, 2, 3, 4],
        [0, 5, 6, 7, 8],
        [0, 9, 10, 11, 12],
        [0, 13, 14, 15, 16],
        [0, 17, 18, 19, 20],
    ];
    ctx.beginPath();
    fingers.forEach(finger => {
        for (let i = 0; i < finger.length - 1; i++) {
            const a = landmarks[finger[i]];
            const b = landmarks[finger[i + 1]];
            ctx.moveTo(a.x * handCanvas.width, a.y * handCanvas.height);
            ctx.lineTo(b.x * handCanvas.width, b.y * handCanvas.height);
        };
    });
    ctx.stroke();
}

function detectHandRubbing(hands) {
    const left = hands[0][0]; // Palm base
    const right = hands[1][0];
    if (!left || !right) return;

    const dist = distance_(left, right);
    const now = performance.now();
    const deltaT = (now - lastUpdateTime) / 1000;

    if (lastDistance !== null) {
        const velocity = Math.abs(dist - lastDistance) / deltaT; // m/s equivalent
        const close = dist < 0.25; // Hands close
        const fast = velocity > 0.4; // Rubbing motion threshold

        if (close && fast) {
            if (!rubbingStartTime) rubbingStartTime = now;
            else if (now - rubbingStartTime > 700 && !showGoodJob) {
                showGoodJob = true;
                goodJobText.style.display = "block";
                setTimeout(() => {
                    goodJobText.style.display = "none";
                    showGoodJob = false;
                }, 2000);
            }
        } else {
            rubbingStartTime = null;
        }

        displayDistanceInfo(dist, velocity);
    }

    lastDistance = dist;
    lastUpdateTime = now;
}

// draw pose landmarks
function drawPose(results) {
    ctx.clearRect(0, 0, poseCanvas.width, poseCanvas.height);

    if (!results.landmarks) return;
    console.log("Detected landmarks:", results.landmarks);

    const landmarks = results.landmarks[0];

    ctx.fillStyle = "rgba(0, 255, 0, 0.8)";
    ctx.strokeStyle = "rgba(0, 255, 0, 0.4)";
    ctx.lineWidth = 2;

    // connect landmarks lines
    const connections = [
        [11, 13], [13, 15], // Left arm
        [12, 14], [14, 16], // Right arm
        [11, 12],           // Shoulders
        [15, 17], [16, 18] // Hands
        //[23, 24], [11, 23], [12, 24] // Torso
    ];

    ctx.beginPath();
    for (const [a, b] of connections) {
        const p1 = landmarks[a];
        const p2 = landmarks[b];
        if (p1 && p2) {
            ctx.moveTo(p1.x * poseCanvas.width, p1.y * poseCanvas.height);
            ctx.lineTo(p2.x * poseCanvas.width, p2.y * poseCanvas.height);
        }
    }
    ctx.stroke();

    //for (const landmarks of results.landmarks) {
    //    for (const lm of landmarks) {
    //        const x = lm.x * poseCanvas.width;
    //        const y = lm.y * poseCanvas.height;
    //        ctx.beginPath();
    //        ctx.arc(x, y, 4, 0, 2 * Math.PI);
    //        ctx.fill();
    //    }
    //}
    for (const lm of landmarks) {
        const x = lm.x * poseCanvas.width;
        const y = lm.y * poseCanvas.height;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, 2 * Math.PI);
        ctx.fill();
    }

    // gestures
    detectHandRubbing(landmarks);
}

function drawPose2(results) {
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
function detectHandRubbing_pose(landmarks) {
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

    // Live distance overlay (bottom-right)
    let distDiv = document.getElementById('dist-info');
    if (!distDiv) {
        distDiv = document.createElement('div');
        distDiv.id = 'dist-info';
        Object.assign(distDiv.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.5)',
            color: 'lime',
            padding: '6px',
            borderRadius: '8px',
            fontSize: '14px',
            fontFamily: 'monospace'
        });
        document.body.appendChild(distDiv);
    }
    distDiv.innerText = `WristDist: ${distWrist.toFixed(3)} | IndexDist: ${distIndex.toFixed(3)}`;

    console.log("Wrists:", distWrist.toFixed(3), "Index:", distIndex.toFixed(3));

    const threshold = 0.3; // closer hands
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

// compute 3D euclidean distance between two keypoints
function distance_(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// info overlays
function displayDistanceInfo(dist, velocity) {
    let distDiv = document.getElementById('dist-info');
    if (!distDiv) {
        distDiv = document.createElement('div');
        distDiv.id = 'dist-info';
        Object.assign(distDiv.style, {
            position: 'fixed',
            bottom: '10px',
            right: '10px',
            background: 'rgba(0,0,0,0.6)',
            color: 'lime',
            padding: '8px',
            borderRadius: '8px',
            fontFamily: 'monospace',
            fontSize: '13px'
        });
        document.body.appendChild(distDiv);
    }
    distDiv.innerText = `Distance: ${dist.toFixed(3)} | Velocity: ${velocity.toFixed(2)}`;
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

    infoDiv.innerHTML = `FPS: ${stats.dom.children[0].textContent}, Overlay lag: ${avgOverlayLag} ms`;
}
