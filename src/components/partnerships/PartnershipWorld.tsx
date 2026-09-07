import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { DESTINATIONS } from '../../lib/partnerships'

/**
 * A single elegant diorama: one winding route from the Brand Radar to the
 * Relationship Garden, with each brand token standing at the destination its
 * current stage puts it at. The imperative three.js world is scoped to this
 * component so the rest of the app never touches WebGL.
 */

export interface WorldBrand {
  id: string
  dest: number
  health: 'Moving well' | 'Needs attention' | 'Stalled' | 'Waiting'
  priority?: 'High' | 'Normal' | 'Low'
}

interface WorldProps {
  brands: WorldBrand[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onResetRef?: (fn: () => void) => void
}

const IVORY = 0xf2efe7
const STONE = 0xdbd4c4
const DEEP = 0xcdc5b1
const GRAPHITE = 0x2a2a2d
const GOLD = 0xc8a86b
const GREEN = 0x789681
const AMBER = 0xb99a5c
const RED = 0xb6746b
const GREY = 0xa9a7a0

const healthHex: Record<WorldBrand['health'], number> = {
  'Moving well': GREEN,
  'Needs attention': AMBER,
  Stalled: RED,
  Waiting: GREY,
}

function mat(color: number, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0.02, ...extra })
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0, ry = 0) {
  const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  s.position.set(x, y, z)
  s.rotation.y = ry
  s.castShadow = true
  s.receiveShadow = true
  return s
}
function cyl(r1: number, r2: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24) {
  const s = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m)
  s.position.set(x, y, z)
  s.castShadow = true
  s.receiveShadow = true
  return s
}
function sph(r: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), m)
  s.position.set(x, y, z)
  s.castShadow = true
  return s
}

function buildIsland() {
  const outline: [number, number][] = [
    [-56, 6], [-48, -6], [-36, -12], [-22, -10], [-8, -14], [6, -11], [18, -15], [28, -24],
    [38, -27], [48, -18], [60, -14], [70, -2], [70, 10], [62, 20], [48, 17], [34, 21],
    [20, 18], [6, 22], [-8, 19], [-24, 22], [-40, 19], [-52, 15],
  ]
  const curve = new THREE.CatmullRomCurve3(outline.map(([x, z]) => new THREE.Vector3(x, -z, 0)), true, 'catmullrom', 0.45)
  const pts = curve.getPoints(220)
  const shape = new THREE.Shape()
  shape.moveTo(pts[0].x, pts[0].y)
  pts.slice(1).forEach((p) => shape.lineTo(p.x, p.y))
  const lagoon: [number, number][] = [[20, 0], [23, 5.5], [29, 5.5], [32, 0], [29, -5.5], [23, -5.5]]
  const lc = new THREE.CatmullRomCurve3(lagoon.map(([x, y]) => new THREE.Vector3(x, y, 0)), true, 'catmullrom', 0.5).getPoints(80)
  const hole = new THREE.Path()
  hole.moveTo(lc[0].x, lc[0].y)
  lc.slice(1).forEach((p) => hole.lineTo(p.x, p.y))
  shape.holes.push(hole)
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.6, bevelEnabled: true, bevelSize: 0.5, bevelThickness: 0.45, bevelSegments: 3, curveSegments: 8 })
  geo.rotateX(-Math.PI / 2)
  geo.computeBoundingBox()
  geo.translate(0, -(geo.boundingBox?.max.y ?? 0), 0)
  geo.computeVertexNormals()
  const island = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.88, metalness: 0 }))
  island.receiveShadow = true
  island.castShadow = true
  const shelfGeo = geo.clone()
  const shelf = new THREE.Mesh(shelfGeo, mat(0xe6e0d1, { roughness: 0.95 }))
  shelf.scale.set(1.035, 0.5, 1.06)
  shelf.position.y = -0.9
  shelf.receiveShadow = true
  const grp = new THREE.Group()
  grp.add(shelf)
  grp.add(island)
  return grp
}

function pathRibbon(points: [number, number][], m: THREE.MeshStandardMaterial, w = 3.4) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'catmullrom', 0.4)
  const g = new THREE.Group()
  const len = curve.getLength()
  const n = Math.max(6, Math.round(len / 2.35))
  const altColor = m.color.clone().offsetHSL(0, 0, 0.035)
  const alt = new THREE.MeshStandardMaterial({ color: altColor, roughness: 0.95 })
  const geo = new THREE.BoxGeometry(1.75, 0.18, w)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const p = curve.getPointAt(t)
    const tan = curve.getTangentAt(t)
    const s = new THREE.Mesh(geo, i % 2 ? alt : m)
    s.position.set(p.x, 0.09, p.z)
    s.rotation.y = Math.atan2(-tan.z, tan.x)
    s.receiveShadow = true
    g.add(s)
  }
  return g
}

