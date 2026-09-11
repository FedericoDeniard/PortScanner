import { describe, expect, test } from "bun:test"
import { createLineSplitter } from "./lines"

describe("createLineSplitter", () => {
  test("emits complete lines", () => {
    const lines: string[] = []
    const push = createLineSplitter((l) => lines.push(l))
    push('{"a":1}\n{"b":2}\n')
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  test("buffers partial lines across chunks", () => {
    const lines: string[] = []
    const push = createLineSplitter((l) => lines.push(l))
    push('{"a')
    push('":1')
    push('}\n{"b":2}')
    expect(lines).toEqual(['{"a":1}'])
    push("\n")
    expect(lines).toEqual(['{"a":1}', '{"b":2}'])
  })

  test("handles line split exactly at newline", () => {
    const lines: string[] = []
    const push = createLineSplitter((l) => lines.push(l))
    push("hello")
    push("\nworld\n")
    expect(lines).toEqual(["hello", "world"])
  })

  test("skips empty lines", () => {
    const lines: string[] = []
    const push = createLineSplitter((l) => lines.push(l))
    push("\n\n\nfoo\n\n")
    expect(lines).toEqual(["foo"])
  })

  test("handles \\r\\n", () => {
    const lines: string[] = []
    const push = createLineSplitter((l) => lines.push(l))
    push("one\r\ntwo\r\n")
    expect(lines).toEqual(["one", "two"])
  })
})
