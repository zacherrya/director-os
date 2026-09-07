import type {
  AssetKind,
  Episode,
  Project,
  ProjectAsset,
  Scene,
  SceneSfxCue,
  ScenePurpose,
} from '../lib/types'

let idCounter = 0
function id(prefix: string) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function sfxCue(name: string, offset = 0, duration?: number): SceneSfxCue {
  return { id: id('sfxcue'), name, offset, duration }
}

function scene(partial: {
  index: number
  start: number
  end: number
  purpose: ScenePurpose
  emotion: Scene['emotion']
  dialogue: string
  actorDirection: string[]
  camera: Scene['camera']
  visual: string
  onScreenText: Scene['onScreenText']
  audio: Scene['audio']
  retentionGoal: string
  notes?: string
  tags?: string[]
  thumbnailIcon: string
  assets?: Scene['assets']
}): Scene {
  return {
    id: id('scene'),
    index: partial.index,
    start: partial.start,
    end: partial.end,
    purpose: partial.purpose,
    emotion: partial.emotion,
    dialogue: partial.dialogue,
    actorDirection: partial.actorDirection,
    camera: partial.camera,
    visual: partial.visual,
    onScreenText: partial.onScreenText,
    assets: partial.assets ?? [],
    audio: partial.audio,
    retentionGoal: partial.retentionGoal,
    notes: partial.notes ?? '',
    tags: partial.tags ?? [],
    thumbnailIcon: partial.thumbnailIcon,
  }
}

// ---------------------------------------------------------------------------
// Styled by Shivangi — Lesson 001 (fully detailed, mirrors the reference)
// ---------------------------------------------------------------------------

