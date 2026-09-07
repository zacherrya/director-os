/**
 * The media kit: the document a brand asks for before it will talk about money.
 *
 * Two rules shape the whole thing.
 *
 * First, every number is read from real published performance — nothing is typed
 * in and nothing is rounded up. A kit assembled by hand is stale within a month
 * and quietly flattering, and a brand's marketing team can check. So every median
 * carries the number of posts it came from, on the page that gets sent out.
 *
 * Second, the headline claim has to be earned. The positioning this kit is built
 * around — work that travels past its own following — is a real claim about the
 * numbers, so it is only made when the numbers make it. When a typical post does
 * not out-travel the audience, the page leads with a different, true strength
 * instead. Overclaiming is the specific failure mode of a small creator's media
 * kit, and it is the one thing a brand will catch.
 *
 * The engagement figure is stated as interactions ÷ views, because that is what
 * it is. Quoting it as a share of followers — the other common convention — is a
 * much larger number off the same data.
 */

import jsPDF from 'jspdf'
import {
  COLOR,
  esc,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  sanitizeFilename,
  withPageRenderer,
} from './pdfPage'
import { engagementRate, formatCount, PLATFORM_LABEL, type PostPerformance, type SocialPlatform } from './social'
import type { Baselines } from './retention'
import type { MediaKitProfile } from './types'

/** More than this and the page stops being a kit and starts being a portfolio. */
export const MAX_FEATURED = 6

/** Height of the cover plate. Sized to the page rather than to the image. */
const COVER_ART_H = 786

export interface PlatformSnapshot {
  platform: SocialPlatform
  /** '@handle' on Instagram, the channel title on YouTube. */
  handle: string
  /** Followers or subscribers. */
  audience: number | null
  /** The recent window the medians were computed over. */
  posts: PostPerformance[]
  baselines: Baselines
}

export interface MediaKit {
  profile: MediaKitProfile
  platforms: PlatformSnapshot[]
  featured: PostPerformance[]
  generatedAt: Date
}

const AUDIENCE_NOUN: Record<SocialPlatform, string> = {
  instagram: 'followers',
  youtube: 'subscribers',
}

/* ------------------------------------------------------------------ reach --- */

/**
 * How far a typical post travels compared with the audience already following.
 *
 * Instagram reports reach, which is the honest measure. YouTube reports no reach
 * at all, so views against subscribers stands in — a Short is served heavily to
 * non-subscribers, so the ratio means much the same thing. The basis is carried
 * along and printed, because the two are not the same measurement and a kit that
 * blurred them would deserve to be caught.
 */
export interface TravelStat {
  platform: SocialPlatform
  multiple: number
  basis: 'reach' | 'views'
  sampleSize: number
}

export function travelStat(s: PlatformSnapshot): TravelStat | null {
  if (!s.baselines.reliable || s.audience === null || s.audience <= 0) return null
  if (s.baselines.medianReachMultiple !== null) {
    return {
      platform: s.platform,
      multiple: s.baselines.medianReachMultiple,
      basis: 'reach',
      sampleSize: s.baselines.sampleSize,
    }
  }
  if (s.baselines.medianViews !== null) {
    return {
      platform: s.platform,
      multiple: s.baselines.medianViews / s.audience,
      basis: 'views',
      sampleSize: s.baselines.sampleSize,
    }
  }
  return null
}

/** The strongest travel figure across the connected accounts, or null when none
 * of them clears 1× — at which point the claim is simply not available. */
export function bestTravel(platforms: PlatformSnapshot[]): TravelStat | null {
  const stats = platforms.map(travelStat).filter((t): t is TravelStat => t !== null && t.multiple > 1)
  if (stats.length === 0) return null
  return stats.reduce((best, t) => (t.multiple > best.multiple ? t : best))
}

/** The fallback headline when nothing out-travels its audience: the plain size of
 * a typical post, which is true whatever the ratio says. */
function bestReach(platforms: PlatformSnapshot[]): PlatformSnapshot | null {
  const withViews = platforms.filter((p) => p.baselines.medianViews !== null)
  if (withViews.length === 0) return null
  return withViews.reduce((best, p) =>
    (p.baselines.medianViews ?? 0) > (best.baselines.medianViews ?? 0) ? p : best,
  )
}

/* --------------------------------------------------------------- featured --- */

/**
 * Which posts appear under Selected Work. A pinned selection wins — the best
 * post by views is not always the one worth showing a brand — and otherwise it
 * falls back to the strongest few across every connected platform.
 */
