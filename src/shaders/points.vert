// snoise(vec3) is concatenated in ahead of this file.

uniform sampler2D uPositions;
uniform sampler2D uPalette;
uniform float uSize;
uniform float uPixelScale; // drawingBufferHeight / (2 * tan(fov/2))
uniform float uColorScale;
uniform float uColorSpread;

attribute vec2  aRef;
attribute float aJitter;

varying vec3  vColor;
varying float vSpeed;

void main() {
  vec4 p = texture2D(uPositions, aRef);

  // Hue follows world position, so neighbouring particles agree no matter which
  // phrase they are currently spelling. Two octaves: the coarse one sets the
  // color regions, the fine one keeps them from looking airbrushed.
  float n = snoise(p.xyz * uColorScale) * 0.7
          + snoise(p.xyz * uColorScale * 2.4 + 31.7) * 0.3;
  float t = clamp(n * uColorSpread + 0.5, 0.0, 1.0);

  vColor = texture2D(uPalette, vec2(t, 0.5)).rgb * aJitter;
  vSpeed = p.w;

  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  // Narrow viewports push the camera far enough back that points go sub-pixel,
  // where drivers clamp or drop them and the field turns to faint static.
  gl_PointSize = max(uSize * uPixelScale / max(-mv.z, 0.001), 1.0);
  gl_Position = projectionMatrix * mv;
}
