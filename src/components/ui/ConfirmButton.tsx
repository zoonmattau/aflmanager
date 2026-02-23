import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type ButtonProps = React.ComponentProps<typeof Button>
interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  onConfirm: () => void
  /** Label shown on the first click. Defaults to the button's children. */
  confirmLabel?: string
  /** How long (ms) the confirming state stays active before reverting. Default 3000. */
  timeout?: number
}

/**
 * A button that requires two clicks within a timeout window to trigger a
 * destructive action. On the first click it turns red and changes its label;
 * a second click within `timeout` ms executes `onConfirm`. If the timeout
 * expires it silently reverts to the original appearance.
 */
export function ConfirmButton({
  onConfirm,
  confirmLabel = 'Click again to confirm',
  timeout = 3000,
  children,
  className,
  disabled,
  variant,
  size,
  ...props
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function clear() {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation()
    if (confirming) {
      clear()
      setConfirming(false)
      onConfirm()
    } else {
      setConfirming(true)
      timerRef.current = setTimeout(() => setConfirming(false), timeout)
    }
  }

  // Clear timer on unmount
  useEffect(() => clear, [])

  return (
    <Button
      {...props}
      size={size}
      variant={confirming ? 'destructive' : variant}
      className={cn(confirming && 'ring-1 ring-destructive/60', className)}
      onClick={handleClick}
      disabled={disabled}
    >
      {confirming ? confirmLabel : children}
    </Button>
  )
}
