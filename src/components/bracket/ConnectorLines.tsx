/**
 * ConnectorLines — SVG bezier curves for bracket connections.
 */

import type { Connection } from './bracketUtils'
import type { PortPosition, PortKey } from './useBracketLayout'
import { makePortKey } from './useBracketLayout'
import type { WiringState } from './useBracketConnections'

interface ConnectorLinesProps {
  connections: Connection[]
  portPositions: Map<PortKey, PortPosition>
  wiringState: WiringState
  mousePos: PortPosition
  containerWidth: number
  containerHeight: number
}

function bezierPath(from: PortPosition, to: PortPosition): string {
  const dx = Math.abs(to.x - from.x) * 0.5
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`
}

export function ConnectorLines({
  connections,
  portPositions,
  wiringState,
  mousePos,
  containerWidth,
  containerHeight,
}: ConnectorLinesProps) {
  return (
    <svg
      className="pointer-events-none absolute inset-0"
      width={containerWidth}
      height={containerHeight}
      style={{ overflow: 'visible' }}
    >
      {/* Established connections */}
      {connections.map((conn) => {
        const fromKey = makePortKey(conn.from.nodeId, conn.from.portType)
        const toKey = makePortKey(conn.to.nodeId, conn.to.portType)
        const fromPos = portPositions.get(fromKey)
        const toPos = portPositions.get(toKey)

        if (!fromPos || !toPos) return null

        const isLoser = conn.from.portType === 'loser-out'

        return (
          <path
            key={conn.id}
            d={bezierPath(fromPos, toPos)}
            fill="none"
            stroke={isLoser ? '#f59e0b' : '#3b82f6'}
            strokeWidth={2}
            strokeOpacity={0.6}
          />
        )
      })}

      {/* Ghost line during wiring */}
      {wiringState.mode === 'wiring' && (
        <path
          d={bezierPath(wiringState.fromPosition, mousePos)}
          fill="none"
          stroke="#ffffff"
          strokeWidth={2}
          strokeOpacity={0.4}
          strokeDasharray="6 4"
        />
      )}
    </svg>
  )
}
