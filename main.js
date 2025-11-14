import * as THREE from 'three';
import Stats from 'stats.js';
import {
    FilesetResolver,
    HandLandmarker
} from "@mediapipe/tasks-vision";


let scene, camera, renderer, stats;
let video, handLandmarker;

let rubbingStartTime = null;
let lastUpdateTime = performance.now();
let timerActive = false;
let showGoodJob = false;

let lastHandSeenTime = 0;
let hasAnnouncedShowHands = false;

let motionHistory = [];
let lastCenter = null;

// Stable-frame counters
const stableCounters = {
    contact: 0,
    circular: 0,
    orientation: 0
};
const STABLE_FRAMES = 15;

// Sticky washing progress
let washingProgress = {
    contact: false,
    circularMotion: false,
    orientation: false
};

// overlays
const handCanvas = document.createElement("canvas");
const ctx = handCanvas.getContext("2d");
Object.assign(handCanvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    zIndex: "10",
    pointerEvents: "none"
});
document.body.appendChild(handCanvas);

// Progress
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
  z-index: 200;
`;
const percentSpan = document.createElement("div");
const timeSpan = document.createElement("div");
progressBox.append(percentSpan, timeSpan);
document.body.appendChild(progressBox);

// Good job
const goodJobText = document.createElement("div");
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

// Debug info
const debugBox = document.createElement("div");
debugBox.style.cssText = `
  position: fixed;
  bottom: 80px; left: 10px;
  background: rgba(0,0,0,0.7);
  color: white;
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.9em;
  z-index: 600;
  line-height: 1.4em;
`;
document.body.appendChild(debugBox);


// AI speed overlay
const aiStats = document.createElement("div");
aiStats.style.cssText = `
  position: fixed;
  bottom: 10px; left: 10px;
  background: rgba(0,0,0,0.6);
  color: white;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 0.9em;
  z-index: 500;
`;
document.body.appendChild(aiStats);

// Guidance panel 
const guidanceBox = document.createElement("div");
guidanceBox.style.cssText = `
  position: fixed;
  top: 10px; right: 10px;
  background: rgba(0,0,0,0.75);
  padding: 10px 14px;
  border-radius: 8px;
  color: white;
  font-size: 1em;
  z-index: 800;
`;
document.body.appendChild(guidanceBox);

// Checklist (NEW)
const checklist = document.createElement("div");
checklist.style.cssText = `
  position: fixed;
  top: 10px; left: 10px;
  background: rgba(0,0,0,0.65);
  padding: 10px 14px;
  border-radius: 8px;
  color: white;
  font-size: 1em;
  line-height:1.5em;
  z-index: 850;
`;
checklist.innerHTML = `
  <b>Technique Checklist</b><br>
  • <span id="chk-contact">⬜ Hands close</span><br>
  • <span id="chk-circular">⬜ Circular Rubbing motion</span><br>
  • <span id="chk-orient">⬜ Palms face each other</span>
