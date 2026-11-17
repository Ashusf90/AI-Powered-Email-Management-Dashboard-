import { ChevronDown, ChevronUp, Eye, MailOpen, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { formatShortTime, getProviderLabel, getResponsibilityMeta } from '../lib/format';
import type { EmailThread, Responsibility } from '../types/email';

interface SpatialInbox3DProps {
  threads: EmailThread[];
  onOpenInInbox: (threadId: string) => void;
}

type OrbitFilter = 'ALL' | Responsibility;
type CameraPreset = 'overview' | 'client' | 'assistant' | 'top';

// Pre-allocated scratch math helpers (zero GC inside animation loop)
const _scratchVec = new THREE.Vector3();
const _scratchTarget = new THREE.Vector3();
const _scratchMatrix = new THREE.Matrix4();
const _scratchPos = new THREE.Vector3();
const _scratchQuat = new THREE.Quaternion();
const _scratchScale = new THREE.Vector3(1, 1, 1);

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createStudioFloorTextures(): {
  albedo: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
} {
  const size = 1024;
  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const ctx = albedoCanvas.getContext('2d')!;

  ctx.fillStyle = '#e8edf3';
  ctx.fillRect(0, 0, size, size);

  // Concentric calibration rings matching the 3 responsibility orbits
  const cx = size / 2;
  const cy = size / 2;
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.18)';
  ctx.lineWidth = 2;
  [120, 220, 320, 420].forEach((r) => {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Subtle radial ticks
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 110, cy + Math.sin(a) * 110);
    ctx.lineTo(cx + Math.cos(a) * 440, cy + Math.sin(a) * 440);
    ctx.stroke();
  }

  const albedo = new THREE.CanvasTexture(albedoCanvas);
  albedo.colorSpace = THREE.SRGBColorSpace;

  // Procedural roughness/grain map
  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = 256;
  roughCanvas.height = 256;
  const rctx = roughCanvas.getContext('2d')!;
  rctx.fillStyle = '#c8c8c8';
  rctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1800; i++) {
    const x = (i * 73) % 256;
    const y = (i * 139) % 256;
    const v = 185 + ((i * 29) % 45);
    rctx.fillStyle = `rgb(${v},${v},${v})`;
    rctx.fillRect(x, y, 2, 2);
  }
  const roughness = new THREE.CanvasTexture(roughCanvas);
  roughness.wrapS = THREE.RepeatWrapping;
  roughness.wrapT = THREE.RepeatWrapping;
  roughness.repeat.set(6, 6);

  return { albedo, roughness };
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 124);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.42)');
  grad.addColorStop(0.55, 'rgba(15, 23, 42, 0.14)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildCentralRelayHub(isSoftwareGl: boolean): {
  group: THREE.Group;
  innerRing: THREE.Mesh;
  outerRing: THREE.Mesh;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  // 1. Chamfered Lathe pedestal base (grounded at y = 0)
  const lathePoints = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(1.45, 0),
    new THREE.Vector2(1.45, 0.12),
    new THREE.Vector2(1.22, 0.28),
    new THREE.Vector2(0.86, 0.34),
    new THREE.Vector2(0.76, 0.62),
    new THREE.Vector2(0.95, 0.72),
    new THREE.Vector2(0, 0.72),
  ];
  const baseGeo = new THREE.LatheGeometry(lathePoints, 48);
  const baseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.84,
    roughness: 0.28,
  });
  const baseMesh = new THREE.Mesh(baseGeo, baseMat);
  baseMesh.castShadow = !isSoftwareGl;
  baseMesh.receiveShadow = true;
  group.add(baseMesh);
  disposables.push(baseGeo, baseMat);

  // 2. Brushed titanium collar ring
  const collarGeo = new THREE.TorusGeometry(0.96, 0.06, 16, 48);
  collarGeo.rotateX(Math.PI / 2);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0xcbd5e1,
    metalness: 0.92,
    roughness: 0.18,
  });
  const collarMesh = new THREE.Mesh(collarGeo, collarMat);
  collarMesh.position.y = 0.72;
  group.add(collarMesh);
  disposables.push(collarGeo, collarMat);

  // 3. Machined cobalt core emitter inside dome
  const coreGeo = new THREE.OctahedronGeometry(0.32, 1);
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x1d4ed8,
    emissive: 0x1d4ed8,
    emissiveIntensity: 0.55,
    metalness: 0.35,
    roughness: 0.25,
  });
  const coreMesh = new THREE.Mesh(coreGeo, coreMat);
  coreMesh.position.y = 1.28;
  group.add(coreMesh);
  disposables.push(coreGeo, coreMat);

  // 4 & 5. Two orthogonal precision gimbal rings
  const ringGeo1 = new THREE.TorusGeometry(0.58, 0.025, 12, 48);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.9,
    roughness: 0.2,
  });
  const innerRing = new THREE.Mesh(ringGeo1, ringMat);
  innerRing.position.y = 1.28;
  innerRing.rotation.x = Math.PI / 3;
  group.add(innerRing);

  const ringGeo2 = new THREE.TorusGeometry(0.7, 0.02, 12, 48);
  const outerRing = new THREE.Mesh(ringGeo2, ringMat);
  outerRing.position.y = 1.28;
  outerRing.rotation.y = Math.PI / 4;
  group.add(outerRing);
  disposables.push(ringGeo1, ringGeo2, ringMat);

  // 6. Optical protective glass dome (depthWrite false for clean interior visibility)
  const domeGeo = new THREE.SphereGeometry(0.84, 32, 24, 0, Math.PI * 2, 0, Math.PI * 0.65);
  const domeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf8fafc,
    metalness: 0,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.82,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 1,
    ior: 1.48,
    clearcoat: 1.0,
    depthWrite: false,
  });
  const domeMesh = new THREE.Mesh(domeGeo, domeMat);
  domeMesh.position.y = 0.92;
  domeMesh.renderOrder = 2;
  group.add(domeMesh);
  disposables.push(domeGeo, domeMat);

  return {
    group,
    innerRing,
    outerRing,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

function buildEmailCapsuleGroup(
  thread: EmailThread,
  isSoftwareGl: boolean,
  shadowTex: THREE.CanvasTexture
): {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  beaconMat: THREE.MeshStandardMaterial;
  dispose: () => void;
} {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  const accentHex =
    thread.responsibility === 'CLIENT_TO_REPLY'
      ? 0xd97706
      : thread.responsibility === 'ASSISTANT_TO_REPLY'
        ? 0x1d4ed8
        : 0x64748b;

  // 1. Beveled extruded carrier chassis (primary silhouette)
  const shape = new THREE.Shape();
  const w = 0.82;
  const d = 0.56;
  const r = 0.1;
  shape.moveTo(-w / 2 + r, -d / 2);
  shape.lineTo(w / 2 - r, -d / 2);
  shape.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
  shape.lineTo(w / 2, d / 2 - r);
  shape.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
  shape.lineTo(-w / 2 + r, d / 2);
  shape.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
  shape.lineTo(-w / 2, -d / 2 + r);
  shape.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);

  const chassisGeo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  chassisGeo.rotateX(-Math.PI / 2);
  const chassisMat = new THREE.MeshStandardMaterial({
    color: thread.isUnread ? 0xffffff : 0xe2e8f0,
    roughness: 0.52,
    metalness: 0.12,
  });
  const chassisMesh = new THREE.Mesh(chassisGeo, chassisMat);
  chassisMesh.position.y = 0.22;
  chassisMesh.castShadow = !isSoftwareGl;
  chassisMesh.receiveShadow = true;
  group.add(chassisMesh);
  disposables.push(chassisGeo, chassisMat);

  // 2. Brushed aluminum perimeter gimbal collar (metallic contrast delta >= 0.35)
  const rimGeo = new THREE.TorusGeometry(0.46, 0.018, 10, 32);
  rimGeo.rotateX(Math.PI / 2);
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.88,
    roughness: 0.22,
  });
  const rimMesh = new THREE.Mesh(rimGeo, rimMat);
  rimMesh.position.y = 0.29;
  group.add(rimMesh);
  disposables.push(rimGeo, rimMat);

  // 3. Responsibility color beacon crest (distinct vertical fin)
  const beaconGeo = new THREE.CylinderGeometry(0.08, 0.11, 0.22, 16);
  const beaconMat = new THREE.MeshStandardMaterial({
    color: accentHex,
    emissive: accentHex,
    emissiveIntensity: thread.isUnread || thread.needsReview ? 0.5 : 0.15,
    roughness: 0.28,
    metalness: 0.45,
  });
  const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
  beaconMesh.position.set(0, 0.48, 0);
  beaconMesh.castShadow = !isSoftwareGl;
  group.add(beaconMesh);
  disposables.push(beaconGeo, beaconMat);

  // 4. Needs-review or unread top crown ring
  if (thread.needsReview || thread.isImportant) {
    const crownGeo = new THREE.TorusGeometry(0.14, 0.018, 8, 24);
    crownGeo.rotateX(Math.PI / 2);
    const crownMat = new THREE.MeshStandardMaterial({
      color: thread.needsReview ? 0xdc2626 : 0xf59e0b,
      emissive: thread.needsReview ? 0xdc2626 : 0xf59e0b,
      emissiveIntensity: 0.45,
      metalness: 0.7,
      roughness: 0.25,
    });
    const crownMesh = new THREE.Mesh(crownGeo, crownMat);
    crownMesh.position.y = 0.62;
    group.add(crownMesh);
    disposables.push(crownGeo, crownMat);
  }

  // Soft contact shadow directly on ground beneath capsule
  const shadowGeo = new THREE.PlaneGeometry(1.15, 1.15);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    map: shadowTex,
    transparent: true,
    depthWrite: false,
    opacity: 0.6,
  });
  const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
  shadowPlane.position.y = 0.025;
  group.add(shadowPlane);
  disposables.push(shadowGeo, shadowMat);

  // Proxy raycast collider on layer 1 for crisp fast picking
  const hitGeo = new THREE.BoxGeometry(1.05, 0.85, 0.85);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitMesh = new THREE.Mesh(hitGeo, hitMat);
  hitMesh.position.y = 0.42;
  hitMesh.layers.enable(1);
  hitMesh.userData.threadId = thread.id;
  group.add(hitMesh);
  disposables.push(hitGeo, hitMat);

  return {
    group,
    hitMesh,
    beaconMat,
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}