export function selectFeatured(platforms: PlatformSnapshot[], profile: MediaKitProfile): PostPerformance[] {
  const all = platforms.flatMap((p) => p.posts)
  if (profile.featuredPostIds.length > 0) {
    // Kept in the order they were pinned, and silently forgiving of ids whose
    // post has since dropped out of the fetched window.
    return profile.featuredPostIds
      .map((id) => all.find((p) => p.id === id))
      .filter((p): p is PostPerformance => p !== undefined)
      .slice(0, MAX_FEATURED)
  }
  return [...all]
    .filter((p) => p.views !== null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, MAX_FEATURED)
}

/* ------------------------------------------------------------ formatting --- */

function formatPercent(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)}%`
}

function formatMultiple(value: number): string {
  return `${value.toFixed(1)}×`
}

function monthYear(date: Date): string {
  return `${date.toLocaleDateString('en-GB', { month: 'long' })} ${date.getFullYear()}`
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

function sampleNote(n: number): string {
  return `Median of ${n} post${n === 1 ? '' : 's'}`
}

/**
 * A thumbnail can only go in the PDF if it loads cross-origin — html2canvas
 * rasterises through a canvas, and an image the browser refuses to release
 * taints it. Rather than let those come out blank, each one is tried first and
 * anything that fails is replaced by a plain tile.
 */
async function usableThumbnail(url: string | undefined): Promise<string | null> {
  if (!url) return null
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img.naturalWidth > 0 ? url : null)
    img.onerror = () => resolve(null)
    img.src = url
  })
}

/* ------------------------------------------------------------------ style --- */

/**
 * Editorial rather than dashboard: hairline rules instead of rounded cards,
 * figures set in the display serif at a light weight, and micro-labels in
 * letterspaced caps. Numbers of this size look bigger in a bold sans and more
 * credible in a light serif, which is the whole argument.
 */
export const KIT_STYLE = `
  .page.kit { padding: 68px 76px; display: flex; flex-direction: column; }
  .kl {
    font-family: 'Inter', sans-serif; font-size: 9px; font-weight: 500;
    letter-spacing: 0.2em; text-transform: uppercase; color: ${COLOR.inkFaint};
  }
  .kl-ink { color: ${COLOR.ink}; }
  .kl-gold { color: ${COLOR.gold}; }
  .kf { font-family: 'Fraunces', Georgia, serif; font-weight: 300; letter-spacing: -0.02em; }
  .kbody { font-size: 14.5px; line-height: 1.7; color: ${COLOR.inkDim}; }
  .khair { border: none; border-top: 1px solid ${COLOR.border}; }
  .kthumb { background: ${COLOR.surface2}; border: 1px solid ${COLOR.borderSoft}; display: block; }
  .kfoot { display: flex; justify-content: space-between; align-items: baseline; }
