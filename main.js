import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

class HandwashAR {
    constructor() {
        this.camera = null;
        this.scene = null;
        this.renderer = null;
        this.arrowModel = null;
        this.arSession = null;

        // Performance monitoring
        this.frameCount = 0;
        this.lastTime = performance.now();
        this.currentFPS = 0;

        this.init();
    }

    init() {
        this.setupScene();
        this.loadAssets();
        this.setupEventListeners();
        this.updateStatus('Ready to start AR');
    }

    setupScene() {
        // Create Three.js scene
        this.scene = new THREE.Scene();

        // Create camera
        this.camera = new THREE.PerspectiveCamera(
            70,
            window.innerWidth / window.innerHeight,
            0.01,
            20
        );

        // Create renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.xr.enabled = true;

        document.getElementById('ar-container').appendChild(this.renderer.domElement);

        // Add basic lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
        directionalLight.position.set(1, 1, 1);
        this.scene.add(directionalLight);
    }

    loadAssets() {
        const loader = new GLTFLoader();

        // Load arrow model
        loader.load('/assets/direction_arrow/arrow.gltf',
            (gltf) => {
                this.arrowModel = gltf.scene;
                this.arrowModel.scale.set(0.05, 0.05, 0.05);
                this.arrowModel.position.set(0, 0, -0.8);
                this.arrowModel.visible = false;
                this.scene.add(this.arrowModel);
                this.updateStatus('AR assets loaded ✅');
                console.log('Arrow model loaded successfully');
            },
            (progress) => {
                console.log('Loading model...', progress);
            },
            (error) => {
                console.error('Error loading arrow model:', error);
                this.updateStatus('Error loading assets ❌');
            }
        );
    }

    setupEventListeners() {
        document.getElementById('start-ar').addEventListener('click', () => {
            this.startAR();
        });

        window.addEventListener('resize', () => {
            this.onWindowResize();
        });
    }

    async startAR() {
        this.updateStatus('Starting AR session...');

        if (!navigator.xr) {
            this.updateStatus('WebXR not supported in this browser ❌');
            alert('WebXR is not supported in your browser. Try Chrome or Edge on Android.');
            return;
        }

        try {
            // Check if AR is supported
            const isSupported = await navigator.xr.isSessionSupported('immersive-ar');

            if (!isSupported) {
                this.updateStatus('AR not supported on this device ❌');
                alert('AR is not supported on your device. Try a different phone or browser.');
                return;
            }

            // Request AR session
            const session = await navigator.xr.requestSession('immersive-ar', {
                requiredFeatures: ['local', 'hit-test']
            });

            await this.renderer.xr.setSession(session);
            this.arSession = session;

            // Hide start button and show model
            document.getElementById('start-ar').style.display = 'none';
            if (this.arrowModel) {
                this.arrowModel.visible = true;
            }

            this.updateStatus('AR session active - Point camera at your hands 🎯');

            // Start animation loop
            this.renderer.setAnimationLoop((time, frame) => {
                this.animate(time, frame);
            });

            // Handle session end
            session.addEventListener('end', () => {
                this.updateStatus('AR session ended');
                document.getElementById('start-ar').style.display = 'block';
                if (this.arrowModel) {
                    this.arrowModel.visible = false;
                }
            });

        } catch (error) {
            console.error('Failed to start AR session:', error);
            this.updateStatus('Failed to start AR ❌');
            alert('Failed to start AR: ' + error.message);
        }
    }

    animate(time, frame) {
        // Calculate FPS
        this.frameCount++;
        const currentTime = performance.now();
        if (currentTime >= this.lastTime + 1000) {
            this.currentFPS = Math.round((this.frameCount * 1000) / (currentTime - this.lastTime));
            document.getElementById('fps-counter').textContent = `FPS: ${this.currentFPS}`;
            this.frameCount = 0;
            this.lastTime = currentTime;
        }

        // Animate arrow
        if (this.arrowModel && this.arrowModel.visible) {
            this.arrowModel.rotation.y += 0.02;
            this.arrowModel.position.y = Math.sin(time * 0.001) * 0.1;
        }

        this.renderer.render(this.scene, this.camera);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
        console.log('Status:', message);
    }
}

// Initialize the application when the page loads
new HandwashAR();