import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { useGameStore } from '@/stores/gameStore'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PlayerPicker } from '@/components/compare/PlayerPicker'
import { CompareOverview } from '@/components/compare/CompareOverview'
import { CompareAttributes } from '@/components/compare/CompareAttributes'
import { CompareStats } from '@/components/compare/CompareStats'
import { CompareContract } from '@/components/compare/CompareContract'
import { CompareRoleFit } from '@/components/compare/CompareRoleFit'
import { CompareDevelopment } from '@/components/compare/CompareDevelopment'

export function PlayerComparisonPage() {
  const { playerAId: paramA, playerBId: paramB } = useParams<{ playerAId?: string; playerBId?: string }>()
  const players = useGameStore((s) => s.players)
  const clubs = useGameStore((s) => s.clubs)

  const [selectedA, setSelectedA] = useState<string | null>(paramA ?? null)
  const [selectedB, setSelectedB] = useState<string | null>(paramB ?? null)

  const playerA = selectedA ? players[selectedA] : null
  const playerB = selectedB ? players[selectedB] : null

  function handleSwap() {
    setSelectedA(selectedB)
    setSelectedB(selectedA)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">Compare Players</h1>
      </div>

      {/* Player pickers */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <PlayerPicker
            selectedPlayerId={selectedA}
            onSelect={setSelectedA}
            excludePlayerId={selectedB}
            players={players}
            clubs={clubs}
            label="Select Player A"
          />
        </div>
        <Button variant="outline" size="icon" onClick={handleSwap} disabled={!selectedA && !selectedB}>
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <PlayerPicker
            selectedPlayerId={selectedB}
            onSelect={setSelectedB}
            excludePlayerId={selectedA}
            players={players}
            clubs={clubs}
            label="Select Player B"
          />
        </div>
      </div>

      {/* Content */}
      {playerA && playerB ? (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="attributes">Attributes</TabsTrigger>
            <TabsTrigger value="stats">Stats</TabsTrigger>
            <TabsTrigger value="contract">Contract</TabsTrigger>
            <TabsTrigger value="role-fit">Role Fit</TabsTrigger>
            <TabsTrigger value="development">Development</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <CompareOverview playerA={playerA} playerB={playerB} clubs={clubs} />
          </TabsContent>
          <TabsContent value="attributes">
            <CompareAttributes playerA={playerA} playerB={playerB} />
          </TabsContent>
          <TabsContent value="stats">
            <CompareStats playerA={playerA} playerB={playerB} />
          </TabsContent>
          <TabsContent value="contract">
            <CompareContract playerA={playerA} playerB={playerB} />
          </TabsContent>
          <TabsContent value="role-fit">
            <CompareRoleFit playerA={playerA} playerB={playerB} />
          </TabsContent>
          <TabsContent value="development">
            <CompareDevelopment playerA={playerA} playerB={playerB} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">Select two players to compare them side-by-side.</p>
        </div>
      )}
    </div>
  )
}