const lesson001Scenes: Scene[] = [
  scene({
    index: 1,
    start: 0,
    end: 3,
    purpose: 'Hook',
    emotion: 'Curious',
    dialogue: 'Your wardrobe is full... so why do you still have nothing to wear?',
    actorDirection: ['Walk in', 'Look surprised'],
    camera: { shotType: 'Wide', movement: 'Push In', lens: '24mm', angle: 'Eye Level' },
    visual: 'Shivangi opens an overstuffed closet, hangers screech, camera pushes in on her face.',
    onScreenText: { text: 'WHY?', font: 'Fraunces', animation: 'Fade In', position: 'Center', duration: 2 },
    audio: {
      music: 'Cinematic Beat',
      sfx: [sfxCue('Closet opens', 0), sfxCue('Hanger movement', 0.4)],
      voiceOver: '',
      mood: 'Tense curiosity',
      intensity: 60,
      volumeNotes: 'Music under -14dB, SFX punchy on closet open.',
    },
    retentionGoal: 'Creates curiosity in the first 3 seconds — stops the scroll.',
    tags: ['Hook'],
    thumbnailIcon: 'door-open',
  }),
  scene({
    index: 2,
    start: 3,
    end: 6,
    purpose: 'False Belief',
    emotion: 'Confused',
    dialogue: 'Because you think the solution is buying more clothes.',
    actorDirection: ['Point at board', 'Look into camera'],
    camera: { shotType: 'Medium', movement: 'Static', lens: '35mm', angle: 'Eye Level' },
    visual: 'Cut to phone screen scrolling a shopping app, thumb taps "Buy Now".',
    onScreenText: { text: 'BUY MORE CLOTHES', font: 'Inter', animation: 'Slide Up', position: 'Center', duration: 2.5 },
    audio: {
      music: 'Light Beat',
      sfx: [sfxCue('Phone tap', 0.3), sfxCue('Card swipe', 1.6)],
      voiceOver: '',
      mood: 'Ironic, a little smug',
      intensity: 45,
      volumeNotes: 'Keep SFX crisp and forward in the mix.',
    },
    retentionGoal: 'Names the false belief the audience holds — sets up the reversal.',
    tags: ['False Belief'],
    thumbnailIcon: 'shopping-bag',
  }),
  scene({
    index: 3,
    start: 6,
    end: 10,
    purpose: 'It Isn\'t',
    emotion: 'Realization',
    dialogue: 'It isn\'t.\nYour problem isn\'t your wardrobe.',
    actorDirection: ['Smile', 'Pause', 'Look into camera'],
    camera: { shotType: 'Close Up', movement: 'Truck', lens: '35mm', angle: 'Eye Level' },
    visual: 'Shivangi talking to camera, confident expression.',
    onScreenText: { text: 'It isn’t your\nwardrobe.', font: 'Fraunces', animation: 'Fade In', position: 'Bottom', duration: 3 },
    audio: {
      music: 'Music Cut (Silence)',
      sfx: [],
      voiceOver: '',
      mood: 'Confident stillness',
      intensity: 20,
      volumeNotes: 'Full music cut to let the line land.',
    },
    retentionGoal: 'Pays off the hook — reversal moment that earns trust.',
    notes: 'Pause after "It isn’t." for impact.',
    tags: ['Education', 'Mindset Shift', 'Hook'],
    thumbnailIcon: 'user-round',
  }),
  scene({
    index: 4,
    start: 10,
    end: 15,
    purpose: 'Lesson',
    emotion: 'Curious',
    dialogue: 'Your problem is that nobody taught you how style actually works.',
    actorDirection: ['Walk in', 'Point at board'],
    camera: { shotType: 'Medium', movement: 'Handheld', lens: '35mm', angle: 'Eye Level' },
    visual: 'Notebook flips open on a desk to a hand-drawn "Styled by Shivangi School" title page.',
    onScreenText: { text: 'Styled by\nShivangi School', font: 'Fraunces', animation: 'Write On', position: 'Center', duration: 3 },
    audio: {
      music: 'Bell Ding',
      sfx: [sfxCue('Notebook Open', 0), sfxCue('Marker Write', 2)],
      voiceOver: '',
      mood: 'Playful, instructive',
      intensity: 50,
      volumeNotes: 'Marker write SFX synced to on-screen text draw-on.',
    },
    retentionGoal: 'Introduces the lesson framing — signals value is coming.',
    tags: ['Lesson'],
    thumbnailIcon: 'notebook-pen',
  }),
  scene({
    index: 5,
    start: 15,
    end: 22,
    purpose: 'Truth',
    emotion: 'Inspired',
    dialogue: 'Style isn\'t a talent.\nIt\'s a skill.',
    actorDirection: ['Look into camera', 'Smile'],
    camera: { shotType: 'Close Up', movement: 'Push In', lens: '50mm', angle: 'Eye Level' },
    visual: 'Chalkboard-style graphic behind Shivangi reading "STYLE = UNDERSTANDING".',
    onScreenText: { text: 'STYLE\n=\nUNDERSTANDING', font: 'Fraunces', animation: 'Pop In', position: 'Center', duration: 4 },
    audio: {
      music: 'Uplifting Rise',
      sfx: [sfxCue('Click', 0.2), sfxCue('Sparkle', 0.5)],
      voiceOver: '',
      mood: 'Empowering',
      intensity: 70,
      volumeNotes: 'Build music energy through this beat into Homework.',
    },
    retentionGoal: 'Builds emotion and reframes the audience’s self-belief.',
    tags: ['Mindset Shift'],
    thumbnailIcon: 'graduation-cap',
  }),
  scene({
    index: 6,
    start: 22,
    end: 26,
    purpose: 'Homework',
    emotion: 'Determined',
    dialogue: 'Open your wardrobe. Count how many clothes you haven’t worn in the last 3 months.',
    actorDirection: ['Point at board', 'Look surprised'],
    camera: { shotType: 'Top Down', movement: 'Static', lens: '24mm', angle: 'High Angle' },
    visual: 'Overhead shot of hand-written homework list: "Open Wardrobe", "Count Clothes", "Circle Unworn".',
    onScreenText: { text: 'HOMEWORK', font: 'Inter', animation: 'Slide In', position: 'Top', duration: 3 },
    audio: {
      music: 'Soft Beat',
      sfx: [sfxCue('Page Flip', 0), sfxCue('Pen Write', 1)],
      voiceOver: '',
      mood: 'Actionable, focused',
      intensity: 40,
      volumeNotes: 'Keep music low so instructions read clearly if VO added later.',
    },
    retentionGoal: 'Converts a passive viewer into an active participant.',
    tags: ['Homework', 'CTA'],
    thumbnailIcon: 'clipboard-list',
  }),
  scene({
    index: 7,
    start: 26,
    end: 28,
    purpose: 'Teaser',
    emotion: 'Excited',
    dialogue: 'Tomorrow... we’ll fix it.',
    actorDirection: ['Smile', 'Look into camera'],
    camera: { shotType: 'Medium', movement: 'Pull Out', lens: '35mm', angle: 'Eye Level' },
    visual: 'Bell icon rings on screen, Shivangi winks as frame pulls back to reveal the studio.',
    onScreenText: { text: 'TOMORROW...', font: 'Fraunces', animation: 'Fade Out', position: 'Bottom', duration: 2 },
    audio: {
      music: 'Bell + Whoosh',
      sfx: [sfxCue('Bell', 0.5)],
      voiceOver: '',
      mood: 'Anticipation',
      intensity: 55,
      volumeNotes: 'End on bell hit synced to logo whoosh for part 2 teaser.',
    },
    retentionGoal: 'Sets up part 2 — drives follows and return viewership.',
    tags: ['Series Hook'],
    thumbnailIcon: 'bell',
  }),
]

