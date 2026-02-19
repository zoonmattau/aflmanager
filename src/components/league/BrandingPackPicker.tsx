/**
 * BrandingPackPicker
 *
 * A dialog that lets the user browse the four themed branding packs and
 * apply one to the current custom league template.
 *
 * Usage:
 *   <BrandingPackPicker onApply={(template) => { ... }} />
 */
import { useState } from 'react'
import { Layers, ChevronDown, ChevronUp, CheckCircle2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { BRANDING_TEMPLATE_PACKS } from '@/data/brandingTemplatePacks'
import { applyBrandingPack } from '@/engine/league/applyBrandingPack'
import type { BrandingPack } from '@/types/brandingPack'
import type { CustomLeagueTemplate } from '@/types/customLeague'

// ---------------------------------------------------------------------------
// Colour swatch for a team
// ---------------------------------------------------------------------------

function TeamSwatch({ colors, name }: { colors: { primary: string; secondary: string }; name: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <div className="flex flex-shrink-0 overflow-hidden rounded-sm border border-border" style={{ width: 20, height: 16 }}>
        <div style={{ width: '50%', background: colors.primary }} />
        <div style={{ width: '50%', background: colors.secondary }} />
      </div>
      <span className="truncate text-xs text-muted-foreground">{name}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PackCard
// ---------------------------------------------------------------------------

interface PackCardProps {
  pack: BrandingPack
  isSelected: boolean
  onSelect: () => void
}

function PackCard({ pack, isSelected, onSelect }: PackCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'relative w-full rounded-lg border-2 text-left transition-all',
        'hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected
          ? 'border-primary shadow-md'
          : 'border-border hover:border-muted-foreground',
      ].join(' ')}
    >
      {/* Accent bar */}
      <div
        className="h-1.5 w-full rounded-t-md"
        style={{ background: pack.accentColor }}
      />

      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-sm leading-tight">{pack.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{pack.tagline}</p>
          </div>
          {isSelected && (
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary mt-0.5" />
          )}
        </div>

        <div className="mt-2 flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{pack.era}</Badge>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{pack.recommendedTeamCount} teams</Badge>
        </div>

        {/* Top 6 colour swatches */}
        <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1">
          {pack.teams.slice(0, 6).map((team) => (
            <TeamSwatch key={team.id} colors={team.colors} name={team.name} />
          ))}
          {pack.teams.length > 6 && (
            <span className="col-span-2 text-[10px] text-muted-foreground mt-0.5">
              + {pack.teams.length - 6} more teams
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// PackDetail — expanded view for the selected pack
// ---------------------------------------------------------------------------

interface PackDetailProps {
  pack: BrandingPack
  teamCount: number
  onTeamCountChange: (n: number) => void
}

function PackDetail({ pack, teamCount, onTeamCountChange }: PackDetailProps) {
  const [showAll, setShowAll] = useState(false)
  const displayTeams = pack.teams.slice(0, teamCount)
  const visibleTeams = showAll ? displayTeams : displayTeams.slice(0, 10)

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      {/* Pack description */}
      <p className="text-sm text-muted-foreground">{pack.description}</p>

      {/* Naming convention + logo style */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-md bg-muted p-2.5">
          <p className="font-medium text-foreground mb-0.5">Naming style</p>
          <p className="text-muted-foreground">{pack.namingConvention}</p>
        </div>
        <div className="rounded-md bg-muted p-2.5">
          <p className="font-medium text-foreground mb-0.5">Visual identity</p>
          <p className="text-muted-foreground">{pack.logoStyle}</p>
        </div>
      </div>

      {/* Team count picker */}
      <div className="flex items-center gap-3">
        <Label className="flex-shrink-0 text-sm">Teams</Label>
        <Input
          type="number"
          min={pack.minTeams}
          max={pack.maxTeams}
          value={teamCount}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10)
            if (!isNaN(v)) {
              onTeamCountChange(Math.min(pack.maxTeams, Math.max(pack.minTeams, v)))
            }
          }}
          className="w-20 h-8 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {pack.minTeams}–{pack.maxTeams} supported, {pack.recommendedTeamCount} recommended
        </span>
      </div>

      {/* Team roster preview */}
      <div>
        <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
          Team Roster ({teamCount} clubs)
        </p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
          {visibleTeams.map((team) => (
            <div key={team.id} className="flex items-center gap-1.5 min-w-0">
              {/* Guernsey mini-preview */}
              <div
                className="flex-shrink-0 rounded-sm border border-border overflow-hidden"
                style={{ width: 24, height: 18 }}
              >
                <div style={{ width: '50%', height: '100%', float: 'left', background: team.colors.primary }} />
                <div style={{ width: '50%', height: '100%', float: 'left', background: team.colors.secondary }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{team.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{team.homeVenue}</p>
              </div>
            </div>
          ))}
        </div>
        {displayTeams.length > 10 && (
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {showAll
              ? <><ChevronUp className="h-3 w-3" /> Show fewer</>
              : <><ChevronDown className="h-3 w-3" /> Show all {displayTeams.length} clubs</>
            }
          </button>
        )}
      </div>

      {/* Rivalries preview */}
      {pack.prominentRivalries.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Key Rivalries
          </p>
          <div className="flex flex-wrap gap-1.5">
            {pack.prominentRivalries
              .filter((rivalry) => {
                const ids = new Set(displayTeams.map((t) => t.id))
                return ids.has(rivalry.teamIds[0]) && ids.has(rivalry.teamIds[1])
              })
              .map((rivalry) => {
                const [a, b] = rivalry.teamIds
                const teamA = pack.teams.find((t) => t.id === a)
                const teamB = pack.teams.find((t) => t.id === b)
                return (
                  <Badge key={`${a}-${b}`} variant="outline" className="text-[10px] gap-1">
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ background: teamA?.colors.primary }}
                    />
                    {teamA?.name} vs {teamB?.name}
                    <span
                      className="inline-block w-2 h-2 rounded-sm"
                      style={{ background: teamB?.colors.primary }}
                    />
                    {rivalry.label && (
                      <span className="text-muted-foreground">· {rivalry.label}</span>
                    )}
                  </Badge>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface BrandingPackPickerProps {
  onApply: (template: CustomLeagueTemplate) => void
}

export function BrandingPackPicker({ onApply }: BrandingPackPickerProps) {
  const [open, setOpen] = useState(false)
  const [selectedPack, setSelectedPack] = useState<BrandingPack>(BRANDING_TEMPLATE_PACKS[0])
  const [teamCount, setTeamCount] = useState(BRANDING_TEMPLATE_PACKS[0].recommendedTeamCount)
  const [templateName, setTemplateName] = useState('')

  const handleSelectPack = (pack: BrandingPack) => {
    setSelectedPack(pack)
    setTeamCount(pack.recommendedTeamCount)
    setTemplateName('')
  }

  const handleApply = () => {
    const template = applyBrandingPack(selectedPack, {
      teamCount,
      templateName: templateName.trim() || undefined,
    })
    onApply(template)
    setOpen(false)
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Sparkles className="mr-1.5 h-3.5 w-3.5" />
        Quick Start from Pack
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Branding Template Packs
            </DialogTitle>
            <DialogDescription>
              Choose a themed pack to instantly generate a complete league with preset clubs,
              colours, venues, and rivalries. You can customise every detail afterward.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Pack grid */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {BRANDING_TEMPLATE_PACKS.map((pack) => (
                <PackCard
                  key={pack.id}
                  pack={pack}
                  isSelected={selectedPack.id === pack.id}
                  onSelect={() => handleSelectPack(pack)}
                />
              ))}
            </div>

            {/* Detail panel */}
            <PackDetail
              pack={selectedPack}
              teamCount={teamCount}
              onTeamCountChange={(n) => setTeamCount(n)}
            />

            {/* Template name override */}
            <div className="flex items-center gap-3">
              <Label className="flex-shrink-0 text-sm" htmlFor="pack-template-name">
                Template name
              </Label>
              <Input
                id="pack-template-name"
                placeholder={`${selectedPack.name} League`}
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApply}>
              <Sparkles className="mr-1.5 h-4 w-4" />
              Apply Pack — {teamCount} Clubs
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
