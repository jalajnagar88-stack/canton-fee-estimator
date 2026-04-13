import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './components/ui/card';
import { Badge } from './components/ui/badge';

// Represents a single data point in the fee history, likely tied to a specific
// commit or version of the Daml model.
export interface FeeHistoryPoint {
  version: string; // e.g., git commit hash or version tag like "v1.2.3"
  date: string; // ISO 8601 date string, e.g., "2024-05-21"
  createFee: number; // Estimated fee for a 'create' transaction in USD
  exerciseFee: number; // Estimated fee for a key 'exercise' transaction in USD
  archiveFee: number; // Estimated fee for an 'archive' transaction in USD
  payloadSize: number; // Payload size in bytes, a key driver of fees
}

interface FeeTrendProps {
  data: FeeHistoryPoint[];
  title?: string;
}

const formatCurrency = (value: number) => `$${value.toFixed(6)}`;
const formatBytes = (value: number) => `${value} B`;

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload as FeeHistoryPoint;
    return (
      <div className="bg-background p-3 border border-border rounded-lg shadow-lg">
        <p className="font-bold text-foreground">{`Version: ${label}`}</p>
        <p className="text-sm text-muted-foreground">{`Date: ${new Date(dataPoint.date).toLocaleDateString()}`}</p>
        <hr className="my-2 border-border" />
        <ul className="space-y-1">
          {payload.map((p: any) => (
            <li key={p.dataKey} style={{ color: p.color }} className="text-sm">
              {`${p.name}: `}
              <strong>
                {p.dataKey === 'payloadSize' ? formatBytes(p.value) : formatCurrency(p.value)}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
};


/**
 * FeeTrend component visualizes the evolution of estimated Canton transaction fees
 * over different versions of a Daml contract. It helps developers understand the
 * cost implications of their model changes.
 */
const FeeTrend: React.FC<FeeTrendProps> = ({ data, title = "Transaction Fee Evolution" }) => {

  if (!data || data.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Tracking estimated fees across contract versions.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-80">
          <p className="text-muted-foreground">
            {data && data.length > 0 ? "Need at least two data points to show a trend." : "No historical data available."}
          </p>
        </CardContent>
      </Card>
    );
  }

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];
  const createChange = ((lastPoint.createFee - firstPoint.createFee) / firstPoint.createFee) * 100;

  const getChangeBadge = (change: number) => {
    if (isNaN(change) || Math.abs(change) < 0.01) {
      return <Badge variant="secondary">No Change</Badge>;
    }
    const isIncrease = change > 0;
    return (
      <Badge variant={isIncrease ? 'destructive' : 'default'} className={!isIncrease ? 'bg-green-600 hover:bg-green-700 text-white' : ''}>
        {isIncrease ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%
      </Badge>
    );
  };


  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-start">
            <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription>
                    Tracking estimated fees across contract versions.
                </CardDescription>
            </div>
            <div className="flex flex-col items-end space-y-1 text-right">
                <span className="text-xs text-muted-foreground">
                    Create Fee Change since <span className="font-mono">{firstPoint.version.substring(0,7)}</span>
                </span>
                {getChangeBadge(createChange)}
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="w-full h-96">
            <ResponsiveContainer>
                <LineChart
                data={data}
                margin={{
                    top: 5,
                    right: 30,
                    left: 50, // Increased for y-axis label
                    bottom: 30, // Increased for angled x-axis labels
                }}
                >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                    dataKey="version" 
                    tickFormatter={(tick) => tick.substring(0, 7)}
                    angle={-45}
                    textAnchor="end"
                    height={70}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    label={{ value: 'Contract Version (Commit)', position: 'insideBottom', offset: -10, fill: 'hsl(var(--foreground))' }}
                />
                <YAxis 
                    yAxisId="left"
                    tickFormatter={(value) => formatCurrency(Number(value))}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    label={{ value: 'Estimated Fee (USD)', angle: -90, position: 'insideLeft', offset: -40, fill: 'hsl(var(--foreground))' }}
                    domain={['dataMin', 'dataMax']}
                />
                <YAxis 
                    yAxisId="right"
                    orientation="right"
                    tickFormatter={(value) => formatBytes(Number(value))}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    label={{ value: 'Payload Size (Bytes)', angle: 90, position: 'insideRight', offset: -20, fill: 'hsl(var(--foreground))' }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend verticalAlign="top" wrapperStyle={{paddingBottom: '20px'}}/>
                
                <ReferenceLine yAxisId="left" stroke="hsl(var(--border))" />

                <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="createFee"
                    name="Create Fee"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                    activeDot={{ r: 6, stroke: 'hsl(var(--primary))' }}
                />
                <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="exerciseFee"
                    name="Exercise Fee"
                    stroke="#16a34a" // green-600
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                    activeDot={{ r: 6, stroke: '#16a34a' }}
                />
                <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="archiveFee"
                    name="Archive Fee"
                    stroke="#dc2626" // red-600
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                    activeDot={{ r: 6, stroke: '#dc2626' }}
                />
                <Line
                    yAxisId="right"
                    type="step"
                    dataKey="payloadSize"
                    name="Payload Size"
                    stroke="hsl(var(--muted-foreground))"
                    strokeDasharray="3 3"
                    strokeOpacity={0.8}
                    dot={false}
                />
                </LineChart>
            </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

export default FeeTrend;