function buildDestination(key: string, group: THREE.Group, M: Record<string, THREE.Material>) {
  const glowGold = new THREE.MeshStandardMaterial({ color: 0xf3ddb2, emissive: 0xc8a86b, emissiveIntensity: 1.3, roughness: 0.4 })
  const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.1, depthWrite: false })
  const plinth = (w: number, d: number, mm: THREE.Material = M.stone) => box(w, 0.5, d, mm, 0, 0.25, 0)
  const round = (r: number, mm: THREE.Material = M.stone) => cyl(r, r + 0.15, 0.5, mm, 0, 0.25, 0, 40)

  switch (key) {
    case 'radar': {
      group.add(round(4.6))
      group.add(cyl(0.55, 0.75, 5.2, M.ivory, 0, 3.1, 0))
      group.add(cyl(1.5, 1.5, 0.25, M.stone, 0, 5.8, 0))
      const spin = new THREE.Group()
      spin.position.set(0, 6.4, 0)
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(1.7, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2.7),
        new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.75, side: THREE.DoubleSide }),
      )
      dish.rotation.z = 0.55
      dish.castShadow = true
      spin.add(dish)
      spin.add(cyl(0.08, 0.08, 1.5, M.gold, 0.55, 0.5, 0))
      group.add(spin)
      group.userData.spin = spin
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.TorusGeometry(2.1 + i * 0.9, 0.035, 6, 44), M.gold)
        r.rotation.x = Math.PI / 2
        r.position.y = 0.62 + i * 0.02
        group.add(r)
      }
      group.add(box(1.4, 1, 1.2, M.ivory, 3, 1, 1.6, 0.3))
      break
    }
    case 'research': {
      group.add(plinth(9, 7))
      group.add(box(5.4, 2.6, 4.2, M.ivory, -0.4, 1.8, 0))
      group.add(box(5.8, 0.3, 4.6, M.stone, -0.4, 3.25, 0))
      group.add(box(3.4, 1.6, 2.6, M.ivory, 2.9, 1.3, 0.7, 0.24))
      for (let i = 0; i < 3; i++) group.add(box(0.9, 0.9, 0.06, M.graphite, -2.1 + i * 1.7, 2, 2.13))
      group.add(box(2.4, 1.3, 0.08, M.stone, -0.4, 4.1, -1.4))
      for (let i = 0; i < 3; i++) group.add(box(0.5, 0.4, 0.03, M.gold, -1.2 + i * 0.8, 4.1, -1.33))
      group.add(box(1.6, 0.12, 0.9, M.wood, -2.6, 0.62, 2.6, 0.2))
      group.add(box(1.6, 0.12, 0.9, M.wood, -0.6, 0.62, 3, -0.15))
      group.add(sph(0.35, M.stone, 1.7, 0.75, 2.7))
      group.add(cyl(0.28, 0.28, 0.7, M.wood, 2.6, 0.9, 2.9))
      break
    }
    case 'idea': {
      group.add(round(4.4))
      group.add(box(4.4, 3.6, 4.4, M.glass, 0, 2.3, 0))
      group.add(box(4.7, 0.25, 4.7, M.ivory, 0, 4.2, 0))
      for (const [x, z] of [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]]) group.add(cyl(0.09, 0.09, 3.6, M.gold, x, 2.3, z, 8))
      const bulb = sph(0.85, glowGold, 0, 2.4, 0)
      group.add(bulb)
      const light = new THREE.PointLight(0xd8b478, 3.4, 16, 2)
      light.position.set(0, 2.4, 0)
      group.add(light)
      group.userData.bulb = bulb
      group.userData.bulbLight = light
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4
        group.add(box(1.5, 1.1, 0.07, M.stone, Math.cos(a) * 5.4, 1.15, Math.sin(a) * 5.4, -a))
      }
      group.add(box(0.9, 0.35, 0.6, M.graphite, 2.6, 0.68, 3.4, 0.4))
      group.add(cyl(0.18, 0.18, 0.4, M.gold, 3.1, 0.68, 3.6, 12))
      break
    }
    case 'pitch': {
      group.add(plinth(9, 6.6))
      group.add(box(5.4, 1.15, 2.6, M.ivory, -0.5, 1.07, 0))
      group.add(box(5.8, 0.14, 3, M.wood, -0.5, 1.72, 0))
      for (let i = 0; i < 4; i++) group.add(box(1.5, 0.09, 1.05, M.stone, -2.2 + i * 0.28, 1.83 + i * 0.09, 0.5 - i * 0.12, 0.05 * i))
      group.add(box(1.1, 1.5, 0.07, M.stone, 1.6, 2.55, -0.4, -0.2))
      group.add(box(1.1, 1.5, 0.07, M.gold, 1.6, 2.55, -0.55, -0.2))
      group.add(box(1.3, 1.8, 0.09, M.ivory, -3.5, 2.6, -1.5, 0.25))
      for (let i = 0; i < 4; i++) group.add(box(0.22, 0.22, 0.05, i < 3 ? M.gold : M.deep, -3.9, 3.25 - i * 0.42, -1.42, 0.25))
      group.add(box(1.5, 0.05, 0.9, M.stone, 3.2, 1.8, 1.1, -0.3))
      break
    }
    case 'outreach': {
      group.add(plinth(11, 8))
      const channels: Record<string, THREE.Group> = {}
      const mk = (name: string, x: number, build: (c: THREE.Group) => void) => {
        const c = new THREE.Group()
        c.position.set(x, 0.5, 0)
        build(c)
        group.add(c)
        channels[name] = c
      }
      mk('Email', -3.4, (c) => {
        c.add(cyl(1.5, 1.7, 0.4, M.stone, 0, 0.2, 0, 28))
        c.add(box(2.1, 1.3, 0.28, M.ivory, 0, 1.3, 0))
        const flap = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.85, 4), M.gold)
        flap.position.set(0, 1.62, 0.02)
        flap.rotation.set(Math.PI, Math.PI / 4, 0)
        flap.castShadow = true
        c.add(flap)
        c.add(cyl(0.12, 0.12, 2.2, M.stone, 0, 1.1, -0.5, 10))
      })
      mk('Instagram', 0, (c) => {
        c.add(cyl(1.6, 1.8, 0.4, M.stone, 0, 0.2, 0, 28))
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, 12, 40), M.gold)
        ring.position.y = 2.1
        ring.castShadow = true
        c.add(ring)
        const inner = new THREE.Mesh(
          new THREE.CircleGeometry(1.1, 32),
          new THREE.MeshStandardMaterial({ color: 0xeae5da, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
        )
        inner.position.y = 2.1
        c.add(inner)
        c.add(cyl(0.14, 0.2, 1.7, M.ivory, 0, 1, 0, 14))
      })
      mk('LinkedIn', 3.4, (c) => {
        c.add(cyl(1.4, 1.6, 0.4, M.stone, 0, 0.2, 0, 28))
        c.add(cyl(0.42, 0.55, 3.4, M.ivory, 0, 1.9, 0, 18))
        for (let i = 0; i < 3; i++) {
          const r = new THREE.Mesh(new THREE.TorusGeometry(0.62 + i * 0.06, 0.05, 8, 26), M.gold)
          r.rotation.x = Math.PI / 2
          r.position.y = 1.2 + i * 0.75
          c.add(r)
        }
        c.add(cyl(0.1, 0.1, 0.9, M.gold, 0, 4, 0, 8))
      })
      group.userData.channels = channels
      group.add(box(3.2, 0.9, 1.6, M.ivory, 0, 0.95, 3.1))
      group.add(box(2.6, 0.06, 1.1, M.graphite, 0, 1.42, 3.1))
      break
    }
    case 'control': {
      group.add(round(5.2))
      group.add(cyl(3.3, 3.5, 1.9, M.ivory, 0, 1.45, 0, 40))
      group.add(cyl(3.6, 3.6, 0.22, M.stone, 0, 2.5, 0, 40))
      const ring = new THREE.Group()
      ring.position.y = 2.75
      group.add(ring)
      const lights: THREE.Mesh[] = []
      const seq = [GREEN, GOLD, GREY, RED, GREEN, GOLD, GREY, GREEN]
      seq.forEach((c, i) => {
        const a = (i / seq.length) * Math.PI * 2
        const l = sph(0.19, new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.5 }), Math.cos(a) * 3.05, 0, Math.sin(a) * 3.05)
        ring.add(l)
        lights.push(l)
      })
      group.userData.lights = lights
      group.add(cyl(0.14, 0.14, 2.2, M.stone, 0, 3.7, 0, 10))
      group.add(sph(0.24, glowGold, 0, 4.9, 0))
      for (let i = 0; i < 4; i++) group.add(box(1.1, 0.75, 0.06, M.graphite, -2.4 + i * 1.6, 1.6, 3.42, 0))
      break
    }
    case 'response': {
      group.add(round(4.2))
      group.add(box(2.8, 1.5, 2.2, M.ivory, -1.6, 1.25, 0.6))
      group.add(cyl(0.4, 0.5, 2.4, M.ivory, 1.6, 1.7, -0.4, 18))
      const dish = new THREE.Mesh(
        new THREE.SphereGeometry(1.6, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2.6),
        new THREE.MeshStandardMaterial({ color: IVORY, roughness: 0.7, side: THREE.DoubleSide }),
      )
      dish.position.set(1.6, 3.3, -0.4)
      dish.rotation.set(-0.7, 0, 0.35)
      dish.castShadow = true
      group.add(dish)
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.5, 12, 16, 1, true), beamMat)
      beam.position.set(1.6, 9, -0.4)
      group.add(beam)
      group.userData.beam = beam
      group.add(box(1.9, 0.05, 1.2, M.graphite, -1.6, 2.03, 0.6))
      break
    }
    case 'bridge': {
      const deck: THREE.Mesh[] = []
      group.add(box(4.4, 1.6, 5, M.stone, -7.6, 0.4, 0))
      group.add(box(4.4, 1.6, 5, M.stone, 7.6, 0.4, 0))
      group.add(box(1.3, 4.6, 1.3, M.ivory, -4.6, -0.6, 0))
      group.add(box(1.3, 4.6, 1.3, M.ivory, 4.6, -0.6, 0))
      const seg = 9
      const missing = [5, 6]
      for (let i = 0; i < seg; i++) {
        const x = -4.4 + i * (8.8 / (seg - 1))
        if (missing.includes(i)) {
          const gap = new THREE.Mesh(
            new THREE.BoxGeometry(0.92, 0.3, 3.2),
            new THREE.MeshBasicMaterial({ color: GOLD, wireframe: true, transparent: true, opacity: 0.5 }),
          )
          gap.position.set(x, 1.55, 0)
          group.add(gap)
          deck.push(gap)
        } else {
          const d = box(0.92, 0.3, 3.2, M.ivory, x, 1.55, 0)
          group.add(d)
          deck.push(d)
        }
      }
      for (const z of [-1.75, 1.75])
        for (let i = 0; i < seg; i += 2) {
          const x = -4.4 + i * (8.8 / (seg - 1))
          group.add(cyl(0.06, 0.06, 0.9, M.gold, x, 2.1, z, 8))
        }
      for (const z of [-1.75, 1.75]) group.add(box(6.2, 0.08, 0.08, M.gold, -1.9, 2.52, z))
      group.add(cyl(0.5, 0.6, 1.2, M.ivory, -7.6, 1.8, -1.4, 16))
      group.add(box(1.6, 1.2, 1.6, M.ivory, 7.6, 1.8, 1.3, 0.4))
      group.userData.deck = deck
      break
    }
    case 'gate': {
      group.add(plinth(10, 7, M.ivory))
      group.add(box(1.3, 4.4, 1.3, M.ivory, -3, 2.2, 0))
      group.add(box(1.3, 4.4, 1.3, M.ivory, 3, 2.2, 0))
      const arch = new THREE.Mesh(new THREE.TorusGeometry(3, 0.34, 14, 40, Math.PI), M.gold)
      arch.position.y = 4.3
      arch.castShadow = true
      group.add(arch)
      group.add(box(7.2, 0.12, 2.6, M.gold, 0, 0.56, 0))
      for (let i = 0; i < 4; i++) {
        const x = -3.4 + i * 2.2
        group.add(cyl(0.07, 0.07, 1.5, M.stone, x, 1.25, -3.4, 8))
        group.add(box(1.5, 0.42, 0.06, i === 0 ? M.stone : M.deep, x, 1.95, -3.4, -0.5))
      }
      break
    }
    case 'studio': {
      group.add(plinth(11, 8))
      group.add(box(6.4, 3, 5.2, M.ivory, -0.6, 2, 0))
      for (let i = 0; i < 3; i++) {
        const s = box(1.7, 1.1, 5.2, M.glass, -2.6 + i * 2, 3.9, 0)
        s.rotation.z = -0.5
        group.add(s)
        group.add(box(0.1, 1.2, 5.3, M.stone, -3.35 + i * 2, 3.95, 0))
      }
      group.add(box(4.6, 0.06, 2.6, M.graphite, -0.6, 1.9, 2.63))
      group.add(box(1.6, 0.9, 0.08, M.graphite, 3.6, 1.4, -1.2, -0.3))
      group.add(box(1.4, 0.75, 0.02, glowGold, 3.6, 1.4, -1.14, -0.3))
      for (const dx of [-0.35, 0.3, 0]) group.add(cyl(0.05, 0.05, 1.6, M.stone, 3.4 + dx, 1.3, 2.4 + (dx === 0 ? 0.4 : 0), 8))
      group.add(box(0.9, 0.55, 0.6, M.graphite, 3.4, 2.3, 2.5, 0.3))
      group.add(cyl(0.22, 0.26, 0.5, M.gold, 3.4, 2.3, 2.9, 14))
      group.add(box(2, 0.12, 1.3, M.wood, -4.6, 1.1, 2.4, 0.2))
      group.add(box(1.6, 0.9, 0.06, M.stone, -5.4, 1.6, -2.6, 0.4))
      break
    }
    case 'harbour': {
      group.add(plinth(11, 7.4, M.ivory))
      group.add(box(3.4, 0.3, 7, M.wood, 4.4, 0.62, 0))
      for (let i = 0; i < 4; i++) group.add(cyl(0.18, 0.18, 2.4, M.wood, 5.6, -0.4, -2.6 + i * 1.7, 8))
      group.add(cyl(1.9, 1.9, 2.4, M.gold, -3.4, 1.7, -0.4, 30))
      const door = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.13, 10, 26), M.ivory)
      door.position.set(-3.4, 1.7, 1.5)
      group.add(door)
      for (let i = 0; i < 3; i++) group.add(box(1.2, 1.2, 1.2, M.stone, 0.4 + (i % 2) * 1.4, 1.1 + Math.floor(i / 2) * 1.2, 1.8 - (i % 2) * 1.3, 0.15 * i))
      group.add(cyl(0.22, 0.22, 4.6, M.ivory, 1.4, 2.8, -2.6, 12))
      group.add(box(4.6, 0.2, 0.3, M.ivory, 3.2, 5, -2.6))
      group.add(cyl(0.03, 0.03, 1.6, M.stone, 5.2, 4.1, -2.6, 6))
      group.add(box(0.7, 0.7, 0.7, M.stone, 5.2, 3.1, -2.6))
      group.add(cyl(0.07, 0.07, 2, M.stone, -5.4, 1.5, 2.2, 8))
      const flag = box(1.3, 0.5, 0.05, mat(RED), -4.8, 2.3, 2.2)
      group.add(flag)
      group.userData.flag = flag
      break
    }
    case 'garden': {
      group.add(cyl(5.4, 5.6, 0.5, M.stone, 0, 0.25, 0, 44))
      group.add(cyl(3.8, 3.9, 0.5, M.green, 0, 0.72, 0, 40))
      group.add(cyl(2.3, 2.35, 0.5, M.greenDark, 0, 1.2, 0, 36))
      const trees = new THREE.Group()
      group.add(trees)
      group.userData.trees = trees
      const treeSpec: [number, number, number][] = [[-3.9, 1.6, 1], [3.6, -2.2, 1.15], [1.4, 4.2, 0.9], [-2.2, -3.9, 1.05], [4.6, 2.4, 0.8]]
      treeSpec.forEach(([x, z, s]) => {
        const t = new THREE.Group()
        t.position.set(x, 0.5, z)
        t.scale.setScalar(s)
        t.add(cyl(0.16, 0.2, 1.2, M.wood, 0, 0.6, 0, 10))
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.2, 16), M.greenDark)
        c.position.y = 2.2
        c.castShadow = true
        t.add(c)
        trees.add(t)
      })
      const pav = new THREE.Group()
      pav.position.set(0, 1.45, 0)
      group.add(pav)
      for (const [x, z] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) pav.add(cyl(0.09, 0.09, 2.2, M.ivory, x, 1.1, z, 10))
      pav.add(box(3.8, 0.16, 3.8, M.ivory, 0, 2.25, 0))
      pav.add(box(0.9, 0.12, 0.9, M.gold, 0, 2.4, 0))
      break
    }
    case 'archive': {
      group.add(cyl(5, 5.2, 0.34, M.deep, 0, -0.05, 0, 40))
      group.add(cyl(3.4, 3.4, 0.08, mat(0xdcd7cb, { roughness: 0.95 }), 0, 0.16, 0, 36))
      const boxes: [number, number][] = [[-2, -1], [-0.7, 1.2], [0.8, -1.3], [2.1, 0.9]]
      boxes.forEach(([x, z], i) => {
        group.add(box(0.55, 1.3 + i * 0.15, 0.28, mat(0xcfc9bb, { roughness: 0.95 }), x, 0.8 + i * 0.075, z, 0.3 * i))
      })
      group.add(box(2.2, 0.06, 1, mat(0xc9c3b4), 0, 0.2, 3, 0.1))
      break
    }
  }
}

