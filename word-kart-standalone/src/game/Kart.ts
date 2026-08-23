import * as THREE from 'three'
import RAPIER from '@dimforge/rapier3d-compat'
import { Track, ROAD_HALF } from './Track'
import { clamp, lerp } from './utils'

export class Kart {
  readonly mesh = new THREE.Group()
  readonly bodyHandle: RAPIER.RigidBody
  readonly collider: RAPIER.Collider

  t = 0.02
  lane = 0
  speed = 0
  maxSpeed = 16
  steer = 0
  steerInput = 0
  yaw = 0
  roll = 0

  private readonly tmp = {
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
  }

  constructor(world: RAPIER.World, track: Track) {
    this.buildMesh()
    const s = track.place(this.t, this.lane, 0.2)
    this.bodyHandle = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(s.pos.x, s.pos.y + 0.5, s.pos.z)
        .setLinearDamping(0.15)
        .setAngularDamping(2.5)
        .lockRotations(),
    )
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.75, 0.35, 1.15)
        .setFriction(0.8)
        .setRestitution(0.05)
        .setDensity(2.2),
      this.bodyHandle,
    )
    this.syncFromTrack(track, 0)
  }

  private buildMesh() {
    const bodyMat = new THREE.MeshStandardMaterial({
      color: '#ff6a1a',
      roughness: 0.35,
      metalness: 0.25,
      emissive: '#ff4500',
      emissiveIntensity: 0.08,
    })
    const dark = new THREE.MeshStandardMaterial({ color: '#1a2238', roughness: 0.4, metalness: 0.4 })
    const chrome = new THREE.MeshStandardMaterial({ color: '#e8eef8', roughness: 0.2, metalness: 0.85 })

    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.42, 2.35), bodyMat)
    hull.position.y = 0.5
    hull.castShadow = true
    this.mesh.add(hull)

    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.9), bodyMat)
    nose.position.set(0, 0.46, -1.25)
    nose.castShadow = true
    this.mesh.add(nose)

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.1, 0.45), bodyMat)
    wing.position.set(0, 1.0, 1.05)
    wing.castShadow = true
    this.mesh.add(wing)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.38, 0.85), dark)
    cabin.position.set(0, 0.82, 0.05)
    cabin.castShadow = true
    this.mesh.add(cabin)

    const pip = new THREE.Group()
    const suit = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.35, 6, 10), new THREE.MeshStandardMaterial({ color: '#7dff4d', roughness: 0.5 }))
    suit.position.y = 1.05
    pip.add(suit)
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.12, 12), new THREE.MeshStandardMaterial({ color: '#5a3820', roughness: 0.8 }))
    hat.position.y = 1.35
    pip.add(hat)
    pip.castShadow = true
    this.mesh.add(pip)

    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 20)
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#121218', roughness: 0.7, metalness: 0.2 })
    const positions: [number, number, number][] = [[-0.72, 0.36, -0.75], [0.72, 0.36, -0.75], [-0.72, 0.36, 0.85], [0.72, 0.36, 0.85]]
    this.mesh.userData.wheels = positions.map(([x, y, z]) => {
      const w = new THREE.Mesh(wheelGeo, wheelMat)
      w.rotation.z = Math.PI / 2
      w.position.set(x, y, z)
      w.castShadow = true
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.32, 12), chrome)
      hub.rotation.z = Math.PI / 2
      w.add(hub)
      this.mesh.add(w)
      return w
    })
  }

  syncFromTrack(track: Track, dt: number) {
    const targetSpeed = this.maxSpeed * (1 + (this.steerInput !== 0 ? 0.05 : 0))
    this.speed = lerp(this.speed, targetSpeed, 1 - Math.pow(0.06, dt * 60))

    const grip = 9.5
    this.lane += this.steerInput * dt * grip
    this.lane = clamp(this.lane, -ROAD_HALF + 1.1, ROAD_HALF - 1.1)

    // ~one lap every ~9–10s at top speed (kid-friendly pace)
    const advance = (this.speed / 145) * dt
    this.t = (this.t + advance) % 1

    const next = track.place(this.t, this.lane, 0.15)
    const pos = next.pos
    this.yaw = Math.atan2(next.tan.x, next.tan.z)
    this.roll = lerp(this.roll, -this.steerInput * 0.28, 0.12)
    this.steer = lerp(this.steer, this.steerInput, 0.14)

    this.mesh.position.copy(pos)
    this.mesh.rotation.set(0, this.yaw, this.roll)

    const lin = next.tan.clone().multiplyScalar(this.speed * 0.12)
    lin.y = 0
    this.bodyHandle.setLinvel({ x: lin.x, y: 0, z: lin.z }, true)
    this.bodyHandle.setTranslation({ x: pos.x, y: pos.y + 0.35, z: pos.z }, true)

    const spin = this.speed * 0.08
    for (const w of this.mesh.userData.wheels as THREE.Mesh[]) {
      w.rotation.x += spin * dt
    }
  }

  speedNorm() {
    return clamp(this.speed / this.maxSpeed, 0, 1)
  }

  getPosition(out = this.tmp.pos) {
    return out.copy(this.mesh.position)
  }
}
