import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface NavigationGuardDialogProps {
  isBlocked: boolean
  title?: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  proceed: () => void
  reset: () => void
}

export function NavigationGuardDialog({
  isBlocked,
  title = 'Unsaved Changes',
  description = 'You have unsaved changes that will be lost if you leave this page.',
  confirmLabel = 'Leave anyway',
  cancelLabel = 'Stay',
  proceed,
  reset,
}: NavigationGuardDialogProps) {
  return (
    <Dialog
      open={isBlocked}
      // Escape key / clicking outside = stay (same as the cancel button)
      onOpenChange={(open) => { if (!open) reset() }}
    >
      <DialogContent className="max-w-sm [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={reset}>
            {cancelLabel}
          </Button>
          <Button variant="destructive" onClick={proceed}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