export function SpatialInbox3D({ threads, onOpenInInbox }: SpatialInbox3DProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [orbitFilter, setOrbitFilter] = useState<OrbitFilter>('ALL');
  const [motionEnabled, setMotionEnabled] = useState(true);
  const [hudCollapsed, setHudCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    threads.find((t) => !t.isArchived && !t.isCompleted)?.id ?? null
  );
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);

  const activeThreads = useMemo(
    () => threads.filter((t) => !t.isArchived && !t.isCompleted),
    [threads]
  );

  // Mutable refs for 60fps loop without re-initializing WebGL
  const orbitFilterRef = useRef<OrbitFilter>(orbitFilter);
  const motionEnabledRef = useRef<boolean>(motionEnabled);
  const selectedIdRef = useRef<string | null>(selectedId);
  const cameraTransitionRef = useRef<{
    active: boolean;
    pos: THREE.Vector3;
    target: THREE.Vector3;
  }>({
    active: false,
    pos: new THREE.Vector3(0, 8.2, 12.5),
    target: new THREE.Vector3(0, 0.5, 0),
  });

  useEffect(() => {
    orbitFilterRef.current = orbitFilter;
  }, [orbitFilter]);

  useEffect(() => {
    motionEnabledRef.current = motionEnabled;
  }, [motionEnabled]);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const applyCameraPreset = (preset: CameraPreset) => {
    const t = cameraTransitionRef.current;
    t.active = true;
    switch (preset) {
      case 'client':
        t.pos.set(0, 4.2, 6.2);
        t.target.set(0, 0.6, 0);
        break;
      case 'assistant':
        t.pos.set(6.8, 5.8, 8.8);
        t.target.set(0, 0.4, 0);
        break;
      case 'top':
        t.pos.set(0.01, 14.5, 0.1);
        t.target.set(0, 0, 0);
        break;
      case 'overview':
      default:
        t.pos.set(0, 8.2, 12.5);
        t.target.set(0, 0.5, 0);
        break;
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight - 56;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.022);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 120);
    camera.position.set(0, 8.2, 12.5);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const canvasEl = renderer.domElement;
    canvasEl.style.display = 'block';
    canvasEl.style.width = '100%';
    canvasEl.style.height = '100%';
    container.innerHTML = '';
    container.appendChild(canvasEl);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => setContextLost(false);
    canvasEl.addEventListener('webglcontextlost', handleContextLost);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored);

    // Procedural RoomEnvironment reflections
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = roomEnv.texture;
    pmremGenerator.dispose();

    // Studio Lighting Rig: Warm key + Cool Hemisphere fill + Rim backlight
    const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x94a3b8, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.55);
    keyLight.position.set(8, 14, 7);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 36;
    const d = 11;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xbfdbfe, 0.65);
    rimLight.position.set(-9, 7, -8);
    scene.add(rimLight);

    // Studio Floor with procedural CanvasTextures
    const floorTex = createStudioFloorTextures();
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    floorTex.albedo.anisotropy = maxAniso;
    floorTex.roughness.anisotropy = maxAniso;

    const floorGeo = new THREE.CircleGeometry(32, 64);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex.albedo,
      roughnessMap: floorTex.roughness,
      roughness: 0.78,
      metalness: 0.08,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    const shadowTex = createContactShadowTexture();
    const hubShadowGeo = new THREE.PlaneGeometry(4.2, 4.2);
    hubShadowGeo.rotateX(-Math.PI / 2);
    const hubShadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.7,
    });
    const hubShadow = new THREE.Mesh(hubShadowGeo, hubShadowMat);
    hubShadow.position.y = 0.02;
    scene.add(hubShadow);

    // Central Relay Hub Assembly
    const hub = buildCentralRelayHub(isSoftwareGl);
    scene.add(hub.group);

    // 3 Concentric Orbital Rings (polygonOffset prevents any Z-fighting)
    const orbitConfigs: Array<{
      radius: number;
      color: number;
      responsibility: Responsibility;
    }> = [
      { radius: 3.1, color: 0xd97706, responsibility: 'CLIENT_TO_REPLY' },
      { radius: 5.4, color: 0x1d4ed8, responsibility: 'ASSISTANT_TO_REPLY' },
      { radius: 7.7, color: 0x64748b, responsibility: 'NO_REPLY_NEEDED' },
    ];

    const ringDisposables: Array<{ dispose: () => void }> = [];
    orbitConfigs.forEach((cfg) => {
      const trackGeo = new THREE.RingGeometry(cfg.radius - 0.025, cfg.radius + 0.025, 96);
      trackGeo.rotateX(-Math.PI / 2);
      const trackMat = new THREE.MeshBasicMaterial({
        color: cfg.color,
        transparent: true,
        opacity: 0.48,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const trackMesh = new THREE.Mesh(trackGeo, trackMat);
      trackMesh.position.y = 0.03;
      scene.add(trackMesh);
      ringDisposables.push(trackGeo, trackMat);
    });

    // InstancedMesh orbital tick markers (36 ticks across the 3 rings)
    const tickCount = 36;
    const tickGeo = new THREE.BoxGeometry(0.05, 0.03, 0.16);
    const tickMat = new THREE.MeshStandardMaterial({
      color: 0x64748b,
      metalness: 0.7,
      roughness: 0.3,
    });
    const ticksInstanced = new THREE.InstancedMesh(tickGeo, tickMat, tickCount);
    let idx = 0;
    orbitConfigs.forEach((cfg) => {
      for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        _scratchPos.set(
          Math.cos(angle) * cfg.radius,
          0.035,
          Math.sin(angle) * cfg.radius
        );
        _scratchQuat.setFromAxisAngle(_scratchVec.set(0, 1, 0), -angle + Math.PI / 2);
        _scratchMatrix.compose(_scratchPos, _scratchQuat, _scratchScale);
        ticksInstanced.setMatrixAt(idx++, _scratchMatrix);
      }
    });
    ticksInstanced.instanceMatrix.needsUpdate = true;
    ticksInstanced.computeBoundingSphere();
    scene.add(ticksInstanced);

    // Build Email Capsule Nodes per Active Thread
    const grouped: Record<Responsibility, EmailThread[]> = {
      CLIENT_TO_REPLY: activeThreads.filter((t) => t.responsibility === 'CLIENT_TO_REPLY'),
      ASSISTANT_TO_REPLY: activeThreads.filter((t) => t.responsibility === 'ASSISTANT_TO_REPLY'),
      NO_REPLY_NEEDED: activeThreads.filter((t) => t.responsibility === 'NO_REPLY_NEEDED'),
    };

    interface NodeEntry {
      thread: EmailThread;
      orbitRadius: number;
      baseAngle: number;
      orbitSpeed: number;
      assembly: ReturnType<typeof buildEmailCapsuleGroup>;
    }

    const nodeEntries: NodeEntry[] = [];
    const hitMeshes: THREE.Mesh[] = [];

    orbitConfigs.forEach((cfg) => {
      const list = grouped[cfg.responsibility];
      list.forEach((thread, i) => {
        const angle = (i / Math.max(list.length, 1)) * Math.PI * 2 + (cfg.radius * 0.3);
        const assembly = buildEmailCapsuleGroup(thread, isSoftwareGl, shadowTex);
        assembly.group.position.set(
          Math.cos(angle) * cfg.radius,
          0,
          Math.sin(angle) * cfg.radius
        );
        assembly.group.rotation.y = -angle + Math.PI / 2;
        scene.add(assembly.group);
        hitMeshes.push(assembly.hitMesh);
        nodeEntries.push({
          thread,
          orbitRadius: cfg.radius,
          baseAngle: angle,
          orbitSpeed: cfg.responsibility === 'CLIENT_TO_REPLY' ? 0.08 : cfg.responsibility === 'ASSISTANT_TO_REPLY' ? 0.055 : 0.035,
          assembly,
        });
      });
    });

    // OrbitControls
    const controls = new OrbitControls(camera, canvasEl);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4.2;
    controls.maxDistance = 24;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.target.set(0, 0.5, 0);

    controls.addEventListener('start', () => {
      cameraTransitionRef.current.active = false;
    });

    // Raycaster on layer 1
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(1);
    const pointer = new THREE.Vector2();
    let lastMoveTs = 0;

    const updatePointer = (e: PointerEvent) => {
      const rect = canvasEl.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    };

    const handlePointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastMoveTs < 50) return;
      lastMoveTs = now;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const tid = hits[0].object.userData.threadId as string;
        setHoveredId(tid);
        canvasEl.style.cursor = 'pointer';
      } else {
        setHoveredId(null);
        canvasEl.style.cursor = 'grab';
      }
    };

    let downPos = { x: 0, y: 0 };
    const handlePointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const handlePointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 6) return;
      updatePointer(e);
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(hitMeshes, false);
      if (hits.length > 0) {
        const tid = hits[0].object.userData.threadId as string;
        setSelectedId(tid);
      }
    };

    canvasEl.addEventListener('pointermove', handlePointerMove);
    canvasEl.addEventListener('pointerdown', handlePointerDown);
    canvasEl.addEventListener('pointerup', handlePointerUp);

    // Pre-warm shaders on hardware GPUs
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Animation Loop with Software-WebGL fence pacing
    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();
    let orbitElapsed = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      if (motionEnabledRef.current) {
        orbitElapsed += dt;
      }

      // Hub gyroscopic motion
      hub.innerRing.rotation.z += dt * (motionEnabledRef.current ? 0.45 : 0);
      hub.outerRing.rotation.x += dt * (motionEnabledRef.current ? 0.3 : 0);

      // Smooth damped camera preset transitions
      const trans = cameraTransitionRef.current;
      if (trans.active) {
        const alpha = 1 - Math.exp(-5.5 * dt);
        camera.position.lerp(trans.pos, alpha);
        controls.target.lerp(trans.target, alpha);
        if (
          camera.position.distanceTo(trans.pos) < 0.04 &&
          controls.target.distanceTo(trans.target) < 0.04
        ) {
          trans.active = false;
        }
      }

      // Position & scale capsule nodes smoothly
      const currentFilter = orbitFilterRef.current;
      const currentSelected = selectedIdRef.current;
      const scaleAlpha = 1 - Math.exp(-8 * dt);

      for (const entry of nodeEntries) {
        const angle = entry.baseAngle + orbitElapsed * entry.orbitSpeed;
        entry.assembly.group.position.x = Math.cos(angle) * entry.orbitRadius;
        entry.assembly.group.position.z = Math.sin(angle) * entry.orbitRadius;
        entry.assembly.group.rotation.y = -angle + Math.PI / 2;

        const isVisibleByFilter =
          currentFilter === 'ALL' || entry.thread.responsibility === currentFilter;
        const isSelected = entry.thread.id === currentSelected;
        const targetScale = isVisibleByFilter ? (isSelected ? 1.24 : 1.0) : 0.45;

        const nextScale = THREE.MathUtils.lerp(
          entry.assembly.group.scale.x,
          targetScale,
          scaleAlpha
        );
        entry.assembly.group.scale.setScalar(nextScale);
        entry.assembly.beaconMat.emissiveIntensity = isSelected
          ? 0.95
          : isVisibleByFilter
            ? entry.thread.isUnread
              ? 0.55
              : 0.2
            : 0.04;
      }

      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight - 56;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      canvasEl.removeEventListener('pointermove', handlePointerMove);
      canvasEl.removeEventListener('pointerdown', handlePointerDown);
      canvasEl.removeEventListener('pointerup', handlePointerUp);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);

      controls.dispose();
      hub.dispose();
      nodeEntries.forEach((e) => e.assembly.dispose());
      ringDisposables.forEach((d) => d.dispose());
      floorGeo.dispose();
      floorMat.dispose();
      floorTex.albedo.dispose();
      floorTex.roughness.dispose();
      hubShadowGeo.dispose();
      hubShadowMat.dispose();
      shadowTex.dispose();
      tickGeo.dispose();
      tickMat.dispose();
      roomEnv.dispose();
      renderer.dispose();
    };
  }, [activeThreads]);

  const inspectedThread =
    activeThreads.find((t) => t.id === (hoveredId || selectedId)) ||
    activeThreads[0] ||
    null;

  return (
    <div className="relative w-full h-[calc(100vh-3.5rem)] bg-slate-100 overflow-hidden select-none">
      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full" />

      {contextLost && (
        <div className="absolute inset-0 bg-slate-100 flex items-center justify-center p-6 z-20">
          <div className="bg-white border border-slate-200 rounded-xl p-6 text-center max-w-sm space-y-2">
            <p className="text-sm font-semibold text-slate-900">
              WebGL context paused
            </p>
            <p className="text-xs text-slate-600">
              Reload or switch back to the Inbox view to continue managing threads.
            </p>
          </div>
        </div>
      )}

      {/* Minimal Top-Left Header & Selected Thread Readout (solid rgba, zero backdrop-blur) */}
      <div className="pointer-events-none absolute top-4 left-4 right-4 flex items-start justify-between gap-4 z-10">
        <div
          className="pointer-events-auto rounded-xl border border-slate-200 px-4 py-3 max-w-md shadow-sm"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.94)' }}
        >
          <p className="text-[11px] font-semibold text-slate-500">
            Spatial Responsibility Orbitrium · Drag to orbit, click any node
          </p>
          {inspectedThread ? (
            <div className="mt-1.5 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900 truncate">
                  {inspectedThread.subject}
                </p>
                <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                  {formatShortTime(inspectedThread.lastMessageAt)}
                </span>
              </div>
              <p className="text-xs text-slate-600 truncate">
                {inspectedThread.primarySenderName} ·{' '}
                <span
                  className={
                    getResponsibilityMeta(inspectedThread.responsibility)
                      .textColor
                  }
                >
                  {getResponsibilityMeta(inspectedThread.responsibility).label}
                </span>{' '}
                · {getProviderLabel(inspectedThread.provider)}
              </p>
              <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed pt-0.5">
                {inspectedThread.summary}
              </p>
              <div className="pt-1.5">
                <button
                  type="button"
                  onClick={() => onOpenInInbox(inspectedThread.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                >
                  <MailOpen className="w-3.5 h-3.5" />
                  <span>Open Conversation in Inbox</span>
                </button>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-600 mt-1">
              No active email conversations in orbit.
            </p>
          )}
        </div>
      </div>

      {/* Collapsible Unified Bottom Control Dock */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 w-[min(920px,94vw)] flex flex-col items-center">
        <button
          type="button"
          onClick={() => setHudCollapsed(!hudCollapsed)}
          className="px-3 py-1 text-[11px] font-medium text-slate-700 border border-b-0 border-slate-200 rounded-t-lg flex items-center gap-1.5 shadow-sm"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.94)' }}
        >
          {hudCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Controls</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Controls</span>
            </>
          )}
        </button>

        {!hudCollapsed && (
          <div
            className="w-full border border-slate-200 rounded-xl px-4 py-2.5 shadow-md flex flex-wrap items-center justify-between gap-3"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.95)' }}
          >
            {/* Orbit Highlight Filter */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              {(
                [
                  { id: 'ALL', label: 'All Orbits' },
                  { id: 'CLIENT_TO_REPLY', label: 'Client (Inner)' },
                  { id: 'ASSISTANT_TO_REPLY', label: 'Assistant (Mid)' },
                  { id: 'NO_REPLY_NEEDED', label: 'None (Outer)' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrbitFilter(opt.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                    orbitFilter === opt.id
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Camera Presets */}
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-slate-400 mr-0.5" />
              {(
                [
                  { id: 'overview', label: 'Overview' },
                  { id: 'client', label: 'Client Ring' },
                  { id: 'top', label: 'Top-Down' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => applyCameraPreset(cam.id)}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap"
                >
                  {cam.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setMotionEnabled(!motionEnabled)}
                className="px-2.5 py-1 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors whitespace-nowrap inline-flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{motionEnabled ? 'Pause Orbit' : 'Resume Orbit'}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
