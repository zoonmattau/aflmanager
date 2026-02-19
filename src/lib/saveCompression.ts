/**
 * Save-file compression using the native browser CompressionStream / DecompressionStream API.
 *
 * Compressed saves are stored as ArrayBuffer in IndexedDB.
 * Legacy saves are plain objects stored via structured clone — both formats
 * are handled transparently through isCompressed() + decompressState().
 *
 * Typical reduction for AFL Manager saves: 70–80% smaller than raw JSON.
 */

const COMPRESSION_FORMAT = 'gzip' as const

/**
 * Serialise `data` to JSON then gzip-compress it.
 * Returns an ArrayBuffer suitable for direct storage in IndexedDB via idb-keyval.
 */
export async function compressState(data: Record<string, unknown>): Promise<ArrayBuffer> {
  const json = JSON.stringify(data)
  const encoded = new TextEncoder().encode(json)

  const cs = new CompressionStream(COMPRESSION_FORMAT)
  const writer = cs.writable.getWriter()
  writer.write(encoded)
  writer.close()

  return new Response(cs.readable).arrayBuffer()
}

/**
 * Decompress an ArrayBuffer produced by compressState() and parse the JSON.
 */
export async function decompressState(buf: ArrayBuffer): Promise<Record<string, unknown>> {
  const ds = new DecompressionStream(COMPRESSION_FORMAT)
  const writer = ds.writable.getWriter()
  writer.write(buf)
  writer.close()

  const text = await new Response(ds.readable).text()
  return JSON.parse(text) as Record<string, unknown>
}

/**
 * Returns true when the raw IDB value is a compressed save (ArrayBuffer).
 * Returns false for legacy plain-object saves.
 */
export function isCompressed(value: unknown): value is ArrayBuffer {
  return value instanceof ArrayBuffer
}
