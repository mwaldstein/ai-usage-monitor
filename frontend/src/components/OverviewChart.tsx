import type { ServiceStatus } from '../types'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts'

interface OverviewChartProps {
  statuses: ServiceStatus[]
}

export function OverviewChart({ statuses }: OverviewChartProps) {
  // Aggregate quota data by provider
  const data = statuses
    .map((status) => {
      const totalUsed = status.quotas.reduce((sum, q) => sum + q.used, 0)
      const totalLimit = status.quotas.reduce((sum, q) => sum + q.limit, 0)
      return {
        name: status.service.name,
        used: totalUsed,
        limit: totalLimit,
        remaining: totalLimit - totalUsed,
      }
    })
    .filter((d) => d.limit > 0)

  const COLORS = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#EF4444',
    '#8B5CF6',
    '#EC4899',
    '#06B6D4',
    '#84CC16',
  ]

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">Usage Overview</h3>
        <p className="text-gray-500">No quota data available</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
      <h3 className="text-lg font-semibold mb-4">Usage Overview</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="used"
            >
              {data.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => value.toFixed(2)} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
