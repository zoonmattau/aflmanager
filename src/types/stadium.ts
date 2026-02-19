export type StadiumSurface = 'grass' | 'synthetic' | 'hybrid'

export interface CustomStadium {
  id: string
  name: string
  city: string
  state: string
  capacity: number
  surface: StadiumSurface
  opened: number
  notes?: string
}