// ---------------------------------------------------------------------------
// Lightweight scene generator for supporting episodes
// ---------------------------------------------------------------------------

const purposeCycle: ScenePurpose[] = ['Hook', 'Problem', 'Lesson', 'Example', 'Transformation', 'CTA']
const iconCycle = ['clapperboard', 'camera', 'sparkles', 'message-circle', 'wand-2', 'megaphone']

function buildQuickScenes(length: number, count: number, dialogues: string[]): Scene[] {
  const scenes: Scene[] = []
  const step = length / count
  for (let i = 0; i < count; i++) {
    const start = Math.round(i * step)
    const end = i === count - 1 ? length : Math.round((i + 1) * step)
    const purpose = purposeCycle[i % purposeCycle.length]
    scenes.push(
      scene({
        index: i + 1,
        start,
        end,
        purpose,
        emotion: 'Curious',
        dialogue: dialogues[i] ?? `Scene ${i + 1} dialogue placeholder.`,
        actorDirection: ['Look into camera'],
        camera: { shotType: 'Medium', movement: 'Static', lens: '35mm', angle: 'Eye Level' },
        visual: `Placeholder visual description for scene ${i + 1}.`,
        onScreenText: { text: purpose.toUpperCase(), font: 'Inter', animation: 'Fade In', position: 'Bottom', duration: 2 },
        audio: {
          music: 'Underscore',
          sfx: [],
          voiceOver: '',
          mood: 'Neutral',
          intensity: 40,
          volumeNotes: '',
        },
        retentionGoal: `Advances the ${purpose.toLowerCase()} beat.`,
        thumbnailIcon: iconCycle[i % iconCycle.length],
      }),
    )
  }
  return scenes
}

// ---------------------------------------------------------------------------
// Projects + Episodes
// ---------------------------------------------------------------------------

export const episodes: Episode[] = []
export const projects: Project[] = []

function addEpisode(e: Omit<Episode, 'id'>): Episode {
  const full: Episode = { ...e, id: id('ep') }
  episodes.push(full)
  return full
}

// Styled by Shivangi
const shivangiEp1 = addEpisode({
  projectId: 'proj-shivangi',
  number: 1,
  title: 'Why You Still Have Nothing To Wear',
  length: 28,
  status: 'Planning',
  completion: 72,
  estShootMinutes: 45,
  estEditMinutes: 90,
  format: '9:16',
  scenes: lesson001Scenes,
})

