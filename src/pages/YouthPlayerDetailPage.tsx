import { useNavigate, useParams } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, Star } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function AttrBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 75 ? 'bg-green-500' : value >= 55 ? 'bg-yellow-500' : 'bg-slate-400'
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums w-7 text-right font-medium">{value}</span>
    </div>
  )
}

function StatBlock({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function YouthPlayerDetailPage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate     = useNavigate()

  const youthPathway  = useGameStore((s) => s.youthPathway)
  const playerClubId  = useGameStore((s) => s.playerClubId)
  const currentYear   = useGameStore((s) => s.currentYear)

  if (!youthPathway || !playerId) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Player not found.</p>
        <Button variant="link" onClick={() => navigate('/youth-pathway')}>← Youth Pathway</Button>
      </div>
    )
  }

  const player = youthPathway.players[playerId]
  if (!player) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Player not found.</p>
        <Button variant="link" onClick={() => navigate('/youth-pathway')}>← Youth Pathway</Button>
      </div>
    )
  }

  const comp         = youthPathway.competitions[player.compId]
  const club         = comp?.clubs.find((c) => c.id === player.clubId)
  const scouted      = player.discoveredByClubIds.includes(playerClubId)
  const converted    = youthPathway.convertedProspectIds[player.id]

  const isDraftEligible = player.ageGroup === 'u18' && (player.age === 17 || player.age === 18)
  const draftYear       = player.age === 18 ? currentYear : currentYear + 1

  const scoutRating = scouted
    ? Math.round(
        (player.athleticism + player.footballIQ + player.contested +
          player.kicking + player.marking + player.goalkicking +
          player.workRate + player.leadership) / 8,
      )
    : null

  return (
    <div className="space-y-4">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ChevronLeft className="h-4 w-4 mr-1" />Back
        </Button>
        {comp && (
          <Button
            variant="link"
            size="sm"
            className="text-xs p-0 h-auto text-muted-foreground"
            onClick={() => navigate(`/youth-pathway/competition/${player.compId}`)}
          >
            {comp.name}
          </Button>
        )}
      </div>

      {/* Header card */}
      <Card>
        <CardContent className="pt-5 pb-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {scouted && <Star className="h-4 w-4 text-blue-500 shrink-0" />}
                <h1 className="text-2xl font-bold">
                  {player.firstName} {player.lastName}
                </h1>
                {converted && (
                  <Badge
                    variant="outline"
                    className="border-green-500 text-green-600 cursor-pointer"
                    onClick={() => navigate('/scouting')}
                  >
                    AFL Prospect
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{player.position}</Badge>
                <Badge variant="secondary" className="uppercase">{player.ageGroup}</Badge>
                <span className="text-sm text-muted-foreground">Age {player.age}</span>
                <span className="text-sm text-muted-foreground">Year {player.yearInComp} in comp</span>
              </div>
              {club && (
                <div className="flex items-center gap-2">
                  <div
                    className="h-3.5 w-3.5 rounded-full shrink-0"
                    style={{ backgroundColor: club.colors.primary }}
                  />
                  <span className="text-sm font-medium">{club.name}</span>
                  {comp && (
                    <span className="text-xs text-muted-foreground">· {comp.name}</span>
                  )}
                </div>
              )}
            </div>

            {isDraftEligible && (
              <div className="text-center border rounded-lg px-4 py-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Draft Eligible</p>
                <p className="text-2xl font-bold">{draftYear}</p>
                {player.age === 18 && (
                  <Badge variant="default" className="text-xs mt-1">This year</Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {scouted ? (
        <>
          {/* Season stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Season Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-4">
                <StatBlock label="Games" value={player.seasonStats.gamesPlayed} />
                <StatBlock label="Disposals" value={player.seasonStats.disposals} />
                <StatBlock label="Goals" value={player.seasonStats.goals} />
                <StatBlock label="Marks" value={player.seasonStats.marks} />
                <StatBlock label="Tackles" value={player.seasonStats.tackles} />
                <StatBlock label="BOG" value={player.seasonStats.bestOnGroundCount} />
                <StatBlock label="Avg Rating" value={player.seasonStats.avgRating.toFixed(1)} />
              </div>
            </CardContent>
          </Card>

          {/* Attributes */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">Scout Report</CardTitle>
                {scoutRating !== null && (
                  <span className="text-xs text-muted-foreground">
                    Scout avg: <span className="font-bold text-foreground">{scoutRating}</span>
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <AttrBar label="Athleticism"   value={player.athleticism} />
              <AttrBar label="Football IQ"   value={player.footballIQ} />
              <AttrBar label="Contested"     value={player.contested} />
              <AttrBar label="Kicking"       value={player.kicking} />
              <AttrBar label="Marking"       value={player.marking} />
              <AttrBar label="Goalkicking"   value={player.goalkicking} />
              <AttrBar label="Work Rate"     value={player.workRate} />
              <AttrBar label="Leadership"    value={player.leadership} />
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <p className="font-medium text-muted-foreground">Player Not Scouted</p>
            <p className="text-sm text-muted-foreground/60">
              Assign a scout to the {comp?.state ?? player.region} region to unlock this player's attributes and detailed stats.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
