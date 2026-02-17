import { useMemo } from 'react'
import { useGameStore } from '@/stores/gameStore'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

function urgencyBadgeClass(urgency: 'low' | 'medium' | 'high'): string {
  if (urgency === 'high') return 'bg-red-500/15 text-red-400 border-red-500/40'
  if (urgency === 'medium') return 'bg-amber-500/15 text-amber-400 border-amber-500/40'
  return 'bg-blue-500/15 text-blue-400 border-blue-500/40'
}

export function CoachingJobsPage() {
  const manager = useGameStore((s) => s.manager)
  const clubs = useGameStore((s) => s.clubs)
  const openings = useGameStore((s) => s.coachingJobMarket)
  const applyForCoachingJob = useGameStore((s) => s.applyForCoachingJob)

  const openJobs = useMemo(
    () => openings.filter((job) => job.status === 'open'),
    [openings],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Coaching Job Market</h1>
        <p className="text-sm text-muted-foreground">
          {manager.name} is unemployed. Apply for open senior coaching roles.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Career Status</CardTitle>
          <CardDescription>
            Reputation {manager.reputation} | Job Security {manager.jobSecurity}%
          </CardDescription>
        </CardHeader>
      </Card>

      {openJobs.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            No open jobs right now. Advance time to trigger new board reviews and vacancies.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {openJobs.map((job) => {
            const club = clubs[job.clubId]
            return (
              <Card key={job.id}>
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">{club?.fullName ?? job.clubId}</p>
                      <Badge variant="outline" className={urgencyBadgeClass(job.urgency)}>
                        {job.urgency}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{job.reason}</p>
                  </div>
                  <Button onClick={() => applyForCoachingJob(job.id)}>Apply</Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
