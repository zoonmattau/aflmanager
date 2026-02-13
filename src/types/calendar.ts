import type { TrainingFocus } from '@/engine/training/trainingEngine'

export type ScheduleSlot = 'morning' | 'afternoon'

export interface DaySchedule {
  morning: TrainingFocus | 'rest' | null   // null = unscheduled
  afternoon: TrainingFocus | 'rest' | null
}

/** Keyed by YYYY-MM-DD date string */
export type WeekSchedule = Record<string, DaySchedule>

export type GameEventType =
  | 'match'
  | 'training'
  | 'contract-deadline'
  | 'trade-deadline'
  | 'draft'
  | 'preseason-friendly'
  | 'bye'
  | 'milestone'

export interface GameEvent {
  id: string
  date: string            // YYYY-MM-DD
  time?: string           // e.g. "7:25pm"
  type: GameEventType
  title: string
  description?: string
  /** Arbitrary data payload for event processing */
  data?: Record<string, unknown>
  resolved: boolean
}

export interface GameCalendar {
  events: GameEvent[]
  currentDate: string     // YYYY-MM-DD
}
