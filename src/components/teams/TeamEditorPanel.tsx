import { useState } from 'react'
import type { GuernseyPattern, GuernseyStyle } from '@/types/club'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { GuernseyPreview } from '@/components/teams/GuernseyPreview'
import { ChevronDown, ChevronRight, Plus, Trash2, X } from 'lucide-react'

export interface TeamEditorData {
  id: string
  name: string
  fullName: string
  abbreviation: string
  mascot: string
  logoUrl: string
  homeGround: string
  secondaryHomeGrounds: string[]
  established: number
  colors: { primary: string; secondary: string; tertiary?: string }
  guernseyStyle: GuernseyStyle | null
  notes: string
  rivalryClubIds: string[]
  tier: 'large' | 'medium' | 'small'
  finances: { revenue: number; expenses: number; balance: number }
  fanSatisfaction: number
}

export interface TeamEditorPanelProps {
  team: TeamEditorData
  allTeams: Array<{ id: string; name: string }>
  onChange: (updates: Partial<TeamEditorData>) => void
  showFinancials?: boolean
  onDelete?: () => void
}

const GUERNSEY_PATTERNS: { value: GuernseyPattern; label: string }[] = [
  { value: 'solid', label: 'Solid' },
  { value: 'vertical-stripes', label: 'Vertical Stripes' },
  { value: 'horizontal-hoops', label: 'Horizontal Hoops' },
  { value: 'v-stripe', label: 'V-Stripe' },
  { value: 'chevron', label: 'Chevron' },
  { value: 'sash', label: 'Sash' },
  { value: 'yoke', label: 'Yoke' },
  { value: 'halves', label: 'Halves' },
]

const DEFAULT_GUERNSEY: GuernseyStyle = {
  homePattern: 'solid',
  awayPattern: 'solid',
  homeColors: ['#000000', '#ffffff'],
  awayColors: ['#ffffff', '#000000'],
}

function formatMoney(n: number): string {
  return `$${(n / 1_000_000).toFixed(1)}M`
}

function parseMoney(s: string): number {
  const cleaned = s.replace(/[$,M]/gi, '').trim()
  const n = parseFloat(cleaned)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 1_000_000)
}

