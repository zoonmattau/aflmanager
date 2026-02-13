import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useGameStore } from '@/stores/gameStore'
import clubsData from '@/data/clubs.json'
import { cn } from '@/lib/utils'

interface ClubData {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  homeGround: string
  colors: { primary: string; secondary: string; tertiary?: string }
}

export function SetupPage() {
  const [selectedClub, setSelectedClub] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('My Career')
  const initializeGame = useGameStore((s) => s.initializeGame)

  const clubs = clubsData as ClubData[]

  const handleStartGame = () => {
    if (!selectedClub) return
    initializeGame(selectedClub, saveName)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-4xl space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">AFL Manager</h1>
          <p className="text-lg text-muted-foreground">
            Choose your club and begin your career as list manager
          </p>
        </div>

        {/* Save Name */}
        <div className="max-w-sm mx-auto">
          <Label htmlFor="saveName">Save Name</Label>
          <Input
            id="saveName"
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            placeholder="My Career"
          />
        </div>

        {/* Club Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {clubs.map((club) => (
            <Card
              key={club.id}
              className={cn(
                'cursor-pointer transition-all hover:scale-105',
                selectedClub === club.id
                  ? 'ring-2 ring-primary shadow-lg'
                  : 'hover:shadow-md'
              )}
              onClick={() => setSelectedClub(club.id)}
            >
              <CardContent className="flex flex-col items-center gap-2 p-4">
                <div
                  className="h-12 w-12 rounded-full border-2 border-background shadow-sm"
                  style={{
                    background: `linear-gradient(135deg, ${club.colors.primary} 50%, ${club.colors.secondary} 50%)`,
                  }}
                />
                <div className="text-center">
                  <p className="text-sm font-semibold leading-tight">{club.name}</p>
                  <p className="text-xs text-muted-foreground">{club.mascot}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Selected Club Info */}
        {selectedClub && (
          <Card>
            <CardHeader>
              <CardTitle>
                {clubs.find((c) => c.id === selectedClub)?.fullName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Home Ground: {clubs.find((c) => c.id === selectedClub)?.homeGround}
              </p>
              <Button size="lg" onClick={handleStartGame} className="w-full">
                Start Career with {clubs.find((c) => c.id === selectedClub)?.name}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
