import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Heart, Zap, TrendingUp, Shield, AlertTriangle, Trophy, Info } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { Player, PlayerAttributes, PlayerPositionType } from '@/types/player'

const ATTR_CATEGORIES: { label: string; attrs: { key: keyof PlayerAttributes; label: string }[] }[] = [
  {
    label: 'Kicking',
    attrs: [
      { key: 'kickingEfficiency', label: 'Efficiency' },
      { key: 'kickingDistance', label: 'Distance' },
      { key: 'setShot', label: 'Set Shot' },
      { key: 'dropPunt', label: 'Drop Punt' },
      { key: 'snap', label: 'Snap' },
    ],
  },
  {
    label: 'Handball',
    attrs: [
      { key: 'handballEfficiency', label: 'Efficiency' },
      { key: 'handballDistance', label: 'Distance' },
      { key: 'handballReceive', label: 'Receive' },
    ],
  },
  {
    label: 'Marking',
    attrs: [
      { key: 'markingOverhead', label: 'Overhead' },
      { key: 'markingLeading', label: 'Leading' },
      { key: 'markingContested', label: 'Contested' },
      { key: 'markingUncontested', label: 'Uncontested' },
    ],
  },
  {
    label: 'Physical',
    attrs: [
      { key: 'speed', label: 'Speed' },
      { key: 'acceleration', label: 'Acceleration' },
      { key: 'endurance', label: 'Endurance' },
      { key: 'strength', label: 'Strength' },
      { key: 'agility', label: 'Agility' },
      { key: 'leap', label: 'Leap' },
      { key: 'recovery', label: 'Recovery' },
    ],
  },
  {
    label: 'Contested',
    attrs: [
      { key: 'tackling', label: 'Tackling' },
      { key: 'contested', label: 'Contested Ball' },
      { key: 'clearance', label: 'Clearance' },
      { key: 'hardness', label: 'Hardness' },
    ],
  },
  {
    label: 'Game Sense',
    attrs: [
      { key: 'disposalDecision', label: 'Decision Making' },
      { key: 'fieldKicking', label: 'Field Kicking' },
      { key: 'positioning', label: 'Positioning' },
      { key: 'creativity', label: 'Creativity' },
      { key: 'anticipation', label: 'Anticipation' },
      { key: 'composure', label: 'Composure' },
    ],
  },
  {
    label: 'Offensive',
    attrs: [
      { key: 'goalkicking', label: 'Goalkicking' },
      { key: 'groundBallGet', label: 'Ground Ball' },
      { key: 'insideForward', label: 'Inside Forward' },
      { key: 'leadingPatterns', label: 'Leading' },
      { key: 'scoringInstinct', label: 'Scoring Instinct' },
    ],
  },
  {
    label: 'Defensive',
    attrs: [
      { key: 'intercept', label: 'Intercept' },
      { key: 'spoiling', label: 'Spoiling' },
      { key: 'oneOnOne', label: '1-on-1' },
      { key: 'zonalAwareness', label: 'Zonal Awareness' },
      { key: 'rebounding', label: 'Rebounding' },
    ],
  },
  {
    label: 'Ruck',
    attrs: [
      { key: 'hitouts', label: 'Hitouts' },
      { key: 'ruckCreative', label: 'Ruck Creativity' },
      { key: 'followUp', label: 'Follow-up' },
    ],
  },
  {
    label: 'Mental',
    attrs: [
      { key: 'pressure', label: 'Pressure' },
      { key: 'leadership', label: 'Leadership' },
      { key: 'workRate', label: 'Work Rate' },
      { key: 'consistency', label: 'Consistency' },
      { key: 'determination', label: 'Determination' },
      { key: 'teamPlayer', label: 'Team Player' },
      { key: 'clutch', label: 'Clutch' },
    ],
  },
  {
    label: 'Set Pieces',
    attrs: [
      { key: 'centreBounce', label: 'Centre Bounce' },
      { key: 'boundaryThrowIn', label: 'Throw-in' },
      { key: 'stoppage', label: 'Stoppage' },
    ],
  },
]

function attrColor(val: number): string {
  if (val >= 80) return 'text-green-500'
  if (val >= 65) return 'text-emerald-400'
  if (val >= 50) return 'text-yellow-500'
  if (val >= 35) return 'text-orange-500'
  return 'text-red-500'
}

