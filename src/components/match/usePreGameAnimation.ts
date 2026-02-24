import { useState, useEffect, useRef, useCallback } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnimPhase = 'banner' | 'warmup' | 'anthem' | 'huddle' | 'break' | 'done'

export interface BannerAnchor {
  /** Centre of the banner strip (% of field) */
  left: number
  top: number
  /** 'user' or 'opp' — renderer maps to club colours */
  side: 'user' | 'opp'
}

export interface PreGameAnimState {
  phase: AnimPhase
  /** Override target positions: slotKey -> { top, left } */
  targetOverrides: Map<string, { top: number; left: number }> | null
  /** Label to show on field overlay */
  phaseLabel: string | null
  /** Progress 0-1 within current phase */
  progress: number
  /** Banner positions to render during the banner phase (null when not applicable) */
  bannerAnchors: BannerAnchor[] | null
}

interface UsePreGameAnimationOpts {
  active: boolean
  isImportant: boolean
  /** 18 slot names for user team (e.g. Object.keys(userSlotLineup)) */
  userSlots: string[]
  /** 18 slot names for opponent team */
  opponentSlots: string[]
  onComplete: () => void
}

// ---------------------------------------------------------------------------
// Phase timing (ms)
// ---------------------------------------------------------------------------

const PHASE_DURATION: Record<AnimPhase, number> = {
  banner: 2000,
  warmup: 3000,
  anthem: 3000,
  huddle: 2000,
  break: 2000,
  done: 0,
}

const PHASE_LABELS: Record<AnimPhase, string | null> = {
  banner: 'RUNNING THROUGH THE BANNER',
  warmup: 'WARM UP',
  anthem: 'NATIONAL ANTHEM',
  huddle: 'TEAM HUDDLE',
  break: null,
  done: null,
}

// ---------------------------------------------------------------------------
// Field geometry (landscape orientation)
//
// left: 0% = far-left defending end, 100% = far-right attacking end
// top:  0% = top boundary, 100% = bottom boundary
//
// 50m arc / boundary intersections (approx):
//   User forward 50:  left ~87%, top ~5%  (right side, top boundary)
//   Opponent fwd 50:  left ~13%, top ~5%  (left side, top boundary)
// ---------------------------------------------------------------------------

// Banner anchor positions — where the 50m arc meets the top boundary
const USER_BANNER = { left: 87, top: 5 }
const OPP_BANNER = { left: 13, top: 5 }

// ---------------------------------------------------------------------------
// Position generators
// ---------------------------------------------------------------------------

/** Banner: each team starts in a tight cluster at their own 50m / boundary
 *  intersection point (top edge), as if bursting through a paper banner.
 *  User at right-side 50, opponent at left-side 50. */
function bannerPositions(userSlots: string[], opponentSlots: string[]): Map<string, { top: number; left: number }> {
  const map = new Map<string, { top: number; left: number }>()
  // User team: cluster at the forward 50 / top boundary intersection
  userSlots.forEach((slot, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    map.set(`user-${slot}`, {
      left: USER_BANNER.left - 3 + col * 3,
      top: USER_BANNER.top + row * 4,
    })
  })
  // Opponent team: cluster at the back-50 / top boundary intersection (their fwd 50)
  opponentSlots.forEach((slot, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    map.set(`opp-${slot}`, {
      left: OPP_BANNER.left - 3 + col * 3,
      top: OPP_BANNER.top + row * 4,
    })
  })
  return map
}

/** Warm-up: each team spreads into the 50 they just ran into.
 *  User in forward 50 (right), opponent in their forward 50 (left). */
function warmupPositions(userSlots: string[], opponentSlots: string[]): Map<string, { top: number; left: number }> {
  const map = new Map<string, { top: number; left: number }>()
  userSlots.forEach((slot, i) => {
    const angle = (i / userSlots.length) * Math.PI * 2 + i * 0.7
    const radius = 7 + (i % 3) * 4
    map.set(`user-${slot}`, {
      left: 82 + Math.cos(angle) * radius,
      top: 50 + Math.sin(angle) * (radius * 1.4),
    })
  })
  opponentSlots.forEach((slot, i) => {
    const angle = (i / opponentSlots.length) * Math.PI * 2 + i * 0.7
    const radius = 7 + (i % 3) * 4
    map.set(`opp-${slot}`, {
      left: 18 + Math.cos(angle) * radius,
      top: 50 + Math.sin(angle) * (radius * 1.4),
    })
  })
  return map
}

