export function createLineSplitter(onLine: (line: string) => void) {
  let buffer = ""
  return (chunk: string) => {
    buffer += chunk
    let idx: number
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (line.length > 0) onLine(line)
    }
  }
}
