uniform float uOpacity;

varying vec3  vColor;
varying float vSpeed;

void main() {
  // Soft round sprite — cheaper and crisper than sampling a texture.
  float d = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.12, d);
  if (a <= 0.002) discard;

  // Moving particles spark, so a transition visibly flares.
  vec3 col = vColor * (1.0 + clamp(vSpeed, 0.0, 4.0) * 0.42);

  gl_FragColor = vec4(col, a * uOpacity);
}