const shivangiEp2 = addEpisode({
  projectId: 'proj-shivangi',
  number: 2,
  title: 'The 5-Piece Capsule That Fixes Everything',
  length: 32,
  status: 'Filming',
  completion: 40,
  estShootMinutes: 60,
  estEditMinutes: 100,
  format: '9:16',
  scenes: buildQuickScenes(32, 6, [
    'You own 80 pieces and still wear the same 5.',
    'You think you need more options.',
    'A capsule isn’t about less. It’s about intention.',
    'Here’s the 5-piece formula I give every client.',
    'Mix these five and you get twenty outfits.',
    'Screenshot this before you shop again.',
  ]),
})

const shivangiEp3 = addEpisode({
  projectId: 'proj-shivangi',
  number: 3,
  title: 'Colour Theory For People Who Hate Colour',
  length: 24,
  status: 'Published',
  completion: 100,
  estShootMinutes: 35,
  estEditMinutes: 70,
  format: '9:16',
  scenes: buildQuickScenes(24, 5, [
    'Black and grey is not a personality.',
    'You’re scared of colour because no one showed you how.',
    'Here’s the 60-30-10 rule, simplified.',
    'Try this on one outfit this week.',
    'Tag me when you do.',
  ]),
})

// ETCHD
const etchdEp1 = addEpisode({
  projectId: 'proj-etchd',
  number: 1,
  title: 'The Brand Nobody Asked For',
  length: 40,
  status: 'Editing',
  completion: 55,
  estShootMinutes: 90,
  estEditMinutes: 150,
  format: '16:9',
  scenes: buildQuickScenes(40, 7, [
    'Every founder says the same thing at 2am.',
    '"Nobody is going to buy this."',
    'That fear is actually a good sign.',
    'Here’s what we built anyway.',
    'The first sale changed everything.',
    'This is the part nobody shows you.',
    'Follow along as we build ETCHD in public.',
  ]),
})

const etchdEp2 = addEpisode({
  projectId: 'proj-etchd',
  number: 2,
  title: 'Behind The Studio Build',
  length: 30,
  status: 'Planning',
  completion: 18,
  estShootMinutes: 70,
  estEditMinutes: 110,
  format: '16:9',
  scenes: buildQuickScenes(30, 6, [
    'This studio was a garage six months ago.',
    'We had no idea what we were doing.',
    'Every wall in here has a story.',
    'Here’s the gear that actually mattered.',
    'The part that almost broke us.',
    'Come see what we built next.',
  ]),
})

// The Gibsons
const gibsonsEp1 = addEpisode({
  projectId: 'proj-gibsons',
  number: 1,
  title: 'A Day In Our Chaotic House',
  length: 45,
  status: 'Filming',
  completion: 33,
  estShootMinutes: 120,
  estEditMinutes: 90,
  format: '9:16',
  scenes: buildQuickScenes(45, 8, [
    '6am. Someone is already crying.',
    'It’s not the kids, it’s me.',
    'This is what nobody tells you about mornings.',
    'By 9am we’ve survived three meltdowns.',
    'Lunch is somehow the hardest part of the day.',
    'This is the trick that actually works.',
    'By dinner we’re all just... surviving.',
    'Same time tomorrow. We’ll try again.',
  ]),
})

const gibsonsEp2 = addEpisode({
  projectId: 'proj-gibsons',
  number: 2,
  title: 'Renovating On A Budget',
  length: 38,
  status: 'Published',
  completion: 100,
  estShootMinutes: 80,
  estEditMinutes: 100,
  format: '9:16',
  scenes: buildQuickScenes(38, 6, [
    'We had $4,000 and a very ugly kitchen.',
    'Everyone told us to hire a contractor.',
    'Here’s what we did instead.',
    'This one hack saved us $1,200.',
    'The reveal still makes us emotional.',
    'Full cost breakdown is in the comments.',
  ]),
})

