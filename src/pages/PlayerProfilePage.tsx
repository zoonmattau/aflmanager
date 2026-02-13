import { useParams, useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Heart, Zap, TrendingUp, Shield, AlertTriangle } from 'lucide-react'
import type { Player, PlayerAttributes } from '@/types/player'

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

export function PlayerProfilePage() {
  const { playerId } = useParams<{ playerId: string }>()
  const navigate = useNavigate()
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)

  const player = playerId ? players[playerId] : null
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
      <div className="grid gap-4 md:grid-cols-2">
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

  const rows = [
    { label: 'Games', total: gamesPlayed, avg: null },
    { label: 'Goals', total: stats.goals, avg: stats.goals / gamesPlayed },
    { label: 'Disposals', total: stats.disposals, avg: stats.disposals / gamesPlayed },
    { label: 'Kicks', total: stats.kicks, avg: stats.kicks / gamesPlayed },
    { label: 'Handballs', total: stats.handballs, avg: stats.handballs / gamesPlayed },
    { label: 'Marks', total: stats.marks, avg: stats.marks / gamesPlayed },
    { label: 'Tackles', total: stats.tackles, avg: stats.tackles / gamesPlayed },
    { label: 'Hitouts', total: stats.hitouts, avg: stats.hitouts / gamesPlayed },
    { label: 'Contested Poss', total: stats.contestedPossessions, avg: stats.contestedPossessions / gamesPlayed },
    { label: 'Clearances', total: stats.clearances, avg: stats.clearances / gamesPlayed },
    { label: 'Inside 50s', total: stats.insideFifties, avg: stats.insideFifties / gamesPlayed },
    { label: 'Rebound 50s', total: stats.rebound50s, avg: stats.rebound50s / gamesPlayed },
  ]

  return (
    <div className="text-sm space-y-0.5">
      <div className="flex text-xs text-muted-foreground font-medium mb-1">
        <span className="flex-1">Stat</span>
        <span className="w-14 text-right">Total</span>
        <span className="w-14 text-right">Avg</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="flex">
          <span className="flex-1 text-muted-foreground">{r.label}</span>
          <span className="w-14 text-right font-mono">{r.total}</span>
          <span className="w-14 text-right font-mono text-muted-foreground">
            {r.avg !== null ? r.avg.toFixed(1) : '-'}
          </span>
        </div>
      ))}
    </div>
  )
}
