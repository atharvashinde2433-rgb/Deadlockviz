# 🔒 DeadlockViz — Deadlock Detection & Visualization System

**DeadlockViz** is an interactive, educational web-based simulation and visualization platform for Operating Systems concepts, focusing on **Deadlock Modeling, Detection, and Avoidance**.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Flask](https://img.shields.io/badge/Flask-3.x-green)
![Vanilla JS](https://img.shields.io/badge/Frontend-HTML5%20%7C%20CSS3%20%7C%20Canvas-orange)

---

## ✨ Features

### 1. 🔗 Resource Allocation Graph (RAG) Simulator
* **Interactive Canvas:** Drag-and-drop processes (circles) and resources (rectangles).
* **Multi-Instance Support:** Resources support 1 to 5 units, visually rendered with instance dots inside (green for allocated, white for free).
* **Holt's Graph Reduction Algorithm:** Evaluates general deadlock detection for single and multi-instance systems step-by-step.
* **Cycle Detection:** Identifies exact circular wait cycles and distinguishes between single-unit cycles (deadlock) and multi-unit cycles resolved by unblocked processes.
* **Wait-For Graph (WFG):** Automatically collapses resource nodes into direct process dependencies.
* **Presets:** Quick-load textbook scenarios (Circular Deadlock, Multi-Instance Cycle with No Deadlock, Multi-Instance Deadlock, Safe Tree).
* **Export:** One-click graph snapshot export to PNG image.

### 2. 🏦 Banker's Algorithm (Deadlock Avoidance)
* **Safety Algorithm:**
  * Computes the dynamic **Need Matrix** ($Need = Max - Allocation$).
  * Searches for a safe process execution sequence using available resources.
  * Displays step-by-step execution traces (`Work Before`, `Alloc Released`, `Work After`).
* **Resource-Request Algorithm Simulator:**
  * Evaluates immediate resource requests from any process in real time:
    * **Step 1:** Verifies $Request \le Need$ (validates maximum claim).
    * **Step 2:** Verifies $Request \le Available$ (checks if resources are currently free).
    * **Step 3:** Runs safety check on tentative state ($Available - Request$, $Alloc + Request$, $Need - Request$).
  * **Commit State:** Allows applying granted requests directly into the active matrices to chain subsequent requests.
  * **Quick Trials:** One-click trials for textbook scenarios (Safe grant, Insufficient available wait, Unsafe state denial).

### 3. 📖 Theory & Comprehensive Concepts
* Coffman's 4 necessary conditions: *Mutual Exclusion*, *Hold & Wait*, *No Preemption*, *Circular Wait*.
* Strategy comparisons: Prevention vs Avoidance vs Detection & Recovery vs Ostrich Algorithm.
* Reference pseudocode for WFG DFS cycle detection, Banker's Safety, Resource-Request, and Holt's Graph Reduction.

---

## 🚀 Getting Started

### Prerequisites
* Python 3.8 or higher
* pip

### Installation & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/atharvashinde2433-rgb/Deadlockviz.git
   cd Deadlockviz
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start the Flask Application:**
   ```bash
   python app.py
   ```

4. **Open in your browser:**
   ```
   http://127.0.0.1:5000
   ```

### 📁 Offline / Static File Mode
The project also supports 100% standalone execution without a backend server! Simply open `index.html` directly in any modern browser.

---

## 📂 Project Structure

```
Deadlockviz/
├── app.py                  # Flask backend & API routes (/api/bankers, /api/rag/detect)
├── requirements.txt        # Python dependencies
├── index.html              # Standalone Home Page
├── simulator.html          # Standalone RAG Simulator
├── bankers.html            # Standalone Banker's Algorithm
├── theory.html             # Standalone Theory Page
├── css/
│   └── style.css           # Design system & dark theme styles
├── js/
│   ├── rag.js              # HTML5 Canvas RAG simulation engine
│   ├── simulator_ui.js     # Simulator UI controller & reduction displays
│   ├── bankers.js          # Safety & Resource-Request algorithm engine
│   └── utils.js            # Toast notifications & UI helpers
├── templates/              # Jinja2 Flask templates
│   ├── base.html
│   ├── index.html
│   ├── simulator.html
│   ├── bankers.html
│   └── theory.html
└── static/                 # Static assets for Flask app
    ├── css/style.css
    └── js/
```

---


