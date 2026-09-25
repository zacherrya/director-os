/**
 * Draws one frame of the edit onto a canvas.
 *
 * The preview and the export both call `drawFrame`, so what plays in the
 * editor is what renders — there is no second implementation to drift.
 *
 * `ctx.filter` is deliberately never used. WebKit, which is what the desktop
 * app runs on, accepts the property and silently ignores it; a blur built on it
 * would look right in a Chromium preview and do nothing in the real app. Blur is
 * done instead by drawing through a downscaled canvas (for footage) and by
 * throwing a blurred shadow from off-screen glyphs (for text), both of which
 * render identically in every engine.
 */

import {
  layersAt,
  textsAt,
  type EditClip,
  type EditProject,
  type EditText,
  type PlacedClip,
} from './model.ts'
import {
  EDITOR_FONTS_URL,
  FONT_COMBOS,
  fontCombo,
  fontDescriptors,
  textAnimation,
  tokenize,
  transitionFrame,
  unitStarts,
  unitState,
  type FontCombo,
  type LayerFx,
  type Token,
} from './presets.ts'

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas

/** Hands back the source frame for a clip at a source time, or null if it isn't ready. */
export type FrameProvider = (clip: EditClip, sourceTime: number) => CanvasImageSource | null

const IDENTITY: LayerFx = { visible: true, alpha: 1, scale: 1, dx: 0, dy: 0, blur: 0, motionBlur: 0 }

/* ------------------------------------------------------------- scratch --- */

function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

const scratch = new Map<string, AnyCanvas>()
/** Reused scratch canvases, so a render does not allocate one per frame. */
function scratchCanvas(key: string, w: number, h: number): { canvas: AnyCanvas; ctx: Ctx } {
  const id = `${key}:${w}x${h}`
  let canvas = scratch.get(id)
  if (!canvas) {
    canvas = makeCanvas(w, h)
    scratch.set(id, canvas)
  }
  const ctx = canvas.getContext('2d') as Ctx
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, w, h)
  return { canvas, ctx }
}

export function intrinsicSize(img: CanvasImageSource): [number, number] {
  const any = img as unknown as Record<string, number>
  if ('videoWidth' in any) return [any.videoWidth, any.videoHeight]
  if ('naturalWidth' in any) return [any.naturalWidth, any.naturalHeight]
  if ('displayWidth' in any) return [any.displayWidth, any.displayHeight]
  return [any.width, any.height]
}

/* ---------------------------------------------------------------- shots --- */

/** Draws a source frame filling the frame (cover), punched in by the clip's zoom. */
function drawCover(ctx: Ctx, img: CanvasImageSource, W: number, H: number, zoom: number, fx: LayerFx, offsetX = 0) {
  const [iw, ih] = intrinsicSize(img)
  if (!iw || !ih) return
  const s = Math.max(W / iw, H / ih) * zoom * fx.scale
  const w = iw * s
  const h = ih * s
  ctx.drawImage(img, (W - w) / 2 + fx.dx * W + offsetX, (H - h) / 2 + fx.dy * H, w, h)
}

/**
 * Blur by drawing through a small canvas and back up. Radius `r` pixels maps to
 * a downscale of roughly r/2, which reads as a soft gaussian at the sizes used.
 */
function drawBlurredShot(ctx: Ctx, img: CanvasImageSource, W: number, H: number, zoom: number, fx: LayerFx, r: number) {
  const k = Math.max(1, Math.min(48, r / 2))
  const w = Math.max(2, Math.round(W / k))
  const h = Math.max(2, Math.round(H / k))
  const { canvas, ctx: small } = scratchCanvas('blur', w, h)
  small.imageSmoothingQuality = 'high'
  small.save()
  small.scale(w / W, h / H)
  drawCover(small, img, W, H, zoom, { ...fx, alpha: 1 })
  small.restore()
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(canvas, 0, 0, W, H)
}

/**
 * Motion blur by averaging taps along the motion. Drawing tap i at alpha
 * 1/(i+1) over the previous ones keeps a running mean, so the result is an
 * even smear rather than a stack that saturates towards the first tap.
 */