// YouTube Essays
const essaysEp1 = addEpisode({
  projectId: 'proj-essays',
  number: 1,
  title: 'Why Every Coming-of-Age Film Feels The Same',
  length: 50,
  status: 'Planning',
  completion: 10,
  estShootMinutes: 20,
  estEditMinutes: 240,
  format: '16:9',
  scenes: buildQuickScenes(50, 8, [
    'There’s a shot that shows up in every coming-of-age film.',
    'A kid, alone, staring out a car window.',
    'It’s not lazy. It’s a formula.',
    'Here’s where that formula actually comes from.',
    'Three films that broke the pattern on purpose.',
    'What happens when a director refuses the shot.',
    'This is why the formula still works on us.',
    'Next essay: the needle-drop problem.',
  ]),
})

const essaysEp2 = addEpisode({
  projectId: 'proj-essays',
  number: 2,
  title: 'The Needle-Drop Problem',
  length: 55,
  status: 'Editing',
  completion: 62,
  estShootMinutes: 15,
  estEditMinutes: 280,
  format: '16:9',
  scenes: buildQuickScenes(55, 7, [
    'One song can make or break a scene.',
    'Studios are paying more than ever to license them.',
    'So why do needle-drops keep feeling cheap?',
    'It’s a timing problem, not a taste problem.',
    'Here’s the scene that gets it right.',
    'And the one that gets it painfully wrong.',
    'Next time: the score that isn’t there.',
  ]),
})

projects.push(
  {
    id: 'proj-shivangi',
    name: 'Styled by Shivangi',
    description: 'Short-form styling lessons and wardrobe psychology.',
    color: '#d3a75c',
    icon: 'shirt',
    episodeIds: [shivangiEp1.id, shivangiEp2.id, shivangiEp3.id],
  },
  {
    id: 'proj-etchd',
    name: 'ETCHD',
    description: 'Building a creative studio brand in public.',
    color: '#4f8fc0',
    icon: 'flame',
    episodeIds: [etchdEp1.id, etchdEp2.id],
  },
  {
    id: 'proj-gibsons',
    name: 'The Gibsons',
    description: 'Family life, home projects and honest chaos.',
    color: '#6bb15a',
    icon: 'home',
    episodeIds: [gibsonsEp1.id, gibsonsEp2.id],
  },
  {
    id: 'proj-essays',
    name: 'YouTube Essays',
    description: 'Long-form video essays on film and culture.',
    color: '#8a7bd8',
    icon: 'clapperboard',
    episodeIds: [essaysEp1.id, essaysEp2.id],
  },
)

// ---------------------------------------------------------------------------
// Project Assets
// ---------------------------------------------------------------------------

export const assets: ProjectAsset[] = []

function addAsset(a: Omit<ProjectAsset, 'id'>) {
  assets.push({ ...a, id: id('asset') })
}

