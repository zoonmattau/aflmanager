import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGameStore } from '@/stores/gameStore'
import { ACHIEVEMENT_DEFS } from '@/engine/achievements/achievementDefinitions'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Trophy, ChevronDown, ChevronRight, ArrowLeft, Clock } from 'lucide-react'
import type { AchievementCategory, AchievementTier } from '@/types/achievements'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<AchievementCategory, string> = {
  'premiership': 'Premiership',
  'dynasty': 'Dynasty',
  'club-rebuild': 'Club Rebuild',
  'player-development': 'Player Development',
  'draft-scouting': 'Draft & Scouting',
  'awards': 'Awards',
  'season-performance': 'Season Performance',
  'youth': 'Youth',
  'club-building': 'Club Building',
  'management': 'Management',
  'records': 'Records',
  'hall-of-fame': 'Hall of Fame',
}

const TIER_COLORS: Record<AchievementTier, string> = {
  bronze: 'text-amber-600 border-amber-600',
  silver: 'text-slate-400 border-slate-400',
  gold: 'text-yellow-400 border-yellow-400',
}

const TIER_BG: Record<AchievementTier, string> = {
  bronze: 'bg-amber-900/20',
  silver: 'bg-slate-800/30',
  gold: 'bg-yellow-900/20',
}

const ALL_CATEGORIES: AchievementCategory[] = [
  'premiership',
  'dynasty',
  'club-rebuild',
  'player-development',
  'draft-scouting',
  'awards',
  'season-performance',
  'youth',
  'club-building',
  'management',
  'records',
  'hall-of-fame',
]

// ---------------------------------------------------------------------------
// AchievementsTab
// ---------------------------------------------------------------------------

function AchievementsTab() {
  const achievements = useGameStore((s) => s.achievements)
  const clubs = useGameStore((s) => s.clubs)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const unlockedSet = new Map(achievements.map((a) => [a.defId, a]))
  const totalUnlocked = achievements.length

  const toggleCategory = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className="space-y-4">
      {/* Header summary */}
      <Card>
        <CardContent className="py-4 px-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-yellow-400" />
              <span className="font-semibold text-lg">{totalUnlocked} / {ACHIEVEMENT_DEFS.length} Unlocked</span>
            </div>
            <Progress
              value={(totalUnlocked / ACHIEVEMENT_DEFS.length) * 100}
              className="w-40 h-2"
            />
          </div>
        </CardContent>
      </Card>

      {/* Category sections */}
      {ALL_CATEGORIES.map((cat) => {
        const defsInCat = ACHIEVEMENT_DEFS.filter((d) => d.category === cat)
        const unlockedInCat = defsInCat.filter((d) => unlockedSet.has(d.id)).length
        const isCollapsed = collapsed.has(cat)

        return (
          <Card key={cat}>
            <button
              className="w-full text-left"
              onClick={() => toggleCategory(cat)}
            >
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isCollapsed
                      ? <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                    <CardTitle className="text-sm font-semibold">{CATEGORY_LABELS[cat]}</CardTitle>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {unlockedInCat} / {defsInCat.length}
                  </span>
                </div>
              </CardHeader>
            </button>

            {!isCollapsed && (
              <CardContent className="pt-0 pb-4 px-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {defsInCat.map((def) => {
                    const unlocked = unlockedSet.get(def.id)
                    const clubName = unlocked ? (clubs[unlocked.clubId]?.name ?? unlocked.clubId) : null

                    return (
                      <div
                        key={def.id}
                        className={`rounded-lg border p-3 transition-opacity ${
                          unlocked ? TIER_BG[def.tier] : 'opacity-40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-sm font-medium leading-tight">{def.title}</span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 capitalize ${TIER_COLORS[def.tier]}`}
                          >
                            {def.tier}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground leading-snug">{def.description}</p>
                        {unlocked && (
                          <p className="text-[10px] text-muted-foreground mt-2">
                            Unlocked {unlocked.year}
                            {clubName ? ` · ${clubName}` : ''}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// ObjectivesTab
// ---------------------------------------------------------------------------

function ObjectivesTab() {
  const objectives = useGameStore((s) => s.careerObjectives)
  const dismissObjective = useGameStore((s) => s.dismissObjective)

  const active = objectives.filter((o) => o.status === 'active')
  const completed = objectives.filter((o) => o.status === 'completed').sort(
    (a, b) => (b.completedYear ?? 0) - (a.completedYear ?? 0),
  )
  const expired = objectives.filter((o) => o.status === 'expired')

  const [showExpired, setShowExpired] = useState(false)

  const ScopeBadge = ({ scope }: { scope: 'season' | 'multi-season' }) => (
    <Badge variant="outline" className={`text-[10px] ${scope === 'multi-season' ? 'text-purple-400 border-purple-400' : 'text-blue-400 border-blue-400'}`}>
      {scope === 'multi-season' ? 'multi-season' : 'season'}
    </Badge>
  )

  return (
    <div className="space-y-6">
      {/* Active objectives */}
      <div>
        <h3 className="text-sm font-semibold mb-3">Active Objectives</h3>
        {active.length === 0 ? (
          <p className="text-xs text-muted-foreground">No active objectives. Advance to the next season to receive new objectives.</p>
        ) : (
          <div className="space-y-3">
            {active.map((obj) => {
              const pct = Math.min(100, Math.round((obj.currentValue / obj.targetValue) * 100))
              return (
                <Card key={obj.id}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{obj.title}</span>
                        <ScopeBadge scope={obj.scope} />
                      </div>
                      {obj.expiresYear != null && (
                        <div className="flex items-center gap-1 shrink-0 text-[10px] text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Expires {obj.expiresYear}
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{obj.description}</p>
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="flex-1 h-1.5" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {obj.currentValue} / {obj.targetValue}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Completed objectives */}
      {completed.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Completed</h3>
          <div className="space-y-1.5">
            {completed.map((obj) => (
              <div
                key={obj.id}
                className="flex items-center justify-between rounded-md bg-green-900/20 border border-green-900/40 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <Trophy className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <span className="text-xs font-medium">{obj.title}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{obj.completedYear}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expired objectives */}
      {expired.length > 0 && (
        <div>
          <button
            className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-2"
            onClick={() => setShowExpired((v) => !v)}
          >
            {showExpired ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Missed ({expired.length})
          </button>
          {showExpired && (
            <div className="space-y-1.5">
              {expired.map((obj) => (
                <div
                  key={obj.id}
                  className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2 opacity-60"
                >
                  <span className="text-xs">{obj.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">Expired {obj.expiresYear ?? obj.assignedYear}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-5 px-1.5 text-[10px]"
                      onClick={() => dismissObjective(obj.id)}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AchievementsPage() {
  const navigate = useNavigate()

  return (
    <div className="container max-w-4xl py-6 space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-xl font-bold">Achievements & Career Objectives</h1>
      </div>

      <Tabs defaultValue="achievements">
        <TabsList>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="objectives">Career Objectives</TabsTrigger>
        </TabsList>

        <TabsContent value="achievements" className="mt-4">
          <AchievementsTab />
        </TabsContent>

        <TabsContent value="objectives" className="mt-4">
          <ObjectivesTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
