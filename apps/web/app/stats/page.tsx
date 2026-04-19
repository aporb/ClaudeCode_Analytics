import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTokensPerDay, getTopTools, getCostByProject, getActivityByDay } from '@/lib/queries'
import { TokensOverTime } from '@/components/charts/TokensOverTime'
import { TopTools } from '@/components/charts/TopTools'
import { CostByProject } from '@/components/charts/CostByProject'
import { ActivityHeatmap } from '@/components/charts/ActivityHeatmap'

export default async function StatsPage() {
  const [daily, tools, costs, activity] = await Promise.all([
    getTokensPerDay(90),
    getTopTools(30),
    getCostByProject(30),
    getActivityByDay(91),
  ])
  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Stats</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Tokens per day (last 90 days)</CardTitle>
          </CardHeader>
          <CardContent><TokensOverTime data={daily} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Top tools (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent><TopTools data={tools} /></CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Cost by project (last 30 days)</CardTitle>
          </CardHeader>
          <CardContent><CostByProject data={costs} /></CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base font-medium">Activity (last 13 weeks)</CardTitle>
          </CardHeader>
          <CardContent><ActivityHeatmap data={activity} /></CardContent>
        </Card>
      </div>
    </main>
  )
}