const shivangiScenes = lesson001Scenes
addAsset({
  projectId: 'proj-shivangi',
  category: 'AI Videos',
  name: 'Closet Push-In — Hook Variant',
  status: 'Approved',
  linkedScenes: [shivangiScenes[0].id],
  notes: 'Runway-style push in, warm practical lighting.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'AI Videos',
  name: 'Phone Scroll Overlay',
  status: 'Generated',
  linkedScenes: [shivangiScenes[1].id],
  notes: 'Needs faster scroll speed on second pass.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Images',
  name: 'Notebook Title Card',
  status: 'Approved',
  linkedScenes: [shivangiScenes[3].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Images',
  name: 'Style = Understanding Chalkboard',
  status: 'Needs Revision',
  linkedScenes: [shivangiScenes[4].id],
  notes: 'Chalk texture too heavy, simplify.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Music',
  name: 'Cinematic Beat — Full Mix',
  status: 'Approved',
  linkedScenes: [shivangiScenes[0].id],
  notes: 'Licensed, stems available.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Music',
  name: 'Uplifting Rise',
  status: 'Approved',
  linkedScenes: [shivangiScenes[4].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'SFX',
  name: 'Closet Open + Hanger Slide',
  status: 'Approved',
  linkedScenes: [shivangiScenes[0].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'SFX',
  name: 'Bell Ding',
  status: 'Approved',
  linkedScenes: [shivangiScenes[3].id, shivangiScenes[6].id],
  notes: 'Reused across series as a signature sting.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Fonts',
  name: 'Fraunces (Display)',
  status: 'Approved',
  linkedScenes: [],
  notes: 'Primary on-screen text font.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Fonts',
  name: 'Inter (Labels)',
  status: 'Approved',
  linkedScenes: [],
  notes: 'Secondary label font for tags and stamps.',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Logos',
  name: 'Styled by Shivangi Wordmark',
  status: 'Approved',
  linkedScenes: [shivangiScenes[3].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Icons',
  name: 'Bell Icon (Teaser Sting)',
  status: 'Approved',
  linkedScenes: [shivangiScenes[6].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Props',
  name: 'Chalkboard "Style = Understanding"',
  status: 'Generated',
  linkedScenes: [shivangiScenes[4].id],
  notes: '',
})
addAsset({
  projectId: 'proj-shivangi',
  category: 'Wardrobe',
  name: 'Capsule Wardrobe Rail',
  status: 'Pending',
  linkedScenes: [shivangiScenes[0].id],
  notes: 'Confirm rack colour matches set.',
})

addAsset({
  projectId: 'proj-etchd',
  category: 'AI Videos',
  name: 'Studio Build Timelapse',
  status: 'Generated',
  linkedScenes: [],
  notes: '',
})
addAsset({
  projectId: 'proj-etchd',
  category: 'Logos',
  name: 'ETCHD Monogram',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})
addAsset({
  projectId: 'proj-etchd',
  category: 'Music',
  name: 'Low-Fi Build Loop',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})
addAsset({
  projectId: 'proj-etchd',
  category: 'Props',
  name: 'Whiteboard — Roadmap',
  status: 'Pending',
  linkedScenes: [],
  notes: '',
})

addAsset({
  projectId: 'proj-gibsons',
  category: 'Images',
  name: 'Kitchen Before / After',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})
addAsset({
  projectId: 'proj-gibsons',
  category: 'SFX',
  name: 'Kids Laughing (Clean)',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})
addAsset({
  projectId: 'proj-gibsons',
  category: 'Wardrobe',
  name: 'Everyday Home Fits',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})

addAsset({
  projectId: 'proj-essays',
  category: 'Images',
  name: 'Car Window Shot Archive',
  status: 'Generated',
  linkedScenes: [],
  notes: 'Reference grab from 12 films for the essay.',
})
addAsset({
  projectId: 'proj-essays',
  category: 'Music',
  name: 'Score — Slow Strings Bed',
  status: 'Needs Revision',
  linkedScenes: [],
  notes: 'Too dramatic for the tone of this essay.',
})
addAsset({
  projectId: 'proj-essays',
  category: 'Fonts',
  name: 'Fraunces Italic (Pull Quotes)',
  status: 'Approved',
  linkedScenes: [],
  notes: '',
})

export function getProject(projectId: string): Project | undefined {
  return projects.find((p) => p.id === projectId)
}

export function getEpisode(episodeId: string): Episode | undefined {
  return episodes.find((e) => e.id === episodeId)
}

export function getProjectEpisodes(projectId: string): Episode[] {
  return episodes.filter((e) => e.projectId === projectId)
}

export function getProjectAssets(projectId: string): ProjectAsset[] {
  return assets.filter((a) => a.projectId === projectId)
}

export const assetKindOptions: AssetKind[] = ['AI Video', 'AI Image', 'Animation', 'Motion Graphic', 'Prop']
