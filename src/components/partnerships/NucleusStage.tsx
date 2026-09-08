import { useEffect, useImperativeHandle, useRef, type Ref } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import {
  LINE_STYLE, departmentPositions, orbitPosition, personRadius,
  type NucleusStatus, type StageDepartment, type Vec3,
} from '../../lib/nucleus'

/**
 * The Contact Nucleus stage.
 *
 * The brand sits at the centre. Its departments orbit it as glass spheres, and
 * its people orbit their department. Every sphere is a shade of the brand's own
 * colour — the ladder is passed in from `shadesOf` so the stage, the rail and
 * the recommendation card all colour the same person the same way.
 *
 * Line material carries the relationship and the spheres do not: a dashed line
 * means the details are unverified or the address is dead, and weight follows
 * how far the relationship has actually got. That separation is deliberate —
 * colour here belongs to the brand, and status belongs to the connection.
 *
 * Nothing is drawn that the user did not enter. There is no department sphere
 * for a desk with nobody in it, because Director cannot read an org chart.
 */

const STATUS_DOT: Record<NucleusStatus, number> = {
  replied: 0x5f7d69,
  warm: 0xc8a86b,
  uncontacted: 0xb4b2ab,
  uncertain: 0xa9a294,
  invalid: 0xa05f57,
}

const STATUS_CSS: Record<NucleusStatus, string> = {
  replied: '#5f7d69', warm: '#C8A86B', uncontacted: '#b4b2ab', uncertain: '#a9a294', invalid: '#a05f57',
}

export interface NucleusHandle {
  /** Fly back to the opening view. */
  reset: () => void
  /** Run the send pulse from a person into the nucleus. */
  signal: (personId: string) => void
  /** Dolly in or out. Below 1 moves closer, above 1 pulls back. */
  zoom: (factor: number) => void
}

interface Props {
  brandName: string
  brandColor: string
  typeLabel: string
  departments: StageDepartment[]
  /** Contact id → hex. One shade per person, off the brand colour. */
  shades: Record<string, string>
  /** Department name → hex, from the same ladder. */
  deptShades: Record<string, string>
  selectedId: string | null
  expandedDept: string | null
  /** Ids surviving the filters, or null when no filter is applied. */
  visibleIds: string[] | null
  reduceMotion: boolean
  onPickPerson: (id: string) => void
  onPickDept: (key: string) => void
  onPickNone: () => void
  ref?: Ref<NucleusHandle>
}

const glass = (color: number, opacity: number) =>
  new THREE.MeshPhysicalMaterial({
    color, roughness: 0.13, metalness: 0.04, transparent: true, opacity,
    transmission: opacity > 0.85 ? 0.12 : 0.42, thickness: 1.4, clearcoat: 1, clearcoatRoughness: 0.16,
  })

const solid = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.06, ...o })

const hex = (css: string, fallback = 0xc8a86b) => {
  const n = Number.parseInt(css.replace('#', ''), 16)
  return Number.isNaN(n) ? fallback : n
}

/** Nudge a colour towards white or black without leaving its hue. */
const mix = (color: number, towards: number, amount: number) =>
  new THREE.Color(color).lerp(new THREE.Color(towards), amount).getHex()

interface Fly {
  fromP: THREE.Vector3; fromT: THREE.Vector3
  toP: THREE.Vector3; toT: THREE.Vector3
  t: number; dur: number
}

/**
 * The live scene, named rather than inferred. Describing this shape as
 * `typeof ref.current` from inside the ref's own initialiser is circular, and
 * the checker pays for that by the minute.
 */
interface SceneState {
  scene: THREE.Scene
  cam: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  root: THREE.Group
  deptLayer: THREE.Group
  peopleLayer: THREE.Group
  linkLayer: THREE.Group
  labelHost: HTMLDivElement
  nucleus: THREE.Group
  core: THREE.Mesh
  brandLabel: HTMLDivElement | null
  depts: DeptNode[]
  people: PersonNode[]
  ray: THREE.Raycaster
  pointer: THREE.Vector2
  home: { pos: THREE.Vector3; target: THREE.Vector3 }
  fly: Fly | null
  signal: THREE.Mesh | null
  signalRun: { from: THREE.Vector3; t: number } | null
  open: number
  hovered: string | null
  /** Shift is held, so a left-drag pans instead of orbiting. */
  panMode: boolean
  /** Last cursor written to the canvas, so the loop only touches style on change. */
  cursor: string
  reduce: boolean
  selectedId: string | null
  disposables: { dispose: () => void }[]
}