`;
document.body.appendChild(checklist);

const chkContact = document.getElementById("chk-contact");
const chkCircular = document.getElementById("chk-circular");
const chkOrient = document.getElementById("chk-orient");


// speech control (prevents overlapping)
let lastSpokenText = "";
let speaking = false;
let currentPriorityIssue = null;

function speak(text) {
    if (!window.speechSynthesis) return;
    if (speaking) return;

    if (text === lastSpokenText) return;

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    speaking = true;
    lastSpokenText = text;

    u.onend = () => (speaking = false);
    speechSynthesis.speak(u);
}


init();
startHandLoop();
animate();

async function init() {
    // 3js scene
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

    stats = new Stats();
    document.body.appendChild(stats.dom);

    await setupCamera();
    await setupHandLandmarker();

    handCanvas.width = window.innerWidth;
    handCanvas.height = window.innerHeight;

    window.addEventListener("resize", () => {
        handCanvas.width = window.innerWidth;
        handCanvas.height = window.innerHeight;
    });
}

// camera setup
async function setupCamera() {
    video = document.createElement("video");
    Object.assign(video.style, {
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "100%",
        objectFit: "cover",
        zIndex: "-1"
    });

    video.autoplay = true;
    video.playsInline = true;
    document.body.appendChild(video);

    const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" }
    });

    video.srcObject = stream;
    await new Promise(res => (video.onloadedmetadata = res));
}

// hand landmarker
async function setupHandLandmarker() {
    const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm"
    );

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
            modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
        },
        runningMode: "VIDEO",
        numHands: 2,
        minTrackingConfidence: 0.5,
        minHandDetectionConfidence: 0.5
    });
}

// detection loop
function startHandLoop() {
    setInterval(() => {
        if (!handLandmarker || video.readyState < 2) return;

        const start = performance.now();
        const result = handLandmarker.detectForVideo(video, start);

        const inference = performance.now() - start;
        aiStats.innerHTML = `Inference: ${inference.toFixed(1)}ms`;

        if (!result.landmarks || result.landmarks.length === 0) {
            handleNoHandsDetected();
            return;
        }

        handleHandsDetected(result.landmarks);
    }, 66);
}

// hand detection
function handleNoHandsDetected() {
    ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    const now = performance.now();
    if (now - lastHandSeenTime > 2000) {
        speak("Show both hands to the camera");
        guidanceBox.innerHTML = "👐 Please show both hands";
    }

    rubbingStartTime = null;
    timerActive = false;
    progressBox.style.display = "none";
}

function handleHandsDetected(hands) {
    lastHandSeenTime = performance.now();
    hasAnnouncedShowHands = false;
    guidanceBox.innerHTML = "";

    // Log landmark positions for your future AI coach
    console.log(JSON.stringify(hands));
    drawHands(hands);

    if (hands.length < 2) {
        guidanceBox.innerHTML = "👐 Please show both hands";
        speak("Please show both hands");
        return;
    }

    const now = performance.now();
    const washing = detectRealHandWashing(hands, now);

    updateProgress(washing);
    updateChecklist();
    debugInfo(washing);
}

// draw hands
function drawHands(allHands) {
    ctx.clearRect(0, 0, handCanvas.width, handCanvas.height);

    for (const hand of allHands) {
        for (const lm of hand) {
            ctx.fillStyle = "lime";
            ctx.beginPath();
            ctx.arc(
                lm.x * handCanvas.width,
                lm.y * handCanvas.height,
                4,
                0,
                2 * Math.PI
            );
            ctx.fill();
        }
    }
}

// hand washing
function detectRealHandWashing(hands, now) {
    const contactScore = getContactScore(hands);
    const circular = detectCircularMotion(hands, now);
    const orientation = detectPalmOrientation(hands);

    updateCriterion("contact", contactScore >= 3);
    updateCriterion("circularMotion", circular);
    updateCriterion("orientation", orientation);

    return {
        contactScore,
        hasCircularMotion: circular,
        correctOrientation: orientation
    };
}

function updateCriterion(name, conditionMet) {
    if (conditionMet) {
        stableCounters[name]++;
        if (stableCounters[name] > STABLE_FRAMES) {
            washingProgress[name] = true;
        }
    } else {
        stableCounters[name] = 0;
    }
}

function getContactScore(hands) {
    const L = hands[0];
    const R = hands[1];

    const pairs = [
        { l: 0, r: 0 },
        { l: 5, r: 5 },
        { l: 9, r: 9 },
        { l: 8, r: 0 },
        { l: 0, r: 8 },
        { l: 5, r: 17 },
        { l: 17, r: 5 }
    ];

    let count = 0;
    for (const p of pairs) {
        const a = L[p.l];
        const b = R[p.r];
        if (!a || !b) continue;

        const d = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        if (d < 0.15) count++;
    }

    return count;
}

function detectCircularMotion(hands, now) {
    const LW = hands[0][0];
    const RW = hands[1][0];

    if (!LW || !RW) return false;

    const cx = (LW.x + RW.x) / 2;
    const cy = (LW.y + RW.y) / 2;

    if (!lastCenter) {
        lastCenter = { cx, cy };
        return false;
    }

    const dx = cx - lastCenter.cx;
    const dy = cy - lastCenter.cy;
    const angle = Math.atan2(dy, dx);

    motionHistory.push({ angle, time: now, dx, dy });
    motionHistory = motionHistory.filter(p => now - p.time < 1000);

    lastCenter = { cx, cy };

    if (motionHistory.length < 6) return false;

    let directionChanges = 0;
    let lastA = motionHistory[0].angle;

    for (const p of motionHistory) {
        const diff = Math.abs(p.angle - lastA);

        if (diff > Math.PI / 3 && Math.abs(p.dx) + Math.abs(p.dy) > 0.01) {
            directionChanges++;
        }

        lastA = p.angle;
    }

    return directionChanges >= 3;
}

function detectPalmOrientation(hands) {
    const L = hands[0];
    const R = hands[1];

    const nL = palmNormal(L);
    const nR = palmNormal(R);

    if (!nL || !nR) return false;

    // Normalize
    normalize(nL);
    normalize(nR);

    const dot = nL.x * nR.x + nL.y * nR.y + nL.z * nR.z;

    return dot < -0.2;
}

function palmNormal(hand) {
    const wrist = hand[0];
    const index = hand[5];
    const pinky = hand[17];
    if (!wrist || !index || !pinky) return null;

    // vectors from wrist
    const v1 = {
        x: index.x - wrist.x,
        y: index.y - wrist.y,
        z: index.z - wrist.z
    };
    const v2 = {
        x: pinky.x - wrist.x,
        y: pinky.y - wrist.y,
        z: pinky.z - wrist.z
    };

    // cross product → palm normal
    return {
        x: v1.y * v2.z - v1.z * v2.y,
        y: v1.z * v2.x - v1.x * v2.z,
        z: v1.x * v2.y - v1.y * v2.x
    };
}

function normalize(v) {
    const len = Math.hypot(v.x, v.y, v.z);
    v.x /= len;
    v.y /= len;
    v.z /= len;
}

function detectPalmOrientation_palmvector(hands) {
    const L = hands[0];
    const R = hands[1];

    const vL = palmVector(L);
    const vR = palmVector(R);

    if (!vL || !vR) return false;

    const dot =
        vL.x * vR.x +
        vL.y * vR.y +
        vL.z * vR.z;

    return dot < -0.1;
}

function palmVector(hand) {
    const wrist = hand[0];
    const index = hand[5];
    const pinky = hand[17];
    if (!wrist || !index || !pinky) return null;

    const cx = (index.x + pinky.x) / 2;
    const cy = (index.y + pinky.y) / 2;
    const cz = (index.z + pinky.z) / 2;

    return {
        x: cx - wrist.x,
        y: cy - wrist.y,
        z: cz - wrist.z
    };
}

function updateProgress(washing) {
    const missing = [];

    if (!washingProgress.contact) missing.push("👐 Bring hands closer");
    if (!washingProgress.circularMotion) missing.push("🔄 Make circular rubbing motions");
    if (!washingProgress.orientation) missing.push("🤲 Palms should face each other");

    // PRIORITY: contact → circular → orientation
    const highest = missing.length > 0 ? missing[0] : null;

    // Speak only when a new highest priority appears
    if (highest !== currentPriorityIssue) {
        currentPriorityIssue = highest;

        if (highest) speak(highest);
        else speak("Great technique! Keep going");
    }

    // Display same guidance visually
    if (highest) {
        guidanceBox.innerHTML = `Fix: ${highest}`;
    } else {
        guidanceBox.innerHTML = `👌 Great technique! Keep going`;
    }

    // If at least 2 criteria are met -> start timer
    const passedCount = Object.values(washingProgress).filter(v => v).length;

    if (passedCount >= 1) {
        if (!timerActive) {
            timerActive = true;
            rubbingStartTime = performance.now();
        }
    } else {
        timerActive = false;
        progressBox.style.display = "none";
    }

    // Timer running
    if (timerActive) {
        const elapsed = performance.now() - rubbingStartTime;
        showProgress(elapsed, 20000);

        if (elapsed >= 20000) {
            goodJobText.style.display = "block";
            speak("Excellent! You have completed 20 seconds of proper hand washing");
            setTimeout(() => (goodJobText.style.display = "none"), 3000);
        }
    }

    // Provide feedback
    if (missing.length > 0) {
        guidanceBox.innerHTML = `Fix the following:<br>${missing.join("<br>")}`;
        speak(missing[0]); // speak highest priority issue
    } else {
        guidanceBox.innerHTML = "👌 Great technique! Keep going";
    }
}

function updateChecklist() {
    chkContact.textContent = washingProgress.contact ? "✔ Hands close" : "⬜ Hands close";
    chkCircular.textContent = washingProgress.circularMotion ? "✔ Circular Rubbing motion" : "⬜ Circular motion";
    chkOrient.textContent = washingProgress.orientation ? "✔ Palms face each other" : "⬜ Palms face each other";
}

function debugInfo(w) {
    debugBox.innerHTML = `
        <b>Contact Score:</b> ${w.contactScore}<br>
        <b>Circular:</b> ${w.hasCircularMotion}<br>
        <b>Orientation:</b> ${w.correctOrientation}
    `;
}

function showProgress(elapsed, total) {
    const pct = Math.min(100, (elapsed / total) * 100);
    const remain = Math.max(0, ((total - elapsed) / 1000)).toFixed(1);

    progressBox.style.display = "block";
    percentSpan.textContent = `${pct.toFixed(0)}% complete`;
    timeSpan.textContent = `${remain}s remaining`;
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
