import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getTokensPerDay } from '@/lib/queries'
import { TokensOverTime } from '@/components/charts/TokensOverTime'

export default async function StatsPage() {
  const daily = await getTokensPerDay(90)
  return (
    <main>
      <h1 className="text-xl font-semibold mb-6">Stats</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">Tokens per day (last 90 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <TokensOverTime data={daily} />
        </CardContent>
      </Card>
    </main>
  )
}
