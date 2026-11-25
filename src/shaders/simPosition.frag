uniform float uDt;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;

  vec4 pos = texture2D(texturePosition, uv);
  vec4 vel = texture2D(textureVelocity, uv);

  pos.xyz += vel.xyz * uDt;
  pos.w = vel.w; // carry speed through so the render pass can spark on motion

  gl_FragColor = pos;
}