`

/* ------------------------------------------------------------------ pages --- */

/** Every page is header, a content column that owns the space between, then a
 * hairline and a running foot. Giving the middle its own flex column is what
 * lets a page push its closing block down to sit on the rule, rather than
 * stacking everything at the top and trailing off into white. */
function pageFrame(inner: string, footLeft: string, footRight: string): string {
  return `
  <div class="page kit">
    <div style="flex:1; display:flex; flex-direction:column; min-height:0;">${inner}</div>
    <hr class="khair" />
    <div class="kfoot" style="padding-top:14px;">
      <span class="kl">${footLeft}</span>
      <span class="kl">${footRight}</span>
    </div>
  </div>`
}

function coverHtml(kit: MediaKit, coverThumb: string | null): string {
  const { profile } = kit
  const line = profile.tagline || profile.positioning
  const contact = [profile.location, profile.contactEmail].filter(Boolean).map(esc).join('   ·   ')
  // A tall plate running the full height of the page, with the name set against
  // its foot — the standard editorial split. Her best-performing post supplies
  // it; when that image cannot be rasterised the cover is purely typographic and
  // the name takes the extra room rather than leaving a hole where art was.
  // An explicit height, not a stretched one: the plate's intrinsic size is taller
  // than the page, and a percentage height against a flex-sized parent resolves
  // differently across engines — one of which is html2canvas's clone.
  const art = coverThumb
    ? `<img class="kthumb" src="${esc(coverThumb)}" style="width:306px; height:${COVER_ART_H}px; object-fit:cover; flex:0 0 auto;" />`
    : ''

  return `
  <div class="page kit">
    <div class="kfoot">
      <span class="kl kl-gold">Media Kit</span>
      <span class="kl">${monthYear(kit.generatedAt)}</span>
    </div>

    <div style="flex:1; display:flex; align-items:flex-end; gap:54px; margin:38px 0; min-height:0;">
      <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:flex-end;">
        <div class="kf" style="font-size:${art ? 56 : 70}px; line-height:1.02;">${esc(profile.displayName || 'Untitled')}</div>
        ${
          line
            ? `<div class="kbody" style="font-size:16px; margin-top:24px; max-width:${art ? 360 : 470}px;">${esc(line)}</div>`
            : ''
        }
      </div>
      ${art}
    </div>

    <hr class="khair" />
    <div class="kfoot" style="padding-top:14px;">
      <span class="kl">${contact}</span>
      <span class="kl">${kit.platforms.map((p) => PLATFORM_LABEL[p.platform]).join(' · ')}</span>
    </div>
  </div>`
}

function audienceColumn(s: PlatformSnapshot): string {
  return `
  <div>
    <div class="kl">${PLATFORM_LABEL[s.platform]}</div>
    <div class="kf" style="font-size:42px; line-height:1.1; margin-top:10px;">${formatCount(s.audience)}</div>
    <div style="font-size:12px; color:${COLOR.inkDim}; margin-top:2px;">${AUDIENCE_NOUN[s.platform]}</div>
    <div style="font-size:11.5px; color:${COLOR.inkFaint}; margin-top:10px;">${esc(s.handle)}</div>
  </div>`
}

function positioningHtml(kit: MediaKit): string {
  const { profile } = kit
  const section = (label: string, body: string) => `
    <div style="margin-top:34px;">
      <div class="kl">${label}</div>
      <div class="kbody" style="margin-top:12px; max-width:520px;">${esc(body)}</div>
    </div>`

  return pageFrame(
    `
    <div class="kfoot">
      <span class="kl kl-gold">Positioning</span>
      <span class="kl">01</span>
    </div>

    ${
      profile.positioning
        ? `<div class="kf" style="font-size:27px; line-height:1.35; margin-top:44px; max-width:560px;">${esc(profile.positioning)}</div>`
        : `<div class="kf" style="font-size:27px; line-height:1.35; margin-top:44px; max-width:560px;">${esc(profile.tagline)}</div>`
    }

    ${profile.audienceNote ? section('Who it reaches', profile.audienceNote) : ''}
    ${profile.collaborationNote ? section('Working together', profile.collaborationNote) : ''}

    <div style="margin-top:auto; padding-top:48px;">
      <hr class="khair" style="margin-bottom:28px;" />
      <div class="kl" style="margin-bottom:22px;">Audience</div>
      <div style="display:grid; grid-template-columns:repeat(${Math.max(kit.platforms.length, 1)}, 1fr); gap:40px;">
        ${kit.platforms.map(audienceColumn).join('')}
      </div>
    </div>`,
    esc(kit.profile.displayName),
    'Positioning',
  )
}

function figure(label: string, value: string, note: string): string {
  return `
  <div>
    <div class="kl">${label}</div>
    <div class="kf" style="font-size:32px; line-height:1.15; margin-top:8px;">${value}</div>
    <div style="font-size:10.5px; color:${COLOR.inkFaint}; margin-top:3px;">${note}</div>
  </div>`
}

function platformRow(s: PlatformSnapshot): string {
  const reach =
    s.baselines.medianReachMultiple !== null
      ? figure('Reach', formatMultiple(s.baselines.medianReachMultiple), 'of follower count')
      : ''
  return `
  <div style="padding:22px 0; border-top:1px solid ${COLOR.borderSoft};">
    <div class="kfoot" style="margin-bottom:16px;">
      <span class="kl kl-ink">${PLATFORM_LABEL[s.platform]}</span>
      <span class="kl">${sampleNote(s.baselines.sampleSize)}</span>
    </div>
    <div style="display:grid; grid-template-columns:repeat(${reach ? 3 : 2}, 1fr); gap:32px;">
      ${figure('Views', formatCount(s.baselines.medianViews), 'per post')}
      ${figure('Engagement', formatPercent(s.baselines.medianEngagement), 'interactions ÷ views')}
      ${reach}
    </div>
  </div>`
}

/** The headline on the performance page. Reads as a claim about travel only when
 * a platform actually clears 1×; otherwise it states the plain size of a typical
 * post, which is true either way. */
function headlineHtml(kit: MediaKit): string {
  const travel = bestTravel(kit.platforms)
  if (travel) {
    const label = PLATFORM_LABEL[travel.platform]
    const basis =
      travel.basis === 'reach'
        ? `reach against follower count`
        : `views against subscriber count — ${label} reports no reach figure`
    return `
    <div class="kf" style="font-size:92px; line-height:1;">${formatMultiple(travel.multiple)}</div>
    <div class="kbody" style="font-size:16px; margin-top:18px; max-width:460px;">
      A typical ${esc(label)} post is seen by ${formatMultiple(travel.multiple)} as many people as the
      account has ${AUDIENCE_NOUN[travel.platform]} — the work travels past the audience that already
      follows it.
    </div>
    <div class="kl" style="margin-top:14px;">${sampleNote(travel.sampleSize)} · ${basis}</div>`
  }

  const strongest = bestReach(kit.platforms)
  if (!strongest) return ''
  return `
  <div class="kf" style="font-size:92px; line-height:1;">${formatCount(strongest.baselines.medianViews)}</div>
  <div class="kbody" style="font-size:16px; margin-top:18px; max-width:460px;">
    Views on a typical ${esc(PLATFORM_LABEL[strongest.platform])} post.
  </div>
  <div class="kl" style="margin-top:14px;">${sampleNote(strongest.baselines.sampleSize)}</div>`
}

function performanceHtml(kit: MediaKit): string {
  return pageFrame(
    `
    <div class="kfoot">
      <span class="kl kl-gold">Performance</span>
      <span class="kl">02</span>
    </div>

    <div style="margin-top:64px;">${headlineHtml(kit)}</div>

    <div style="margin-top:auto; padding-top:56px;">
      ${kit.platforms.map(platformRow).join('')}
    </div>`,
    esc(kit.profile.displayName),
    'Performance',
  )
}

function workCard(post: PostPerformance, thumb: string | null): string {
  const rate = engagementRate(post)
  const art = thumb
    ? `<img class="kthumb" src="${esc(thumb)}" style="width:100%; height:302px; object-fit:cover;" />`
    : `<div class="kthumb" style="width:100%; height:302px;"></div>`
  return `
  <div>
    ${art}
    <div class="kl" style="margin-top:12px;">${PLATFORM_LABEL[post.platform]} · ${post.format} · ${shortDate(post.publishedAt)}</div>
    <div style="font-size:13px; line-height:1.45; margin-top:7px; height:56px; overflow:hidden;">
      ${esc(post.title || 'Untitled')}
    </div>
    <div class="kl kl-ink" style="margin-top:6px;">
      ${formatCount(post.views)} views · ${formatPercent(rate)}
    </div>
  </div>`
}

function workPageHtml(kit: MediaKit, thumbs: (string | null)[], from: number, count: number): string {
  const cards = kit.featured
    .slice(from, from + count)
    .map((p, i) => workCard(p, thumbs[from + i]))
    .join('')
  return pageFrame(
    `
    <div class="kfoot">
      <span class="kl kl-gold">Selected work</span>
      <span class="kl">${from === 0 ? '03' : 'Continued'}</span>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:34px 26px; margin-top:44px;">${cards}</div>`,
    esc(kit.profile.displayName),
    [kit.profile.location, kit.profile.contactEmail].filter(Boolean).map(esc).join('   ·   '),
  )
}

