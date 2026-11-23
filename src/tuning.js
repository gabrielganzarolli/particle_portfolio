/**
 * The tuning panel, as in the Cream v3 proof. Open the page with #ajuste in the
 * address to get it; nobody else ever loads it, because Tweakpane is imported
 * only then.
 *
 * Every control writes straight into the live uniforms or the tuning object
 * main.js reads each frame, so changes show on the next frame. The head's size,
 * place and density rebuild its particles a moment after the slider rests. "Copiar preset"
 * puts the current values on the clipboard as JSON, ready to be made the new
 * defaults in code. "Salvar neste navegador" keeps them for the next visits to
 * #ajuste on this browser only.
 */

const STORE_KEY = 'gg-preset-v1';

export function readSavedPreset() {
  if (!/ajuste/.test(location.hash)) return null;
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** Snapshot of everything the panel can change, in one flat object per group. */
function snapshot({ tune, fieldDefaults, field, post, dust, headTune }) {
  const vu = field.velVar.material.uniforms;
  const pu = field.material.uniforms;
  return {
    field: {
      opacity: fieldDefaults.opacity,
      spring: vu.uSpring.value,
      damping: vu.uDamping.value,
      turbulence: vu.uTurbulence.value,
      repel: vu.uRepel.value,
      radius: vu.uRadius.value,
      fluidForce: vu.uFluidForce.value,
      dof: pu.uDof.value,
      size: pu.uSize.value,
    },
    post: {
      bloom: post.bloom.strength,
      bloomRadius: post.bloom.radius,
      threshold: post.bloom.threshold,
      grain: post.grain.uniforms.uGrain.value,
      vignette: post.grain.uniforms.uVignette.value,
    },
    motion: { ...tune },
    dust: { shift: dust.material.uniforms.uFluidShift.value },
    ...(headTune ? { head: { ...headTune } } : {}),
  };
}

/** Write a preset (or part of one) back into the live scene. */
export function applyPreset(preset, { tune, fieldDefaults, field, post, dust, headTune, onHead }, headKind = 'all') {
  if (!preset) return;
  const vu = field.velVar.material.uniforms;
  const pu = field.material.uniforms;
  const f = preset.field ?? {};
  if (f.opacity !== undefined) fieldDefaults.opacity = f.opacity;
  if (f.spring !== undefined) vu.uSpring.value = f.spring;
  if (f.damping !== undefined) vu.uDamping.value = f.damping;
  if (f.turbulence !== undefined) vu.uTurbulence.value = f.turbulence;
  if (f.repel !== undefined) vu.uRepel.value = f.repel;
  if (f.radius !== undefined) vu.uRadius.value = f.radius;
  if (f.fluidForce !== undefined) vu.uFluidForce.value = f.fluidForce;
  if (f.dof !== undefined) pu.uDof.value = f.dof;
  if (f.size !== undefined) pu.uSize.value = f.size;
  const p = preset.post ?? {};
  if (p.bloom !== undefined) post.bloom.strength = p.bloom;
  if (p.bloomRadius !== undefined) post.bloom.radius = p.bloomRadius;
  if (p.threshold !== undefined) post.bloom.threshold = p.threshold;
  if (p.grain !== undefined) post.grain.uniforms.uGrain.value = p.grain;
  if (p.vignette !== undefined) post.grain.uniforms.uVignette.value = p.vignette;
  Object.assign(tune, preset.motion ?? {});
  if (preset.dust?.shift !== undefined) dust.material.uniforms.uFluidShift.value = preset.dust.shift;
  if (preset.head && headTune && headKind) {
    Object.assign(headTune, preset.head);
    onHead?.(headKind);
  }
}

export async function attachTuning(ctx) {
  const { Pane } = await import('tweakpane');
  const state = snapshot(ctx);
  const pane = new Pane({ title: 'Ajuste' });
  pane.element.parentElement.style.zIndex = '50';
  // Taller than a laptop screen once folders open: it scrolls on its own.
  Object.assign(pane.element.parentElement.style, { maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' });

  // Head controls that move or resample it rebuild 262k destinations, so they
  // wait for the slider to rest a moment; the turn's values apply live.
  const LAYOUT = new Set(['size', 'x', 'y']);
  const LOOK = new Set(['shadows', 'floor', 'face', 'crown', 'ears', 'neck']);
  let pendingHead = null;
  let headTimer = 0;
  const sync = (ev) => {
    const key = ev?.target?.key;
    let kind = null;
    if (LAYOUT.has(key)) kind = 'layout';
    else if (LOOK.has(key)) kind = 'look';
    applyPreset(state, ctx, null);
    if (state.head) Object.assign(ctx.headTune, state.head);
    if (!kind) return;
    pendingHead = pendingHead && pendingHead !== kind ? 'all' : kind;
    clearTimeout(headTimer);
    headTimer = setTimeout(() => {
      ctx.onHead(pendingHead);
      pendingHead = null;
    }, 140);
  };

  const stats = { nivel: ctx.level(), fps: 60 };
  pane.addBinding(stats, 'nivel', { readonly: true, format: (v) => v.toFixed(0) });
  pane.addBinding(stats, 'fps', { readonly: true, view: 'graph', min: 0, max: 120 });
  let last = performance.now();
  const tick = (now) => {
    stats.fps = Math.round(1000 / Math.max(now - last, 1));
    stats.nivel = ctx.level();
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  if (state.head) {
    const head = pane.addFolder({ title: 'Cabeça' });
    head.addButton({ title: 'Mostrar cabeça' }).on('click', () => ctx.showHead(true));
    head.addButton({ title: 'Voltar ao nome' }).on('click', () => ctx.showHead(false));
    const place = head.addFolder({ title: 'Tamanho e posição' });
    place.addBinding(state.head, 'size', { label: 'tamanho', min: 0.4, max: 2, step: 0.01 });
    place.addBinding(state.head, 'x', { label: 'horizontal', min: -0.8, max: 0.8, step: 0.01 });
    place.addBinding(state.head, 'y', { label: 'vertical', min: -0.6, max: 0.6, step: 0.01 });
    const dens = head.addFolder({ title: 'Densidade' });
    dens.addBinding(state.head, 'face', { label: 'rosto', min: 0, max: 4, step: 0.05 });
    dens.addBinding(state.head, 'crown', { label: 'topo e nuca', min: 0, max: 2, step: 0.05 });
    dens.addBinding(state.head, 'ears', { label: 'orelhas', min: 0, max: 3, step: 0.05 });
    dens.addBinding(state.head, 'neck', { label: 'pescoço', min: 0, max: 3, step: 0.05 });
    dens.addBinding(state.head, 'floor', { label: 'laterais', min: 0, max: 1, step: 0.01 });
    dens.addBinding(state.head, 'shadows', { label: 'sombras', min: 0, max: 1, step: 0.01 });
    dens.addBinding(state.head, 'brightness', { label: 'brilho', min: 0.2, max: 3, step: 0.05 });
    const move = head.addFolder({ title: 'Movimento' });
    move.addBinding(state.head, 'yaw', { label: 'giro lateral', min: 0, max: 1.2, step: 0.01 });
    move.addBinding(state.head, 'pitch', { label: 'giro vertical', min: 0, max: 0.8, step: 0.01 });
    move.addBinding(state.head, 'roll', { label: 'inclinação', min: 0, max: 1, step: 0.01 });
    move.addBinding(state.head, 'stiffness', { label: 'rapidez', min: 5, max: 120, step: 1 });
    move.addBinding(state.head, 'damping', { label: 'amortecimento', min: 2, max: 30, step: 0.5 });
    move.addBinding(state.head, 'sway', { label: 'balanço parado', min: 0, max: 4, step: 0.05 });
  }

  // The rest starts folded, so the head's controls are the first thing seen.
  const field = pane.addFolder({ title: 'Partículas', expanded: !state.head });
  field.addBinding(state.field, 'opacity', { label: 'brilho', min: 0.1, max: 1 });
  field.addBinding(state.field, 'size', { label: 'tamanho', min: 0.002, max: 0.03 });
  field.addBinding(state.field, 'spring', { label: 'mola', min: 2, max: 30 });
  field.addBinding(state.field, 'damping', { label: 'amortecimento', min: 0.8, max: 0.99 });
  field.addBinding(state.field, 'turbulence', { label: 'turbulência', min: 0, max: 1 });
  field.addBinding(state.field, 'dof', { label: 'desfoque de profundidade', min: 0, max: 1.2 });

  const mouse = pane.addFolder({ title: 'Mouse e fluido', expanded: !state.head });
  mouse.addBinding(state.field, 'fluidForce', { label: 'força do fluido', min: 0, max: 30 });
  mouse.addBinding(state.motion, 'fluidPointer', { label: 'empurrão do mouse', min: 0, max: 30 });
  mouse.addBinding(state.motion, 'fluidScroll', { label: 'empurrão da rolagem', min: 0, max: 1 });
  mouse.addBinding(state.motion, 'dissipation', { label: 'dissipação', min: 0.9, max: 0.995 });
  mouse.addBinding(state.field, 'repel', { label: 'afastar', min: 0, max: 20 });
  mouse.addBinding(state.field, 'radius', { label: 'raio de afastar', min: 0.2, max: 4 });
  mouse.addBinding(state.motion, 'parallaxX', { label: 'parallax horizontal', min: 0, max: 2 });
  mouse.addBinding(state.motion, 'parallaxY', { label: 'parallax vertical', min: 0, max: 2 });

  const post = pane.addFolder({ title: 'Luz', expanded: !state.head });
  post.addBinding(state.post, 'bloom', { label: 'brilho difuso', min: 0, max: 2 });
  post.addBinding(state.post, 'bloomRadius', { label: 'raio', min: 0, max: 1 });
  post.addBinding(state.post, 'threshold', { label: 'limiar', min: 0, max: 1 });
  post.addBinding(state.post, 'grain', { label: 'grão', min: 0, max: 0.08 });
  post.addBinding(state.post, 'vignette', { label: 'vinheta', min: 0, max: 1 });
  post.addBinding(state.dust, 'shift', { label: 'poeira no fluido', min: 0, max: 0.2 });

  pane.on('change', sync);

  pane.addButton({ title: 'Copiar preset' }).on('click', () => {
    navigator.clipboard?.writeText(JSON.stringify(state, null, 2));
  });
  pane.addButton({ title: 'Salvar neste navegador' }).on('click', () => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable */
    }
  });
  pane.addButton({ title: 'Voltar ao padrão' }).on('click', () => {
    try {
      localStorage.removeItem(STORE_KEY);
    } catch {
      /* storage unavailable */
    }
    location.reload();
  });
}
