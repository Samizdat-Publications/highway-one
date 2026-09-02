// Node module-resolution hook so headless tests can import project modules that say `import ... from 'three'`.
// Usage: node --import ./tools/node-three-register.mjs some-test.mjs
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function resolve(specifier, context, next) {
  if (specifier === 'three') return { url: pathToFileURL(path.join(root, 'vendor/three/three.module.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/utils/BufferGeometryUtils.js')) return { url: pathToFileURL(path.join(root, 'vendor/three/BufferGeometryUtils.js')).href, shortCircuit: true };
  if (specifier.startsWith('three/addons/')) return { url: pathToFileURL(path.join(root, 'vendor/three/addons/', specifier.slice('three/addons/'.length))).href, shortCircuit: true };
  return next(specifier, context);
}
