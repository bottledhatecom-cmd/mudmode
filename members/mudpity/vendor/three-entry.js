// Entry used to make vendor/three.min.js: a tree-shaken, minified classic-script (IIFE) build of three.js 0.186.1
// (plain WebGL renderer only, no WebGPU) that sets window.THREE. Rebuild: see README-three.txt.
export {
  WebGLRenderer, Scene, PerspectiveCamera, Color, FogExp2, HemisphereLight, DirectionalLight, Group, Mesh, Object3D,
  BoxGeometry, CylinderGeometry, SphereGeometry, IcosahedronGeometry, OctahedronGeometry, ConeGeometry, CircleGeometry,
  CapsuleGeometry, LatheGeometry, PlaneGeometry, TorusGeometry, BufferGeometry, BufferAttribute, Float32BufferAttribute,
  InstancedMesh, InstancedBufferAttribute,
  MeshLambertMaterial, MeshBasicMaterial, MeshStandardMaterial, ShaderMaterial,
  CanvasTexture, Vector2, Vector3, Quaternion, Matrix4, Euler, MathUtils,
  AdditiveBlending, DoubleSide, BackSide, ACESFilmicToneMapping, PCFShadowMap, SRGBColorSpace, REVISION
} from 'three';
