import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import type { DashboardWidget, DashboardWidgetId } from '@/hooks/useDashboardConfig'

interface SortableWidgetItemProps {
  widget: DashboardWidget
  onToggle: (id: DashboardWidgetId, visible: boolean) => void
}

function SortableWidgetItem({ widget, onToggle }: SortableWidgetItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: widget.id,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 py-2.5 px-1 rounded hover:bg-muted/40"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{widget.label}</p>
        <p className="text-xs text-muted-foreground truncate">{widget.description}</p>
      </div>
      <Switch
        checked={widget.visible}
        onCheckedChange={(v) => onToggle(widget.id, v)}
      />
    </div>
  )
}

interface DashboardCustomizeSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  widgets: DashboardWidget[]
  onSetVisible: (id: DashboardWidgetId, visible: boolean) => void
  onReorder: (orderedIds: DashboardWidgetId[]) => void
  onReset: () => void
}

export function DashboardCustomizeSheet({
  open,
  onOpenChange,
  widgets,
  onSetVisible,
  onReorder,
  onReset,
}: DashboardCustomizeSheetProps) {
  const sensors = useSensors(useSensor(PointerSensor))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const ids = widgets.map((w) => w.id)
      const from = ids.indexOf(active.id as DashboardWidgetId)
      const to = ids.indexOf(over.id as DashboardWidgetId)
      onReorder(arrayMove(ids, from, to))
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-80 flex flex-col">
        <SheetHeader>
          <SheetTitle>Customise Dashboard</SheetTitle>
          <p className="text-xs text-muted-foreground">Drag to reorder. Toggle to show or hide.</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-2 divide-y">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={widgets.map((w) => w.id)}
              strategy={verticalListSortingStrategy}
            >
              {widgets.map((w) => (
                <SortableWidgetItem key={w.id} widget={w} onToggle={onSetVisible} />
              ))}
            </SortableContext>
          </DndContext>
        </div>
        <div className="border-t pt-3 pb-1">
          <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
            Reset to defaults
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