export function TeamEditorPanel({ team, allTeams, onChange, showFinancials, onDelete }: TeamEditorPanelProps) {
  const [expanded, setExpanded] = useState(false)
  const [newGround, setNewGround] = useState('')
  const [newRivalId, setNewRivalId] = useState('')

  const guernsey = team.guernseyStyle ?? DEFAULT_GUERNSEY

  const availableRivals = allTeams.filter(
    (t) => t.id !== team.id && !team.rivalryClubIds.includes(t.id),
  )

  return (
    <Card>
      <button
        type="button"
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <div
          className="h-4 w-4 shrink-0 rounded-full border"
          style={{ backgroundColor: team.colors.primary }}
        />
        <span className="font-medium">{team.name}</span>
        <span className="text-xs text-muted-foreground">{team.abbreviation}</span>
        <span className="ml-auto text-xs text-muted-foreground">{team.homeGround}</span>
        {onDelete && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </button>

      {expanded && (
        <CardContent className="space-y-6 border-t pt-4">
          {/* Identity */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Identity</h4>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={team.name} onChange={(e) => onChange({ name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Full Name</Label>
                <Input value={team.fullName} onChange={(e) => onChange({ fullName: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Abbreviation</Label>
                <Input
                  value={team.abbreviation}
                  onChange={(e) => onChange({ abbreviation: e.target.value.toUpperCase().slice(0, 4) })}
                  maxLength={4}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Mascot</Label>
                <Input value={team.mascot} onChange={(e) => onChange({ mascot: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Logo URL</Label>
                <Input value={team.logoUrl} onChange={(e) => onChange({ logoUrl: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Established</Label>
                <Input
                  type="number"
                  value={team.established}
                  onChange={(e) => onChange({ established: parseInt(e.target.value, 10) || 2026 })}
                />
              </div>
            </div>
          </section>

          {/* Colours */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Colours</h4>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Primary</Label>
                <Input
                  type="color"
                  className="h-9 w-14"
                  value={team.colors.primary}
                  onChange={(e) => onChange({ colors: { ...team.colors, primary: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary</Label>
                <Input
                  type="color"
                  className="h-9 w-14"
                  value={team.colors.secondary}
                  onChange={(e) => onChange({ colors: { ...team.colors, secondary: e.target.value } })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tertiary</Label>
                <Input
                  type="color"
                  className="h-9 w-14"
                  value={team.colors.tertiary ?? '#ffffff'}
                  onChange={(e) => onChange({ colors: { ...team.colors, tertiary: e.target.value } })}
                />
              </div>
            </div>
          </section>

          {/* Guernsey */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Guernsey</h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Home Pattern</Label>
                <Select
                  value={guernsey.homePattern}
                  onValueChange={(v) =>
                    onChange({
                      guernseyStyle: { ...guernsey, homePattern: v as GuernseyPattern },
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GUERNSEY_PATTERNS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-8 w-12"
                    value={guernsey.homeColors[0]}
                    onChange={(e) =>
                      onChange({
                        guernseyStyle: { ...guernsey, homeColors: [e.target.value, guernsey.homeColors[1]] },
                      })
                    }
                  />
                  <Input
                    type="color"
                    className="h-8 w-12"
                    value={guernsey.homeColors[1]}
                    onChange={(e) =>
                      onChange({
                        guernseyStyle: { ...guernsey, homeColors: [guernsey.homeColors[0], e.target.value] },
                      })
                    }
                  />
                  <GuernseyPreview pattern={guernsey.homePattern} colors={guernsey.homeColors} size={36} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Away Pattern</Label>
                <Select
                  value={guernsey.awayPattern}
                  onValueChange={(v) =>
                    onChange({
                      guernseyStyle: { ...guernsey, awayPattern: v as GuernseyPattern },
                    })
                  }
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {GUERNSEY_PATTERNS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input
                    type="color"
                    className="h-8 w-12"
                    value={guernsey.awayColors[0]}
                    onChange={(e) =>
                      onChange({
                        guernseyStyle: { ...guernsey, awayColors: [e.target.value, guernsey.awayColors[1]] },
                      })
                    }
                  />
                  <Input
                    type="color"
                    className="h-8 w-12"
                    value={guernsey.awayColors[1]}
                    onChange={(e) =>
                      onChange({
                        guernseyStyle: { ...guernsey, awayColors: [guernsey.awayColors[0], e.target.value] },
                      })
                    }
                  />
                  <GuernseyPreview pattern={guernsey.awayPattern} colors={guernsey.awayColors} size={36} />
                </div>
              </div>
            </div>
          </section>

          {/* Grounds */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Grounds</h4>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Home Ground</Label>
                <Input value={team.homeGround} onChange={(e) => onChange({ homeGround: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Secondary Home Grounds</Label>
                <div className="flex flex-wrap gap-1">
                  {team.secondaryHomeGrounds.map((g, i) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                      {g}
                      <button
                        type="button"
                        className="hover:text-destructive"
                        onClick={() =>
                          onChange({
                            secondaryHomeGrounds: team.secondaryHomeGrounds.filter((_, idx) => idx !== i),
                          })
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="Add ground..."
                    value={newGround}
                    onChange={(e) => setNewGround(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newGround.trim()) {
                        onChange({
                          secondaryHomeGrounds: [...team.secondaryHomeGrounds, newGround.trim()],
                        })
                        setNewGround('')
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!newGround.trim()}
                    onClick={() => {
                      onChange({
                        secondaryHomeGrounds: [...team.secondaryHomeGrounds, newGround.trim()],
                      })
                      setNewGround('')
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          </section>

          {/* Rivalries */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Rivalries</h4>
            <div className="flex flex-wrap gap-1">
              {team.rivalryClubIds.map((rid) => {
                const rival = allTeams.find((t) => t.id === rid)
                return (
                  <span key={rid} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                    {rival?.name ?? rid}
                    <button
                      type="button"
                      className="hover:text-destructive"
                      onClick={() =>
                        onChange({
                          rivalryClubIds: team.rivalryClubIds.filter((id) => id !== rid),
                        })
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                )
              })}
            </div>
            {availableRivals.length > 0 && (
              <div className="flex gap-2">
                <Select value={newRivalId} onValueChange={setNewRivalId}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Add rival..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRivals.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!newRivalId}
                  onClick={() => {
                    if (newRivalId) {
                      onChange({
                        rivalryClubIds: [...team.rivalryClubIds, newRivalId],
                      })
                      setNewRivalId('')
                    }
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </section>

          {/* Notes */}
          <section className="space-y-3">
            <h4 className="text-sm font-semibold text-muted-foreground">Notes</h4>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={3}
              value={team.notes}
              onChange={(e) => onChange({ notes: e.target.value })}
              placeholder="Club history, notes, etc."
            />
          </section>

          {/* Financials & Popularity */}
          {showFinancials && (
            <section className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Financials & Popularity</h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">Revenue</Label>
                  <Input
                    value={formatMoney(team.finances.revenue)}
                    onChange={(e) =>
                      onChange({ finances: { ...team.finances, revenue: parseMoney(e.target.value) } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Expenses</Label>
                  <Input
                    value={formatMoney(team.finances.expenses)}
                    onChange={(e) =>
                      onChange({ finances: { ...team.finances, expenses: parseMoney(e.target.value) } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Balance</Label>
                  <Input
                    value={formatMoney(team.finances.balance)}
                    onChange={(e) =>
                      onChange({ finances: { ...team.finances, balance: parseMoney(e.target.value) } })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tier</Label>
                  <Select
                    value={team.tier}
                    onValueChange={(v) => onChange({ tier: v as 'large' | 'medium' | 'small' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="large">Large</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="small">Small</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Fan Satisfaction</Label>
                  <span className="text-xs text-muted-foreground">{team.fanSatisfaction}</span>
                </div>
                <Slider
                  value={[team.fanSatisfaction]}
                  min={0}
                  max={100}
                  step={1}
                  onValueChange={([v]) => onChange({ fanSatisfaction: v })}
                />
              </div>
            </section>
          )}
        </CardContent>
      )}
    </Card>
  )
}
