uniform float uOpacity;
uniform float uHeadMix;

varying vec3  vColor;
varying float vSpeed;
varying float vFocus;

void main() {
  // Squared falloff: a bright core and a soft edge, which bloom then picks up
  // as glow instead of as a hard disc.
  float d = length(gl_PointCoord - vec2(0.5));
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d);
  a *= a;
  // The head's dots are discs with a soft edge, like printed dots.
  a = mix(a, smoothstep(0.5, 0.36, d), uHeadMix);

  // Moving particles spark, so a transition visibly flares.
  vec3 col = vColor * (1.0 + clamp(vSpeed, 0.0, 4.0) * 0.42);

  gl_FragColor = vec4(min(col, vec3(1.6)), a * uOpacity * vFocus);
}
