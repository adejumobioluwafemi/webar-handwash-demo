import * as THREE from 'three';
import Stats from 'stats.js';
import {
    FilesetResolver,
    HandLandmarker
} from "@mediapipe/tasks-vision";


let scene, camera, renderer, stats;
let video, handLandmarker;
let lastDistance = null;
let lastUpdateTime = performance.now();
let rubbingStartTime = null;
let showGoodJob = false;
let lastLandmarkTime = 0;
let lastOverlayTime = 0;

// canvas for drawing overlays
const handCanvas = document.createElement("canvas");
const ctx = handCanvas.getContext("2d");
handCanvas.style.position = "fixed";
handCanvas.style.top = "0";
handCanvas.style.left = "0";
handCanvas.style.zIndex = "10";
handCanvas.style.pointerEvents = "none";
document.body.appendChild(handCanvas);

// overlay for progress text
const progressBox = document.createElement("div");
progressBox.style.cssText = `
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  background: rgba(0,0,0,0.7);
  padding: 15px 20px;
  border-radius: 10px;
  color: white;
  font-size: 1.4em;
  display: none;
  text-align: center;
  z-index: 200;
`;

const debugBox = document.createElement("div");
debugBox.style.cssText = `
  position: fixed;
  bottom: 80px;
  left: 10px;
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.9em;
  z-index: 600;
  line-height: 1.4em;
`;
document.body.appendChild(debugBox);

const percentSpan = document.createElement("div");
const timeSpan = document.createElement("div");
progressBox.append(percentSpan, timeSpan);
document.body.appendChild(progressBox);

// "Good Job!" text
const goodJobText = document.createElement('div');
goodJobText.textContent = "Good Job!";
goodJobText.style.cssText = `
  position: fixed;
  top: 30%; left: 50%;
  transform: translate(-50%, -50%);
  font-size: 3em;
  color: lime;
  display: none;
  z-index: 300;
`;
document.body.appendChild(goodJobText);

// latency overlay (hand tracking speed)
const aiStats = document.createElement("div");
aiStats.style.cssText = `
  position: fixed;
  bottom: 10px;
  left: 10px;
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 0.9em;
  z-index: 500;
`;
document.body.appendChild(aiStats);


init();
startHandLoop();
animate();

async function init() {

    // Scene
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(
        70,
        window.innerWidth / window.innerHeight,
        0.01,
        10
    );

    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "high-performance"
    });

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // FPS meter
    stats = new Stats();
    document.body.appendChild(stats.dom);

    // Camera + Hand Model
    await setupCamera();
    await setupHandLandmarker();

    handCanvas.width = window.innerWidth;
    handCanvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        handCanvas.width = window.innerWidth;
        handCanvas.height = window.innerWidth;
    });
}

// camera setup
async function setupCamera() {
    video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;

    Object.assign(video.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: "-1"
    });

    document.body.appendChild(video);

    const stream = await navigator.mediaDevices.getUserMedia({
        video: {
            width: 640,
            height: 480,
            facingMode: "user"
        }
    });

    video.srcObject = stream;
    await new Promise(res => (video.onloadedmetadata = res));
}

// hand model
async function setupHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    // FIXED MODEL URL
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        },
        runningMode: "VIDEO",
        numHands: 2,
        minTrackingConfidence: 0.5,
        minHandDetectionConfidence: 0.5
    });

    console.log("HandLandmarker Lite loaded");
}

// hand loop
function startHandLoop() {
    setInterval(() => {
        if (!handLandmarker || video.readyState < 2) return;

        const startTS = performance.now();

        const results = handLandmarker.detectForVideo(video, startTS);

        const inferTime = performance.now() - startTS;
        lastLandmarkTime = inferTime;

        if (!results.landmarks) return;

        // Log landmark positions for your future AI coach
        console.log(JSON.stringify(results.landmarks));

        drawHands(results.landmarks);
        lastOverlayTime = performance.now() - startTS;

        if (results.landmarks.length === 2) {
            detectHandRubbing(results.landmarks);
        }

        aiStats.innerHTML = `
      <b>AI Speed</b><br>
      Inference: ${inferTime.toFixed(1)} ms<br>
      Overlay Lag: ${lastOverlayTime.toFixed(1)} ms
    `;

    }, 66); // ~15 FPS
}

// draw hand landmarks 
function drawHands(allHands) {
    ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    for (const hand of allHands) {
        for (const lm of hand) {
            ctx.fillStyle = "lime";
            ctx.beginPath();
            ctx.arc(lm.x * handCanvas.width, lm.y * handCanvas.height, 4, 0, 2 * Math.PI);
            ctx.fill();
        }
    }
}

// RUBBING DETECTION 
function detectHandRubbing(hands) {
    //const left = hands[0][0]; // wrist
    //const right = hands[1][0]; // wrist
    const left = hands[0][8]; // index finger tip
    const right = hands[1][8]; // index finger tip
    if (!left || !right) return;

    const dist = Math.hypot(left.x - right.x, left.y - right.y, left.z - right.z);

    const now = performance.now();
    const dt = (now - lastUpdateTime) / 1000;
    const velocity = lastDistance ? Math.abs(dist - lastDistance) / dt : 0;

    const close = dist < 0.25;
    const fast = velocity > 0.015;

    debugBox.innerHTML = `
        <b>Hand Debug</b><br>
        Distance: ${dist.toFixed(3)}<br>
        Speed: ${velocity.toFixed(3)}<br>
        Close? <span style="color:${close ? 'lime' : 'red'}">${close}</span><br>
        Fast? <span style="color:${fast ? 'lime' : 'red'}">${fast}</span>
    `;

    if (close && fast) {
        if (!rubbingStartTime) rubbingStartTime = now;
        const elapsed = now - rubbingStartTime;

        showProgress(elapsed, 20000);

        if (elapsed > 20000 && !showGoodJob) {
            showGoodJob = true;
            goodJobText.style.display = "block";

            setTimeout(() => {
                goodJobText.style.display = "none";
                showGoodJob = false;
            }, 2000);
        }
    } else {
        rubbingStartTime = null;
        hideProgress();
    }

    lastDistance = dist;
    lastUpdateTime = now;
}


function showProgress(elapsed, total) {
    const percent = Math.min(100, (elapsed / total) * 100);
    const remaining = ((total - elapsed) / 1000).toFixed(1);

    progressBox.style.display = "block";
    percentSpan.textContent = `${percent.toFixed(0)}% complete`;
    timeSpan.textContent = `${remaining}s remaining`;
}

function hideProgress() {
    progressBox.style.display = "none";
}


function animate() {
    requestAnimationFrame(animate);
    stats.begin();
    renderer.render(scene, camera);
    stats.end();
}