interface DeptNode {
  key: string; relevant: boolean; group: THREE.Group; link: THREE.Object3D
  el: HTMLDivElement; pos: THREE.Vector3; size: number
}
interface PersonNode {
  id: string; deptKey: string; group: THREE.Group; link: THREE.Object3D
  el: HTMLDivElement; pos: THREE.Vector3; radius: number
  halo: THREE.Mesh; phase: number
}

export function NucleusStage({
  brandName, brandColor, typeLabel, departments, shades, deptShades,
  selectedId, expandedDept, visibleIds, reduceMotion,
  onPickPerson, onPickDept, onPickNone, ref,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const api = useRef<SceneState | null>(null)
  /** Who was on stage last time, so editing a name does not fly the camera home. */
  const castRef = useRef('')

  // Handlers change every render; the scene reads them through a ref so the
  // renderer never has to be torn down just because a callback identity moved.
  const cb = useRef({ onPickPerson, onPickDept, onPickNone })
  cb.current = { onPickPerson, onPickDept, onPickNone }

  /* ------------------------------------------------------------- scene --- */
  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf7f7f5)

    const cam = new THREE.PerspectiveCamera(34, 1, 0.4, 400)
    cam.position.set(4, 20, 62)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.06
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;cursor:grab'
    host.appendChild(renderer.domElement)

    const labelHost = document.createElement('div')
    labelHost.style.cssText =
      'position:absolute;inset:0;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif'
    host.appendChild(labelHost)

    scene.add(new THREE.HemisphereLight(0xfffdf8, 0xdedad0, 1.35))
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const key = new THREE.DirectionalLight(0xfff7ea, 1.65)
    key.position.set(-16, 26, 20)
    key.castShadow = true
    key.shadow.mapSize.set(2048, 2048)
    const sc = key.shadow.camera
    sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 90
    key.shadow.bias = -0.0006
    key.shadow.normalBias = 0.03
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xe6edf2, 0.7)
    rim.position.set(20, 8, -24)
    scene.add(rim)

    const floorGeo = new THREE.CircleGeometry(160, 72)
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xf5f2ec, roughness: 0.96 })
    const floor = new THREE.Mesh(floorGeo, floorMat)
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -15.5
    floor.receiveShadow = true
    scene.add(floor)

    const root = new THREE.Group()
    scene.add(root)
    const linkLayer = new THREE.Group(); root.add(linkLayer)
    const deptLayer = new THREE.Group(); root.add(deptLayer)
    const peopleLayer = new THREE.Group(); root.add(peopleLayer)

    const nucleus = new THREE.Group()
    const core = new THREE.Mesh(new THREE.SphereGeometry(3.05, 48, 34), solid(0xc8a86b))
    nucleus.add(core)
    root.add(nucleus)

    const controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    // A wider range than the design's 22–96: people sit close in around their
    // department, and reading one cluster means getting properly near it.
    controls.minDistance = 14
    controls.maxDistance = 130
    controls.minPolarAngle = 0.5
    controls.maxPolarAngle = 2.1
    controls.rotateSpeed = 0.7
    controls.zoomSpeed = 0.7
    controls.panSpeed = 0.9
    controls.keyPanSpeed = 18
    controls.screenSpacePanning = true
    // Zoom towards whatever is under the pointer, so leaning into a cluster is
    // one gesture rather than zoom-then-pan-then-zoom.
    controls.zoomToCursor = true
    // Pan freely, but never far enough to lose the brand off-screen and have to
    // hunt for it — the nucleus is the thing every other position is read against.
    controls.maxTargetRadius = 42
    // Middle-drag pans rather than dollies: scroll already zooms, and panning is
    // the gesture with nowhere else to live.
    controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN }
    controls.target.set(0, 0, 0)

    // The stage takes focus so it can be driven from the keyboard. Bound to the
    // canvas rather than the window, so arrowing through the search field never
    // moves the camera.
    renderer.domElement.tabIndex = 0
    renderer.domElement.style.outline = 'none'
    renderer.domElement.setAttribute(
      'aria-label',
      'Contact network. Drag to rotate, shift-drag to pan, scroll to zoom. Arrow keys pan, plus and minus zoom, 0 re-centres.',
    )

    const state: SceneState = {
      scene, cam, renderer, controls, root, deptLayer, peopleLayer, linkLayer, labelHost,
      nucleus, core, brandLabel: null,
      depts: [], people: [],
      ray: new THREE.Raycaster(), pointer: new THREE.Vector2(-9, -9),
      home: { pos: cam.position.clone(), target: new THREE.Vector3(0, 0, 0) },
      fly: null, signal: null, signalRun: null,
      open: 0, hovered: null, panMode: false, cursor: 'grab', reduce: false, selectedId: null,
      disposables: [{ dispose: () => { floorGeo.dispose(); floorMat.dispose() } }],
    }
    api.current = state

    const onMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect()
      state.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const onLeave = () => state.pointer.set(-9, -9)
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => { down = [e.clientX, e.clientY] }
    const onUp = (e: PointerEvent) => {
      // A drag that ends over a sphere is a camera move, not a choice.
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      state.ray.setFromCamera(state.pointer, state.cam)
      const hp = state.ray.intersectObjects(state.peopleLayer.children, true).filter((h) => h.object.visible)[0]
      if (hp) { cb.current.onPickPerson(hp.object.userData.personId as string); return }
      const hd = state.ray.intersectObjects(state.deptLayer.children, true).filter((h) => h.object.visible)[0]
      if (hd) { cb.current.onPickDept(hd.object.userData.deptKey as string); return }
      cb.current.onPickNone()
    }
    const el = renderer.domElement
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerleave', onLeave)
    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointerup', onUp)

    // Hold shift and the left button pans instead of orbiting — the same
    // shortcut design tools use, so it costs nobody a lookup. Mutating the
    // existing map is deliberate: OrbitControls reads it fresh on pointerdown.
    const setPan = (on: boolean) => {
      if (state.panMode === on) return
      state.panMode = on
      controls.mouseButtons.LEFT = on ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
    }
    /**
     * Slide camera and focus together by a screen-space nudge, so a key press
     * moves the view by the same amount wherever the camera happens to be.
     * Hand-rolled rather than OrbitControls' listenToKeyEvents so that panning,
     * zooming and re-centring all arrive through one path — that API only pans.
     */
    const panBy = (dx: number, dy: number) => {
      const offset = new THREE.Vector3().subVectors(cam.position, controls.target)
      const reach = offset.length() * Math.tan(((cam.fov / 2) * Math.PI) / 180)
      const right = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 0)
      const up = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 1)
      const height = el.clientHeight || 1
      const move = new THREE.Vector3()
        .addScaledVector(right, (-2 * dx * reach) / height)
        .addScaledVector(up, (2 * dy * reach) / height)
      // Clamp the focus first, then move the camera by whatever the clamp
      // allowed, so the pair never drifts apart at the edge of the leash.
      const before = controls.target.clone()
      controls.target.add(move).clampLength(0, controls.maxTargetRadius)
      cam.position.add(controls.target.clone().sub(before))
      state.fly = null
    }

    const STEP = 48
    const onStageKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft': panBy(-STEP, 0); break
        case 'ArrowRight': panBy(STEP, 0); break
        case 'ArrowUp': panBy(0, -STEP); break
        case 'ArrowDown': panBy(0, STEP); break
        case '+': case '=': zoomBy(state, 0.82); break
        case '-': case '_': zoomBy(state, 1.22); break
        case '0': flyTo(state, state.home.pos, state.home.target); break
        default: return
      }
      e.preventDefault()
    }
    el.addEventListener('keydown', onStageKey)

    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Shift') setPan(true) }
    const onKeyUp = (e: KeyboardEvent) => { if (e.key === 'Shift') setPan(false) }
    // Releasing shift outside the window never fires keyup, which would strand
    // the stage in pan mode.
    const onBlur = () => setPan(false)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    const resize = () => {
      const w = host.clientWidth || 1, h = host.clientHeight || 1
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    }
    const ro = new ResizeObserver(resize)
    ro.observe(host)
    resize()

    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => tick(state, clock))

    return () => {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerleave', onLeave)
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('keydown', onStageKey)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      state.disposables.forEach((d) => d.dispose())
      disposeTree(scene)
      renderer.dispose()
      el.remove()
      labelHost.remove()
      api.current = null
    }
  }, [])

  /* ------------------------------------------------------- scene contents --- */
  useEffect(() => {
    const s = api.current
    if (!s) return

    clearLayer(s.deptLayer); clearLayer(s.peopleLayer); clearLayer(s.linkLayer)
    s.labelHost.innerHTML = ''
    s.depts = []; s.people = []

    const base = hex(brandColor)

    // The nucleus wears the brand's colour itself, never a shade of it.
    disposeTree(s.nucleus)
    s.nucleus.clear()
    const shell = new THREE.Mesh(new THREE.SphereGeometry(4.5, 64, 44), glass(mix(base, 0xffffff, 0.55), 0.9))
    shell.castShadow = true
    s.nucleus.add(shell)
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(3.05, 48, 34),
      new THREE.MeshStandardMaterial({
        color: mix(base, 0xffffff, 0.24), roughness: 0.26, metalness: 0.22,
        emissive: new THREE.Color(base), emissiveIntensity: 0.38,
      }),
    )
    core.castShadow = true
    s.nucleus.add(core)
    s.core = core
    const band = new THREE.Mesh(new THREE.TorusGeometry(4.5, 0.075, 10, 96), solid(base, { roughness: 0.3, metalness: 0.75 }))
    band.rotation.x = Math.PI / 2
    s.nucleus.add(band)
    const band2 = new THREE.Mesh(
      new THREE.TorusGeometry(4.5, 0.045, 10, 96),
      solid(base, { roughness: 0.3, metalness: 0.75, opacity: 0.6, transparent: true }),
    )
    band2.rotation.set(1.1, 0, 0.6)
    s.nucleus.add(band2)
    s.nucleus.add(new THREE.PointLight(mix(base, 0xffffff, 0.3), 1.5, 22, 2))

    s.brandLabel = label(
      s.labelHost,
      `<div style="display:flex;flex-direction:column;align-items:center;gap:3px">
         <span style="font:600 9px ui-monospace,'SF Mono',monospace;letter-spacing:1.4px;color:#8f6d33">${esc(typeLabel.toUpperCase())}</span>
         <span style="font:500 15px -apple-system,BlinkMacSystemFont,sans-serif;letter-spacing:-.2px;color:#1C1C1E">${esc(brandName)}</span>
       </div>`,
    )

    const positions = departmentPositions(departments.length)

    departments.forEach((d, i) => {
      const p = positions[i]
      const pos = new THREE.Vector3(...p)
      const tint = hex(deptShades[d.key] ?? brandColor, base)

      const g = new THREE.Group()
      g.position.copy(pos)
      const size = 1.15 + Math.min(3, d.people.length) * 0.1
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(size, 40, 28),
        glass(mix(tint, 0xffffff, d.relevant ? 0.18 : 0.46), d.relevant ? 0.8 : 0.62),
      )
      sphere.castShadow = true
      g.add(sphere)
      const inner = new THREE.Mesh(
        new THREE.SphereGeometry(size * 0.58, 28, 20),
        solid(mix(tint, 0x000000, d.relevant ? 0.24 : 0.5), {
          roughness: 0.28, metalness: d.relevant ? 0.72 : 0.35,
        }),
      )
      g.add(inner)
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(size + 0.3, d.relevant ? 0.042 : 0.028, 8, 52),
        solid(d.relevant ? 0xc8a86b : mix(tint, 0x8d949a, 0.6), {
          transparent: true, opacity: d.relevant ? 1 : 0.7, metalness: d.relevant ? 0.75 : 0.2,
        }),
      )
      ring.rotation.x = Math.PI / 2
      g.add(ring)
      g.userData = { inner, targetScale: 1, base: pos.clone() }
      g.traverse((o) => { o.userData.deptKey = d.key })
      s.deptLayer.add(g)

      // The brand-to-department line says only whether this is the right desk.
      const link = makeLink(new THREE.Vector3(0, 0, 0), pos, d.relevant ? 'warm' : 'uncontacted', d.relevant ? 0.8 : 0.3)
      link.userData.deptKey = d.key
      s.linkLayer.add(link)

      const deptEl = label(
        s.labelHost,
        `<div style="display:flex;align-items:center;gap:6px;padding:3px 9px;border-radius:99px;background:rgba(255,255,255,${d.relevant ? '.92' : '.72'});border:1px solid ${d.relevant ? 'rgba(200,168,107,.5)' : '#E5E5E7'};box-shadow:0 2px 8px rgba(60,58,50,.06);color:${d.relevant ? '#1C1C1E' : '#8e9189'};font-size:11px;font-weight:500;backdrop-filter:blur(6px)">
           <span>${esc(d.name)}</span>
           <span style="font:500 9.5px ui-monospace,'SF Mono',monospace;color:${d.relevant ? '#8f6d33' : '#a9a7a0'}">${d.people.length}</span>
         </div>`,
      )
      s.depts.push({ key: d.key, relevant: d.relevant, group: g, link, el: deptEl, pos, size })

      d.people.forEach((person, k) => {
        const ppos = new THREE.Vector3(...orbitPosition(p as Vec3, k, d.people.length, i))
        const shade = hex(shades[person.id] ?? brandColor, base)
        const pr = personRadius(person.strength)

        const pg = new THREE.Group()
        pg.position.copy(ppos)
        const body = new THREE.Mesh(new THREE.SphereGeometry(pr, 32, 22), solid(shade, { roughness: 0.26, metalness: 0.12 }))
        body.castShadow = true
        pg.add(body)
        const halo = new THREE.Mesh(
          new THREE.TorusGeometry(pr + 0.42, 0.085, 10, 48),
          solid(0xc8a86b, { roughness: 0.28, metalness: 0.8 }),
        )
        halo.rotation.x = Math.PI / 2
        halo.visible = false
        pg.add(halo)
        // A soft highlight cap so a dark shade still reads as a lit sphere.
        pg.add(new THREE.Mesh(
          new THREE.SphereGeometry(pr * 0.99, 32, 22, 0, Math.PI * 2, 0, 1.1),
          solid(0xfffdf7, { roughness: 0.16, metalness: 0.04, transparent: true, opacity: 0.3 }),
        ))
        const eq = new THREE.Mesh(new THREE.TorusGeometry(pr + 0.02, 0.022, 6, 44), solid(0x6f736f, { transparent: true, opacity: 0.75 }))
        eq.rotation.x = Math.PI / 2
        pg.add(eq)
        // Status rides on this dot and on the line — never on the sphere colour.
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), solid(STATUS_DOT[person.status], { roughness: 0.4 }))
        dot.position.set(0, pr + 0.26, 0)
        pg.add(dot)
        pg.userData = { targetScale: 1, base: ppos.clone() }
        pg.traverse((o) => { o.userData.personId = person.id; o.userData.deptKey = d.key })
        s.peopleLayer.add(pg)

        const plink = makeLink(pos, ppos, person.status, person.strength)
        plink.userData.personId = person.id
        plink.userData.deptKey = d.key
        s.linkLayer.add(plink)

        const pel = label(
          s.labelHost,
          `<div data-card style="display:flex;flex-direction:column;gap:1px;padding:5px 10px;border-radius:9px;background:rgba(255,255,255,.94);border:1px solid #E5E5E7;box-shadow:0 3px 12px rgba(60,58,50,.08);backdrop-filter:blur(6px);text-align:left">
             <span style="font-size:11.5px;font-weight:500;color:#1C1C1E">${esc(person.name)}</span>
             <span style="font-size:10px;color:#6f7370">${esc(person.title)}</span>
             <span style="display:flex;align-items:center;gap:5px;margin-top:2px;font:500 9px ui-monospace,'SF Mono',monospace;color:#8e9189">
               <i style="width:5px;height:5px;border-radius:99px;background:${STATUS_CSS[person.status]}"></i>${esc((person.channel ?? 'No route').toUpperCase())}
             </span>
           </div>`,
        )
        s.people.push({
          id: person.id, deptKey: d.key, group: pg, link: plink, el: pel,
          pos: ppos, radius: pr, halo, phase: hash(person.id) * 6,
        })
      })
    })

    applyState(s, selectedId, expandedDept, visibleIds)

    // Rebuilding the scene is cheap; yanking the camera back to the opening
    // shot is not. Only do that when the cast actually changed — typing a name
    // in the rail redraws a label, and the view should stay exactly where the
    // user left it.
    const cast = departments.flatMap((d) => d.people.map((p) => p.id)).join(',')
    if (cast !== castRef.current) {
      castRef.current = cast
      s.open = 0
      flyTo(s, s.home.pos, s.home.target)
    } else {
      s.open = 1
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [departments, shades, deptShades, brandColor, brandName, typeLabel])

  /* -------------------------------------------------------------- state --- */
  useEffect(() => {
    const s = api.current
    if (!s) return
    applyState(s, selectedId, expandedDept, visibleIds)

    if (selectedId) {
      const p = s.people.find((x) => x.id === selectedId)
      if (p) {
        const dir = p.pos.clone().normalize()
        flyTo(s, p.pos.clone().addScaledVector(dir, 11).setY(p.pos.y + 6), p.pos.clone().lerp(new THREE.Vector3(0, 0, 0), 0.28))
      }
    } else if (expandedDept) {
      const d = s.depts.find((x) => x.key === expandedDept)
      if (d) flyTo(s, d.pos.clone().multiplyScalar(1.55).setY(d.pos.y + 7), d.pos.clone())
    }
  }, [selectedId, expandedDept, visibleIds])

  useEffect(() => {
    if (api.current) api.current.reduce = reduceMotion
  }, [reduceMotion])

  useImperativeHandle(ref, () => ({
    reset: () => {
      const s = api.current
      if (s) flyTo(s, s.home.pos, s.home.target)
    },
    zoom: (factor: number) => {
      if (api.current) zoomBy(api.current, factor)
    },
    signal: (personId: string) => {
      const s = api.current
      if (!s) return
      const p = s.people.find((x) => x.id === personId)
      if (!p) return
      if (!s.signal) {
        s.signal = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 18, 12),
          new THREE.MeshStandardMaterial({ color: 0xf3ddb2, emissive: new THREE.Color(0xc8a86b), emissiveIntensity: 1.5, roughness: 0.35 }),
        )
        s.root.add(s.signal)
      }
      s.signalRun = { from: p.pos.clone(), t: 0 }
    },
  }), [])

  return <div ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
}

