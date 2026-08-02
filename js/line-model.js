import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const canvas = document.getElementById("line-model");
if (!canvas) {
  console.warn("[line-model] #line-model canvas missing");
} else {
  const LINE_COLOR = 0x01e1e5;
  const MODEL_URL = "assets/model-line.glb";

  const renderer = new THREE.WebGLRenderer({
    canvas,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const root = new THREE.Group();
  scene.add(root);

  const lineMat = new THREE.LineBasicMaterial({
    color: LINE_COLOR,
    transparent: true,
    opacity: 1,
  });

  const wireMat = new THREE.MeshBasicMaterial({
    color: LINE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  });

  function fitCameraToObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      console.warn("[line-model] empty bounds");
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    object.position.sub(center);

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = (camera.fov * Math.PI) / 180;
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.8;
    camera.position.set(dist * 0.7, dist * 0.35, dist);
    camera.near = Math.max(dist / 200, 0.001);
    camera.far = dist * 40;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
  }

  function addLineDrawing(object) {
    object.updateWorldMatrix(true, true);
    let meshCount = 0;

    object.traverse((child) => {
      if (!child.isMesh || !child.geometry) return;
      meshCount += 1;

      const wire = new THREE.Mesh(child.geometry, wireMat);
      wire.applyMatrix4(child.matrixWorld);
      root.add(wire);

      const edges = new THREE.EdgesGeometry(child.geometry, 15);
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.applyMatrix4(child.matrixWorld);
      root.add(lines);
    });

    return meshCount;
  }

  function resize() {
    const parent = canvas.parentElement;
    const w = Math.max(parent?.clientWidth || 0, 1);
    const h = Math.max(parent?.clientHeight || 0, 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener("resize", resize);
  resize();

  const scrollRoot = document.querySelector(".history-main") || document.documentElement;
  let targetRotY = 0;
  let currentRotY = 0;

  function syncScrollRotation() {
    const maxScroll = Math.max(scrollRoot.scrollHeight - scrollRoot.clientHeight, 1);
    const progress = Math.min(Math.max(scrollRoot.scrollTop / maxScroll, 0), 1);
    // full turn across the page scroll
    targetRotY = progress * Math.PI * 2;
  }

  scrollRoot.addEventListener("scroll", syncScrollRotation, { passive: true });
  syncScrollRotation();

  console.log("[line-model] loading", MODEL_URL);
  new GLTFLoader().load(
    MODEL_URL,
    (gltf) => {
      const count = addLineDrawing(gltf.scene);
      console.log("[line-model] meshes", count);
      if (!count) return;
      fitCameraToObject(root);
      resize();
      console.log("[line-model] ready");
    },
    undefined,
    (err) => console.error("[line-model] load failed", err)
  );

  function tick() {
    currentRotY += (targetRotY - currentRotY) * 0.12;
    root.rotation.y = currentRotY;
    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}
