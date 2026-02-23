import { useCallback } from 'react'
import { useBlocker, type Location } from 'react-router-dom'

/**
 * Intercepts route navigation while `isDirty` is true, blocking the transition
 * until the user explicitly confirms or cancels.
 *
 * Usage:
 *   const guard = useNavigationGuard(isDirty)
 *   // Render <NavigationGuardDialog {...guard} /> somewhere in the component tree
 */
export function useNavigationGuard(isDirty: boolean) {
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: Location; nextLocation: Location }) =>
        isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty],
    ),
  )

  return {
    isBlocked: blocker.state === 'blocked',
    proceed: () => { if (blocker.state === 'blocked') blocker.proceed() },
    reset:   () => { if (blocker.state === 'blocked') blocker.reset() },
  }
}
