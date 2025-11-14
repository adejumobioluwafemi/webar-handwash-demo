
# 🧼 WebAR Handwashing Coach (Browser-Based Real-Time AR + Hand Tracking)

### **Live Demo:** [https://webar-handwash-demo.vercel.app/](https://webar-handwash-demo.vercel.app/)

This project is a **browser-based AR hand-washing coach** that uses **WebAR**, **Three.js**, and **MediaPipe Hand Landmarker** to detect correct hand-washing technique in real time.
It gives **audio feedback**, **visual overlays**, and a **20-second progress timer** based on WHO-style washing criteria.

No app installation required — everything runs directly in the browser.

---

## 🚀 Features

### ✅ **Real-time Hand Tracking (MediaPipe Hand Landmarker)**

* Detects both hands using the webcam.
* Tracks 21 landmarks per hand.
* Calculates:

  * **Hand contact score** (hands close enough)
  * **Circular rubbing motion**
  * **Palm orientation** (palms facing each other using cross product)

---

### 🎯 **Technique Criteria (Sticky)**

The system tracks three required techniques:

| Technique          | Description                                |
| ------------------ | ------------------------------------------ |
| 👐 Hands Close     | Hands must be near each other              |
| 🔄 Circular Motion | Detects back-and-forth / circular movement |
| 🤲 Palms Facing    | Palms should be oriented toward each other |

Each technique becomes **✔ sticky** once performed correctly for enough frames.

Criteria do **not** reset when you make a mistake — only completed criteria remain locked.

---

### 🕒 **20-Second Timer**

* Starts automatically once **at least one technique** is correct.
* Continues running as long as technique is maintained.
* When full 20 seconds is reached:

  * Shows **"Good Job!"**
  * Speaks: *"Excellent! You have completed 20 seconds of proper hand washing. Start a new hand wash"*
  * Resets all progress and checklist items.

---

### 🔈 **Real-Time Voice Guidance**

The assistant speaks:

* What the user should fix
* When technique is right
* When the user is not showing hands
* When 20 seconds are done

Using the built-in Web Speech API.

---

### 🎛 Visual Overlays

The demo includes multiple overlays:

* 🟢 **Hand landmarks** drawn on canvas
* 📊 **AI inference speed (ms)**
* ⚡ **Overlay lag measurement (ms)**
* 🧼 **Technique checklist (bottom-right)**
* 💡 **Guidance panel (top-right)**
* ⏱ **20-second progress popup (center)**
* 🖥️ **Debug info (contact score, orientation, circular motion)**
* 🟩 **Stats.js performance monitor**

---

## 🧪 Technologies Used

### 🖼 **MediaPipe Tasks Vision**

* Hand Landmarker (21 landmarks × 2 hands)
* Runs *completely in the browser*
* No server required

### 🎥 **Webcam / getUserMedia**

Used to stream real-time video into MediaPipe for analysis.

### 🌐 **Three.js**

Provides:

* High-performance WebGL rendering
* Camera + renderer used to anchor overlays

### ⚙️ **Stats.js**

Real-time performance monitor.

### 🔊 **SpeechSynthesis API**

Text-to-speech guidance for users.

### 📦 **Hosted On**

Vercel (static deployment)

---

## 📁 Project Structure

```
/public
index.html
/src
main.js
package.json
README.md
```

Everything happens inside **main.js** — no bundler required.

---

## 🧩 How It Works (High-Level)

1. **getUserMedia** opens the webcam.
2. A hidden `<video>` element streams the camera feed.
3. MediaPipe Hand Landmarker receives each frame at ~15 FPS.
4. The engine computes:

   * contact score
   * circular motion pattern
   * palm orientation
5. Sticky technique states are updated.
6. Timer starts once at least 1 technique is correct.
7. Progress, guidance, and checklists update in real time.
8. Voice feedback uses the Web Speech API.
9. When the 20-second timer finishes:

   * Show “Good Job”
   * Speak completion message
   * Reset everything

---

## 📦 Installation (Local Development)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/webar-handwash-demo.git
cd webar-handwash-demo
```

### 2. Install dependencies (if any)

This demo uses plain JS + CDN modules, so no build step is required.
But if you use a simple dev server:

```bash
npm install
```

### 3. Run locally

```bash
npm run dev
```

Or if using VSCode Live Server extension → right-click **index.html → Open with Live Server**

---

## 🌍 Deployment

This demo is deployed on **Vercel** because:

* Zero configuration
* Automatic HTTPS
* Ideal for WebAR/WebGL apps
* Static files served extremely fast

To deploy:

```bash
vercel
```

---

## 🔒 Browser Compatibility

| Platform                | Supported?                        |
| ----------------------- | --------------------------------- |
| iPhone (Safari)         | ✔ Yes                             |
| Android (Chrome)        | ✔ Yes                             |
| Desktop (Chrome / Edge) | ✔ Yes                             |
| Firefox                 | ⚠ Limited (Web Speech API varies) |

Camera permissions required.

---

## 🙋 How to Use the Demo

1. Visit the demo link:
   👉 [https://webar-handwash-demo.vercel.app/](https://webar-handwash-demo.vercel.app/)
2. Allow camera access.
3. Show **both hands** clearly.
4. Follow the on-screen & voice-based corrections.
5. Maintain correct technique for **20 seconds**.
6. Receive completion feedback and start again!

---

## 🧠 Future Enhancements

* WebXR camera textures (no getUserMedia)
* Plane-anchored AR UI
* Gesture-based menu navigation
* Record full motion data for ML training
* Add WHO 7-step technique detection
* Add Object Recognition Try a small model (like YOLOv8n) that can recognize simple things such as “soap,”
* 

---

## ✨ Credits

* Google MediaPipe
* Three.js community
* Vercel for hosting
* Immigify