function attrBgColor(val: number): string {
  if (val >= 80) return 'bg-green-500'
  if (val >= 65) return 'bg-emerald-400'
  if (val >= 50) return 'bg-yellow-500'
  if (val >= 35) return 'bg-orange-500'
  return 'bg-red-500'
}

function moraleLabel(morale: number): string {
  if (morale >= 90) return 'Ecstatic'
  if (morale >= 75) return 'Happy'
  if (morale >= 60) return 'Content'
  if (morale >= 45) return 'Unsettled'
  if (morale >= 30) return 'Unhappy'
  return 'Furious'
}

function getOverall(p: Player): number {
  const vals = Object.values(p.attributes) as number[]
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}

const FIELD_POSITION_COORDS: Record<PlayerPositionType, { x: number; y: number }> = {
  BP: { x: 20, y: 86 },
  FB: { x: 50, y: 90 },
  HBF: { x: 80, y: 86 },
  CHB: { x: 50, y: 72 },
  W: { x: 16, y: 50 },
  IM: { x: 42, y: 50 },
  OM: { x: 58, y: 50 },
  RK: { x: 50, y: 50 },
  HFF: { x: 20, y: 14 },
  CHF: { x: 50, y: 28 },
  FP: { x: 80, y: 14 },
  FF: { x: 50, y: 10 },
}

