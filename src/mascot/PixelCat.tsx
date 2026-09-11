import { useEffect, useState } from "react"
import { colors } from "../theme"

const FRAME_MS = 200

const CHAR_COLOR: Record<string, string | undefined> = {
  "1": colors.base,
  "2": colors.lavender,
  "3": colors.pink,
  "5": colors.green,
}

const FRAME_A: readonly string[] = [
  "..1..........1..",
  "..11........11..",
  "..131......131..",
  "..111111111111..",
  ".11111111111111.",
  ".11155111155111.",
  ".11111111111111.",
  "..111113311111..",
  "....11111111....",
  "...1111111111...",
  "..111111111111..",
  "..111111111111..",
  ".11111111111111.",
  ".11111111111111.",
  ".111111111111111",
  "..11111..11111.1",
  "..11111..111.112",
]

const FRAME_B: readonly string[] = [
  ...FRAME_A.slice(0, 15),
  "..11111..11111.2",
  "..11111..111.111",
]

const FRAME_C: readonly string[] = [
  ...FRAME_A.slice(0, 5),
  ".11122111122111.",
  ...FRAME_A.slice(6),
]

const FRAMES_DATA: readonly (readonly string[])[] = [
  FRAME_A,
  FRAME_A,
  FRAME_B,
  FRAME_A,
  FRAME_A,
  FRAME_A,
  FRAME_C,
  FRAME_A,
]

type Span = { text: string; fg?: string; bg?: string }

function buildLines(rows: readonly string[]): Span[][] {
  const lines: Span[][] = []
  for (let y = 0; y < rows.length; y += 2) {
    const top = rows[y]!
    const bottom = rows[y + 1]
    const spans: Span[] = []
    for (let x = 0; x < top.length; x++) {
      const fg = CHAR_COLOR[top[x]!]
      const bg = bottom ? CHAR_COLOR[bottom[x]!] : undefined
      const span: Span = fg
        ? { text: "▀", fg, ...(bg ? { bg } : {}) }
        : bg
          ? { text: "▄", fg: bg }
          : { text: " " }
      const prev = spans[spans.length - 1]
      if (prev && prev.text === span.text && prev.fg === span.fg && prev.bg === span.bg) {
        prev.text += span.text
      } else {
        spans.push(span)
      }
    }
    lines.push(spans)
  }
  return lines
}

const FRAMES = FRAMES_DATA.map(buildLines)

export function PixelCat() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setFrame((f) => (f + 1) % FRAMES.length), FRAME_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <box style={{ flexDirection: "column" }}>
      {FRAMES[frame]!.map((line, i) => (
        <text key={i}>
          {line.map((span, j) => (
            <span key={j} fg={span.fg} bg={span.bg}>
              {span.text}
            </span>
          ))}
        </text>
      ))}
    </box>
  )
}
