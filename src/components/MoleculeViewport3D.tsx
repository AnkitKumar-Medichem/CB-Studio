import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { AnalyzedAtom, MoleculeModel, Vec3 } from '../chemistry/types';

export type RenderStyle = 'ball-stick' | 'space-fill' | 'wireframe';

export interface MoleculeViewportHandle {
  resetCamera: () => void;
  exportPng: () => void;
  focusAtom: (atomId: number) => void;
}

interface MoleculeViewport3DProps {
  molecule: MoleculeModel | null;
  selectedAtomId: number | null;
  onSelectAtom: (atomId: number | null) => void;
  renderStyle: RenderStyle;
  showLonePairs: boolean;
  showHybridOrbitals: boolean;
  showBondAngles: boolean;
  showVseprCage: boolean;
  showLabels: boolean;
  autoSpin: boolean;
}

// Reusable scratch math objects (zero GC in render loop)
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecMid = new THREE.Vector3();
const _vecDir = new THREE.Vector3();
const _vecUp = new THREE.Vector3(0, 1, 0);
const _vecPerp = new THREE.Vector3();
const _vecPerp2 = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _projVec = new THREE.Vector3();
const _camRight = new THREE.Vector3();
const _camUp = new THREE.Vector3();
const _rotQuat = new THREE.Quaternion();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createTeardropLobeGeometry(length = 1.05, maxRadius = 0.28): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  const steps = 24;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0 at atom center, 1 at tip
    const y = t * length;
    // Smooth pear/orbital profile: narrow neck near nucleus, bulbous outer end
    const profile =
      Math.sin(Math.pow(t, 0.72) * Math.PI) * (0.28 + 0.85 * t);
    pts.push(new THREE.Vector2(Math.max(0.001, profile * maxRadius), y));
  }
  pts.push(new THREE.Vector2(0.001, length));
  return new THREE.LatheGeometry(pts, 24);
}

function needsLightOutline(hex: string): boolean {
  const c = new THREE.Color(hex);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return lum > 0.78;
}

function disposeObject3D(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (
      child instanceof THREE.Mesh ||
      child instanceof THREE.Line ||
      child instanceof THREE.LineSegments
    ) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  });
}

export const MoleculeViewport3D = forwardRef<
  MoleculeViewportHandle,
  MoleculeViewport3DProps