function PositionHeatMapCard({ player }: { player: Player }) {
  const secondary = new Set(player.position.secondary)
  const tertiary = Object.entries(player.position.ratings)
    .filter(([pos, rating]) => {
      if (!rating || rating < 45) return false
      if (pos === player.position.primary) return false
      return !secondary.has(pos as PlayerPositionType)
    })
    .map(([pos]) => pos as PlayerPositionType)

  const eligible = new Set<PlayerPositionType>([
    player.position.primary,
    ...player.position.secondary,
    ...tertiary,
  ])

  function getChipStyle(pos: PlayerPositionType): string {
    if (pos === player.position.primary) return 'bg-green-500/90 text-white border-green-300'
    if (secondary.has(pos)) return 'bg-yellow-500/90 text-black border-yellow-300'
    return 'bg-red-500/90 text-white border-red-300'
  }

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm">Position Heat Map</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="mx-auto w-full max-w-sm aspect-[3/4] rounded-[40%] border border-emerald-600/50 bg-gradient-to-b from-emerald-600/30 via-emerald-700/25 to-emerald-800/25 p-3">
          <div className="relative h-full w-full rounded-[42%] border border-emerald-400/35">
            <div className="absolute left-1/2 top-1/2 h-[38%] w-[52%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
            <div className="absolute left-1/2 top-1/2 h-[15%] w-[22%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/30" />
            <div className="absolute left-1/2 top-0 h-[18%] w-[42%] -translate-x-1/2 border-b border-white/25" />
            <div className="absolute left-1/2 bottom-0 h-[18%] w-[42%] -translate-x-1/2 border-t border-white/25" />

            {(Object.keys(FIELD_POSITION_COORDS) as PlayerPositionType[])
              .filter((pos) => eligible.has(pos))
              .map((pos) => {
                const coords = FIELD_POSITION_COORDS[pos]
                return (
                  <div
                    key={pos}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 rounded border px-2 py-0.5 text-[10px] font-bold tracking-wide shadow ${getChipStyle(pos)}`}
                    style={{ left: `${coords.x}%`, top: `${coords.y}%` }}
                  >
                    {pos}
                  </div>
                )
              })}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded border border-green-300 bg-green-500/90 px-2 py-0.5 text-white">Primary</span>
          <span className="rounded border border-yellow-300 bg-yellow-500/90 px-2 py-0.5 text-black">Secondary</span>
          <span className="rounded border border-red-300 bg-red-500/90 px-2 py-0.5 text-white">Tertiary</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)
  const history = useGameStore((s) => s.history)
  const awards = useGameStore((s) => s.awards)
  const brownlowTracker = useGameStore((s) => s.brownlowTracker)

  const player = playerId ? players[playerId] : null

  // Find draft info from history
  const draftInfo = useMemo(() => {
    if (!playerId) return null
    return history.draftHistory.find((d) => d.playerId === playerId) ?? null
  }, [history.draftHistory, playerId])

  // Honours
  const honours = useMemo(() => {
    if (!playerId) return { brownlowVotes: 0, brownlowWins: 0, colemanWins: 0, risingStarWins: 0, allAustralianCount: 0, bnfWins: 0 }
    let brownlowVotes = 0
    for (const round of brownlowTracker) {
      for (const v of round.votes) {
        if (v.playerId === playerId) brownlowVotes += v.votes
      }
    }
    let brownlowWins = 0
    let colemanWins = 0
    let risingStarWins = 0
    let allAustralianCount = 0
    let bnfWins = 0
    for (const a of awards) {
      if (a.brownlowMedal?.playerId === playerId) brownlowWins++
      if (a.colemanMedal?.playerId === playerId) colemanWins++
      if (a.risingStar?.playerId === playerId) risingStarWins++
      if (a.allAustralian.includes(playerId)) allAustralianCount++
      if (Object.values(a.clubBestAndFairest).includes(playerId)) bnfWins++
    }
    return { brownlowVotes, brownlowWins, colemanWins, risingStarWins, allAustralianCount, bnfWins }
  }, [playerId, brownlowTracker, awards])

  if (!player) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Player not found.</p>
      </div>
    )
  }

  const club = clubs[player.clubId]
  const overall = getOverall(player)
  const ss = player.seasonStats
  const cs = player.careerStats

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div
          className="h-14 w-14 rounded-full flex items-center justify-center text-white font-bold text-xl"
          style={{ backgroundColor: club?.colors.primary ?? '#666' }}
        >
          {player.jerseyNumber}
        </div>
        <div>
          <h1 className="text-2xl font-bold">
            {player.firstName} {player.lastName}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{club?.name}</span>
            <span>&middot;</span>
            <Badge variant="outline">{player.position.primary}</Badge>
            {player.position.secondary.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
            ))}
            <span>&middot;</span>
            <span>Age {player.age}</span>
            <span>&middot;</span>
            <span>{player.height}cm / {player.weight}kg</span>
            <span>&middot;</span>
            {(player.suspension?.weeksRemaining ?? 0) > 0 ? (
              <Badge variant="outline" className="text-[10px] border-orange-500/30 bg-orange-500/15 text-orange-700">
                Suspended ({player.suspension?.weeksRemaining ?? 0}w)
              </Badge>
            ) : player.injury ? (
              <Badge variant="outline" className="text-[10px] border-red-500/30 bg-red-500/15 text-red-600">
                {player.injury.type} ({player.injury.weeksRemaining}w)
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-green-500/30 bg-green-500/15 text-green-600">
                Fit
              </Badge>
            )}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-bold">{overall}</div>
          <p className="text-xs text-muted-foreground">Overall</p>
        </div>
      </div>

      {/* Status gauges */}
      <div className="grid gap-4 md:grid-cols-5">
        <StatusCard icon={Heart} label="Morale" value={player.morale} sub={moraleLabel(player.morale)} />
        <StatusCard icon={Zap} label="Fitness" value={player.fitness} />
        <StatusCard icon={TrendingUp} label="Form" value={player.form} />
        <StatusCard icon={Shield} label="Fatigue" value={player.fatigue} inverted />
        {player.injury ? (
          <Card className="border-red-500/50">
            <CardContent className="py-3 text-center">
              <AlertTriangle className="mx-auto h-5 w-5 text-red-500 mb-1" />
              <p className="text-sm font-semibold text-red-500">{player.injury.type}</p>
              <p className="text-xs text-muted-foreground">{player.injury.weeksRemaining} weeks</p>
              {player.injury.severity && (
                <p className="text-[11px] text-muted-foreground capitalize">
                  {player.injury.severity} {player.injury.recurring ? '• recurring' : ''}
                </p>
              )}
              {player.injury.recoveryProgress !== undefined && (
                <p className="text-[11px] text-muted-foreground">
                  Recovery {Math.round(player.injury.recoveryProgress)}%
                </p>
              )}
            </CardContent>
          </Card>
        ) : (player.suspension?.weeksRemaining ?? 0) > 0 ? (
          <Card className="border-orange-500/50">
            <CardContent className="py-3 text-center">
              <Shield className="mx-auto h-5 w-5 text-orange-500 mb-1" />
              <p className="text-sm font-semibold text-orange-600">Suspended</p>
              <p className="text-xs text-muted-foreground">{player.suspension?.weeksRemaining ?? 0} weeks remaining</p>
              <p className="text-[11px] text-muted-foreground">{player.suspension?.reason}</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-3 text-center">
              <Shield className="mx-auto h-5 w-5 text-green-500 mb-1" />
              <p className="text-sm font-semibold text-green-500">Healthy</p>
              <p className="text-xs text-muted-foreground">No injury</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contract & Personality */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Contract</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Years Remaining</span>
              <span className="font-medium">{player.contract.yearsRemaining}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">AAV</span>
              <span className="font-medium">${(player.contract.aav / 1000).toFixed(0)}k</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Year-by-Year</span>
              <span className="font-medium font-mono text-xs">
                {player.contract.yearByYear.map((y) => `$${(y / 1000).toFixed(0)}k`).join(', ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant={player.contract.isRestricted ? 'secondary' : 'outline'}>
                {player.contract.isRestricted ? 'Restricted FA' : 'Unrestricted FA'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">List</span>
              <Badge variant={player.isRookie ? 'secondary' : 'default'}>
                {player.isRookie ? 'Rookie' : 'Senior'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Durability</span>
              <span className={`font-mono font-medium ${attrColor(player.hiddenAttributes.durability)}`}>
                {player.hiddenAttributes.durability}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Injury Proneness</span>
              <span className={`font-mono font-medium ${attrColor(100 - player.hiddenAttributes.injuryProneness)}`}>
                {player.hiddenAttributes.injuryProneness}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Personality</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <PersonalityBar label="Ambition" value={player.personality.ambition} />
            <PersonalityBar label="Loyalty" value={player.personality.loyalty} />
            <PersonalityBar label="Professionalism" value={player.personality.professionalism} />
            <PersonalityBar label="Temperament" value={player.personality.temperament} />
          </CardContent>
        </Card>

        <PositionHeatMapCard player={player} />
      </div>

      {/* Attributes */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {ATTR_CATEGORIES.map((cat) => (
          <Card key={cat.label}>
            <CardHeader className="py-3">
              <CardTitle className="text-sm">{cat.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {cat.attrs.map(({ key, label }) => {
                const val = player.attributes[key]
                return (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-28 text-xs text-muted-foreground truncate">{label}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${attrBgColor(val)}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <span className={`w-7 text-right text-xs font-mono font-bold ${attrColor(val)}`}>
                      {val}
                    </span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Season Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <StatsTable stats={ss} gamesPlayed={ss.gamesPlayed} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Career Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <StatsTable stats={cs} gamesPlayed={cs.gamesPlayed} />
          </CardContent>
        </Card>
      </div>

      {/* Career Info */}
      {(draftInfo || cs.gamesPlayed > 0) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm">Career</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {draftInfo && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Draft</span>
                <span className="font-medium">
                  Drafted by {clubs[draftInfo.clubId]?.name ?? draftInfo.clubId} in {draftInfo.year}, Pick #{draftInfo.pickNumber}
                </span>
              </div>
            )}
            {cs.gamesPlayed > 0 && (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Career Games</span>
                  <span className="font-mono font-medium">{cs.gamesPlayed}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Career Goals</span>
                  <span className="font-mono font-medium">{cs.goals}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Career Disposals</span>
                  <span className="font-mono font-medium">{cs.disposals}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Injury History */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm">Injury History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {player.injuryHistory.length === 0 ? (
            <p className="text-muted-foreground">No recorded injuries.</p>
          ) : (
            [...player.injuryHistory]
              .slice(-8)
              .reverse()
              .map((h, idx) => (
                <div key={`${h.occurredOn}-${h.type}-${idx}`} className="flex items-center justify-between border-b border-border/40 pb-1 last:border-0">
                  <div>
                    <p className="font-medium">
                      {h.type}
                      {h.recurring ? <span className="text-red-500"> (recurring)</span> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.occurredOn}
                      {h.recoveredOn ? ` to ${h.recoveredOn}` : ' to present'}
                    </p>
                  </div>
                  <div className="text-right text-xs">
                    <p className="font-mono">{h.initialWeeks}w</p>
                    <p className="text-muted-foreground">{h.gamesMissed} games missed</p>
                  </div>
                </div>
              ))
          )}
        </CardContent>
      </Card>

      {/* Honours */}
      {(honours.brownlowVotes > 0 || honours.brownlowWins > 0 || honours.colemanWins > 0 || honours.risingStarWins > 0 || honours.allAustralianCount > 0 || honours.bnfWins > 0) && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Trophy className="h-4 w-4 text-yellow-500" />
              Honours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {honours.brownlowWins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Brownlow Medals</span>
                <span className="font-mono font-bold text-yellow-500">{honours.brownlowWins}</span>
              </div>
            )}
            {honours.brownlowVotes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Brownlow Votes (current season)</span>
                <span className="font-mono font-medium">{honours.brownlowVotes}</span>
              </div>
            )}
            {honours.colemanWins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coleman Medals</span>
                <span className="font-mono font-bold text-yellow-500">{honours.colemanWins}</span>
              </div>
            )}
            {honours.risingStarWins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Rising Star Awards</span>
                <span className="font-mono font-bold">{honours.risingStarWins}</span>
              </div>
            )}
            {honours.allAustralianCount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">All-Australian Selections</span>
                <span className="font-mono font-bold">{honours.allAustralianCount}</span>
              </div>
            )}
            {honours.bnfWins > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Club Best & Fairest</span>
                <span className="font-mono font-bold">{honours.bnfWins}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function StatusCard({
  icon: Icon,
  label,
  value,
  sub,
  inverted,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  sub?: string
  inverted?: boolean
}) {
  return (
    <Card>
      <CardContent className="py-3 text-center">
        <Icon className={`mx-auto h-5 w-5 mb-1 ${attrColor(inverted ? 100 - value : value)}`} />
        <p className={`text-2xl font-bold ${attrColor(inverted ? 100 - value : value)}`}>{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
        {sub && <p className="text-xs font-medium mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  )
}

function PersonalityBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 text-xs text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/60"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-6 text-right text-xs font-mono">{value}</span>
    </div>
  )
}

function StatsTable({
  stats,
  gamesPlayed,
}: {
  stats: import('@/types/player').PlayerCareerStats
  gamesPlayed: number
}) {
  if (gamesPlayed === 0) {
    return <p className="text-sm text-muted-foreground">No stats recorded.</p>
  }

  const rows: { code: string; label: string; desc: string; total: number; avg: number | null }[] = [
    { code: 'GP', label: 'Games Played', desc: 'Matches played.', total: gamesPlayed, avg: null },
    { code: 'AF', label: 'AFL Fantasy', desc: 'AFL Fantasy points total.', total: stats.aflFantasyPoints, avg: stats.aflFantasyPoints / gamesPlayed },
    { code: 'SC', label: 'SuperCoach', desc: 'SuperCoach-style points total.', total: stats.superCoachPoints, avg: stats.superCoachPoints / gamesPlayed },
    { code: 'G', label: 'Goals', desc: '6-point scoring shots.', total: stats.goals, avg: stats.goals / gamesPlayed },
    { code: 'B', label: 'Behinds', desc: '1-point scoring shots.', total: stats.behinds, avg: stats.behinds / gamesPlayed },
    { code: 'D', label: 'Disposals', desc: 'Kicks + handballs.', total: stats.disposals, avg: stats.disposals / gamesPlayed },
    { code: 'K', label: 'Kicks', desc: 'Total kicks.', total: stats.kicks, avg: stats.kicks / gamesPlayed },
    { code: 'HB', label: 'Handballs', desc: 'Total handballs.', total: stats.handballs, avg: stats.handballs / gamesPlayed },
    { code: 'M', label: 'Marks', desc: 'Total marks.', total: stats.marks, avg: stats.marks / gamesPlayed },
    { code: 'CM', label: 'Contested Marks', desc: 'Marks taken under physical pressure.', total: stats.contestedMarks, avg: stats.contestedMarks / gamesPlayed },
    { code: 'T', label: 'Tackles', desc: 'Successful tackles.', total: stats.tackles, avg: stats.tackles / gamesPlayed },
    { code: 'HO', label: 'Hitouts', desc: 'Ruck hitouts won.', total: stats.hitouts, avg: stats.hitouts / gamesPlayed },
    { code: 'CP', label: 'Contested Poss', desc: 'Possessions won in contest.', total: stats.contestedPossessions, avg: stats.contestedPossessions / gamesPlayed },
    { code: 'UP', label: 'Uncontested Poss', desc: 'Possessions won without direct contest.', total: stats.uncontestedPossessions, avg: stats.uncontestedPossessions / gamesPlayed },
    { code: 'CL', label: 'Clearances', desc: 'First effective possession from stoppage.', total: stats.clearances, avg: stats.clearances / gamesPlayed },
    { code: 'I50', label: 'Inside 50s', desc: 'Entries into forward 50.', total: stats.insideFifties, avg: stats.insideFifties / gamesPlayed },
    { code: 'R50', label: 'Rebound 50s', desc: 'Possessions exiting defensive 50.', total: stats.rebound50s, avg: stats.rebound50s / gamesPlayed },
    { code: 'FF', label: 'Frees For', desc: 'Free kicks received.', total: stats.freesFor, avg: stats.freesFor / gamesPlayed },
    { code: 'FA', label: 'Frees Against', desc: 'Free kicks conceded.', total: stats.freesAgainst, avg: stats.freesAgainst / gamesPlayed },
    { code: 'GA', label: 'Goal Assists', desc: 'Final pass/chain contribution to a goal.', total: stats.goalAssists, avg: stats.goalAssists / gamesPlayed },
    { code: 'SI', label: 'Score Involvements', desc: 'Involvement in scoring chains.', total: stats.scoreInvolvements, avg: stats.scoreInvolvements / gamesPlayed },
    { code: 'MG', label: 'Metres Gained', desc: 'Net territory gained from possessions.', total: stats.metresGained, avg: stats.metresGained / gamesPlayed },
    { code: 'INT', label: 'Intercepts', desc: 'Possessions won from opposition ball movement.', total: stats.intercepts, avg: stats.intercepts / gamesPlayed },
    { code: '1%', label: 'One Percenters', desc: 'Spoils, smothers, knock-ons and similar team acts.', total: stats.onePercenters, avg: stats.onePercenters / gamesPlayed },
    { code: 'TO', label: 'Turnovers', desc: 'Possessions lost to opposition.', total: stats.turnovers, avg: stats.turnovers / gamesPlayed },
    { code: 'CLG', label: 'Clangers', desc: 'Significant errors leading to negative outcomes.', total: stats.clangers, avg: stats.clangers / gamesPlayed },
    { code: 'BO', label: 'Bounces', desc: 'Running bounces with possession.', total: stats.bounces, avg: stats.bounces / gamesPlayed },
  ]

  return (
    <TooltipProvider delayDuration={120}>
      <div className="text-sm space-y-0.5">
        <div className="flex text-xs text-muted-foreground font-medium mb-1">
          <span className="flex-1 flex items-center gap-1.5">
            Stat
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="inline-flex items-center text-muted-foreground hover:text-foreground">
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-xs">
                <div className="space-y-1">
                  <p className="font-semibold">Stat Abbreviations</p>
                  <p>`GP` Games Played, `AF` AFL Fantasy, `SC` SuperCoach</p>
                  <p>`D` Disposals, `K` Kicks, `HB` Handballs, `M` Marks</p>
                  <p>`CP` Contested Possessions, `UP` Uncontested Possessions, `CL` Clearances</p>
                  <p>`I50` Inside 50s, `R50` Rebound 50s, `FF/FA` Frees For/Against</p>
                  <p>`GA` Goal Assists, `SI` Score Involvements, `INT` Intercepts, `1%` One Percenters</p>
                  <p>`TO` Turnovers, `CLG` Clangers, `BO` Bounces, `MG` Metres Gained</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </span>
          <span className="w-14 text-right">Total</span>
          <span className="w-14 text-right">Avg</span>
        </div>
        {rows.map((r) => (
          <div key={r.code} className="flex">
            <span className="flex-1 text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help">{r.code} - {r.label}</span>
                </TooltipTrigger>
                <TooltipContent side="right">{r.desc}</TooltipContent>
              </Tooltip>
            </span>
            <span className="w-14 text-right font-mono">{r.total}</span>
            <span className="w-14 text-right font-mono text-muted-foreground">
              {r.avg !== null ? r.avg.toFixed(1) : '-'}
            </span>
          </div>
        ))}
      </div>
    </TooltipProvider>
  )
}
