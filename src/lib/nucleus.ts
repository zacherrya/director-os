/**
 * Where the spheres sit.
 *
 * The Contact Nucleus draws a brand as a nucleus with its people orbiting it.
 * The geometry carries one piece of meaning and no more: distance from the
 * centre is *relevance to this deal*, so the desks that actually handle this
 * kind of partnership sit on the inner ring and everyone else sits further out.
 * Nothing else about a sphere's position means anything — it is not seniority,
 * not how well you know them, and not a guess at the org chart, because Director
 * cannot read a company's org chart.
 *
 * Pure maths, no React and no colour: the page owns the palette, this owns the
 * arithmetic, and both can be reasoned about on their own.
 */

import type { DepartmentGroup } from './contacts'

export interface PlacedContact {
  contactId: string
  department: string
  /** Centre of the sphere, in the viewBox's own units. */
  x: number
  y: number
  radius: number
  /** 0 is the inner ring — the right desk for this deal. */
  ring: number
}

export interface PlacedDepartment {
  department: string
  ring: number
  relevant: boolean
  /** Where the ring's label sits, on the ring itself. */
  x: number
  y: number
  /** Mid-angle in degrees, so a label can be pushed outward from the centre. */
  angle: number
}

export interface NucleusGeometry {
  size: number
  centre: number
  nucleusRadius: number
  /** Radius of each ring that is actually in use, inner first. */
  ringRadii: number[]
  departments: PlacedDepartment[]
  contacts: PlacedContact[]
}

/** Straight up, then clockwise — the way people read a dial. */
const START = -90

function polar(centre: number, radius: number, degrees: number): [number, number] {
  const rad = (degrees * Math.PI) / 180
  return [centre + radius * Math.cos(rad), centre + radius * Math.sin(rad)]
}

/**
 * Lays out one brand's people around the nucleus.
 *
 * Groups arriving here are already sorted by `groupByDepartment`, relevant
 * first. Relevant desks take the inner ring; everything else takes the outer
 * one. When nothing is relevant there is no honest inner/outer distinction to
 * draw, so every group sits on a single ring rather than being pushed to the
 * edge for no reason.
 */
export function nucleusLayout(groups: DepartmentGroup[], size = 480): NucleusGeometry {
  const centre = size / 2
  const nucleusRadius = Math.round(size * 0.082)

  const relevant = groups.filter((g) => g.relevant)
  const rest = groups.filter((g) => !g.relevant)
  // With nothing relevant, one ring is the truthful drawing: no desk here is
  // any closer to this deal than another.
  const rings: DepartmentGroup[][] = relevant.length === 0 ? [rest] : [relevant, rest]
  const usedRings = rings.filter((r) => r.length > 0)

  const RING_RADIUS = [0.27, 0.405]
  const ringRadii = usedRings.map((_, i) => size * (RING_RADIUS[i] ?? RING_RADIUS[RING_RADIUS.length - 1]))

  const total = groups.reduce((n, g) => n + g.contacts.length, 0)
  // Spheres shrink as the network grows so a busy brand does not become a
  // solid ring of overlapping circles.
  const radius = Math.max(size * 0.026, Math.min(size * 0.048, (size * 0.5) / Math.max(6, total)))

  const departments: PlacedDepartment[] = []
  const contacts: PlacedContact[] = []

  usedRings.forEach((ringGroups, ring) => {
    const ringRadius = ringRadii[ring]
    const wedge = 360 / ringGroups.length

    ringGroups.forEach((group, i) => {
      const mid = START + wedge * (i + 0.5)
      const [lx, ly] = polar(centre, ringRadius, mid)
      departments.push({
        department: String(group.department),
        ring,
        relevant: group.relevant,
        x: lx,
        y: ly,
        angle: mid,
      })

      const n = group.contacts.length
      // Leave a gap between neighbouring desks so the clusters stay legible.
      const span = wedge * 0.74
      group.contacts.forEach((c, j) => {
        const angle = n === 1 ? mid : mid - span / 2 + (span * j) / (n - 1)
        const [x, y] = polar(centre, ringRadius, angle)
        contacts.push({ contactId: c.id, department: String(group.department), x, y, radius, ring })
      })
    })
  })

  return { size, centre, nucleusRadius, ringRadii, departments, contacts }
}