/** Anthem: two parallel columns on the wing */
function anthemPositions(userSlots: string[], opponentSlots: string[]): Map<string, { top: number; left: number }> {
  const map = new Map<string, { top: number; left: number }>()
  const count = Math.max(userSlots.length, opponentSlots.length)
  const spacing = Math.min(4.5, 70 / count)
  const startTop = 50 - ((count - 1) * spacing) / 2

  userSlots.forEach((slot, i) => {
    map.set(`user-${slot}`, { left: 53, top: startTop + i * spacing })
  })
  opponentSlots.forEach((slot, i) => {
    map.set(`opp-${slot}`, { left: 47, top: startTop + i * spacing })
  })
  return map
}

/** Huddle: each team forms a tight circle in their own goal square area,
 *  well separated from each other. User huddles near the forward 50 goal
 *  square (right side, ~left: 90%), opponent near theirs (left side, ~left: 10%). */
function huddlePositions(userSlots: string[], opponentSlots: string[]): Map<string, { top: number; left: number }> {
  const map = new Map<string, { top: number; left: number }>()
  const radius = 5
  // User huddle in their forward goal square area (right side)
  userSlots.forEach((slot, i) => {
    const angle = (i / userSlots.length) * Math.PI * 2
    map.set(`user-${slot}`, {
      left: 88 + Math.cos(angle) * radius,
      top: 50 + Math.sin(angle) * radius,
    })
  })
  // Opponent huddle in their forward goal square area (left side)
  opponentSlots.forEach((slot, i) => {
    const angle = (i / opponentSlots.length) * Math.PI * 2
    map.set(`opp-${slot}`, {
      left: 12 + Math.cos(angle) * radius,
      top: 50 + Math.sin(angle) * radius,
    })
  })
  return map
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePreGameAnimation({
  active,
  isImportant,
  userSlots,
  opponentSlots,
  onComplete,
}: UsePreGameAnimationOpts): PreGameAnimState {
  const [phase, setPhase] = useState<AnimPhase>('banner')
  const [progress, setProgress] = useState(0)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const startedRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const progressRafRef = useRef<number>(0)

  const advancePhase = useCallback((current: AnimPhase) => {
    const seq = isImportant
      ? ['banner', 'warmup', 'anthem', 'huddle', 'break', 'done'] as AnimPhase[]
      : ['banner', 'warmup', 'huddle', 'break', 'done'] as AnimPhase[]
    const idx = seq.indexOf(current)
    const next = idx >= 0 && idx < seq.length - 1 ? seq[idx + 1] : 'done'
    return next
  }, [isImportant])

  // Start / advance phase timers
  useEffect(() => {
    if (!active) {
      startedRef.current = false
      return
    }

    if (!startedRef.current) {
      startedRef.current = true
      setPhase('banner')
      setProgress(0)
    }
  }, [active])

  // Timer for current phase
  useEffect(() => {
    if (!active || phase === 'done') return

    const duration = PHASE_DURATION[phase]
    const startTime = performance.now()

    // Progress animation
    function updateProgress() {
      const elapsed = performance.now() - startTime
      setProgress(Math.min(elapsed / duration, 1))
      if (elapsed < duration) {
        progressRafRef.current = requestAnimationFrame(updateProgress)
      }
    }
    progressRafRef.current = requestAnimationFrame(updateProgress)

    timerRef.current = setTimeout(() => {
      const next = advancePhase(phase)
      if (next === 'done') {
        setPhase('done')
        setProgress(1)
        onCompleteRef.current()
      } else {
        setPhase(next)
        setProgress(0)
      }
    }, duration)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      cancelAnimationFrame(progressRafRef.current)
    }
  }, [active, phase, advancePhase])

  // Compute target overrides for current phase
  let targetOverrides: Map<string, { top: number; left: number }> | null = null
  if (active && phase !== 'done' && phase !== 'break') {
    switch (phase) {
      case 'banner':
        targetOverrides = bannerPositions(userSlots, opponentSlots)
        break
      case 'warmup':
        targetOverrides = warmupPositions(userSlots, opponentSlots)
        break
      case 'anthem':
        targetOverrides = anthemPositions(userSlots, opponentSlots)
        break
      case 'huddle':
        targetOverrides = huddlePositions(userSlots, opponentSlots)
        break
    }
  }

  // Banner anchors — only during the banner phase
  const bannerAnchors: BannerAnchor[] | null = (active && phase === 'banner')
    ? [
        { left: USER_BANNER.left, top: USER_BANNER.top, side: 'user' },
        { left: OPP_BANNER.left, top: OPP_BANNER.top, side: 'opp' },
      ]
    : null

  return {
    phase: active ? phase : 'done',
    targetOverrides,
    phaseLabel: active ? PHASE_LABELS[phase] : null,
    progress,
    bannerAnchors,
  }
}

/** Skip helper — call to immediately jump to done */
export function getPhaseSequence(isImportant: boolean): AnimPhase[] {
  return isImportant
    ? ['banner', 'warmup', 'anthem', 'huddle', 'break', 'done']
    : ['banner', 'warmup', 'huddle', 'break', 'done']
}