/** The whole document, page by page. Exported so the layout can be rendered and
 * inspected without going through a file download. */
export function mediaKitPages(
  kit: MediaKit,
  thumbs: (string | null)[],
  coverThumb: string | null,
  workPerPage: number[],
): string[] {
  const pages = [coverHtml(kit, coverThumb), positioningHtml(kit), performanceHtml(kit)]
  let from = 0
  for (const count of workPerPage) {
    pages.push(workPageHtml(kit, thumbs, from, count))
    from += count
  }
  return pages
}

export async function exportMediaKitPdf(kit: MediaKit): Promise<void> {
  const thumbs = await Promise.all(kit.featured.map((p) => usableThumbnail(p.thumbnail)))
  const coverThumb = thumbs[0] ?? null

  await withPageRenderer(async (capture, measureOverflow) => {
    // How much fits depends on how long her own copy runs, so every page is
    // measured rather than assumed. Selected Work is the only section that can
    // be split, so it is the one that flows.
    const workPerPage: number[] = []
    let placed = 0
    while (placed < kit.featured.length) {
      let count = kit.featured.length - placed
      while (count > 1 && measureOverflow(workPageHtml(kit, thumbs, placed, count)) > 0) count -= 1
      workPerPage.push(count)
      placed += count
      // A single card that still overflows would loop forever; it never should,
      // but the kit is not worth hanging the app over.
      if (count === 0) break
    }

    const pdf = new jsPDF({ unit: 'px', format: [PAGE_WIDTH, PAGE_HEIGHT] })
    const pages = mediaKitPages(kit, thumbs, coverThumb, workPerPage)
    for (let i = 0; i < pages.length; i++) {
      const canvas = await capture(pages[i])
      if (i > 0) pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT])
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, PAGE_WIDTH, PAGE_HEIGHT)
    }
    pdf.save(`${sanitizeFilename(`${kit.profile.displayName || 'media'}-media-kit`)}.pdf`)
  }, KIT_STYLE)
}
