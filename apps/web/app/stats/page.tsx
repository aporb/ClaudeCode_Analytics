import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTokensPerDay, getTopTools, getCostByProject } from '@/lib/queries'
import { TokensOverTime } from '@/components/charts/TokensOverTime'
import { TopTools } from '@/components/charts/TopTools'
import { CostByProject } from '@/components/charts/CostByProject'

export default async function StatsPage() {
  const [daily, tools, costs] = await Promise.all([
    getTokensPerDay(90),
    getTopTools(30),
    getCostByProject(30),
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
      </div>
    </main>
  )
}