>(function MoleculeViewport3D(
  {
    molecule,
    selectedAtomId,
    onSelectAtom,
    renderStyle,
    showLonePairs,
    showHybridOrbitals,
    showBondAngles,
    showVseprCage,
    showLabels,
    autoSpin,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const labelLayerRef = useRef<HTMLDivElement | null>(null);
  const angleLabelLayerRef = useRef<HTMLDivElement | null>(null);

  const [contextLost, setContextLost] = useState(false);
  const [hoveredAtom, setHoveredAtom] = useState<{
    atom: AnalyzedAtom;
    x: number;
    y: number;
  } | null>(null);

  // Mutable refs so Three.js loop never restarts on React state updates
  const propsRef = useRef({
    molecule,
    selectedAtomId,
    onSelectAtom,
    renderStyle,
    showLonePairs,
    showHybridOrbitals,
    showBondAngles,
    showVseprCage,
    showLabels,
    autoSpin,
  });
  propsRef.current = {
    molecule,
    selectedAtomId,
    onSelectAtom,
    renderStyle,
    showLonePairs,
    showHybridOrbitals,
    showBondAngles,
    showVseprCage,
    showLabels,
    autoSpin,
  };

  const sceneRefs = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    moleculeGroup: THREE.Group;
    overlayGroup: THREE.Group;
    atomMeshes: THREE.Mesh[];
    raycaster: THREE.Raycaster;
    pointer: THREE.Vector2;
    isSoftwareGl: boolean;
    requestRender: () => void;
    cameraGoal: { pos: THREE.Vector3; target: THREE.Vector3 } | null;
    idealDistance: number;
    angleLabelAnchors: { pos: Vec3; text: string }[];
  } | null>(null);

  // Compute ideal camera distance for current molecule bounding radius
  const computeIdealCamera = (mol: MoleculeModel | null): number => {
    if (!mol || mol.atoms.length === 0) return 6.5;
    let maxR = 1.5;
    for (const a of mol.atoms) {
      const d = Math.hypot(a.position.x, a.position.y, a.position.z) + 1.3;
      if (d > maxR) maxR = d;
    }
    return Math.max(4.6, Math.min(26, maxR * 2.25));
  };

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      const s = sceneRefs.current;
      if (!s) return;
      const dist = s.idealDistance;
      s.moleculeGroup.rotation.set(0, 0, 0);
      s.overlayGroup.rotation.set(0, 0, 0);
      if (s.isSoftwareGl) {
        s.camera.position.set(dist * 0.45, dist * 0.35, dist * 0.88);
        s.controls.target.set(0, 0, 0);
        s.controls.update();
        s.requestRender();
      } else {
        s.cameraGoal = {
          pos: new THREE.Vector3(dist * 0.45, dist * 0.35, dist * 0.88),
          target: new THREE.Vector3(0, 0, 0),
        };
        s.requestRender();
      }
    },
    focusAtom: (atomId: number) => {
      const s = sceneRefs.current;
      const mol = propsRef.current.molecule;
      if (!s || !mol) return;
      const atom = mol.atoms.find((a) => a.id === atomId);
      if (!atom) return;
      const target = new THREE.Vector3(
        atom.position.x,
        atom.position.y,
        atom.position.z
      );
      const offset = s.camera.position.clone().sub(s.controls.target);
      if (offset.length() < 2.2) offset.setLength(3.6);
      if (s.isSoftwareGl) {
        s.controls.target.copy(target);
        s.camera.position.copy(target).add(offset);
        s.controls.update();
        s.requestRender();
      } else {
        s.cameraGoal = {
          pos: target.clone().add(offset),
          target,
        };
        s.requestRender();
      }
    },
    exportPng: () => {
      const s = sceneRefs.current;
      if (!s) return;
      s.renderer.render(s.scene, s.camera);
      const dataUrl = s.renderer.domElement.toDataURL('image/png');
      const link = document.createElement('a');
      const nameSlug = (propsRef.current.molecule?.name || 'molecule')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-');
      link.download = `${nameSlug}-vsepr-3d.png`;
      link.href = dataUrl;
      link.click();
    },
  }));

  // Initialize Three.js WebGL scene once
  useEffect(() => {
    const mount = mountRef.current;
    const container = containerRef.current;
    if (!mount || !container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setPixelRatio(
      isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = false;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    mount.appendChild(renderer.domElement);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => {
      setContextLost(false);
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener(
      'webglcontextrestored',
      handleContextRestored
    );

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xffffff);

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 150);
    camera.position.set(2.8, 2.2, 5.5);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.065;
    controls.minDistance = 2.0;
    controls.maxDistance = 38;
    controls.enablePan = true;

    // Neutral, shadowless scientific illumination (no colored lights, reflections, or shadows)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 0.36);
    keyLight.position.set(3, 5, 6);
    keyLight.castShadow = false;
    scene.add(keyLight);

    const moleculeGroup = new THREE.Group();
    const overlayGroup = new THREE.Group();
    scene.add(moleculeGroup);
    scene.add(overlayGroup);

    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();

    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;
    let lastClockTime = performance.now();
    const pressedArrowKeys = new Set<string>();

    function updateDomLabels() {
      const s = sceneRefs.current;
      const mol = propsRef.current.molecule;
      const w = container?.clientWidth || 1;
      const h = container?.clientHeight || 1;

      if (labelLayerRef.current && mol && propsRef.current.showLabels) {
        const children = labelLayerRef.current.children;
        for (let i = 0; i < mol.atoms.length; i++) {
          const el = children[i] as HTMLElement | undefined;
          if (!el) continue;
          const a = mol.atoms[i];
          _projVec.set(a.position.x, a.position.y, a.position.z);
          if (s) {
            _projVec.applyMatrix4(s.moleculeGroup.matrixWorld);
          }
          _projVec.project(camera);
          if (_projVec.z > 1 || _projVec.z < -1) {
            el.style.opacity = '0';
            continue;
          }
          const sx = ((_projVec.x + 1) / 2) * w;
          const sy = ((-_projVec.y + 1) / 2) * h;
          el.style.opacity = '1';
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${(sy - 20).toFixed(1)}px, 0) translate(-50%, -100%)`;
        }
      }

      if (
        angleLabelLayerRef.current &&
        s &&
        propsRef.current.showBondAngles
      ) {
        const children = angleLabelLayerRef.current.children;
        for (let i = 0; i < s.angleLabelAnchors.length; i++) {
          const el = children[i] as HTMLElement | undefined;
          if (!el) continue;
          const anc = s.angleLabelAnchors[i];
          _projVec.set(anc.pos.x, anc.pos.y, anc.pos.z);
          _projVec.applyMatrix4(s.moleculeGroup.matrixWorld);
          _projVec.project(camera);
          if (_projVec.z > 1 || _projVec.z < -1) {
            el.style.opacity = '0';
            continue;
          }
          const sx = ((_projVec.x + 1) / 2) * w;
          const sy = ((-_projVec.y + 1) / 2) * h;
          el.style.opacity = '1';
          el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
        }
      }
    }

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        const now = performance.now();
        const delta = Math.min(0.05, Math.max(0.001, (now - lastClockTime) / 1000));
        lastClockTime = now;

        const s = sceneRefs.current;
        let needsAnotherFrame = false;

        if (s?.cameraGoal) {
          const factor = 1 - Math.exp(-8 * delta);
          camera.position.lerp(s.cameraGoal.pos, factor);
          controls.target.lerp(s.cameraGoal.target, factor);
          if (
            camera.position.distanceTo(s.cameraGoal.pos) < 0.02 &&
            controls.target.distanceTo(s.cameraGoal.target) < 0.02
          ) {
            camera.position.copy(s.cameraGoal.pos);
            controls.target.copy(s.cameraGoal.target);
            s.cameraGoal = null;
          } else {
            needsAnotherFrame = true;
          }
        }

        if (pressedArrowKeys.size > 0 && s) {
          const rotStep = delta * 1.75;
          _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();
          _camRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();

          let yaw = 0;
          if (pressedArrowKeys.has('ArrowRight')) yaw += rotStep;
          if (pressedArrowKeys.has('ArrowLeft')) yaw -= rotStep;
          if (yaw !== 0) {
            _rotQuat.setFromAxisAngle(_camUp, yaw);
            s.moleculeGroup.quaternion.premultiply(_rotQuat);
          }

          let pitch = 0;
          if (pressedArrowKeys.has('ArrowDown')) pitch += rotStep;
          if (pressedArrowKeys.has('ArrowUp')) pitch -= rotStep;
          if (pitch !== 0) {
            _rotQuat.setFromAxisAngle(_camRight, pitch);
            s.moleculeGroup.quaternion.premultiply(_rotQuat);
          }

          s.overlayGroup.quaternion.copy(s.moleculeGroup.quaternion);
          needsAnotherFrame = true;
        }

        if (propsRef.current.autoSpin && s) {
          _rotQuat.setFromAxisAngle(_vecUp, delta * 0.42);
          s.moleculeGroup.quaternion.premultiply(_rotQuat);
          s.overlayGroup.quaternion.copy(s.moleculeGroup.quaternion);
          needsAnotherFrame = true;
        }

        controls.update();
        if (!isSoftwareGl && controls.enableDamping) {
          // OrbitControls damping settles over a few frames after interaction
        }

        renderer.render(scene, camera);
        updateDomLabels();

        const done = () => {
          renderBusy = false;
          if (renderDirty || needsAnotherFrame) {
            requestRender();
          }
        };

        if (isSoftwareGl) {
          afterDraw(done);
        } else {
          done();
        }
      });
    }

    sceneRefs.current = {
      renderer,
      scene,
      camera,
      controls,
      moleculeGroup,
      overlayGroup,
      atomMeshes: [],
      raycaster,
      pointer,
      isSoftwareGl,
      requestRender,
      cameraGoal: null,
      idealDistance: 6.5,
      angleLabelAnchors: [],
    };

    const handleControlStart = () => {
      if (sceneRefs.current) {
        sceneRefs.current.cameraGoal = null;
      }
    };
    const handleControlChange = () => {
      requestRender();
    };
    controls.addEventListener('start', handleControlStart);
    controls.addEventListener('change', handleControlChange);

    // ResizeObserver for crisp layout transitions
    const resizeObserver = new ResizeObserver(() => {
      if (!container || !sceneRefs.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      requestRender();
    });
    resizeObserver.observe(container);

    // Raycasting for hover & click selection (throttled pointermove)
    let pointerDownPos = { x: 0, y: 0 };
    let lastHoverCheck = 0;

    const onPointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const distMoved = Math.hypot(
        e.clientX - pointerDownPos.x,
        e.clientY - pointerDownPos.y
      );
      if (distMoved > 6) return; // Drag orbit, not click
      const s = sceneRefs.current;
      if (!s) return;
      const rect = renderer.domElement.getBoundingClientRect();
      s.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster.setFromCamera(s.pointer, s.camera);
      const hits = s.raycaster.intersectObjects(s.atomMeshes, false);
      if (hits.length > 0) {
        const atomId = hits[0].object.userData.atomId as number;
        propsRef.current.onSelectAtom(atomId);
      } else {
        propsRef.current.onSelectAtom(null);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverCheck < 40) return;
      lastHoverCheck = now;
      const s = sceneRefs.current;
      const mol = propsRef.current.molecule;
      if (!s || !mol) return;

      const rect = renderer.domElement.getBoundingClientRect();
      s.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      s.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      s.raycaster.setFromCamera(s.pointer, s.camera);
      const hits = s.raycaster.intersectObjects(s.atomMeshes, false);
      if (hits.length > 0) {
        const atomId = hits[0].object.userData.atomId as number;
        const found = mol.atoms.find((a) => a.id === atomId) ?? null;
        if (found) {
          renderer.domElement.style.cursor = 'pointer';
          setHoveredAtom({
            atom: found,
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
          });
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
      setHoveredAtom(null);
    };

    const onPointerLeave = () => {
      setHoveredAtom(null);
    };

    const ARROW_KEYS = new Set([
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
    ]);

    const isEditableTarget = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target.isContentEditable
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.has(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      if (!pressedArrowKeys.has(e.key)) {
        const wasEmpty = pressedArrowKeys.size === 0;
        pressedArrowKeys.add(e.key);
        if (wasEmpty) {
          lastClockTime = performance.now() - 16;
        }
        requestRender();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (pressedArrowKeys.delete(e.key)) {
        requestRender();
      }
    };

    const onWindowBlur = () => {
      pressedArrowKeys.clear();
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onWindowBlur);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }
    requestRender();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      controls.removeEventListener('start', handleControlStart);
      controls.removeEventListener('change', handleControlChange);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onWindowBlur);
      renderer.domElement.removeEventListener(
        'webglcontextlost',
        handleContextLost
      );
      renderer.domElement.removeEventListener(
        'webglcontextrestored',
        handleContextRestored
      );
      disposeObject3D(scene);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
      sceneRefs.current = null;
    };
  }, []);

  // Trigger loop when autoSpin toggles
  useEffect(() => {
    sceneRefs.current?.requestRender();
  }, [autoSpin]);

  // Rebuild 3D molecular geometry whenever molecule or display toggles change
  useEffect(() => {
    const s = sceneRefs.current;
    if (!s) return;

    // Clear previous meshes & dispose GPU memory
    while (s.moleculeGroup.children.length > 0) {
      const child = s.moleculeGroup.children[0];
      s.moleculeGroup.remove(child);
      disposeObject3D(child);
    }
    while (s.overlayGroup.children.length > 0) {
      const child = s.overlayGroup.children[0];
      s.overlayGroup.remove(child);
      disposeObject3D(child);
    }
    s.atomMeshes = [];
    s.angleLabelAnchors = [];

    if (!molecule || molecule.atoms.length === 0) {
      s.requestRender();
      return;
    }

    // Reset rotation when loading a new molecule
    const idealDist = computeIdealCamera(molecule);
    s.idealDistance = idealDist;

    // 1. Render Atoms (scientific matte Lambertian CPK spheres — zero specular/reflection/shadow)
    const sphereGeoHigh = new THREE.SphereGeometry(1, 36, 26);
    const atomMatCache = new Map<string, THREE.MeshLambertMaterial>();
    const outlineMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      side: THREE.BackSide,
    });

    for (const atom of molecule.atoms) {
      let radius = 0.28 + atom.covalentRadius * 0.24;
      if (renderStyle === 'space-fill') {
        radius = atom.vdwRadius * 0.96;
      } else if (renderStyle === 'wireframe') {
        radius = 0.14 + atom.covalentRadius * 0.08;
      }

      const matKey = atom.cpkColor;
      let mat = atomMatCache.get(matKey);
      if (!mat) {
        mat = new THREE.MeshLambertMaterial({
          color: new THREE.Color(atom.cpkColor),
        });
        atomMatCache.set(matKey, mat);
      }

      const mesh = new THREE.Mesh(sphereGeoHigh, mat);
      mesh.position.set(atom.position.x, atom.position.y, atom.position.z);
      mesh.scale.setScalar(radius);
      mesh.layers.enable(1); // Raycast layer
      mesh.userData = { atomId: atom.id };

      s.moleculeGroup.add(mesh);
      s.atomMeshes.push(mesh);

      // Thin neutral edge contour for pure-white/bright CPK spheres (H, He, Ne, S) on white canvas
      if (needsLightOutline(atom.cpkColor)) {
        const outlineMesh = new THREE.Mesh(sphereGeoHigh, outlineMat);
        outlineMesh.position.copy(mesh.position);
        outlineMesh.scale.setScalar(radius * 1.055);
        s.moleculeGroup.add(outlineMesh);
      }
    }

    // 2. Render Bonds (single, double, triple, aromatic — matte CPK half-cylinders)
    if (renderStyle !== 'space-fill') {
      const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1);

      const resolveBondHex = (hex: string) =>
        hex.toUpperCase() === '#FFFFFF' ? '#CBD5E1' : hex;

      const addSplitBondCylinder = (
        pA: THREE.Vector3,
        pB: THREE.Vector3,
        r: number,
        colA: string,
        colB: string
      ) => {
        _vecMid.addVectors(pA, pB).multiplyScalar(0.5);
        const halfLen = pA.distanceTo(_vecMid);
        if (halfLen < 1e-4) return;
        _vecDir.subVectors(pB, pA).normalize();
        _quat.setFromUnitVectors(_vecUp, _vecDir);

        const matA = new THREE.MeshLambertMaterial({
          color: new THREE.Color(resolveBondHex(colA)),
        });
        const meshA = new THREE.Mesh(cylGeo, matA);
        meshA.position.lerpVectors(pA, _vecMid, 0.5);
        meshA.quaternion.copy(_quat);
        meshA.scale.set(r, halfLen, r);
        s.moleculeGroup.add(meshA);

        const matB = new THREE.MeshLambertMaterial({
          color: new THREE.Color(resolveBondHex(colB)),
        });
        const meshB = new THREE.Mesh(cylGeo, matB);
        meshB.position.lerpVectors(_vecMid, pB, 0.5);
        meshB.quaternion.copy(_quat);
        meshB.scale.set(r, halfLen, r);
        s.moleculeGroup.add(meshB);
      };

      const isWire = renderStyle === 'wireframe';

      for (const bond of molecule.bonds) {
        const a1 = molecule.atoms[bond.from];
        const a2 = molecule.atoms[bond.to];
        _vecA.set(a1.position.x, a1.position.y, a1.position.z);
        _vecB.set(a2.position.x, a2.position.y, a2.position.z);
        _vecDir.subVectors(_vecB, _vecA);
        const totalLen = _vecDir.length();
        if (totalLen < 1e-4) continue;
        _vecDir.normalize();

        // Find perpendicular offset vector aligned with neighbor plane if available
        let foundPlane = false;
        for (const nid of a1.neighborIds) {
          if (nid !== a2.id) {
            const nb = molecule.atoms[nid];
            _vecPerp.set(
              nb.position.x - a1.position.x,
              nb.position.y - a1.position.y,
              nb.position.z - a1.position.z
            );
            // Project out bond axis so double bond lies in molecular plane
            _vecPerp.addScaledVector(_vecDir, -_vecPerp.dot(_vecDir));
            if (_vecPerp.length() > 0.05) {
              _vecPerp.normalize();
              foundPlane = true;
              break;
            }
          }
        }
        if (!foundPlane) {
          _vecPerp
            .set(
              Math.abs(_vecDir.y) < 0.85 ? 0 : 1,
              Math.abs(_vecDir.y) < 0.85 ? 1 : 0,
              0
            )
            .cross(_vecDir)
            .normalize();
        }
        _vecPerp2.crossVectors(_vecDir, _vecPerp).normalize();

        const baseR = isWire ? 0.045 : 0.085;

        if (bond.isAromatic) {
          // Solid sigma + dashed pi line
          const offset = isWire ? 0.06 : 0.08;
          const pA1 = _vecA.clone().addScaledVector(_vecPerp, offset * 0.5);
          const pB1 = _vecB.clone().addScaledVector(_vecPerp, offset * 0.5);
          addSplitBondCylinder(pA1, pB1, baseR * 0.72, a1.cpkColor, a2.cpkColor);

          // 3 crisp dashes for aromatic pi bond
          const dashCount = 3;
          for (let d = 0; d < dashCount; d++) {
            const t0 = 0.16 + (d / dashCount) * 0.68;
            const t1 = t0 + 0.14;
            const dA = _vecA
              .clone()
              .lerp(_vecB, t0)
              .addScaledVector(_vecPerp, -offset * 0.85);
            const dB = _vecA
              .clone()
              .lerp(_vecB, t1)
              .addScaledVector(_vecPerp, -offset * 0.85);
            addSplitBondCylinder(
              dA,
              dB,
              baseR * 0.48,
              '#38BDF8',
              '#38BDF8'
            );
          }
        } else if (bond.order === 2) {
          const offset = isWire ? 0.065 : 0.095;
          const r2 = baseR * 0.66;
          addSplitBondCylinder(
            _vecA.clone().addScaledVector(_vecPerp, offset),
            _vecB.clone().addScaledVector(_vecPerp, offset),
            r2,
            a1.cpkColor,
            a2.cpkColor
          );
          addSplitBondCylinder(
            _vecA.clone().addScaledVector(_vecPerp, -offset),
            _vecB.clone().addScaledVector(_vecPerp, -offset),
            r2,
            a1.cpkColor,
            a2.cpkColor
          );
        } else if (bond.order === 3) {
          const offset = isWire ? 0.075 : 0.11;
          const r3 = baseR * 0.54;
          for (let k = 0; k < 3; k++) {
            const ang = (k * Math.PI * 2) / 3;
            const off = _vecPerp
              .clone()
              .multiplyScalar(Math.cos(ang) * offset)
              .addScaledVector(_vecPerp2, Math.sin(ang) * offset);
            addSplitBondCylinder(
              _vecA.clone().add(off),
              _vecB.clone().add(off),
              r3,
              a1.cpkColor,
              a2.cpkColor
            );
          }
        } else {
          addSplitBondCylinder(
            _vecA.clone(),
            _vecB.clone(),
            baseR,
            a1.cpkColor,
            a2.cpkColor
          );
        }
      }
    }

    // 3. Render Lone Pair Orbital Lobes + Paired Electron Dots
    if (showLonePairs && renderStyle !== 'space-fill') {
      const lobeGeo = createTeardropLobeGeometry(1.02, 0.29);
      const electronGeo = new THREE.SphereGeometry(0.055, 14, 12);

      for (const atom of molecule.atoms) {
        if (atom.lonePairOrbitals.length === 0) continue;
        // Slightly deemphasize terminal halogen/ligand lone pairs if huge organic molecule,
        // unless this atom is selected or molecule is small (<14 heavy atoms)
        const isSmallMol = molecule.summary.heavyAtomCount <= 12;
        const isSelected = atom.id === selectedAtomId;
        const isTerminal = atom.sigmaBonds <= 1;
        if (!isSmallMol && isTerminal && !isSelected) continue;

        const baseScale = isSelected ? 1.15 : isTerminal ? 0.85 : 1.04;
        const atomPos = new THREE.Vector3(
          atom.position.x,
          atom.position.y,
          atom.position.z
        );

        for (const lp of atom.lonePairOrbitals) {
          const isDeloc = lp.orbitalType === 'pi-delocalized';
          const dir = new THREE.Vector3(
            lp.direction.x,
            lp.direction.y,
            lp.direction.z
          ).normalize();

          const lobeColor = isDeloc ? 0x7c3aed : 0xd97706;
          const lobeMat = new THREE.MeshBasicMaterial({
            color: lobeColor,
            transparent: true,
            opacity: isSelected ? 0.28 : 0.2,
            depthWrite: false,
            side: THREE.DoubleSide,
          });

          const q = new THREE.Quaternion().setFromUnitVectors(_vecUp, dir);
          const lobeMesh = new THREE.Mesh(lobeGeo, lobeMat);
          lobeMesh.position.copy(atomPos);
          lobeMesh.quaternion.copy(q);
          lobeMesh.scale.setScalar(baseScale);
          lobeMesh.renderOrder = 5;
          s.overlayGroup.add(lobeMesh);

          // For pi-delocalized p orbital, show opposite symmetry lobe too
          if (isDeloc) {
            const qOpp = new THREE.Quaternion().setFromUnitVectors(
              _vecUp,
              dir.clone().negate()
            );
            const lobeOpp = new THREE.Mesh(lobeGeo, lobeMat);
            lobeOpp.position.copy(atomPos);
            lobeOpp.quaternion.copy(qOpp);
            lobeOpp.scale.setScalar(baseScale * 0.92);
            lobeOpp.renderOrder = 5;
            s.overlayGroup.add(lobeOpp);
          }

          // Paired electron spheres nestled inside the lobe bulb
          const eMat = new THREE.MeshBasicMaterial({
            color: isDeloc ? 0x6d28d9 : 0xb45309,
          });
          const perp = new THREE.Vector3(
            Math.abs(dir.y) < 0.85 ? 0 : 1,
            Math.abs(dir.y) < 0.85 ? 1 : 0,
            0
          )
            .cross(dir)
            .normalize();
          const bulbCenter = atomPos
            .clone()
            .addScaledVector(dir, 0.68 * baseScale);
          const eSep = 0.088 * baseScale;

          const e1 = new THREE.Mesh(electronGeo, eMat);
          e1.position.copy(bulbCenter).addScaledVector(perp, eSep);
          const e2 = new THREE.Mesh(electronGeo, eMat);
          e2.position.copy(bulbCenter).addScaledVector(perp, -eSep);
          s.overlayGroup.add(e1, e2);
        }
      }
    }

    // 4. Render Hybrid Orbital Lobes on selected atom
    const focusAtom =
      molecule.atoms.find((a) => a.id === selectedAtomId) ??
      molecule.atoms.find((a) => a.id === molecule.summary.primaryCenterId) ??
      null;

    if (showHybridOrbitals && focusAtom && focusAtom.hybridOrbitals.length >= 2) {
      const hybGeo = createTeardropLobeGeometry(1.18, 0.25);
      const centerPos = new THREE.Vector3(
        focusAtom.position.x,
        focusAtom.position.y,
        focusAtom.position.z
      );
      for (const orb of focusAtom.hybridOrbitals) {
        const dir = new THREE.Vector3(
          orb.direction.x,
          orb.direction.y,
          orb.direction.z
        ).normalize();
        const isBonding = orb.kind === 'bonding';
        const mat = new THREE.MeshBasicMaterial({
          color: isBonding ? 0x0284c7 : 0xd97706,
          wireframe: true,
          transparent: true,
          opacity: isBonding ? 0.28 : 0.36,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(hybGeo, mat);
        mesh.position.copy(centerPos);
        mesh.quaternion.setFromUnitVectors(_vecUp, dir);
        mesh.renderOrder = 4;
        s.overlayGroup.add(mesh);
      }
    }

    // 5. Render VSEPR Electron-Domain Polyhedron Cage around selected atom
    if (showVseprCage && focusAtom && focusAtom.vseprCageVertices.length >= 3) {
      const cageR = 1.65;
      const centerPos = new THREE.Vector3(
        focusAtom.position.x,
        focusAtom.position.y,
        focusAtom.position.z
      );
      const verts = focusAtom.vseprCageVertices.map((v) =>
        centerPos
          .clone()
          .add(new THREE.Vector3(v.x, v.y, v.z).normalize().multiplyScalar(cageR))
      );

      // Connect vertices whose angular separation < 135° (nearest polyhedron edges)
      const linePts: THREE.Vector3[] = [];
      for (let i = 0; i < verts.length; i++) {
        for (let j = i + 1; j < verts.length; j++) {
          const d1 = verts[i].clone().sub(centerPos).normalize();
          const d2 = verts[j].clone().sub(centerPos).normalize();
          if (d1.dot(d2) > -0.65) {
            linePts.push(verts[i], verts[j]);
          }
        }
      }
      if (linePts.length > 0) {
        const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
        const lineMat = new THREE.LineBasicMaterial({
          color: 0x0284c7,
          transparent: true,
          opacity: 0.34,
        });
        const cageLines = new THREE.LineSegments(lineGeo, lineMat);
        s.overlayGroup.add(cageLines);
      }

      // Small vertex markers
      const vGeo = new THREE.SphereGeometry(0.042, 10, 8);
      const vMat = new THREE.MeshBasicMaterial({
        color: 0x0369a1,
        transparent: true,
        opacity: 0.72,
      });
      for (const vp of verts) {
        const dotMesh = new THREE.Mesh(vGeo, vMat);
        dotMesh.position.copy(vp);
        s.overlayGroup.add(dotMesh);
      }
    }

    // 6. Render 3D Bond Angle Arcs around selected atom
    if (showBondAngles && focusAtom && focusAtom.measuredAngles.length > 0) {
      const centerPos = new THREE.Vector3(
        focusAtom.position.x,
        focusAtom.position.y,
        focusAtom.position.z
      );
      // Limit to at most 4 clearest angles so it never clutters octahedral centers
      const anglesToShow = focusAtom.measuredAngles.slice(0, 4);
      const arcMat = new THREE.LineBasicMaterial({
        color: 0x0284c7,
        transparent: true,
        opacity: 0.8,
      });

      for (const ang of anglesToShow) {
        const aAtom = molecule.atoms[ang.atomA];
        const bAtom = molecule.atoms[ang.atomB];
        const va = new THREE.Vector3(
          aAtom.position.x - centerPos.x,
          aAtom.position.y - centerPos.y,
          aAtom.position.z - centerPos.z
        ).normalize();
        const vb = new THREE.Vector3(
          bAtom.position.x - centerPos.x,
          bAtom.position.y - centerPos.y,
          bAtom.position.z - centerPos.z
        ).normalize();

        const arcRadius = 0.72;
        const arcPts: THREE.Vector3[] = [];
        const steps = 20;
        const totalAngle = Math.acos(
          Math.max(-1, Math.min(1, va.dot(vb)))
        );
        const rotAxis = new THREE.Vector3().crossVectors(va, vb);
        if (rotAxis.length() < 1e-4) {
          rotAxis.set(0, 1, 0).cross(va);
          if (rotAxis.length() < 1e-4) rotAxis.set(1, 0, 0).cross(va);
        }
        rotAxis.normalize();

        for (let k = 0; k <= steps; k++) {
          const theta = (k / steps) * totalAngle;
          const ptDir = va.clone().applyAxisAngle(rotAxis, theta);
          arcPts.push(centerPos.clone().addScaledVector(ptDir, arcRadius));
        }

        const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
        const arcLine = new THREE.Line(arcGeo, arcMat);
        s.overlayGroup.add(arcLine);

        // Anchor for crisp projected degree readout
        const midPt = arcPts[Math.floor(arcPts.length / 2)];
        const labelOffset = midPt
          .clone()
          .sub(centerPos)
          .normalize()
          .multiplyScalar(arcRadius + 0.18)
          .add(centerPos);
        s.angleLabelAnchors.push({
          pos: { x: labelOffset.x, y: labelOffset.y, z: labelOffset.z },
          text: `${ang.angleDeg.toFixed(1)}°`,
        });
      }
    }

    s.requestRender();
  }, [
    molecule,
    selectedAtomId,
    renderStyle,
    showLonePairs,
    showHybridOrbitals,
    showBondAngles,
    showVseprCage,
  ]);

  // Reset camera smoothly when molecule SMILES/identity changes
  const prevSmilesRef = useRef<string | null>(null);
  useEffect(() => {
    const s = sceneRefs.current;
    if (!s || !molecule) return;
    if (prevSmilesRef.current !== molecule.summary.smiles) {
      prevSmilesRef.current = molecule.summary.smiles;
      s.moleculeGroup.rotation.set(0, 0, 0);
      s.overlayGroup.rotation.set(0, 0, 0);
      const dist = computeIdealCamera(molecule);
      s.idealDistance = dist;
      if (s.isSoftwareGl) {
        s.camera.position.set(dist * 0.45, dist * 0.35, dist * 0.88);
        s.controls.target.set(0, 0, 0);
        s.controls.update();
        s.requestRender();
      } else {
        s.cameraGoal = {
          pos: new THREE.Vector3(dist * 0.45, dist * 0.35, dist * 0.88),
          target: new THREE.Vector3(0, 0, 0),
        };
        s.requestRender();
      }
    }
  }, [molecule]);

  // Re-sync DOM labels when showLabels or showBondAngles toggles
  useEffect(() => {
    sceneRefs.current?.requestRender();
  }, [showLabels, showBondAngles]);

  const focusAtom =
    molecule?.atoms.find((a) => a.id === selectedAtomId) ??
    molecule?.atoms.find((a) => a.id === molecule?.summary.primaryCenterId) ??
    null;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-white select-none"
    >
      {/* Dedicated WebGL Mount Node */}
      <div ref={mountRef} className="w-full h-full" />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white text-slate-600 text-sm">
          3D rendering context paused. Restoring WebGL viewport…
        </div>
      )}

      {/* Top-Left Minimal Molecule Readout */}
      {molecule && (
        <div className="pointer-events-none absolute top-3.5 left-4 z-10 max-w-[calc(100%-2rem)]">
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {molecule.name || molecule.summary.formula}
            </h2>
            {molecule.name && (
              <span className="font-mono text-sm font-medium text-sky-700">
                {molecule.summary.formula}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 font-mono">
            <span className="text-slate-700">{molecule.summary.smiles}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {molecule.summary.molecularWeight.toFixed(2)} g/mol
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums text-amber-700">
              {molecule.summary.totalLonePairs} lone pair
              {molecule.summary.totalLonePairs === 1 ? '' : 's'}
            </span>
          </div>
        </div>
      )}

      {/* Projected 3D Atom Labels Layer */}
      {showLabels && molecule && (
        <div
          ref={labelLayerRef}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
          {molecule.atoms.map((a) => {
            const isSel = a.id === selectedAtomId;
            if (a.symbol === 'H' && !isSel && molecule.atoms.length > 10) {
              return <div key={a.id} className="hidden" />;
            }
            return (
              <div
                key={a.id}
                style={{ opacity: 0 }}
                className={`absolute top-0 left-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-mono leading-none border ${
                  isSel
                    ? 'bg-sky-50 border-sky-500 text-sky-900 font-medium'
                    : 'bg-white/95 border-slate-200 text-slate-800'
                }`}
              >
                {a.symbol}
                {a.symbol !== 'H' && (
                  <span className="text-sky-700 ml-1">{a.hybridization}</span>
                )}
                {a.lonePairs > 0 && (
                  <span className="text-amber-700 ml-1">· {a.lonePairs}LP</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Projected 3D Bond Angle Labels Layer */}
      {showBondAngles && focusAtom && (
        <div
          ref={angleLabelLayerRef}
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        >
          {focusAtom.measuredAngles.slice(0, 4).map((ang, idx) => (
            <div
              key={`${ang.atomA}-${ang.atomB}-${idx}`}
              style={{ opacity: 0 }}
              className="absolute top-0 left-0 whitespace-nowrap rounded bg-white/95 border border-sky-300 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-sky-800"
            >
              {ang.angleDeg.toFixed(1)}°
            </div>
          ))}
        </div>
      )}

      {/* Hover Tooltip */}
      {hoveredAtom && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-sm"
          style={{
            left: Math.min(
              hoveredAtom.x + 14,
              Math.max(12, (containerRef.current?.clientWidth || 600) - 310)
            ),
            top: Math.max(12, hoveredAtom.y - 54),
          }}
        >
          <div className="font-semibold text-slate-900">
            {hoveredAtom.atom.name} ({hoveredAtom.atom.symbol}
            {hoveredAtom.atom.id + 1})
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-slate-600">
            {hoveredAtom.atom.hybridization} · {hoveredAtom.atom.molecularGeometry} ·{' '}
            {hoveredAtom.atom.lonePairs} LP
          </div>
        </div>
      )}

    </div>
  );
});
