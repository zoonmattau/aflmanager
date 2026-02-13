/**
 * Bracket layout hook.
 *
 * Measures port positions via DOM refs + ResizeObserver for SVG line rendering.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export interface PortPosition {
  x: number
  y: number
}

/**
 * Port key format: "nodeId:portType" e.g. "w0m0:winner-out"
 */
export type PortKey = string

export function makePortKey(nodeId: string, portType: string): PortKey {
  return `${nodeId}:${portType}`
}

export function useBracketLayout() {
  const containerRef = useRef<HTMLDivElement>(null)
  const portElementsRef = useRef<Map<PortKey, HTMLElement>>(new Map())
  const [portPositions, setPortPositions] = useState<Map<PortKey, PortPosition>>(
    new Map(),
  )
  const [measureVersion, setMeasureVersion] = useState(0)

  const registerPort = useCallback(
    (key: PortKey, element: HTMLElement | null) => {
      if (element) {
        portElementsRef.current.set(key, element)
      } else {
        portElementsRef.current.delete(key)
      }
    },
    [],
  )

  const measurePorts = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const containerRect = container.getBoundingClientRect()
    const newPositions = new Map<PortKey, PortPosition>()

    portElementsRef.current.forEach((element, key) => {
      const rect = element.getBoundingClientRect()
      newPositions.set(key, {
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top + rect.height / 2 - containerRect.top,
      })
    })

    setPortPositions(newPositions)
  }, [])

  // Re-measure on resize
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const observer = new ResizeObserver(() => {
      measurePorts()
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [measurePorts])

  // Re-measure when measureVersion changes (triggered by structural changes)
  useEffect(() => {
    // Use requestAnimationFrame to wait for layout to settle after DOM updates
    const raf = requestAnimationFrame(() => {
      measurePorts()
    })
    return () => cancelAnimationFrame(raf)
  }, [measureVersion, measurePorts])

  const requestMeasure = useCallback(() => {
    setMeasureVersion((v) => v + 1)
  }, [])

  return {
    containerRef,
    portPositions,
    registerPort,
    requestMeasure,
  }
}
