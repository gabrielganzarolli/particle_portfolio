// snoise(vec3) is concatenated in ahead of this file.

uniform sampler2D uPositions;
uniform sampler2D uPalette;
uniform float uSize;
// The head is drawn as dots of varied size: each particle reads its dot's
// size from the head's destinations (.w), blended in by uHeadMix.
uniform sampler2D uHeadTarget;
uniform float uHeadMix;
uniform float uHeadSize;
uniform float uPixelScale; // drawingBufferHeight / (2 * tan(fov/2))
uniform float uColorScale;
uniform float uColorSpread;
uniform float uFocus;      // camera distance to the phrase's plane
uniform float uDof;        // how fast particles off that plane defocus

attribute vec2  aRef;
attribute float aJitter;

varying vec3  vColor;
varying float vSpeed;
varying float vFocus;

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
  float depth = max(-mv.z, 0.001);

  // Depth of field, as in the Cream v3 proof: a particle away from the
  // phrase's plane grows and loses brightness in proportion, so its light is
  // spread rather than added. At rest the field is within ±0.16 of the plane
  // and stays sharp; mid-morph, particles flung forward turn into bokeh.
  float defocus = abs(depth - uFocus) * uDof;
  float grow = 1.0 + min(defocus, 3.0) * 1.1;
  vFocus = 1.0 / (grow * grow);

  // Narrow viewports push the camera far enough back that points go sub-pixel,
  // where drivers clamp or drop them and the field turns to faint static.
  float headSize = uHeadMix > 0.0 ? uHeadSize * texture2D(uHeadTarget, aRef).w : 1.0;
  gl_PointSize = max(uSize * mix(1.0, headSize, uHeadMix) * uPixelScale / depth * grow, 1.0);
  gl_Position = projectionMatrix * mv;
}