export function PartnershipWorld({ brands, selectedId, onSelect, onResetRef }: WorldProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const brandsRef = useRef(brands)
  const selectedRef = useRef(selectedId)
  const applyBrandsRef = useRef<(list: WorldBrand[]) => void>(() => {})
  const applySelectionRef = useRef<(id: string | null) => void>(() => {})
  const resetRef = useRef<() => void>(() => {})

  brandsRef.current = brands
  selectedRef.current = selectedId

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf7f7f5)
    scene.fog = new THREE.Fog(0xf7f7f5, 150, 300)

    const cam = new THREE.PerspectiveCamera(31, 1, 0.5, 600)
    cam.position.set(67, 68, 83)

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.08
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%'
    host.appendChild(renderer.domElement)

    const labels = document.createElement('div')
    labels.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:500 11px -apple-system,BlinkMacSystemFont,"SF Pro Text",sans-serif'
    host.appendChild(labels)

    scene.add(new THREE.HemisphereLight(0xfdfbf6, 0xd8d4c6, 1.5))
    scene.add(new THREE.AmbientLight(0xffffff, 0.32))
    const sun = new THREE.DirectionalLight(0xfff6e6, 2.1)
    sun.position.set(-46, 74, 52)
    sun.castShadow = true
    sun.shadow.mapSize.set(2048, 2048)
    const s = sun.shadow.camera
    s.left = -95
    s.right = 95
    s.top = 80
    s.bottom = -80
    s.near = 1
    s.far = 260
    sun.shadow.bias = -0.0006
    sun.shadow.normalBias = 0.04
    scene.add(sun)
    const fill = new THREE.DirectionalLight(0xe8eef2, 0.55)
    fill.position.set(60, 30, -60)
    scene.add(fill)

    const M: Record<string, THREE.Material> = {
      ivory: mat(IVORY),
      stone: mat(STONE),
      deep: mat(DEEP, { roughness: 0.9 }),
      gold: mat(GOLD, { roughness: 0.34, metalness: 0.72 }),
      graphite: mat(GRAPHITE, { roughness: 0.5 }),
      green: mat(0x8ea88f, { roughness: 0.9 }),
      greenDark: mat(0x76907c, { roughness: 0.9 }),
      wood: mat(0xc9b493, { roughness: 0.85 }),
      sand: mat(0xdccfb2, { roughness: 0.95 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xeef2f1, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.26, transmission: 0.5 }),
      water: mat(0xc2d4d3, { roughness: 0.12, metalness: 0.34 }),
    }

    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), M.water)
    water.rotation.x = -Math.PI / 2
    water.position.y = -1.05
    water.receiveShadow = true
    scene.add(water)

    scene.add(buildIsland())

    const a: [number, number][] = DESTINATIONS.slice(0, 7).map((d) => [d.x, d.z])
    a.push([22.6, 4.9])
    const bpath: [number, number][] = [[29.4, -4.9], ...DESTINATIONS.slice(8, 12).map((d) => [d.x, d.z] as [number, number])]
    scene.add(pathRibbon(a, M.sand as THREE.MeshStandardMaterial))
    scene.add(pathRibbon(bpath, M.sand as THREE.MeshStandardMaterial))
    scene.add(pathRibbon([[33, -12], [33.2, -18], [33, -24]], M.deep as THREE.MeshStandardMaterial, 2.2))

    const groups: Record<string, THREE.Group> = {}
    const labelEls: Record<number, HTMLDivElement> = {}
    DESTINATIONS.forEach((d, i) => {
      const g = new THREE.Group()
      g.position.set(d.x, 0, d.z)
      if (d.key === 'bridge') g.rotation.y = Math.atan2(22, 15)
      buildDestination(d.key, g, M)
      g.userData.destIndex = i
      g.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.isMesh) mesh.userData.destIndex = i
      })
      scene.add(g)
      groups[d.key] = g
      const el = document.createElement('div')
      el.style.cssText =
        'position:absolute;transform:translate(-50%,-100%);white-space:nowrap;display:flex;align-items:center;gap:6px;padding:4px 9px 4px 5px;border-radius:99px;background:rgba(255,255,255,.86);border:1px solid #e5e5e7;box-shadow:0 2px 8px rgba(60,58,50,.07);color:#3a3a3c;backdrop-filter:blur(6px);transition:opacity .2s'
      el.innerHTML = `<span style="font:600 9px ui-monospace,'SF Mono',monospace;width:16px;height:16px;border-radius:99px;background:#f2efe7;display:grid;place-items:center;color:#8e8878">${String(i + 1).padStart(2, '0')}</span><span data-name>${d.name}</span><span data-count style="font:500 10px ui-monospace,'SF Mono',monospace;color:#a09a8b"></span>`
      labels.appendChild(el)
      labelEls[i] = el
    })

    const tokenLayer = new THREE.Group()
    scene.add(tokenLayer)

    const controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.minPolarAngle = 0.35
    controls.maxPolarAngle = 1.18
    controls.minDistance = 26
    controls.maxDistance = 190
    controls.rotateSpeed = 0.5
    controls.panSpeed = 0.7
    controls.zoomSpeed = 0.75
    controls.screenSpacePanning = false
    controls.target.set(9, 0, -1)
    const home = { pos: cam.position.clone(), target: controls.target.clone() }

    let fly: { fromP: THREE.Vector3; fromT: THREE.Vector3; toP: THREE.Vector3; toT: THREE.Vector3; t: number; dur: number } | null = null
    let currentTokens: THREE.Group[] = []
    let hovered: string | null = null

    const flyTo = (d: (typeof DESTINATIONS)[number], zoom = 1) => {
      const target = new THREE.Vector3(d.x, 1.5, d.z)
      const off = new THREE.Vector3(-10, 15, 20).multiplyScalar(zoom + 0.9)
      fly = { fromP: cam.position.clone(), fromT: controls.target.clone(), toP: target.clone().add(off), toT: target, t: 0, dur: 1.0 }
    }

    const applySelection = (id: string | null) => {
      currentTokens.forEach((t) => {
        const on = t.userData.brandId === id
        const beam = t.userData.beam as THREE.Mesh
        if (beam) beam.visible = on
        const chip = t.userData.chip as THREE.Mesh
        if (chip) chip.material = on ? (M.gold as THREE.Material) : (M.ivory as THREE.Material)
        t.scale.setScalar(on ? 1.22 : 1)
      })
    }
    applySelectionRef.current = applySelection

    const beamMat = new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.1, depthWrite: false })

    const applyBrands = (list: WorldBrand[]) => {
      while (tokenLayer.children.length) tokenLayer.remove(tokenLayer.children[0])
      currentTokens = []
      const byDest: Record<number, WorldBrand[]> = {}
      list.forEach((b) => {
        (byDest[b.dest] = byDest[b.dest] || []).push(b)
      })
      Object.entries(byDest).forEach(([di, arr]) => {
        const d = DESTINATIONS[+di]
        arr.forEach((b, k) => {
          const spread = (k - (arr.length - 1) / 2) * 2.6
          const g = new THREE.Group()
          g.position.set(d.x + spread, 0.5, d.z + 7.2 + (+di % 2 ? 0.6 : 0))
          const c = healthHex[b.health]
          g.add(cyl(0.14, 0.14, 1.5, M.stone, 0, 0.75, 0, 10))
          g.add(cyl(1.5, 1.62, 0.22, M.deep, 0, 0.11, 0, 26))
          const chip = cyl(1.25, 1.25, 0.5, M.ivory, 0, 1.75, 0, 26)
          g.add(chip)
          const ring = new THREE.Mesh(
            new THREE.TorusGeometry(1.26, 0.12, 8, 32),
            new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, roughness: 0.5 }),
          )
          ring.rotation.x = Math.PI / 2
          ring.position.y = 2.02
          g.add(ring)
          const face = new THREE.Mesh(new THREE.CircleGeometry(1.06, 26), mat(0xf9f7f1, { roughness: 0.55 }))
          face.rotation.x = -Math.PI / 2
          face.position.y = 2.02
          g.add(face)
          if (b.priority === 'High') g.add(cyl(0.1, 0.1, 0.9, new THREE.MeshStandardMaterial({ color: 0xf3ddb2, emissive: 0xc8a86b, emissiveIntensity: 1.3, roughness: 0.4 }), 0, 2.5, 0, 8))
          const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.25, 8, 16, 1, true), beamMat)
          beam.position.y = 5.6
          beam.visible = false
          g.add(beam)
          g.userData = { brandId: b.id, dest: +di, beam, ring, chip, base: g.position.y, phase: Math.random() * 6 }
          g.traverse((o) => {
            const mesh = o as THREE.Mesh
            if (mesh.isMesh) mesh.userData.brandId = b.id
          })
          tokenLayer.add(g)
          currentTokens.push(g)
        })
      })
      DESTINATIONS.forEach((_, i) => {
        const el = labelEls[i]
        const n = (byDest[i] || []).length
        const cnt = el.querySelector('[data-count]') as HTMLElement | null
        if (cnt) cnt.textContent = n ? String(n) : ''
      })
      applySelection(selectedRef.current)
    }
    applyBrandsRef.current = applyBrands

    resetRef.current = () => {
      fly = { fromP: cam.position.clone(), fromT: controls.target.clone(), toP: home.pos.clone(), toT: home.target.clone(), t: 0, dur: 1.0 }
    }
    if (onResetRef) onResetRef(resetRef.current)

    // pointer + click
    const ray = new THREE.Raycaster()
    const pointer = new THREE.Vector2(-9, -9)
    const rect = () => host.getBoundingClientRect()
    const onMove = (e: PointerEvent) => {
      const r = rect()
      pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    }
    const onLeave = () => pointer.set(-9, -9)
    let down: [number, number] | null = null
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY]
    }
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return
      ray.setFromCamera(pointer, cam)
      const hitT = ray.intersectObjects(tokenLayer.children, true)[0]
      if (hitT) {
        const id = (hitT.object.userData as { brandId?: string }).brandId
        if (id) {
          onSelect(id)
          const b = brandsRef.current.find((x) => x.id === id)
          if (b) flyTo(DESTINATIONS[b.dest], 0.86)
        }
        return
      }
      const hitD = ray.intersectObjects(
        DESTINATIONS.map((d) => groups[d.key]).filter(Boolean),
        true,
      )[0]
      if (hitD && (hitD.object.userData as { destIndex?: number }).destIndex != null) {
        const i = (hitD.object.userData as { destIndex: number }).destIndex
        flyTo(DESTINATIONS[i], 1)
        return
      }
      onSelect(null)
    }
    renderer.domElement.addEventListener('pointermove', onMove)
    renderer.domElement.addEventListener('pointerleave', onLeave)
    renderer.domElement.addEventListener('pointerdown', onDown)
    renderer.domElement.addEventListener('pointerup', onUp)

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth || 1
      const h = host.clientHeight || 1
      cam.aspect = w / h
      cam.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    })
    ro.observe(host)

    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    let reduce = mq.matches
    const onReduce = () => {
      reduce = mq.matches
    }
    mq.addEventListener('change', onReduce)

    const clock = new THREE.Clock()
    renderer.setAnimationLoop(() => {
      const dt = Math.min(clock.getDelta(), 0.05)
      const e = clock.elapsedTime

      if (fly) {
        fly.t = Math.min(1, fly.t + dt / fly.dur)
        const k = 1 - Math.pow(1 - fly.t, 3)
        cam.position.lerpVectors(fly.fromP, fly.toP, k)
        controls.target.lerpVectors(fly.fromT, fly.toT, k)
        if (fly.t >= 1) fly = null
      }

      if (!reduce) {
        const radar = groups.radar?.userData.spin as THREE.Group | undefined
        if (radar) radar.rotation.y += dt * 0.28
        const ideaData = groups.idea?.userData as { bulb?: THREE.Mesh; bulbLight?: THREE.PointLight }
        if (ideaData?.bulbLight && ideaData.bulb) {
          const p = 0.86 + Math.sin(e * 1.15) * 0.14
          ideaData.bulbLight.intensity = 3.2 * p
          ideaData.bulb.scale.setScalar(0.97 + p * 0.04)
        }
        const lights = (groups.control?.userData.lights || []) as THREE.Mesh[]
        lights.forEach((l, i) => {
          l.scale.setScalar(1 + Math.sin(e * 1.4 + i) * 0.12)
        })
        const beam = groups.response?.userData.beam as THREE.Mesh | undefined
        if (beam) (beam.material as THREE.MeshBasicMaterial).opacity = 0.06 + Math.abs(Math.sin(e * 0.8)) * 0.09
        currentTokens.forEach((t) => {
          t.position.y = (t.userData.base as number) + Math.sin(e * 0.9 + (t.userData.phase as number)) * 0.09
        })
      }

      ray.setFromCamera(pointer, cam)
      const h = ray.intersectObjects(tokenLayer.children, true)[0]
      const id = h ? ((h.object.userData as { brandId?: string }).brandId ?? null) : null
      if (id !== hovered) {
        hovered = id
        renderer.domElement.style.cursor = id ? 'pointer' : 'grab'
      }

      // labels
      const w = host.clientWidth
      const hh = host.clientHeight
      const v = new THREE.Vector3()
      const dist = cam.position.distanceTo(controls.target)
      const show = dist < 260
      const far = dist > 132
      DESTINATIONS.forEach((d, i) => {
        const el = labelEls[i]
        if (!el) return
        const lift = (d.key === 'garden' ? 5.4 : d.key === 'bridge' ? 4.2 : 7.4) + (i % 2 ? 5.2 : 0)
        v.set(d.x, lift, d.z).project(cam)
        const on = show && v.z < 1
        el.style.display = on ? 'flex' : 'none'
        const nm = el.querySelector('[data-name]') as HTMLElement | null
        if (nm) nm.style.display = far ? 'none' : ''
        el.style.padding = far ? '4px 5px' : '4px 9px 4px 5px'
        if (on) {
          el.style.left = ((v.x + 1) / 2) * w + 'px'
          el.style.top = ((-v.y + 1) / 2) * hh + 'px'
        }
      })

      controls.update()
      renderer.render(scene, cam)
    })

    // First paint
    applyBrands(brandsRef.current)
    applySelection(selectedRef.current)

    return () => {
      renderer.setAnimationLoop(null)
      ro.disconnect()
      mq.removeEventListener('change', onReduce)
      renderer.domElement.removeEventListener('pointermove', onMove)
      renderer.domElement.removeEventListener('pointerleave', onLeave)
      renderer.domElement.removeEventListener('pointerdown', onDown)
      renderer.domElement.removeEventListener('pointerup', onUp)
      renderer.dispose()
      host.removeChild(renderer.domElement)
      host.removeChild(labels)
    }
  }, [onSelect, onResetRef])

  useEffect(() => {
    applyBrandsRef.current(brands)
  }, [brands])

  useEffect(() => {
    applySelectionRef.current(selectedId)
  }, [selectedId])

  return <div ref={hostRef} className="absolute inset-0 overflow-hidden" />
}