/* ------------------------------------------------------------- helpers --- */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

/** Stable per-id jitter, so a sphere's float phase survives a re-render. */
function hash(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 997
  return h / 997
}

function label(host: HTMLDivElement, html: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);white-space:nowrap;transition:opacity .25s'
  el.innerHTML = html
  host.appendChild(el)
  return el
}

function makeLink(from: THREE.Vector3, to: THREE.Vector3, status: NucleusStatus, strength: number): THREE.Object3D {
  const spec = LINE_STYLE[status]
  const w = spec.width * (0.75 + strength * 0.7)
  const dir = new THREE.Vector3().subVectors(to, from)
  const color = STATUS_DOT[status]

  if (spec.dash) {
    const grp = new THREE.Group()
    const len = dir.length()
    const n = Math.max(4, Math.round(len / 0.62))
    const geo = new THREE.CylinderGeometry(w, w, 0.3, 6)
    const m = solid(color, { transparent: true, opacity: spec.opacity, roughness: 0.5 })
    for (let i = 0; i < n; i += 2) {
      const seg = new THREE.Mesh(geo, m)
      seg.position.copy(from).addScaledVector(dir, (i + 0.5) / n)
      seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
      grp.add(seg)
    }
    return grp
  }

  const m = solid(color, { transparent: true, opacity: spec.opacity, roughness: 0.45, metalness: status === 'warm' ? 0.5 : 0.05 })
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(w, w, dir.length(), 8), m)
  mesh.position.copy(from).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())
  return mesh
}