function drawMotionBlurredShot(ctx: Ctx, img: CanvasImageSource, W: number, H: number, zoom: number, fx: LayerFx) {
  const spread = fx.motionBlur * W
  const taps = 9
  const { canvas, ctx: acc } = scratchCanvas('motion', W, H)
  for (let i = 0; i < taps; i++) {
    acc.globalAlpha = 1 / (i + 1)
    const offset = (i / (taps - 1) - 0.5) * spread
    drawCover(acc, img, W, H, zoom, { ...fx, alpha: 1 }, offset)
  }
  ctx.drawImage(canvas, 0, 0)
}

function drawShot(ctx: Ctx, img: CanvasImageSource | null, clip: EditClip, fx: LayerFx, W: number, H: number) {
  if (!img || !fx.visible || fx.alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = fx.alpha
  const blurPx = fx.blur * W
  if (fx.motionBlur * W > 2) drawMotionBlurredShot(ctx, img, W, H, clip.zoom || 1, fx)
  else if (blurPx > 1.5) drawBlurredShot(ctx, img, W, H, clip.zoom || 1, fx, blurPx)
  else drawCover(ctx, img, W, H, clip.zoom || 1, fx)
  ctx.restore()
}

/* ----------------------------------------------------------------- text --- */

const fontString = (combo: FontCombo, px: number, accent: boolean) => {
  const a = combo.accent
  const italic = accent ? (a.italic ?? combo.italic) : combo.italic
  const weight = accent ? (a.weight ?? combo.weight) : combo.weight
  const family = accent ? (a.family ?? combo.family) : combo.family
  return `${italic ? 'italic ' : ''}${weight} ${px}px ${family}`
}

export interface PlacedWord {
  token: number
  line: number
  x: number
  width: number
}

/**
 * Greedy word wrap. Pure — `measure` is injected — so line-breaking can be
 * tested without a canvas. A word wider than the line gets a line to itself
 * rather than being split mid-word.
 */
export function wrapTokens(
  widths: number[],
  space: number,
  maxWidth: number,
): { words: PlacedWord[]; lineWidths: number[] } {
  const words: PlacedWord[] = []
  const lineWidths: number[] = []
  let line = 0
  let x = 0
  widths.forEach((w, token) => {
    if (x > 0 && x + space + w > maxWidth) {
      lineWidths[line] = x
      line++
      x = 0
    }
    const at = x === 0 ? 0 : x + space
    words.push({ token, line, x: at, width: w })
    x = at + w
  })
  if (widths.length) lineWidths[line] = x
  return { words, lineWidths }
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, h / 2, w / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

/** Vertical anchors inside the platforms' safe zone: clear of the top bar and the caption/UI stack. */
const ANCHOR = { top: 0.15, center: 0.5, bottom: 0.7 } as const

function setTracking(ctx: Ctx, px: number) {
  const c = ctx as unknown as { letterSpacing?: string }
  if ('letterSpacing' in ctx) c.letterSpacing = `${px}px`
}

/**
 * Paints one run of glyphs with the look's stroke, shadow and fill, optionally
 * blurred. The blur throws a shadow from glyphs drawn far off-canvas, so only
 * the blurred copy lands in frame — the one text blur WebKit will render.
 */
function paintRun(ctx: Ctx, combo: FontCombo, run: string, x: number, y: number, px: number, fill: string, blurPx: number, alpha: number) {
  if (alpha <= 0.001) return
  const sharp = alpha * Math.min(1, Math.max(0, 1 - blurPx / 6))
  const soft = alpha * Math.min(1, Math.max(0, blurPx / 3))

  if (soft > 0.001) {
    ctx.save()
    ctx.globalAlpha = soft
    ctx.shadowColor = fill
    ctx.shadowBlur = blurPx
    ctx.shadowOffsetX = 100000
    ctx.fillStyle = fill
    ctx.fillText(run, x - 100000, y)
    ctx.restore()
  }
  if (sharp <= 0.001) return

  ctx.save()
  ctx.globalAlpha = sharp
  if (combo.stroke) {
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.lineWidth = combo.stroke.width * px * 2
    ctx.strokeStyle = combo.stroke.color
    if (combo.shadow) {
      ctx.shadowColor = combo.shadow.color
      ctx.shadowBlur = combo.shadow.blur * px
      ctx.shadowOffsetY = combo.shadow.dy * px
    }
    ctx.strokeText(run, x, y)
    ctx.shadowColor = 'transparent'
  } else if (combo.shadow) {
    ctx.shadowColor = combo.shadow.color
    ctx.shadowBlur = combo.shadow.blur * px
    ctx.shadowOffsetY = combo.shadow.dy * px
  }
  ctx.fillStyle = fill
  ctx.fillText(run, x, y)
  ctx.restore()
}

export function drawText(ctx: Ctx, text: EditText, t: number, W: number, H: number) {
  const combo = fontCombo(text.style)
  const anim = textAnimation(text.animation)
  const local = t - text.start
  const px = combo.size * W
  const tokens: Token[] = tokenize(text.text).map((tk) => ({
    ...tk,
    text: combo.uppercase ? tk.text.toUpperCase() : tk.text,
  }))
  if (!tokens.length) return

  ctx.save()
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  setTracking(ctx, combo.tracking * px)

  const measure = (tk: Token) => {
    ctx.font = fontString(combo, px, tk.emphasis)
    return ctx.measureText(tk.text).width
  }
  ctx.font = fontString(combo, px, false)
  const space = ctx.measureText(' ').width
  const boxPad = combo.box ? combo.box.padX * px * 2 : 0
  const { words, lineWidths } = wrapTokens(tokens.map(measure), space, W * 0.84 - boxPad)

  const lineH = px * combo.lineHeight
  const blockH = lineWidths.length * lineH
  const top = ANCHOR[text.position] * H - blockH / 2
  const lineX = (line: number) => (W - lineWidths[line]) / 2
  // Baseline sits about 78% down the line box for these faces.
  const baseline = (line: number) => top + line * lineH + lineH * 0.78

  // Units: one for the whole text, one per word, or one per letter.
  type Unit = { weight: number; words: number[]; letter?: { word: number; index: number } }
  const units: Unit[] =
    anim.unit === 'line'
      ? [{ weight: tokens.reduce((a, tk) => a + tk.text.length, 0), words: words.map((_, i) => i) }]
      : anim.unit === 'word'
        ? words.map((_, i) => ({ weight: tokens[i].text.length, words: [i] }))
        : words.flatMap((_, i) => [...tokens[i].text].map((__, j) => ({ weight: 1, words: [i], letter: { word: i, index: j } })))
  const starts = unitStarts(anim, units.map((u) => u.weight), text.duration)

  // Boxes first, per line, arriving with the line's first unit.
  if (combo.box) {
    for (let line = 0; line < lineWidths.length; line++) {
      const firstUnit = units.findIndex((u) => words[u.words[0]].line === line)
      const s = unitState(anim, local, text.duration, Math.max(0, firstUnit), starts)
      if (!s.visible || s.opacity <= 0) continue
      const padX = combo.box.padX * px
      const padY = combo.box.padY * px
      const w = lineWidths[line] + padX * 2
      const h = lineH + padY * 2 - lineH * 0.18
      const cx = lineX(line) + lineWidths[line] / 2
      const cy = top + line * lineH + lineH / 2
      ctx.save()
      ctx.globalAlpha = s.opacity
      ctx.translate(cx + s.dx * px, cy + s.dy * px)
      ctx.scale(s.scale, s.scale)
      ctx.fillStyle = combo.box.color
      roundRect(ctx, -w / 2, -h / 2, w, h, combo.box.radius * px)
      ctx.fill()
      ctx.restore()
    }
  }

  let caretAt: { x: number; y: number } | null = null
  units.forEach((unit, ui) => {
    const s = unitState(anim, local, text.duration, ui, starts)
    if (!s.visible || s.opacity <= 0.001) return

    // Pivot on the middle of what this unit covers, so scale grows from its centre.
    const first = words[unit.words[0]]
    const last = words[unit.words[unit.words.length - 1]]
    const lines = new Set(unit.words.map((w) => words[w].line))
    const multiLine = lines.size > 1
    const pivotX = multiLine ? W / 2 : lineX(first.line) + (first.x + last.x + last.width) / 2
    const pivotY = multiLine ? top + blockH / 2 : top + first.line * lineH + lineH / 2

    ctx.save()
    ctx.translate(pivotX + s.dx * px, pivotY + s.dy * px)
    ctx.scale(s.scale, s.scale)
    ctx.translate(-pivotX, -pivotY)

    if (s.reveal < 1) {
      ctx.beginPath()
      const left = Math.min(...[...lines].map(lineX))
      const right = Math.max(...[...lines].map((l) => lineX(l) + lineWidths[l]))
      ctx.rect(left - px, 0, (right - left + 2 * px) * s.reveal, H)
      ctx.clip()
    }

    for (const wi of unit.words) {
      const placed = words[wi]
      const tk = tokens[wi]
      const accent = tk.emphasis || s.highlight > 0.5
      ctx.font = fontString(combo, px, accent)
      const fill = accent ? (combo.accent.fill ?? combo.fill) : combo.fill
      const x0 = lineX(placed.line) + placed.x
      const y = baseline(placed.line)
      if (unit.letter) {
        const prefix = ctx.measureText(tk.text.slice(0, unit.letter.index)).width
        const glyph = tk.text[unit.letter.index]
        paintRun(ctx, combo, glyph, x0 + prefix, y, px, fill, s.blur * px, s.opacity)
        caretAt = { x: x0 + prefix + ctx.measureText(glyph).width, y }
      } else {
        paintRun(ctx, combo, tk.text, x0, y, px, fill, s.blur * px, s.opacity)
      }
    }
    ctx.restore()
  })

  // The typewriter caret — only while typing, and it does not blink: nothing loops.
  if (anim.id === 'typewriter' && caretAt && local < (starts[starts.length - 1] ?? 0) + 0.3) {
    const c = caretAt as { x: number; y: number }
    ctx.fillStyle = combo.fill
    ctx.fillRect(c.x + px * 0.06, c.y - px * 0.78, Math.max(2, px * 0.06), px * 0.92)
  }
  ctx.restore()
}

/* ---------------------------------------------------------------- frame --- */

export function drawFrame(
  ctx: Ctx,
  project: Pick<EditProject, 'width' | 'height' | 'texts'>,
  placed: PlacedClip[],
  t: number,
  frameFor: FrameProvider,
) {
  const W = project.width
  const H = project.height
  ctx.save()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  const layers = layersAt(placed, t)
  if (layers.kind === 'solo') {
    drawShot(ctx, frameFor(layers.layer.clip, layers.layer.sourceTime), layers.layer.clip, IDENTITY, W, H)
  } else if (layers.kind === 'transition') {
    const tf = transitionFrame(layers.preset, layers.progress)
    drawShot(ctx, frameFor(layers.out.clip, layers.out.sourceTime), layers.out.clip, tf.out, W, H)
    drawShot(ctx, frameFor(layers.in.clip, layers.in.sourceTime), layers.in.clip, tf.in, W, H)
    if (tf.overlay && tf.overlay.alpha > 0) {
      ctx.globalAlpha = tf.overlay.alpha
      ctx.fillStyle = tf.overlay.color
      ctx.fillRect(0, 0, W, H)
      ctx.globalAlpha = 1
    }
  }

  for (const text of textsAt(project.texts, t).sort((a, b) => a.start - b.start)) {
    drawText(ctx, text, t, W, H)
  }
  ctx.restore()
}

/* ---------------------------------------------------------------- fonts --- */

let fontsReady: Promise<void> | null = null

/**
 * Loads every face the looks use before anything is drawn. A frame drawn while
 * a font is still arriving comes out in the fallback face, and in an export that
 * frame is permanent.
 */
export function ensureEditorFonts(): Promise<void> {
  if (fontsReady) return fontsReady
  fontsReady = (async () => {
    if (typeof document === 'undefined') return
    if (!document.querySelector('link[data-editor-fonts]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = EDITOR_FONTS_URL
      link.dataset.editorFonts = 'true'
      document.head.appendChild(link)
      await new Promise<void>((resolve) => {
        link.onload = () => resolve()
        link.onerror = () => resolve()
        setTimeout(resolve, 4000)
      })
    }
    const all = FONT_COMBOS.flatMap(fontDescriptors)
    await Promise.race([
      Promise.allSettled(all.map((d) => document.fonts.load(d))),
      new Promise((r) => setTimeout(r, 6000)),
    ])
  })()
  return fontsReady
}
