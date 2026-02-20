import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trophy, Medal, Star, Target, Shield, Users } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { SeasonAwardRecord } from '@/types/history'

type AwardTab = 'overview' | 'brownlow' | 'coleman' | 'rising-star' | 'all-australian' | 'club-bf'

const TABS: { id: AwardTab; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: Trophy },
  { id: 'brownlow', label: 'Brownlow Medal', icon: Medal },
  { id: 'coleman', label: 'Coleman Medal', icon: Target },
  { id: 'rising-star', label: 'Rising Star', icon: Star },
  { id: 'all-australian', label: 'All-Australian', icon: Shield },
  { id: 'club-bf', label: 'Club B&F', icon: Users },
]

function ClubDot({ clubId }: { clubId: string }) {
  const club = useGameStore((s) => s.clubs[clubId])
  if (!club) return null
  return (
    <div
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: club.colors.primary }}
      title={club.abbreviation}
    />
  )
}

export function AwardsHistoryPage() {
  const navigate = useNavigate()
  const awardHistory = useGameStore((s) => s.history.awards)
  const clubs = useGameStore((s) => s.clubs)
  const playerClubId = useGameStore((s) => s.playerClubId)
  const [activeTab, setActiveTab] = useState<AwardTab>('overview')

  // Sorted newest-first for display
  const sorted: SeasonAwardRecord[] = [...awardHistory].sort((a, b) => b.year - a.year)

  if (sorted.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Awards History</h1>
          <p className="text-muted-foreground">No seasons completed yet</p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Trophy className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Complete a season to see award records</p>
            <Button variant="outline" onClick={() => navigate('/')}>Back to Dashboard</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const userClubId = playerClubId

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Awards History</h1>
          <p className="text-muted-foreground">
            {sorted.length} season{sorted.length === 1 ? '' : 's'} of awards
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/awards-night')}>
          <Trophy className="mr-2 h-4 w-4" />
          Awards Night
        </Button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium transition-colors ${
                active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
              {active && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-foreground" />
              )}
            </button>
          )
        })}
      </div>

      {/* ── OVERVIEW ── */}
      {activeTab === 'overview' && (
        <div className="space-y-3">
          {sorted.map((record) => (
            <Card key={record.year}>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{record.year} Season</span>
                  <Badge variant="outline">{record.year}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 p-4 pt-0 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    icon: Medal,
                    label: 'Brownlow',
                    name: record.brownlowMedal?.playerName,
                    detail: record.brownlowMedal ? `${record.brownlowMedal.votes} votes` : null,
                    clubId: record.brownlowMedal?.clubId,
                  },
                  {
                    icon: Target,
                    label: 'Coleman',
                    name: record.colemanMedal?.playerName,
                    detail: record.colemanMedal ? `${record.colemanMedal.goals} goals` : null,
                    clubId: record.colemanMedal?.clubId,
                  },
                  {
                    icon: Star,
                    label: 'Rising Star',
                    name: record.risingStar?.playerName,
                    detail: null,
                    clubId: record.risingStar?.clubId,
                  },
                  {
                    icon: Shield,
                    label: 'All-Australian',
                    name: `${record.allAustralian.length} players`,
                    detail: null,
                    clubId: null,
                  },
                ].map(({ icon: Icon, label, name, detail, clubId }) => (
                  <div key={label} className="rounded-md border bg-muted/30 px-3 py-2.5">
                    <div className="mb-1 flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {clubId && <ClubDot clubId={clubId} />}
                      <p className="truncate text-sm font-medium">{name ?? '—'}</p>
                    </div>
                    {detail && <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── BROWNLOW MEDAL ── */}
      {activeTab === 'brownlow' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium">Year</th>
                  <th className="px-4 py-2.5 text-left font-medium">Winner</th>
                  <th className="px-4 py-2.5 text-left font-medium">Club</th>
                  <th className="px-4 py-2.5 text-right font-medium">Votes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sorted.map((r) => {
                  const bm = r.brownlowMedal
                  const club = bm?.clubId ? clubs[bm.clubId] : null
                  const isUserClub = bm?.clubId === userClubId
                  return (
                    <tr key={r.year} className={isUserClub ? 'bg-primary/5' : 'hover:bg-muted/30'}>
                      <td className="px-4 py-2.5 font-medium">{r.year}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          {bm?.clubId && <ClubDot clubId={bm.clubId} />}
                          <span>{bm?.playerName ?? '—'}</span>
                          {isUserClub && <Badge variant="secondary" className="text-xs">Your club</Badge>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{club?.fullName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold">
                        {bm ? bm.votes : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── COLEMAN MEDAL ── */}
      {activeTab === 'coleman' && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Year</th>
                <th className="px-4 py-2.5 text-left font-medium">Winner</th>
                <th className="px-4 py-2.5 text-left font-medium">Club</th>
                <th className="px-4 py-2.5 text-right font-medium">Goals</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => {
                const cm = r.colemanMedal
                const club = cm?.clubId ? clubs[cm.clubId] : null
                const isUserClub = cm?.clubId === userClubId
                return (
                  <tr key={r.year} className={isUserClub ? 'bg-primary/5' : 'hover:bg-muted/30'}>
                    <td className="px-4 py-2.5 font-medium">{r.year}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {cm?.clubId && <ClubDot clubId={cm.clubId} />}
                        <span>{cm?.playerName ?? '—'}</span>
                        {isUserClub && <Badge variant="secondary" className="text-xs">Your club</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{club?.fullName ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold">
                      {cm ? cm.goals : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── RISING STAR ── */}
      {activeTab === 'rising-star' && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium">Year</th>
                <th className="px-4 py-2.5 text-left font-medium">Winner</th>
                <th className="px-4 py-2.5 text-left font-medium">Club</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map((r) => {
                const rs = r.risingStar
                const club = rs?.clubId ? clubs[rs.clubId] : null
                const isUserClub = rs?.clubId === userClubId
                return (
                  <tr key={r.year} className={isUserClub ? 'bg-primary/5' : 'hover:bg-muted/30'}>
                    <td className="px-4 py-2.5 font-medium">{r.year}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        {rs?.clubId && <ClubDot clubId={rs.clubId} />}
                        <span>{rs?.playerName ?? '—'}</span>
                        {isUserClub && <Badge variant="secondary" className="text-xs">Your club</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{club?.fullName ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── ALL-AUSTRALIAN ── */}
      {activeTab === 'all-australian' && (
        <div className="space-y-4">
          {sorted.map((r) => (
            <Card key={r.year}>
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Shield className="h-4 w-4 text-primary" />
                  {r.year} All-Australian Team
                  <Badge variant="outline">{r.allAustralian.length} players</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
                  {r.allAustralian.map((entry) => {
                    const club = clubs[entry.clubId]
                    const isUser = entry.clubId === userClubId
                    return (
                      <div
                        key={entry.playerId}
                        className={`flex items-center gap-2 rounded px-2 py-1.5 ${isUser ? 'bg-primary/10' : 'bg-muted/30'}`}
                      >
                        {entry.clubId && <ClubDot clubId={entry.clubId} />}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{entry.playerName}</p>
                          <p className="text-[10px] text-muted-foreground">{club?.abbreviation ?? ''}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── CLUB B&F ── */}
      {activeTab === 'club-bf' && (
        <div className="space-y-4">
          {sorted.map((r) => {
            const entries = Object.entries(r.clubBestAndFairest)
            return (
              <Card key={r.year}>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">
                    {r.year} Club Best & Fairest Winners
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {entries.map(([clubId, entry]) => {
                      const club = clubs[clubId]
                      const isUser = clubId === userClubId
                      return (
                        <div
                          key={clubId}
                          className={`flex items-center gap-2 rounded-md border px-3 py-2 ${isUser ? 'border-primary/30 bg-primary/5' : 'border-transparent bg-muted/30'}`}
                        >
                          <div
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: club?.colors.primary ?? '#666' }}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium">
                              {entry.playerName}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {club?.fullName ?? clubId}
                            </p>
                          </div>
                          {isUser && (
                            <Badge variant="secondary" className="shrink-0 text-[10px]">Your club</Badge>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