function setOpacity(obj: THREE.Object3D, o: number, hide: boolean) {
  obj.traverse((m) => {
    const mesh = m as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as THREE.Material & { opacity: number; depthWrite: boolean }
    if (mesh.userData._op === undefined) mesh.userData._op = mat.opacity ?? 1
    mesh.visible = !hide
    mat.transparent = true
    mat.opacity = (mesh.userData._op as number) * o
    mat.depthWrite = o > 0.55
  })
}

function applyState(s: SceneState, selectedId: string | null, expandedDept: string | null, visibleIds: string[] | null) {
  // positionLabels needs to know the focused person: its name stays legible at
  // any zoom, while everyone else's is dropped once the camera pulls back.
  s.selectedId = selectedId
  const sel = s.people.find((x) => x.id === selectedId)
  const selDept: string | null = sel ? sel.deptKey : null

  s.depts.forEach((d) => {
    const hidden = Boolean(visibleIds && !s.people.some((p) => p.deptKey === d.key && visibleIds.includes(p.id)))
    const dim = selDept ? (d.key === selDept ? 1 : 0.22)
      : expandedDept ? (d.key === expandedDept ? 1 : 0.2)
      : d.relevant ? 1 : 0.55
    setOpacity(d.group, dim, hidden)
    setOpacity(d.link, dim * 0.9, hidden)
    d.el.style.opacity = hidden ? '0' : String(Math.max(0.15, dim))
    d.group.userData.targetScale = expandedDept === d.key || selDept === d.key ? 1.12 : 1
  })

  s.people.forEach((p) => {
    const hidden = visibleIds ? !visibleIds.includes(p.id) : false
    const focus = selectedId === p.id
    const dim = focus ? 1
      : selDept ? (p.deptKey === selDept ? 0.7 : 0.14)
      : expandedDept ? (p.deptKey === expandedDept ? 1 : 0.14)
      : 0.92
    setOpacity(p.group, dim, hidden)
    setOpacity(p.link, dim, hidden)
    p.halo.visible = focus && !hidden
    if (focus) {
      const m = p.halo.material as THREE.Material
      m.opacity = 1
      m.transparent = false
    }
    p.group.userData.targetScale = focus ? 1.5 : 1
    p.el.style.opacity = hidden || dim < 0.3 ? '0' : String(Math.min(1, dim))
    const card = p.el.querySelector('[data-card]') as HTMLElement | null
    if (card) card.style.border = focus ? '1px solid rgba(200,168,107,.75)' : '1px solid #E5E5E7'
  })

  setOpacity(s.nucleus, selDept || expandedDept ? 0.65 : 1, false)
}

