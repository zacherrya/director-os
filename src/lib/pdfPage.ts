/**
 * Shared plumbing for the app's PDF exports — page geometry, the print palette,
 * and the offscreen render frame.
 *
 * Extracted from the script export once the media kit became a second one. The
 * iframe trick below is subtle enough that a second copy would have drifted.
 */

import html2canvas from 'html2canvas'

export const PAGE_WIDTH = 850
export const PAGE_HEIGHT = 1100

export const COLOR = {
  ink: '#201e1a',
  inkDim: '#6d6659',
  inkFaint: '#9d9585',
  border: '#e7e1d2',
  borderSoft: '#efeadd',
  gold: '#a97b2f',
  surface2: '#fbf9f3',
}

export function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br/>')
}

/** "7 Sep 2026" — the date stamped on an exported document. */
export function formatDateExported(date: Date): string {
  const day = date.getDate()
  const month = date.toLocaleDateString('en-US', { month: 'short' })
  return `${day} ${month} ${date.getFullYear()}`
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9-_ ]/gi, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'untitled'
}

export const SHARED_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  .page {
    width: ${PAGE_WIDTH}px;
    height: ${PAGE_HEIGHT}px;
    background: #ffffff;
    color: ${COLOR.ink};
    font-family: 'Inter', sans-serif;
    position: relative;
    overflow: hidden;
    padding: 56px 64px;
  }
  .label {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 10.5px;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: ${COLOR.inkFaint};
  }
  .label-gold { color: ${COLOR.gold}; }
  .mono { font-family: 'IBM Plex Mono', monospace; }
  .card {
    border: 1px solid ${COLOR.border};
    border-radius: 10px;
    padding: 18px 20px;
  }
  .rule { border: none; border-top: 1px solid ${COLOR.borderSoft}; margin: 14px 0; }
`

export const GOOGLE_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap'

/** Sets up an isolated offscreen iframe with its own document, yields a
 * `capture` function that turns one page's HTML into a canvas, then tears it
 * all down. `extraStyle` is appended after the shared rules, for CSS only one
 * export needs.
 *
 * html2canvas works by cloning the *entire* document.documentElement the
 * target element lives in (that's how it resolves accurate computed/
 * inherited styles) — rendering into the main Director OS document meant
 * every single page clone dragged along the whole Timeline UI (SceneTable
 * rows, TimelineRuler blocks, etc.), which measured at several *seconds* per
 * page. A dedicated iframe with nothing but the export's own markup makes
 * that clone trivially small again. */
export async function withPageRenderer<T>(
  fn: (capture: (html: string) => Promise<HTMLCanvasElement>, measureOverflow: (html: string) => number) => Promise<T>,
  extraStyle = '',
): Promise<T> {
  const iframe = document.createElement('iframe')
  iframe.style.cssText = `position:fixed; top:0; left:-99999px; width:${PAGE_WIDTH}px; height:${PAGE_HEIGHT}px; border:0;`
  document.body.appendChild(iframe)

  const idoc = iframe.contentDocument
  if (!idoc) throw new Error('Could not create an offscreen render frame')

  idoc.open()
  idoc.write(
    `<!DOCTYPE html><html><head><link rel="stylesheet" href="${GOOGLE_FONTS_HREF}"><style>${SHARED_STYLE}${extraStyle}</style></head><body style="margin:0;"></body></html>`,
  )
  idoc.close()

  await new Promise<void>((resolve) => {
    if (idoc.readyState === 'complete') resolve()
    else iframe.addEventListener('load', () => resolve(), { once: true })
  })
  await idoc.fonts.ready.catch(() => {})

  try {
    const capture = async (html: string) => {
      idoc.body.innerHTML = html
      return html2canvas(idoc.body.firstElementChild as HTMLElement, {
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        // Platform thumbnails come off Instagram's and YouTube's CDNs. Without
        // this they would taint the canvas and the whole page would fail to
        // rasterise; callers still pre-check each image and drop the ones that
        // cannot be fetched cross-origin.
        useCORS: true,
      })
    }
    /** How many pixels of content run past the bottom of the page, 0 if it
     * fits. `.page` clips its overflow, so without asking, a layout that is one
     * row too tall exports as a silently truncated document. */
    const measureOverflow = (html: string) => {
      idoc.body.innerHTML = html
      const page = idoc.body.firstElementChild as HTMLElement | null
      if (!page) return 0
      return Math.max(0, page.scrollHeight - page.clientHeight)
    }

    return await fn(capture, measureOverflow)
  } finally {
    document.body.removeChild(iframe)
  }
}
