import { useEffect, useRef } from "react"
import { NativeImage, type ImageRenderable } from "@opentui/core"
import { useTimeline } from "@opentui/react"

const FRAME_W = 16
const FRAME_H = 22
const FRAMES = 8
const FRAME_MS = 200
const CYCLE_MS = FRAME_MS * FRAMES

const PALETTE: Record<string, readonly [number, number, number, number]> = {
  ".": [0, 0, 0, 0],
  "1": [0x51, 0x57, 0x6c, 0xff],
  "2": [0xb5, 0xbf, 0xe2, 0xff],
  "3": [0xf2, 0xb9, 0xe5, 0xff],
  "5": [0xa6, 0xd2, 0x8a, 0xff],
  "7": [0x82, 0xc8, 0xbe, 0xff],
  "8": [0xe6, 0xc8, 0x90, 0xff],
}

const FRAME_A: readonly string[] = [
  "..1..........1..",
  "..11........11..",
  "..131......131..",
  "..131111111131..",
  "..111111111111..",
  ".11111111111111.",
  ".11155111155111.",
  ".11155111155111.",
  ".11111111111111.",
  ".11111133111111.",
  ".11111222211111.",
  "..177778877771..",
  "..111111111111..",
  "..111222222111.2",
  ".111122222211112",
  ".111122222211111",
  ".111222222221111",
  ".111222222221111",
  ".111222222221111",
  ".111111111111111",
  ".111122112211111",
  "..1111111111111.",
]

const FRAME_B: readonly string[] = [
  ...FRAME_A.slice(0, 12),
  "..111111111111.2",
  "..11122222211112",
  ".111122222211111",
  ...FRAME_A.slice(15),
]

const FRAME_C: readonly string[] = [
  ...FRAME_A.slice(0, 6),
  ".11111111111111.",
  ".11122111122111.",
  ...FRAME_A.slice(8),
]

const FRAMES_DATA: readonly (readonly string[])[] = [
  FRAME_A,
  FRAME_A,
  FRAME_A,
  FRAME_B,
  FRAME_A,
  FRAME_A,
  FRAME_C,
  FRAME_A,
]

function buildSheet(): Uint8Array {
  const w = FRAME_W * FRAMES
  const h = FRAME_H
  const buf = new Uint8Array(w * h * 4)
  for (let f = 0; f < FRAMES; f++) {
    const frame = FRAMES_DATA[f]!
    for (let y = 0; y < FRAME_H; y++) {
      const row = frame[y]!
      for (let x = 0; x < FRAME_W; x++) {
        const ch = row.charAt(x)
        const color = PALETTE[ch]
        if (!color) continue
        const [r, g, b, a] = color
        const dst = ((f * FRAME_W + x) + y * w) * 4
        buf[dst] = r
        buf[dst + 1] = g
        buf[dst + 2] = b
        buf[dst + 3] = a
      }
    }
  }
  return buf
}

export function PixelCat() {
  const imgRef = useRef<ImageRenderable | null>(null)
  const framesRef = useRef<NativeImage[]>([])
  const cursorRef = useRef(0)

  useEffect(() => {
    let cancelled = false
    const sheet = NativeImage.fromRgba(buildSheet(), FRAME_W * FRAMES, FRAME_H)
    const frames: NativeImage[] = []
    for (let i = 0; i < FRAMES; i++) {
      frames.push(
        sheet.extract({
          left: i * FRAME_W,
          top: 0,
          width: FRAME_W,
          height: FRAME_H,
        }),
      )
    }
    if (cancelled) {
      sheet.dispose()
      for (const f of frames) f.dispose()
      return
    }
    framesRef.current = frames
    const img = imgRef.current
    if (img) img.source = frames[0]!
    return () => {
      cancelled = true
      sheet.dispose()
      for (const f of framesRef.current) f.dispose()
      framesRef.current = []
    }
  }, [])

  const timeline = useTimeline({
    duration: CYCLE_MS,
    loop: true,
    autoplay: true,
  })
  useEffect(() => {
    timeline.add(
      { t: 0 },
      {
        t: CYCLE_MS,
        duration: CYCLE_MS,
        ease: "linear",
        onUpdate: (anim) => {
          const t = anim.targets[0]!.t as number
          const idx = Math.floor((t / CYCLE_MS) * FRAMES) % FRAMES
          if (idx === cursorRef.current) return
          cursorRef.current = idx
          const img = imgRef.current
          const frames = framesRef.current
          if (img && frames[idx]) img.source = frames[idx]!
        },
      },
    )
  }, [timeline])

  return <image ref={imgRef} width={7} height={5} fit="fill" protocol="auto" />
}
