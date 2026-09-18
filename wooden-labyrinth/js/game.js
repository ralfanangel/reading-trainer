import * as THREE from "three";
import { LEVEL_1 } from "./level1.js";
import { BallAudio } from "./audio.js";

const MAX_LIVES = 3;
const GRAVITY = 14;
const FRICTION = 0.85;
const MAX_TILT_DEG = 16;
const EDGE_MARGIN = 0.02;

export class LabyrinthGame {
  /**
   * @param {{ canvas: HTMLCanvasElement, ui: Record<string, HTMLElement> }} opts
   */
  constructor({ canvas, ui }) {
    this.canvas = canvas;
    this.ui = ui;
    this.level = LEVEL_1;
    this.audio = new BallAudio();

    this.lives = MAX_LIVES;
    this.state = "title"; // title | playing | paused | lifeLost | won | gameover
    this.tilt = { x: 0, z: 0 }; // radians, board pitch/roll (visual + physics)
    this.gyroEnabled = false;
    this.gyroLive = false; // true once real samples arrive
    this.pointerTilt = { x: 0, z: 0 };
    this.keys = new Set();
    this.hintShown = false;
    /** Baseline hold pose — captured on first sample after Start */
    this.gyroCal = { beta: 0, gamma: 0, ax: 0, ay: 0, ready: false };
    this._gyroSampleAt = 0;

    this.ball = {
      x: 0,
      z: 0,
      y: 0,
      vx: 0,
      vz: 0,
      radius: this.level.ballRadius,
      falling: false,
      fallT: 0,
    };

    this.wallAABBs = [];
    this.boardHalfW = 0;
    this.boardHalfD = 0;
    this.origin = new THREE.Vector3();

    this._clock = new THREE.Clock();
    this._raf = 0;
    this._woodTexture = null;
    this._boardGroup = null;
    this._ballMesh = null;
    this._goalLight = null;
    this._dust = null;

    this._initThree();
    this._buildLevel(this.level);
    this._bindUI();
    this._bindInput();
    this._resize();
    window.addEventListener("resize", () => this._resize());
    this._loop();
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x16110e);
    this.scene.fog = new THREE.FogExp2(0x16110e, 0.028);

    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);
    this.camera.position.set(0, 14, 13);
    this.camera.lookAt(0, 0, 0.5);

    // Soft museum lighting — warm key, cool fill mist
    const hemi = new THREE.HemisphereLight(0xffe8d0, 0x3a4038, 0.85);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffe0b8, 1.85);
    key.position.set(6, 14, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 40;
    key.shadow.camera.left = -12;
    key.shadow.camera.right = 12;
    key.shadow.camera.top = 12;
    key.shadow.camera.bottom = -12;
    key.shadow.bias = -0.0003;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x8fb0a8, 0.35);
    rim.position.set(-8, 6, -6);
    this.scene.add(rim);

    const ambient = new THREE.AmbientLight(0x3a2a20, 0.25);
    this.scene.add(ambient);

    // Distant soft pedestal
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(28, 64),
      new THREE.MeshStandardMaterial({
        color: 0x0e0b09,
        roughness: 1,
        metalness: 0,
      })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    this._woodTexture = this._makeWoodTexture();
  }

  _makeWoodTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#6e4224";
    ctx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 80; i++) {
      const y = (i / 80) * 512 + Math.sin(i * 0.7) * 4;
      ctx.strokeStyle = `rgba(${40 + (i % 5) * 8},${22 + (i % 3) * 4},${10}, ${0.08 + (i % 7) * 0.015})`;
      ctx.lineWidth = 1 + (i % 3);
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= 512; x += 8) {
        ctx.lineTo(x, y + Math.sin(x * 0.04 + i) * 3 + Math.cos(x * 0.01) * 2);
      }
      ctx.stroke();
    }

    // Subtle knots
    for (let k = 0; k < 5; k++) {
      const kx = 60 + Math.random() * 400;
      const ky = 60 + Math.random() * 400;
      const g = ctx.createRadialGradient(kx, ky, 2, kx, ky, 18 + Math.random() * 12);
      g.addColorStop(0, "rgba(50,28,14,0.45)");
      g.addColorStop(1, "rgba(50,28,14,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(kx, ky, 28, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 8;
    return tex;
  }

  _buildLevel(level) {
    if (this._boardGroup) {
      this.scene.remove(this._boardGroup);
      this._boardGroup.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
      });
    }

    const cs = level.cellSize;
    const w = level.width * cs;
    const d = level.depth * cs;
    this.boardHalfW = w / 2;
    this.boardHalfD = d / 2;
    this.origin.set(-this.boardHalfW, 0, -this.boardHalfD);

    this._boardGroup = new THREE.Group();
    this.scene.add(this._boardGroup);

    const boardMat = new THREE.MeshStandardMaterial({
      map: this._woodTexture.clone(),
      roughness: 0.72,
      metalness: 0.05,
      color: level.palette.board,
    });
    boardMat.map.repeat.set(2.2, 2.6);

    const wallMat = new THREE.MeshStandardMaterial({
      map: this._woodTexture.clone(),
      roughness: 0.65,
      metalness: 0.04,
      color: level.palette.wall,
    });
    wallMat.map.repeat.set(0.6, 0.4);

    const wallTopMat = new THREE.MeshStandardMaterial({
      color: level.palette.wallTop,
      roughness: 0.45,
      metalness: 0.08,
    });

    // Thick wooden slab
    const thickness = 0.55;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, thickness, d + 0.5), boardMat);
    slab.position.set(0, -thickness / 2, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    this._boardGroup.add(slab);

    // Slightly raised play surface with groove lip
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.06, d),
      new THREE.MeshStandardMaterial({
        map: this._woodTexture.clone(),
        color: 0x8a5530,
        roughness: 0.8,
        metalness: 0.02,
      })
    );
    surface.material.map.repeat.set(2, 2.4);
    surface.position.y = 0.03;
    surface.receiveShadow = true;
    this._boardGroup.add(surface);

    // Rim (with openings) + interior walls
    const wallH = 0.42;
    const wallT = 0.18;
    const rimSegs = (level.rim || []).map((s) => s.map((v) => v * cs));
    const allWalls = [...rimSegs, ...level.walls.map((s) => s.map((v) => v * cs))];

    this.wallAABBs = [];

    for (const [x1, z1, x2, z2] of allWalls) {
      const hx = Math.abs(x2 - x1);
      const hz = Math.abs(z2 - z1);
      const isH = hx >= hz;
      const len = Math.max(hx, hz) + wallT;
      const geo = new THREE.BoxGeometry(isH ? len : wallT, wallH, isH ? wallT : len);
      const mesh = new THREE.Mesh(geo, [wallMat, wallMat, wallTopMat, wallMat, wallMat, wallMat]);
      const cx = (x1 + x2) / 2 + this.origin.x;
      const cz = (z1 + z2) / 2 + this.origin.z;
      mesh.position.set(cx, wallH / 2 + 0.03, cz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this._boardGroup.add(mesh);

      const halfX = (isH ? len : wallT) / 2;
      const halfZ = (isH ? wallT : len) / 2;
      this.wallAABBs.push({
        minX: cx - halfX,
        maxX: cx + halfX,
        minZ: cz - halfZ,
        maxZ: cz + halfZ,
      });
    }

    // Goal hole — dark recess + soft brass glow
    const goalLocal = {
      x: level.goal.x * cs + this.origin.x,
      z: level.goal.z * cs + this.origin.z,
    };
    this.goal = { ...goalLocal, radius: level.goalRadius };
    this.hazards = (level.hazards || []).map((h) => ({
      x: h.x * cs + this.origin.x,
      z: h.z * cs + this.origin.z,
      radius: h.radius,
    }));

    this._addHole(goalLocal.x, goalLocal.z, level.goalRadius, {
      glow: true,
      color: level.palette.goalGlow,
    });

    for (const h of this.hazards) {
      this._addHole(h.x, h.z, h.radius, { glow: false, color: level.palette.hazard });
    }

    // Start marker — subtle inlaid circle
    const startX = level.start.x * cs + this.origin.x;
    const startZ = level.start.z * cs + this.origin.z;
    const startRing = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.28, 32),
      new THREE.MeshStandardMaterial({
        color: 0xb8925a,
        roughness: 0.5,
        metalness: 0.3,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      })
    );
    startRing.rotation.x = -Math.PI / 2;
    startRing.position.set(startX, 0.065, startZ);
    this._boardGroup.add(startRing);

    // Ball — polished maple / ivory with soft specular
    const ballGeo = new THREE.SphereGeometry(level.ballRadius, 48, 48);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xf7edd8,
      roughness: 0.32,
      metalness: 0.22,
      emissive: 0xb8925a,
      emissiveIntensity: 0.35,
    });
    this._ballMesh = new THREE.Mesh(ballGeo, ballMat);
    this._ballMesh.castShadow = true;
    this._boardGroup.add(this._ballMesh);

    this._ballShadow = new THREE.Mesh(
      new THREE.CircleGeometry(level.ballRadius * 0.95, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    this._ballShadow.rotation.x = -Math.PI / 2;
    this._ballShadow.position.y = 0.07;
    this._boardGroup.add(this._ballShadow);

    this._ballLight = new THREE.PointLight(0xffe2b0, 0.85, 2.8);
    this._boardGroup.add(this._ballLight);

    // Soft floating dust motes
    const dustCount = 40;
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * w * 1.2;
      positions[i * 3 + 1] = 0.4 + Math.random() * 2.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * d * 1.2;
    }
    dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    this._dust = new THREE.Points(
      dustGeo,
      new THREE.PointsMaterial({
        color: 0xe8dcc8,
        size: 0.04,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      })
    );
    this._boardGroup.add(this._dust);

    // Camera frames the full board on portrait phones
    const dist = Math.max(w, d) * 1.35;
    this._camBase = { x: 0.15, y: dist * 0.95, z: dist * 0.88 };
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this._camBase.x, this._camBase.y, this._camBase.z);
    this.camera.lookAt(0, -0.15, 0);

    this._resetBall(false);
  }

  _addHole(x, z, radius, { glow, color }) {
    const holeCut = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius * 0.92, 0.22, 32),
      new THREE.MeshStandardMaterial({ color: 0x080605, roughness: 1, metalness: 0 })
    );
    holeCut.position.set(x, 0.02, z);
    this._boardGroup.add(holeCut);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius + 0.035, glow ? 0.035 : 0.028, 12, 48),
      new THREE.MeshStandardMaterial({
        color: color || 0x2a2018,
        roughness: glow ? 0.35 : 0.7,
        metalness: glow ? 0.65 : 0.1,
        emissive: glow ? color : 0x000000,
        emissiveIntensity: glow ? 0.15 : 0,
      })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.08, z);
    this._boardGroup.add(ring);

    if (glow) {
      this._goalLight = new THREE.PointLight(color, 0.9, 3.5);
      this._goalLight.position.set(x, 0.55, z);
      this._boardGroup.add(this._goalLight);
    }
  }

  _resetBall(keepLives = true) {
    const cs = this.level.cellSize;
    this.ball.x = this.level.start.x * cs + this.origin.x;
    this.ball.z = this.level.start.z * cs + this.origin.z;
    this.ball.y = this.level.ballRadius + 0.06;
    this.ball.vx = 0;
    this.ball.vz = 0;
    this.ball.falling = false;
    this.ball.fallT = 0;
    this.tilt.x = 0;
    this.tilt.z = 0;
    this.pointerTilt.x = 0;
    this.pointerTilt.z = 0;
    // Re-capture level pose so the current phone angle is "flat"
    this.gyroCal.ready = false;
    if (!keepLives) this.lives = MAX_LIVES;
    this._syncLivesUI();
    this.audio.hush();
  }

  _bindUI() {
    const {
      btnStart,
      btnResume,
      btnRestart,
      btnContinueLife,
      btnReplay,
      btnGameoverRestart,
      btnPause,
    } = this.ui;

    btnStart?.addEventListener("click", () => this.startGame());
    btnResume?.addEventListener("click", () => this.resume());
    btnRestart?.addEventListener("click", () => {
      this._hideAllScreens();
      this._resetBall(true);
      this.state = "playing";
      this._showPlayingChrome();
    });
    btnContinueLife?.addEventListener("click", () => {
      this._hideAllScreens();
      this._resetBall(true);
      this.state = "playing";
      this._showPlayingChrome();
    });
    btnReplay?.addEventListener("click", () => {
      this._hideAllScreens();
      this._resetBall(false);
      this.state = "playing";
      this._showPlayingChrome();
    });
    btnGameoverRestart?.addEventListener("click", () => {
      this._hideAllScreens();
      this._resetBall(false);
      this.state = "playing";
      this._showPlayingChrome();
    });
    btnPause?.addEventListener("click", () => this.pause());
  }

  _bindInput() {
    // Pointer drag tilt (desktop / fallback)
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e) => {
      if (this.state !== "playing") return;
      dragging = true;
      const p = e.touches ? e.touches[0] : e;
      lastX = p.clientX;
      lastY = p.clientY;
    };
    const onMove = (e) => {
      // Touch/drag works as fallback, and also when gyro never started streaming
      if (!dragging || (this.gyroEnabled && this.gyroLive)) return;
      const p = e.touches ? e.touches[0] : e;
      const dx = p.clientX - lastX;
      const dy = p.clientY - lastY;
      lastX = p.clientX;
      lastY = p.clientY;
      // Drag right → tip right edge down → ball rolls right
      this.pointerTilt.z -= dx * 0.0009;
      // Drag down → tip near edge down → ball rolls toward camera
      this.pointerTilt.x += dy * 0.0009;
      const max = THREE.MathUtils.degToRad(MAX_TILT_DEG);
      this.pointerTilt.x = THREE.MathUtils.clamp(this.pointerTilt.x, -max, max);
      this.pointerTilt.z = THREE.MathUtils.clamp(this.pointerTilt.z, -max, max);
    };
    const onUp = () => {
      dragging = false;
    };

    this.canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    this.canvas.addEventListener("touchstart", onDown, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onUp);

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key);
      if (e.key === "Escape" && this.state === "playing") this.pause();
      else if (e.key === "Escape" && this.state === "paused") this.resume();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key));

    window.addEventListener("deviceorientation", (e) => this._onOrientation(e), true);
    window.addEventListener("devicemotion", (e) => this._onMotion(e), true);
  }

  _screenAngle() {
    const so = window.screen?.orientation?.angle;
    if (typeof so === "number") return so;
    if (typeof window.orientation === "number") return window.orientation;
    return 0;
  }

  /**
   * Rotate device pitch/roll deltas into portrait screen space.
   * Returns { pitchDeg, rollDeg } where pitch tips near/far, roll tips left/right.
   */
  _orientToScreen(pitchDeg, rollDeg) {
    const angle = ((this._screenAngle() % 360) + 360) % 360;
    const rad = THREE.MathUtils.degToRad(angle);
    const c = Math.cos(rad);
    const s = Math.sin(rad);
    // Device frame → keep "downhill toward bottom of screen" stable across rotations
    return {
      pitchDeg: pitchDeg * c - rollDeg * s,
      rollDeg: pitchDeg * s + rollDeg * c,
    };
  }

  _applyTiltDegrees(pitchDeg, rollDeg) {
    const max = MAX_TILT_DEG;
    const dead = 0.6;
    let p = Math.abs(pitchDeg) < dead ? 0 : pitchDeg;
    let r = Math.abs(rollDeg) < dead ? 0 : rollDeg;
    p = THREE.MathUtils.clamp(p, -max, max);
    r = THREE.MathUtils.clamp(r, -max, max);
    // Visual: +rotation.x drops the near (+Z) edge; +rotation.z lifts the +X edge.
    // Phone: pitch>0 (top up / near down relative to cal) → near edge down → +tilt.x
    // Phone: roll>0 (right edge down) → need -tilt.z so +X drops.
    this.tilt.x = THREE.MathUtils.degToRad(p);
    this.tilt.z = THREE.MathUtils.degToRad(-r);
    this.gyroLive = true;
    this._gyroSampleAt = performance.now();
  }

  _onOrientation(e) {
    if (!this.gyroEnabled || this.state !== "playing") return;
    if (e.beta == null && e.gamma == null) return;

    const beta = e.beta ?? 0;
    const gamma = e.gamma ?? 0;

    if (!this.gyroCal.ready) {
      this.gyroCal.beta = beta;
      this.gyroCal.gamma = gamma;
      this.gyroCal.ready = true;
      this.tilt.x = 0;
      this.tilt.z = 0;
      this.gyroLive = true;
      this._gyroSampleAt = performance.now();
      return;
    }

    // Relative to the pose at Start / respawn — flat hold = no drift "uphill"
    const rawPitch = beta - this.gyroCal.beta;
    const rawRoll = gamma - this.gyroCal.gamma;
    const { pitchDeg, rollDeg } = this._orientToScreen(rawPitch, rawRoll);
    this._applyTiltDegrees(pitchDeg, rollDeg);
  }

  _onMotion(e) {
    if (!this.gyroEnabled || this.state !== "playing") return;
    const g = e.accelerationIncludingGravity;
    if (!g || (g.x == null && g.y == null)) return;

    // Prefer orientation when it is streaming; motion is a backup / iOS helper
    if (this.gyroLive && performance.now() - this._gyroSampleAt < 250) return;

    const ax = g.x ?? 0;
    const ay = g.y ?? 0;

    if (!this.gyroCal.ready) {
      this.gyroCal.ax = ax;
      this.gyroCal.ay = ay;
      this.gyroCal.ready = true;
      this.tilt.x = 0;
      this.tilt.z = 0;
      this.gyroLive = true;
      this._gyroSampleAt = performance.now();
      return;
    }

    // ~9.8 m/s² ≈ 90°; scale so a gentle tip stays within MAX_TILT_DEG
    const toDeg = (v) => THREE.MathUtils.clamp((v / 9.8) * 90, -90, 90);
    const rawPitch = toDeg(ay - this.gyroCal.ay);
    const rawRoll = toDeg(ax - this.gyroCal.ax);
    const { pitchDeg, rollDeg } = this._orientToScreen(rawPitch, rawRoll);
    this._applyTiltDegrees(pitchDeg, rollDeg);
  }

  async startGame() {
    await this.audio.unlock();
    await this._requestGyro();
    this._hideAllScreens();
    this._resetBall(false);
    this.state = "playing";
    this._showPlayingChrome();
    if (!this.hintShown) {
      this.hintShown = true;
      this._showHint();
    }
    // If permission was granted but no events arrive, fall back to touch
    if (this.gyroEnabled) {
      setTimeout(() => {
        if (this.state !== "playing") return;
        if (!this.gyroLive) {
          this.gyroEnabled = false;
          if (this.ui.gyroNote) {
            this.ui.gyroNote.textContent =
              "Keine Gyro-Daten — mit dem Finger ziehen zum Neigen.";
          }
          this.ui.tiltHint?.classList.add("hidden");
          this.ui.desktopHint?.classList.remove("hidden");
          setTimeout(() => this.ui.desktopHint?.classList.add("hidden"), 2800);
        }
      }, 1200);
    }
  }

  async _requestGyro() {
    const note = this.ui.gyroNote;
    this.gyroEnabled = false;
    this.gyroLive = false;
    this.gyroCal.ready = false;

    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    try {
      // iOS 13+ requires a user-gesture permission for both APIs
      if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
        try {
          await DeviceMotionEvent.requestPermission();
        } catch {
          /* continue — orientation alone may still work */
        }
      }
      if (
        typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"
      ) {
        const res = await DeviceOrientationEvent.requestPermission();
        this.gyroEnabled = res === "granted";
      } else if (isTouch && typeof DeviceOrientationEvent !== "undefined") {
        this.gyroEnabled = true;
      } else {
        this.gyroEnabled = false;
      }
    } catch {
      this.gyroEnabled = false;
    }

    if (note) {
      note.textContent = this.gyroEnabled
        ? "Gyroskop aktiv — iPhone flach halten, dann sanft neigen."
        : "Desktop: Ziehen oder Pfeiltasten zum Neigen.";
    }
  }

  _showHint() {
    const el = this.gyroEnabled ? this.ui.tiltHint : this.ui.desktopHint;
    if (!el) return;
    el.classList.remove("hidden");
    setTimeout(() => el.classList.add("hidden"), 3200);
  }

  pause() {
    if (this.state !== "playing") return;
    this.state = "paused";
    this.audio.hush();
    this.ui.pauseScreen?.classList.add("is-on");
    this.ui.btnPause?.classList.add("hidden");
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.ui.pauseScreen?.classList.remove("is-on");
    this.ui.btnPause?.classList.remove("hidden");
  }

  _showPlayingChrome() {
    this.ui.hud?.classList.remove("hidden");
    this.ui.btnPause?.classList.remove("hidden");
  }

  _hideAllScreens() {
    [
      this.ui.titleScreen,
      this.ui.pauseScreen,
      this.ui.lifeLostScreen,
      this.ui.winScreen,
      this.ui.gameoverScreen,
    ].forEach((el) => el?.classList.remove("is-on"));
  }

  _syncLivesUI() {
    const nodes = this.ui.lives?.querySelectorAll(".life") ?? [];
    nodes.forEach((node, i) => {
      node.classList.toggle("is-lost", i >= this.lives);
    });
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _applyKeyboardTilt(dt) {
    if (this.gyroEnabled && this.gyroLive) return;
    const max = THREE.MathUtils.degToRad(MAX_TILT_DEG);
    const rate = 1.1 * dt;
    // Left → tip left down → ball left → +tilt.z (because ax = -sin(z))
    if (this.keys.has("ArrowLeft") || this.keys.has("a")) this.pointerTilt.z += rate;
    if (this.keys.has("ArrowRight") || this.keys.has("d")) this.pointerTilt.z -= rate;
    // Up → tip far edge down → ball away (-Z) → -tilt.x
    if (this.keys.has("ArrowUp") || this.keys.has("w")) this.pointerTilt.x -= rate;
    if (this.keys.has("ArrowDown") || this.keys.has("s")) this.pointerTilt.x += rate;
    this.pointerTilt.x = THREE.MathUtils.clamp(this.pointerTilt.x, -max, max);
    this.pointerTilt.z = THREE.MathUtils.clamp(this.pointerTilt.z, -max, max);
    this.tilt.x = this.pointerTilt.x;
    this.tilt.z = this.pointerTilt.z;
  }

  _simulate(dt) {
    // Allow the ball to sink into the goal after a win
    if (this.state === "won" && this.ball.falling) {
      this.ball.fallT += dt;
      this.ball.y -= 2.2 * dt + this.ball.fallT * 3 * dt;
      this._boardGroup.rotation.x *= 0.96;
      this._boardGroup.rotation.z *= 0.96;
      return;
    }

    if (this.state !== "playing") return;

    this._applyKeyboardTilt(dt);
    if (!(this.gyroEnabled && this.gyroLive)) {
      this.tilt.x = this.pointerTilt.x;
      this.tilt.z = this.pointerTilt.z;
    }

    // Visual board tilt
    this._boardGroup.rotation.x = this.tilt.x;
    this._boardGroup.rotation.z = this.tilt.z;

    if (this.ball.falling) {
      this.ball.fallT += dt;
      this.ball.y -= 2.8 * dt + this.ball.fallT * 4 * dt;
      this.ball.vx *= 0.98;
      this.ball.vz *= 0.98;
      this.ball.x += this.ball.vx * dt;
      this.ball.z += this.ball.vz * dt;
      if (this.ball.fallT > 0.85) this._onFell();
      return;
    }

    // Gravity matches the visual slope:
    // +tilt.x drops the near (+Z) edge → accelerate +Z
    // +tilt.z lifts the +X edge → accelerate -X
    const ax = -Math.sin(this.tilt.z) * GRAVITY;
    const az = Math.sin(this.tilt.x) * GRAVITY;
    this.ball.vx += ax * dt;
    this.ball.vz += az * dt;

    // Friction
    const speed = Math.hypot(this.ball.vx, this.ball.vz);
    if (speed > 0) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      this.ball.vx *= damp;
      this.ball.vz *= damp;
    }

    // Integrate with substeps for wall stability
    const steps = 3;
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.ball.x += this.ball.vx * h;
      this.ball.z += this.ball.vz * h;
      this._collideWalls();
    }

    this.audio.setSpeed(Math.hypot(this.ball.vx, this.ball.vz));

    // Hazard holes
    for (const h of this.hazards) {
      const hd = Math.hypot(this.ball.x - h.x, this.ball.z - h.z);
      if (hd < h.radius * 0.78) {
        this.ball.falling = true;
        this.ball.fallT = 0;
        this.audio.playFall();
        return;
      }
      if (hd < h.radius * 1.05) {
        this.ball.vx += (h.x - this.ball.x) * 2.2 * dt;
        this.ball.vz += (h.z - this.ball.z) * 2.2 * dt;
      }
    }

    // Goal check
    const dx = this.ball.x - this.goal.x;
    const dz = this.ball.z - this.goal.z;
    const dist = Math.hypot(dx, dz);
    if (dist < this.goal.radius * 0.72 && speed < 2.8) {
      this._onGoal();
      return;
    }
    // Soft pull into hole when near
    if (dist < this.goal.radius * 1.05) {
      this.ball.vx += -dx * 3 * dt;
      this.ball.vz += -dz * 3 * dt;
      if (dist < this.goal.radius * 0.55) {
        this._onGoal();
        return;
      }
    }

    // Fall off board edges (through rim openings)
    const limitX = this.boardHalfW + EDGE_MARGIN;
    const limitZ = this.boardHalfD + EDGE_MARGIN;
    if (Math.abs(this.ball.x) > limitX || Math.abs(this.ball.z) > limitZ) {
      this.ball.falling = true;
      this.ball.fallT = 0;
      this.audio.playFall();
    }
  }

  _collideWalls() {
    const r = this.ball.radius;
    for (const w of this.wallAABBs) {
      const nearestX = THREE.MathUtils.clamp(this.ball.x, w.minX, w.maxX);
      const nearestZ = THREE.MathUtils.clamp(this.ball.z, w.minZ, w.maxZ);
      let dx = this.ball.x - nearestX;
      let dz = this.ball.z - nearestZ;
      const distSq = dx * dx + dz * dz;
      if (distSq >= r * r) continue;

      let dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        // Center inside AABB — push out via smallest overlap
        const left = this.ball.x - w.minX;
        const right = w.maxX - this.ball.x;
        const top = this.ball.z - w.minZ;
        const bottom = w.maxZ - this.ball.z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) {
          this.ball.x = w.minX - r;
          if (this.ball.vx > 0) this._bounceAxis("x");
        } else if (m === right) {
          this.ball.x = w.maxX + r;
          if (this.ball.vx < 0) this._bounceAxis("x");
        } else if (m === top) {
          this.ball.z = w.minZ - r;
          if (this.ball.vz > 0) this._bounceAxis("z");
        } else {
          this.ball.z = w.maxZ + r;
          if (this.ball.vz < 0) this._bounceAxis("z");
        }
        continue;
      }

      const nx = dx / dist;
      const nz = dz / dist;
      const penetration = r - dist;
      this.ball.x += nx * penetration;
      this.ball.z += nz * penetration;
      const vn = this.ball.vx * nx + this.ball.vz * nz;
      if (vn < 0) {
        const restitution = 0.28;
        this.ball.vx -= (1 + restitution) * vn * nx;
        this.ball.vz -= (1 + restitution) * vn * nz;
        const impact = Math.min(1, Math.abs(vn) / 2.5);
        if (impact > 0.12) this.audio.playImpact(impact);
      }
    }
  }

  _bounceAxis(axis) {
    const restitution = 0.28;
    if (axis === "x") {
      const impact = Math.min(1, Math.abs(this.ball.vx) / 2.5);
      this.ball.vx *= -restitution;
      if (impact > 0.12) this.audio.playImpact(impact);
    } else {
      const impact = Math.min(1, Math.abs(this.ball.vz) / 2.5);
      this.ball.vz *= -restitution;
      if (impact > 0.12) this.audio.playImpact(impact);
    }
  }

  _onFell() {
    this.lives -= 1;
    this._syncLivesUI();
    this.audio.hush();
    if (this.lives <= 0) {
      this.state = "gameover";
      this.ui.btnPause?.classList.add("hidden");
      this.ui.gameoverScreen?.classList.add("is-on");
      return;
    }
    this.state = "lifeLost";
    this.ui.btnPause?.classList.add("hidden");
    if (this.ui.lifeLostTitle) this.ui.lifeLostTitle.textContent = "Vom Brett gefallen";
    if (this.ui.lifeLostCopy) {
      this.ui.lifeLostCopy.textContent =
        this.lives === 1 ? "Noch ein Leben. Langsam." : `Noch ${this.lives} Leben.`;
    }
    this.ui.lifeLostScreen?.classList.add("is-on");
  }

  _onGoal() {
    this.state = "won";
    this.ball.falling = true;
    this.ball.fallT = 0;
    this.audio.playGoal();
    this.ui.btnPause?.classList.add("hidden");
    // Show win soon while the ball sinks into the hole
    setTimeout(() => this.ui.winScreen?.classList.add("is-on"), 700);
  }

  _updateVisuals(t) {
    if (this._ballMesh) {
      this._ballMesh.position.set(this.ball.x, this.ball.y, this.ball.z);
      if (this._ballLight) this._ballLight.position.set(this.ball.x, this.ball.y + 0.35, this.ball.z);
      if (this._ballShadow) {
        this._ballShadow.position.x = this.ball.x;
        this._ballShadow.position.z = this.ball.z;
        this._ballShadow.visible = !this.ball.falling || this.ball.y > 0;
        this._ballShadow.material.opacity = this.ball.falling
          ? Math.max(0, 0.35 - this.ball.fallT * 0.4)
          : 0.35;
      }
      // Roll rotation from velocity
      const speed = Math.hypot(this.ball.vx, this.ball.vz);
      if (speed > 0.01 && !this.ball.falling) {
        const axis = new THREE.Vector3(this.ball.vz, 0, -this.ball.vx).normalize();
        this._ballMesh.rotateOnWorldAxis(axis, (speed * 0.016) / this.ball.radius);
      }
    }
    if (this._goalLight) {
      this._goalLight.intensity = 0.7 + Math.sin(t * 1.6) * 0.25;
    }
    if (this._dust) {
      this._dust.rotation.y = t * 0.02;
      const arr = this._dust.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] += Math.sin(t + i) * 0.0004;
      }
      this._dust.geometry.attributes.position.needsUpdate = true;
    }

    // Gentle camera breathe + idle board sway on title
    if (this._camBase) {
      this.camera.position.x = this._camBase.x + Math.sin(t * 0.18) * 0.22;
      this.camera.position.y = this._camBase.y + Math.sin(t * 0.12) * 0.08;
      this.camera.position.z = this._camBase.z + Math.cos(t * 0.15) * 0.12;
      this.camera.lookAt(0, -0.15, 0);
    }
    if (this.state === "title" && this._boardGroup) {
      this._boardGroup.rotation.x = Math.sin(t * 0.35) * 0.06;
      this._boardGroup.rotation.z = Math.cos(t * 0.28) * 0.05;
    }
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop);
    const dt = Math.min(0.033, this._clock.getDelta());
    const t = this._clock.elapsedTime;
    this._simulate(dt);
    this._updateVisuals(t);
    this.renderer.render(this.scene, this.camera);
  };
}
