export type StaffRole =
  | 'head-coach'
  | 'assistant-coach'
  | 'forwards-coach'
  | 'midfield-coach'
  | 'ruck-coach'
  | 'defensive-coach'
  | 'strength-conditioning'
  | 'reserves-coach'

export interface StaffRatings {
  tactical: number           // 1-100
  manManagement: number      // 1-100
  development: number        // 1-100
  gameDay: number            // 1-100
  recruitment: number        // 1-100
  fitness: number            // 1-100
  discipline: number         // 1-100
}

export interface StaffMember {
  id: string
  firstName: string
  lastName: string
  age: number
  role: StaffRole
  clubId: string
  ratings: StaffRatings
  contractYears: number
  salary: number
  philosophy: 'attacking' | 'defensive' | 'balanced' | 'development'
}
