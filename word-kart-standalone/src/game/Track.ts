import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'

export const ROAD_HALF = 5.2
export const LANE_X = [-2.8, 0, 2.8] as const

export type TrackSample = {
  pos: THREE.Vector3
  tan: THREE.Vector3
  side: THREE.Vector3
  up: THREE.Vector3
  quat: THREE.Quaternion
}

export class Track {
  readonly curve: THREE.CatmullRomCurve3
  readonly group = new THREE.Group()
  readonly wordAnchors: { t: number; lane: number }[] = []
  /** Ground pass (sky, grass, scenery). */
  readonly groundGroup = new THREE.Group()
  /** Track pass (asphalt, rails) — drawn after clearDepth. */
  readonly roadGroup = new THREE.Group()

  constructor() {
    const pts: THREE.Vector3[] = []
    const n = 128
    // Constant height clearly above grass (y=0) — raised platform, never buried.
    const roadY = 1.15
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const r = 78 + Math.sin(a * 2) * 10 + Math.cos(a * 3.2) * 4
      pts.push(new THREE.Vector3(
        Math.cos(a) * r,
        roadY,
        Math.sin(a) * r,
      ))
    }
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.22)
    this.buildVisuals()
    for (let i = 0; i < 90; i++) {
      this.wordAnchors.push({
        t: (0.04 + i * 0.0105) % 1,
        lane: LANE_X[i % 3],
      })
    }
  }

  async initPhysics(world: RAPIER.World) {
    const segs = 220
    const verts: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const s = this.sample(t)
      const l = s.pos.clone().addScaledVector(s.side, -ROAD_HALF - 1.4)
      const r = s.pos.clone().addScaledVector(s.side, ROAD_HALF + 1.4)
      verts.push(l.x, l.y + 0.08, l.z, r.x, r.y + 0.08, r.z)
      if (i < segs) {
        const a = i * 2
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3)
      }
    }
    const v = new Float32Array(verts)
    const ind = new Uint32Array(idx)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed())
    world.createCollider(
      RAPIER.ColliderDesc.trimesh(v, ind).setFriction(0.95).setRestitution(0.05),
      body,
    )
  }

  sample(t: number): TrackSample {
    const tt = ((t % 1) + 1) % 1
    const pos = this.curve.getPointAt(tt)
    const tan = this.curve.getTangentAt(tt).normalize()
    // Keep side locked to the XZ plane so the frame never flips and
    // grass cutouts / lanes stay outside the asphalt.
    const tanFlat = new THREE.Vector3(tan.x, 0, tan.z)
    if (tanFlat.lengthSq() < 1e-6) tanFlat.set(1, 0, 0)
    else tanFlat.normalize()
    const side = new THREE.Vector3(-tanFlat.z, 0, tanFlat.x)
    const up = new THREE.Vector3(0, 1, 0)
    const quat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(side.clone().negate(), up, tanFlat),
    )
    return { pos, tan: tanFlat, side, up, quat }
  }

  place(t: number, lane: number, yLift = 0): TrackSample {
    const s = this.sample(t)
    s.pos.addScaledVector(s.side, lane)
    s.pos.y += yLift
    return s
  }

  private buildVisuals() {
    this.groundGroup.add(this.makeSky())
    this.groundGroup.add(this.makeSun())
    this.groundGroup.add(this.makeClouds())
    this.groundGroup.add(this.makeGrass())
    this.groundGroup.add(this.makeScenery())
    this.roadGroup.add(this.buildRoadRibbon())
    this.group.add(this.groundGroup)
    this.group.add(this.roadGroup)
  }

  private makeSky() {
    const c = document.createElement('canvas')
    c.width = 4
    c.height = 512
    const g = c.getContext('2d')!
    const grd = g.createLinearGradient(0, 0, 0, 512)
    grd.addColorStop(0, '#0468e8')
    grd.addColorStop(0.25, '#1a88ff')
    grd.addColorStop(0.5, '#4aabff')
    grd.addColorStop(0.72, '#9fd4ff')
    grd.addColorStop(0.88, '#fff0c8')
    grd.addColorStop(1, '#6ecf58')
    g.fillStyle = grd
    g.fillRect(0, 0, 4, 512)
    const tex = new THREE.CanvasTexture(c)
    tex.colorSpace = THREE.SRGBColorSpace
    return new THREE.Mesh(
      new THREE.SphereGeometry(420, 64, 32),
      new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, toneMapped: false }),
    )
  }

  private makeSun() {
    const g = new THREE.Group()
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(10, 32, 24),
      new THREE.MeshBasicMaterial({ color: '#fff8e8', toneMapped: false }),
    ))
    g.add(new THREE.Mesh(
      new THREE.SphereGeometry(24, 32, 24),
      new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }),
    ))
    g.position.set(60, 75, -110)
    return g
  }

  private makeClouds() {
    const g = new THREE.Group()
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, fog: false, toneMapped: false })
    for (let i = 0; i < 22; i++) {
      const cloud = new THREE.Group()
      const a = (i / 22) * Math.PI * 2
      const r = 100 + (i % 4) * 24
      for (const [x, y, z, s] of [[0, 0, 0, 5], [4, 0.4, 0.5, 3.5], [-3.8, 0.2, -0.4, 3.2], [1.5, 1.2, -1, 2.6]]) {
        const p = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 12), mat)
        p.position.set(x, y, z)
        p.scale.set(1.2, 0.55, 1)
        cloud.add(p)
      }
      cloud.position.set(Math.cos(a) * r, 26 + (i % 5) * 3, Math.sin(a) * r)
      cloud.scale.setScalar(1.2 + (i % 3) * 0.3)
      g.add(cloud)
    }
    return g
  }

  private trackTexture() {
    const c = document.createElement('canvas')
    c.width = 1024
    c.height = 1024
    const g = c.getContext('2d')!
    const L0 = 0; const L1 = 140; const Lw = 160; const Rw = 864; const R0 = 884; const R1 = 1024
    g.fillStyle = '#252830'
    g.fillRect(Lw, 0, Rw - Lw, 1024)
    for (let i = 0; i < 32000; i++) {
      const n = 16 + (Math.random() * 60) | 0
      g.fillStyle = `rgba(${n},${n},${n + 8},${0.04 + Math.random() * 0.12})`
      g.fillRect(Lw + Math.random() * (Rw - Lw), Math.random() * 1024, 1 + (Math.random() * 2) | 0, 1 + (Math.random() * 2) | 0)
    }
    g.fillStyle = '#f0ead8'
    for (let y = 0; y < 1024; y += 72) g.fillRect(504, y + 12, 16, 32)
    const bandH = 56
    for (let y = 0; y < 1024; y += bandH) {
      const red = ((y / bandH) | 0) % 2 === 0
      g.fillStyle = red ? '#d91022' : '#f7f4ee'
      g.fillRect(L0, y, L1 - L0, bandH + 1)
      g.fillRect(R0, y, R1 - R0, bandH + 1)
    }
    g.fillStyle = '#f7f7f2'
    g.fillRect(L1, 0, Lw - L1, 1024)
    g.fillRect(Rw, 0, R0 - Rw, 1024)
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.RepeatWrapping
    tex.anisotropy = 16
    tex.colorSpace = THREE.SRGBColorSpace
    return tex
  }

  private buildRibbon(segs: number, cols: number, profile: (t: number, s: TrackSample) => THREE.Vector3[], uvU: number[], uvV: number) {
    const pos: number[] = []
    const nrm: number[] = []
    const uv: number[] = []
    const idx: number[] = []
    for (let i = 0; i <= segs; i++) {
      const t = i / segs
      const s = this.sample(t)
      const pts = profile(t, s)
      for (let c = 0; c < cols; c++) {
        const p = pts[c]
        pos.push(p.x, p.y, p.z)
        nrm.push(s.up.x, s.up.y, s.up.z)
        uv.push(uvU[c], t * uvV)
      }
      if (i < segs) {
        const base = i * cols
        for (let c = 0; c < cols - 1; c++) {
          const a = base + c; const b = a + 1; const d = a + cols; const e = d + 1
          idx.push(a, d, b, b, d, e)
        }
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    geo.setIndex(idx)
    geo.computeVertexNormals()
    return geo
  }

  private buildRoadRibbon() {
    const g = new THREE.Group()
    const segs = 1200
    const hw = ROAD_HALF
    const kerbW = 1.45
    const u = [0, 0.07, 0.156, 0.844, 0.93, 1]
    // Slight lift so the ribbon sits clearly above the grass plane (y=0).
    const y = 0.18
    const geo = this.buildRibbon(segs, 6, (_t, s) => [
      s.pos.clone().addScaledVector(s.side, -(hw + kerbW)).addScaledVector(s.up, y),
      s.pos.clone().addScaledVector(s.side, -(hw + kerbW * 0.5)).addScaledVector(s.up, y),
      s.pos.clone().addScaledVector(s.side, -hw).addScaledVector(s.up, y),
      s.pos.clone().addScaledVector(s.side, hw).addScaledVector(s.up, y),
      s.pos.clone().addScaledVector(s.side, hw + kerbW * 0.5).addScaledVector(s.up, y),
      s.pos.clone().addScaledVector(s.side, hw + kerbW).addScaledVector(s.up, y),
    ], u, 14)
    const road = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
      map: this.trackTexture(),
      color: '#dcdfe6',
      roughness: 0.82,
      metalness: 0.06,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      depthWrite: true,
    }))
    road.receiveShadow = true
    road.castShadow = true
    road.renderOrder = 10
    g.add(road)

    // Vertical sides so the ribbon reads as a solid road from grazing angles.
    const thick = 0.45
    const sideMat = new THREE.MeshStandardMaterial({
      color: '#2a2e36',
      roughness: 0.9,
      side: THREE.DoubleSide,
    })
    for (const sign of [-1, 1] as const) {
      const edge = sign * (hw + kerbW)
      const sg = this.buildRibbon(segs, 2, (_t, s) => {
        const top = s.pos.clone().addScaledVector(s.side, edge).addScaledVector(s.up, y)
        const bot = s.pos.clone().addScaledVector(s.side, edge).addScaledVector(s.up, y - thick)
        return sign > 0 ? [bot, top] : [top, bot]
      }, [0, 1], 8)
      const wall = new THREE.Mesh(sg, sideMat)
      wall.renderOrder = 10
      g.add(wall)
    }

    const railMat = new THREE.MeshStandardMaterial({ color: '#c8d0dc', roughness: 0.25, metalness: 0.88 })
    const railX = hw + kerbW + 1.6
    for (const sign of [-1, 1]) {
      for (const h of [0.42, 0.78]) {
        const rg = this.buildRibbon(segs, 2, (_t, s) => {
          const a = s.pos.clone().addScaledVector(s.side, sign * (railX - 0.05)).addScaledVector(s.up, h)
          const b = s.pos.clone().addScaledVector(s.side, sign * (railX + 0.05)).addScaledVector(s.up, h)
          return sign > 0 ? [a, b] : [b, a]
        }, [0, 1], 8)
        const rail = new THREE.Mesh(rg, railMat)
        rail.castShadow = true
        rail.renderOrder = 11
        g.add(rail)
      }
    }
    return g
  }

  private makeGrass() {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 256
    const g = c.getContext('2d')!
    g.fillStyle = '#2fa855'
    g.fillRect(0, 0, 256, 256)
    for (let i = 0; i < 5000; i++) {
      g.fillStyle = Math.random() > 0.5 ? '#278f48' : '#3ec86a'
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3)
    }
    const tex = new THREE.CanvasTexture(c)
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(90, 90)
    tex.colorSpace = THREE.SRGBColorSpace

    // Full lawn. Track is drawn in a second pass after clearDepth(), so grass
    // can never cover asphalt on screen.
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(200, 128),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    )
    mesh.rotation.x = -Math.PI / 2
    mesh.position.y = 0
    mesh.receiveShadow = true
    return mesh
  }

  private makeScenery() {
    const g = new THREE.Group()
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a4f28', roughness: 0.9 })
    const leafMat = new THREE.MeshStandardMaterial({ color: '#24b85a', roughness: 0.65, side: THREE.DoubleSide })
    for (let i = 0; i < 70; i++) {
      const t = Math.random()
      const sign = Math.random() < 0.5 ? -1 : 1
      const s = this.place(t, sign * (12 + Math.random() * 10))
      const palm = new THREE.Group()
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, 4, 10), trunkMat)
      trunk.position.y = 2
      trunk.castShadow = true
      palm.add(trunk)
      for (let j = 0; j < 7; j++) {
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), leafMat)
        leaf.position.y = 3.8
        leaf.rotation.y = (j / 7) * Math.PI * 2
        leaf.rotation.z = 0.85
        leaf.translateX(1.1)
        leaf.castShadow = true
        palm.add(leaf)
      }
      palm.position.copy(s.pos)
      palm.position.y = 0
      g.add(palm)
    }
    return g
  }
}
