// Exports an episode as a printable "script" PDF — cover page, storyboard
// grid, then one detail spread per scene. The layout follows the fixed
// design the user supplied (a Claude Design / Adobe Express mockup PDF):
// each page is built as real HTML/CSS (so it reuses the app's own fonts and
// design tokens), rasterized with html2canvas, and assembled into a
// multi-page PDF with jsPDF.

import jsPDF from 'jspdf'
import type { Episode, OnScreenText, Project, Scene } from './types'
import {
  COLOR,
  esc,
  formatDateExported,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  sanitizeFilename,
  withPageRenderer,
} from './pdfPage'

/** "0:00" / "0:28" — matches the per-scene timestamps in the design. */
function formatSceneTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "00:28" — the cover page's zero-padded MM:SS duration. */
function formatDurationMMSS(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** "31 Jul 2026" */
// html2canvas doesn't reliably paint CSS background-image tiling (neither a
// repeating-linear-gradient nor a small tiled data-URI survive the render) —
// a plain <img> is its best-supported case, so the hatch pattern is a single
// self-contained SVG that tiles itself internally via <pattern>, stretched to
// fill the box with object-fit:cover instead of relying on any CSS repeat.
const HATCH_IMG_SRC = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='225'><defs><pattern id='h' width='14' height='14' patternUnits='userSpaceOnUse'><rect width='14' height='14' fill='${COLOR.surface2}'/><path d='M0 14L14 0' stroke='${COLOR.border}' stroke-width='1.4'/></pattern></defs><rect width='400' height='225' fill='url(#h)'/></svg>`,
)}`

function hatchBoxHtml(labelText: string, style: string): string {
  return `
  <div style="position:relative; border-radius:10px; overflow:hidden; ${style}">
    <img src="${HATCH_IMG_SRC}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
    <div style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center;">
      <span class="label mono">${labelText}</span>
    </div>
  </div>`
}

/** The real storyboard photo when the scene has one, else the same hatch
 * placeholder used everywhere else — so a scene never silently loses its
 * uploaded image just because it's being rendered for the script export. */
function sceneVisualHtml(scene: Scene, style: string): string {
  if (scene.image) {
    return `
    <div style="position:relative; border-radius:10px; overflow:hidden; ${style}">
      <img src="${scene.image}" style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;" />
    </div>`
  }
  return hatchBoxHtml('Scene Still · 16:9', style)
}

/** Up to two tags summarizing what's actually filled in for this scene, in
 * the same "DIALOGUE · MUSIC"-style pairing the design shows on each card. */
function sceneTags(scene: Scene): string[] {
  const tags: string[] = []
  if (scene.dialogue.trim()) tags.push('Dialogue')
  if (scene.audio.music.trim()) tags.push('Music')
  if (scene.audio.sfx.length > 0) tags.push('SFX')
  if (scene.assets.length > 0) tags.push('AI')
  if (tags.length === 0) tags.push('Camera')
  return tags.slice(0, 2)
}

function coverPageHtml(episode: Episode, project: Project): string {
  return `
  <div class="page" style="display:flex; flex-direction:column;">
    <div style="display:flex; align-items:center; justify-content:space-between;">
      <span class="label" style="color:${COLOR.gold};">Director OS</span>
      <span style="width:28px; height:2px; background:${COLOR.gold}; display:block;"></span>
    </div>
    <div style="flex:1;"></div>
    <div>
      <div class="label">Lesson ${String(episode.number).padStart(3, '0')} · Script</div>
      <div style="font-size:46px; font-weight:700; line-height:1.08; letter-spacing:-0.01em; margin-top:10px; max-width:640px;">
        ${esc(episode.title)}
      </div>
      <div style="height:1px; background:${COLOR.border}; margin-top:32px;"></div>
      <div style="display:flex; flex-wrap:wrap;">
        <div style="box-sizing:border-box; width:50%; padding:18px 24px 18px 0; border-right:1px solid ${COLOR.border}; border-bottom:1px solid ${COLOR.border};">
          <div class="label">Duration</div>
          <div class="mono" style="font-size:18px; margin-top:4px;">${formatDurationMMSS(episode.length)}</div>
        </div>
        <div style="box-sizing:border-box; width:50%; padding:18px 0 18px 24px; border-bottom:1px solid ${COLOR.border};">
          <div class="label">Project</div>
          <div style="font-size:16px; margin-top:4px;">${esc(project.name)}</div>
        </div>
        <div style="box-sizing:border-box; width:50%; padding:18px 24px 18px 0; border-right:1px solid ${COLOR.border};">
          <div class="label">Scenes</div>
          <div style="font-size:16px; margin-top:4px;">${episode.scenes.length}</div>
        </div>
        <div style="box-sizing:border-box; width:50%; padding:18px 0 18px 24px;">
          <div class="label">Date Exported</div>
          <div style="font-size:16px; margin-top:4px;">${formatDateExported(new Date())}</div>
        </div>
      </div>
    </div>
  </div>`
}

function storyboardCardHtml(scene: Scene): string {
  const tags = sceneTags(scene)
  return `
  <div>
    ${sceneVisualHtml(scene, 'aspect-ratio:16/9;')}
    <div style="display:flex; align-items:flex-start; justify-content:space-between; margin-top:10px;">
      <div>
        <div class="label mono">Scene ${String(scene.index).padStart(2, '0')} · ${formatSceneTime(scene.start)}–${formatSceneTime(scene.end)}</div>
        <div style="font-size:16px; font-weight:600; margin-top:2px;">${esc(scene.purpose)}</div>
      </div>
      <div class="label label-gold mono" style="text-align:right; white-space:nowrap; margin-top:2px;">${tags.join(' · ')}</div>
    </div>
  </div>`
}

function storyboardGridPageHtml(scenes: Scene[], rangeStart: number, rangeEnd: number): string {
  const cards = scenes.map(storyboardCardHtml).join('')
  return `
  <div class="page">
    <div style="display:flex; align-items:baseline; justify-content:space-between; margin-bottom:28px;">
      <div style="font-size:28px; font-weight:700;">Storyboard</div>
      <div class="label mono">${formatSceneTime(rangeStart)} – ${formatSceneTime(rangeEnd)}</div>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px 22px;">${cards}</div>
  </div>`
}

function detailField(label: string, value: string): string {
  return `<div><div class="label">${esc(label)}</div><div style="font-size:14px; font-weight:600; margin-top:3px;">${esc(value)}</div></div>`
}

function onScreenTextFontFamily(font: OnScreenText['font']): string {
  if (font === 'Fraunces') return "'Fraunces', serif"
  if (font === 'IBM Plex Mono') return "'IBM Plex Mono', monospace"
  return "'Inter', sans-serif"
}

function scenePageHtml(scene: Scene, index: number, total: number): string {
  const sfxLines = scene.audio.sfx.length
    ? scene.audio.sfx.map((cue) => `${esc(cue.name)} · ${formatSceneTime(cue.offset)}`).join('<br/>')
    : '—'
  const actorDirection = scene.actorDirection.length ? scene.actorDirection.join(' · ') : '—'
  const onScreenCaption = scene.onScreenText.text.trim()
    ? `${scene.onScreenText.animation} · ${scene.onScreenText.position} · ${scene.onScreenText.duration}s`
    : ''
  const musicSubtext = scene.audio.volumeNotes.trim()

  return `
  <div class="page">
    <div style="display:flex; align-items:flex-start; justify-content:space-between;">
      <div>
        <div class="label mono">Scene ${index + 1} of ${total}</div>
        <div style="font-size:26px; font-weight:700; margin-top:4px;">${esc(scene.purpose)}</div>
      </div>
      <div style="text-align:right; max-width:280px;">
        <div class="label mono">${formatSceneTime(scene.start)}–${formatSceneTime(scene.end)}</div>
        ${scene.retentionGoal.trim() ? `<div class="label-gold" style="font-size:12px; margin-top:4px; line-height:1.4;">${esc(scene.retentionGoal)}</div>` : ''}
      </div>
    </div>

    ${sceneVisualHtml(scene, 'aspect-ratio:16/9; margin-top:20px;')}

    <div style="display:flex; flex-wrap:wrap; margin-top:20px;">
      <div class="card" style="box-sizing:border-box; width:48%; margin-right:4%; margin-bottom:16px;">
        <div class="label label-gold">Camera</div>
        <div style="display:flex; flex-wrap:wrap; margin-top:14px;">
          <div style="box-sizing:border-box; width:50%; padding-right:8px; margin-bottom:14px;">${detailField('Shot', scene.camera.shotType)}</div>
          <div style="box-sizing:border-box; width:50%; padding-right:8px; margin-bottom:14px;">${detailField('Movement', scene.camera.movement)}</div>
          <div style="box-sizing:border-box; width:50%; padding-right:8px;">${detailField('Lens', scene.camera.lens)}</div>
          <div style="box-sizing:border-box; width:50%; padding-right:8px;">${detailField('Height', scene.camera.angle)}</div>
        </div>
        ${scene.camera.notes?.trim() ? `<hr class="rule"/>${detailField('Note', scene.camera.notes)}` : ''}
      </div>

      <div class="card" style="box-sizing:border-box; width:48%; margin-bottom:16px;">
        <div class="label">Dialogue</div>
        <div style="font-size:17px; font-style:italic; margin-top:10px; line-height:1.4;">
          ${scene.dialogue.trim() ? `"${esc(scene.dialogue)}"` : '—'}
        </div>
        <hr class="rule"/>
        <div class="label">Actor Direction</div>
        <div style="font-size:13px; margin-top:6px; color:${COLOR.inkDim};">${esc(actorDirection)}</div>
      </div>

      <div class="card" style="box-sizing:border-box; width:48%; margin-right:4%;">
        <div class="label label-gold">Music &amp; SFX</div>
        <div style="font-size:15px; font-weight:600; margin-top:12px;">${scene.audio.music.trim() ? esc(scene.audio.music) : '—'}</div>
        ${musicSubtext ? `<div style="font-size:12px; color:${COLOR.inkFaint}; margin-top:3px;">${esc(musicSubtext)}</div>` : ''}
        <hr class="rule"/>
        <div class="label">SFX</div>
        <div style="font-size:13px; margin-top:6px; line-height:1.6;">${sfxLines}</div>
      </div>

      <div class="card" style="box-sizing:border-box; width:48%;">
        <div class="label">On-Screen Text</div>
        <div style="background:${COLOR.ink}; border-radius:10px; aspect-ratio:16/10; margin-top:10px; padding:16px; display:flex; align-items:center; justify-content:center;">
          <span style="color:#fff; font-weight:600; font-size:20px; text-align:center; font-family:${onScreenTextFontFamily(scene.onScreenText.font)};">
            ${scene.onScreenText.text.trim() ? esc(scene.onScreenText.text) : 'None'}
          </span>
        </div>
        ${onScreenCaption ? `<div style="font-size:11.5px; color:${COLOR.inkFaint}; margin-top:8px;">${esc(onScreenCaption)}</div>` : ''}
      </div>
    </div>

    ${
      scene.notes.trim()
        ? `<div style="border:1px solid ${COLOR.border}; border-left:3px solid ${COLOR.gold}; border-radius:8px; padding:14px 18px; margin-top:16px;">
            <div class="label label-gold">Director Note</div>
            <div style="font-size:13.5px; margin-top:6px;">${esc(scene.notes)}</div>
          </div>`
        : ''
    }
  </div>`
}

const SCENES_PER_STORYBOARD_PAGE = 6

export async function exportEpisodeScript(episode: Episode, project: Project): Promise<void> {
  await withPageRenderer(async (capture) => {
    const pdf = new jsPDF({ unit: 'px', format: [PAGE_WIDTH, PAGE_HEIGHT] })
    let firstPage = true

    const addPage = async (html: string) => {
      const canvas = await capture(html)
      const imgData = canvas.toDataURL('image/jpeg', 0.92)
      if (!firstPage) pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pdf.addImage(imgData, 'JPEG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT)
      firstPage = false
    }

    await addPage(coverPageHtml(episode, project))
    for (let i = 0; i < episode.scenes.length; i += SCENES_PER_STORYBOARD_PAGE) {
      const chunk = episode.scenes.slice(i, i + SCENES_PER_STORYBOARD_PAGE)
      await addPage(storyboardGridPageHtml(chunk, episode.scenes[0].start, episode.scenes.at(-1)!.end))
    }
    for (let i = 0; i < episode.scenes.length; i++) {
      await addPage(scenePageHtml(episode.scenes[i], i, episode.scenes.length))
    }

    pdf.save(`${sanitizeFilename(`${project.name}-${episode.title}-script`)}.pdf`)
  })
}