/**
 * Dolly in or out. Compounds from where the camera is *heading* rather than
 * where it happens to be — read the live position and three quick taps fight
 * the glide already in progress, zooming about one step between them.
 */
function zoomBy(s: SceneState, factor: number) {
  const from = s.fly ? s.fly.toP : s.cam.position
  const focus = s.fly ? s.fly.toT : s.controls.target
  const offset = new THREE.Vector3().subVectors(from, focus)
  const distance = Math.min(
    Math.max(offset.length() * factor, s.controls.minDistance),
    s.controls.maxDistance,
  )
  // Short glide, not the long establishing move a selection gets.
  flyTo(s, focus.clone().add(offset.setLength(distance)), focus.clone(), 0.28)
}

function flyTo(s: SceneState, pos: THREE.Vector3, target: THREE.Vector3, seconds = 0.95) {
  s.fly = {
    fromP: s.cam.position.clone(), fromT: s.controls.target.clone(),
    toP: pos.clone(), toT: target.clone(), t: 0, dur: s.reduce ? 0.001 : seconds,
  }
}

function tick(s: SceneState, clock: THREE.Clock) {
  const dt = Math.min(clock.getDelta(), 0.05)
  const e = clock.elapsedTime
  if (s.open < 1) s.open = Math.min(1, s.open + dt / (s.reduce ? 0.001 : 0.85))
  const k = 1 - Math.pow(1 - s.open, 3)

  if (s.fly) {
    s.fly.t = Math.min(1, s.fly.t + dt / s.fly.dur)
    const f = 1 - Math.pow(1 - s.fly.t, 3)
    s.cam.position.lerpVectors(s.fly.fromP, s.fly.toP, f)
    s.controls.target.lerpVectors(s.fly.fromT, s.fly.toT, f)
    if (s.fly.t >= 1) s.fly = null
  }

  s.depts.forEach((d) => {
    d.group.position.copy(d.group.userData.base as THREE.Vector3).multiplyScalar(0.28 + 0.72 * k)
    const t = (d.group.userData.targetScale as number) ?? 1
    d.group.scale.lerp(new THREE.Vector3(t, t, t), 0.12)
    if (!s.reduce) (d.group.userData.inner as THREE.Mesh).rotation.y += dt * 0.25
  })

  s.people.forEach((p) => {
    const target = (p.group.userData.base as THREE.Vector3).clone().multiplyScalar(0.35 + 0.65 * k)
    if (!s.reduce) target.y += Math.sin(e * 0.6 + p.phase) * 0.16
    p.group.position.lerp(target, 0.2)
    const t = (p.group.userData.targetScale as number) ?? 1
    p.group.scale.lerp(new THREE.Vector3(t, t, t), 0.12)
    if (p.halo.visible) p.halo.rotation.z += dt * 0.6
  })

  if (!s.reduce) {
    s.nucleus.rotation.y += dt * 0.06
    const mat = s.core.material as THREE.MeshStandardMaterial
    mat.emissiveIntensity = 0.28 + Math.sin(e * 0.9) * 0.06
    // The pulse mesh is created lazily by signal(), so a run without one is not
    // a state to animate through — it is a run to drop.
    const pulse = s.signal
    if (s.signalRun && pulse) {
      s.signalRun.t += dt * 0.85
      if (s.signalRun.t >= 1) {
        s.signalRun = null
        pulse.visible = false
      } else {
        pulse.visible = true
        pulse.position.lerpVectors(s.signalRun.from, new THREE.Vector3(0, 0, 0), 1 - Math.pow(1 - s.signalRun.t, 2))
        pulse.scale.setScalar(1 + Math.sin(s.signalRun.t * Math.PI) * 0.7)
      }
    }
  }

  s.ray.setFromCamera(s.pointer, s.cam)
  const hit = s.ray
    .intersectObjects([...s.peopleLayer.children, ...s.deptLayer.children], true)
    .filter((h) => h.object.visible)[0]
  s.hovered = hit ? (hit.object.userData.personId ?? `dept:${hit.object.userData.deptKey}`) : null
  const cursor = s.panMode ? 'move' : s.hovered ? 'pointer' : 'grab'
  if (cursor !== s.cursor) {
    s.cursor = cursor
    s.renderer.domElement.style.cursor = cursor
  }

  s.controls.update()
  positionLabels(s)
  s.renderer.render(s.scene, s.cam)
}

