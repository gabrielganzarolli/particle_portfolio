import * as THREE from 'three';

/**
 * Tracks the pointer on the z=0 plane in world space, plus a smoothed travel
 * direction so the field can be given a directional wake.
 */
export class Pointer {
  #scratchVec = new THREE.Vector3();
  #scratchDir = new THREE.Vector3();
  #prev = new THREE.Vector3();

  constructor(domElement, camera) {
    this.camera = camera;
    this.el = domElement;

    this.position = new THREE.Vector3(1e6, 1e6, 0);
    this.velocity = new THREE.Vector3();
    this.active = 0;

    this.target = new THREE.Vector3(1e6, 1e6, 0);
    this.targetActive = 0;
    this.hasSample = false;

    this.onMove = this.onMove.bind(this);
    this.onLeave = this.onLeave.bind(this);

    // Listen on window, not on the canvas. The canvas is a fixed backdrop and
    // the scrolling content sits above it, so canvas-level listeners only fire
    // when nothing is overlapping — which, once the page had a <main>, was
    // never. Window-level capture is immune to whatever is stacked on top.
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onMove, { passive: true });
    window.addEventListener('pointercancel', this.onLeave, { passive: true });
    window.addEventListener('blur', this.onLeave);
    // Fires when the cursor leaves the viewport entirely.
    document.documentElement.addEventListener('pointerleave', this.onLeave, { passive: true });
  }

  onMove(event) {
    const rect = this.el.getBoundingClientRect();
    const ndcX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Project onto the z=0 plane the field lives on.
    const v = this.#scratchVec.set(ndcX, ndcY, 0.5).unproject(this.camera);
    const dir = this.#scratchDir.copy(v).sub(this.camera.position).normalize();

    if (Math.abs(dir.z) < 1e-6) return;
    const distance = -this.camera.position.z / dir.z;

    this.target.copy(this.camera.position).addScaledVector(dir, distance);
    this.targetActive = 1;

    if (!this.hasSample) {
      // First sample: teleport rather than easing in from the parked position
      // off at 1e6, which would otherwise drag a shockwave across the field.
      this.position.copy(this.target);
      this.#prev.copy(this.target);
      this.hasSample = true;
    }
  }

  onLeave() {
    this.targetActive = 0;
  }

  update(dt) {
    const k = 1 - Math.pow(0.0015, dt);

    this.#prev.copy(this.position);
    this.position.lerp(this.target, k);

    if (dt > 0) {
      this.velocity
        .copy(this.position)
        .sub(this.#prev)
        .divideScalar(dt)
        .clampLength(0, 12);
    }

    this.active += (this.targetActive - this.active) * (1 - Math.pow(0.02, dt));
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onMove);
    window.removeEventListener('pointercancel', this.onLeave);
    window.removeEventListener('blur', this.onLeave);
    document.documentElement.removeEventListener('pointerleave', this.onLeave);
  }
}
