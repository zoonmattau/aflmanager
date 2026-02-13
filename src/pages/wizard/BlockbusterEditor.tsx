import type { BlockbusterMatch } from '@/types/game'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface BlockbusterEditorProps {
  blockbusters: BlockbusterMatch[]
  onChange: (blockbusters: BlockbusterMatch[]) => void
}

export function BlockbusterEditor({ blockbusters, onChange }: BlockbusterEditorProps) {
  const toggleBlockbuster = (id: string) => {
    onChange(
      blockbusters.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)),
    )
  }

  const updateBlockbuster = (id: string, updates: Partial<BlockbusterMatch>) => {
    onChange(
      blockbusters.map((b) => (b.id === id ? { ...b, ...updates } : b)),
    )
  }

  // Group by type
  const events = blockbusters.filter((b) => b.type === 'event')
  const derbies = blockbusters.filter((b) => b.type === 'derby')
  // Deduplicate derbies by name (show once per rivalry pair)
  const uniqueDerbies: BlockbusterMatch[] = []
  const seenDerbyNames = new Set<string>()
  for (const d of derbies) {
    if (!seenDerbyNames.has(d.name)) {
      seenDerbyNames.add(d.name)
      uniqueDerbies.push(d)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-zinc-200">Blockbuster Matches</Label>
        <p className="text-xs text-zinc-500">
          Named events and rivalry matches placed at specific rounds
        </p>
      </div>

      {/* Named Events */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Named Events</p>
        {events.map((bb) => (
          <BlockbusterRow
            key={bb.id}
            blockbuster={bb}
            onToggle={() => toggleBlockbuster(bb.id)}
            onUpdate={(updates) => updateBlockbuster(bb.id, updates)}
          />
        ))}
      </div>

      {/* Derbies */}
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">Interstate Derbies</p>
        {uniqueDerbies.map((bb) => {
          // Find the pair for this derby
          const pair = derbies.filter((d) => d.name === bb.name)
          const allEnabled = pair.every((d) => d.enabled)
          return (
            <div
              key={bb.id}
              className="flex items-center justify-between rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-200">{bb.name}</p>
                <p className="text-xs text-zinc-500">
                  {bb.homeClubId} vs {bb.awayClubId} (x2)
                </p>
              </div>
              <Switch
                checked={allEnabled}
                onCheckedChange={() => {
                  const newEnabled = !allEnabled
                  onChange(
                    blockbusters.map((b) =>
                      b.name === bb.name ? { ...b, enabled: newEnabled } : b,
                    ),
                  )
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function BlockbusterRow({
  blockbuster,
  onToggle,
  onUpdate,
}: {
  blockbuster: BlockbusterMatch
  onToggle: () => void
  onUpdate: (updates: Partial<BlockbusterMatch>) => void
}) {
  return (
    <div className="space-y-2 rounded-md border border-zinc-700 bg-zinc-800/50 px-3 py-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-zinc-200">{blockbuster.name}</p>
          <p className="text-xs text-zinc-500">
            {formatClubId(blockbuster.homeClubId)} vs {formatClubId(blockbuster.awayClubId)}
          </p>
        </div>
        <Switch checked={blockbuster.enabled} onCheckedChange={onToggle} />
      </div>
      {blockbuster.enabled && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs text-zinc-500">Venue</Label>
            <Input
              value={blockbuster.venue}
              onChange={(e) => onUpdate({ venue: e.target.value })}
              className="h-7 border-zinc-600 bg-zinc-700/50 text-xs text-white"
            />
          </div>
          <div className="w-20">
            <Label className="text-xs text-zinc-500">Round</Label>
            <Input
              value={blockbuster.targetRound === 'auto' ? '' : blockbuster.targetRound}
              placeholder="Auto"
              onChange={(e) => {
                const val = e.target.value.trim()
                onUpdate({ targetRound: val === '' ? 'auto' : parseInt(val, 10) || 'auto' })
              }}
              className="h-7 border-zinc-600 bg-zinc-700/50 text-xs text-white"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function formatClubId(id: string): string {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}