function positionLabels(s: SceneState) {
  const host = s.renderer.domElement as HTMLCanvasElement
  const w = host.clientWidth, h = host.clientHeight
  const v = new THREE.Vector3()

  const place = (el: HTMLDivElement, obj: THREE.Object3D, lift: number) => {
    obj.getWorldPosition(v)
    v.y += lift
    v.project(s.cam)
    const x = ((v.x + 1) / 2) * w, y = ((-v.y + 1) / 2) * h
    const bw = el.offsetWidth / 2 + 6, bh = el.offsetHeight / 2 + 6
    const on = v.z < 1 && x > -bw && x < w + bw && y > -bh && y < h + bh
    el.style.visibility = on ? 'visible' : 'hidden'
    if (on) {
      el.style.left = `${Math.min(w - bw, Math.max(bw, x))}px`
      el.style.top = `${Math.min(h - bh, Math.max(bh, y))}px`
    }
  }

  if (s.brandLabel) place(s.brandLabel, s.nucleus, 0)
  const showDepts = w > 330
  s.depts.forEach((d) => {
    place(d.el, d.group, d.size + 1.5)
    if (!showDepts && !d.relevant) d.el.style.visibility = 'hidden'
  })
  // Names only once you are close enough for them not to become a wall of text.
  const dist = s.cam.position.distanceTo(s.controls.target)
  const showPeople = dist < 58 && w > 420
  s.people.forEach((p) => {
    place(p.el, p.group, p.radius + 2.4)
    if (!showPeople && s.selectedId !== p.id) p.el.style.visibility = 'hidden'
  })
}

function clearLayer(layer: THREE.Group) {
  disposeTree(layer)
  layer.clear()
}

function disposeTree(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh) return
    m.geometry?.dispose()
    const mat = m.material
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else mat?.dispose()
  })
}
