import { Cell, Pie, PieChart, Tooltip } from 'recharts';

export type ResponsibilitySliceFilter = 'all' | 'assistant' | 'client' | 'no_reply';

interface ResponsibilityDonutProps {
  assistantCount: number;
  clientCount: number;
  noReplyCount: number;
  activeFilter: string;
  onSelectFilter: (filter: ResponsibilitySliceFilter) => void;
}

interface SliceItem {
  key: 'assistant' | 'client' | 'no_reply';
  name: string;
  shortName: string;
  value: number;
  color: string;
  textClass: string;
  pct: number;
}

interface DonutTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: SliceItem;
  }>;
}

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload || payload.length === 0 || !payload[0]?.payload) {
    return null;
  }
  const item = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-sm text-xs">
      <p className="font-semibold text-slate-900">{item.name}</p>
      <p className="font-mono text-[11px] text-slate-600 tabular-nums mt-0.5">
        {item.value} {item.value === 1 ? 'thread' : 'threads'} ({item.pct}%)
      </p>
    </div>
  );
}

export function ResponsibilityDonut({
  assistantCount,
  clientCount,
  noReplyCount,
  activeFilter,
  onSelectFilter,
}: ResponsibilityDonutProps) {
  const total = assistantCount + clientCount + noReplyCount;

  const slices: SliceItem[] = [
    {
      key: 'assistant',
      name: 'Assistant to Reply',
      shortName: 'Assistant',
      value: assistantCount,
      color: '#1D4ED8',
      textClass: 'text-blue-700',
      pct: total > 0 ? Math.round((assistantCount / total) * 100) : 0,
    },
    {
      key: 'client',
      name: 'Client to Reply',
      shortName: 'Client',
      value: clientCount,
      color: '#D97706',
      textClass: 'text-amber-700',
      pct: total > 0 ? Math.round((clientCount / total) * 100) : 0,
    },
    {
      key: 'no_reply',
      name: 'No Reply Needed',
      shortName: 'None',
      value: noReplyCount,
      color: '#64748B',
      textClass: 'text-slate-600',
      pct: total > 0 ? Math.round((noReplyCount / total) * 100) : 0,
    },
  ];

  const nonZeroSlices = slices.filter((s) => s.value > 0);
  const activeSlice = slices.find((s) => s.key === activeFilter);

  const handleToggle = (key: 'assistant' | 'client' | 'no_reply') => {
    onSelectFilter(activeFilter === key ? 'all' : key);
  };

  return (
    <div className="px-4 py-2.5 flex items-center gap-4 bg-white">
      {/* Donut Visualization */}
      <div className="relative w-[88px] h-[88px] shrink-0 flex items-center justify-center">
        {total === 0 ? (
          <div className="w-[80px] h-[80px] rounded-full border-[10px] border-slate-100 flex items-center justify-center">
            <span className="font-mono text-xs font-semibold text-slate-400 tabular-nums">
              0
            </span>
          </div>
        ) : (
          <>
            <PieChart width={88} height={88}>
              <Pie
                data={nonZeroSlices}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={27}
                outerRadius={40}
                paddingAngle={nonZeroSlices.length > 1 ? 2 : 0}
                stroke="none"
                isAnimationActive={false}
                onClick={(_data, index) => {
                  const target = nonZeroSlices[index];
                  if (target) handleToggle(target.key);
                }}
              >
                {nonZeroSlices.map((entry) => {
                  const isDimmed =
                    Boolean(activeSlice) && activeSlice?.key !== entry.key;
                  return (
                    <Cell
                      key={entry.key}
                      fill={entry.color}
                      fillOpacity={isDimmed ? 0.28 : 1}
                      className="cursor-pointer outline-none"
                    />
                  );
                })}
              </Pie>
              <Tooltip
                content={<DonutTooltip />}
                wrapperStyle={{ zIndex: 30, pointerEvents: 'none' }}
              />
            </PieChart>
            {/* Center Readout */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums leading-none">
                {activeSlice ? activeSlice.value : total}
              </span>
              <span className="text-[9px] font-medium text-slate-500 mt-0.5 leading-none">
                {activeSlice ? activeSlice.shortName : 'Active'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Interactive Breakdown Legend */}
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="text-[11px] font-semibold text-slate-500 truncate">
            Email Responsibility
          </span>
          {activeSlice && (
            <button
              type="button"
              onClick={() => onSelectFilter('all')}
              className="text-[11px] font-medium text-blue-700 hover:underline whitespace-nowrap shrink-0"
            >
              Reset
            </button>
          )}
        </div>

        <div className="space-y-0.5">
          {slices.map((s) => {
            const isSelected = activeFilter === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => handleToggle(s.key)}
                className={`w-full flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-slate-100 font-semibold'
                    : 'hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-xs shrink-0"
                    style={{ backgroundColor: s.color }}
                  />
                  <span className={`truncate ${s.textClass} font-medium`}>
                    {s.shortName}
                  </span>
                </span>
                <span className="font-mono text-[11px] text-slate-600 tabular-nums shrink-0">
                  {s.value}{' '}
                  <span className="text-slate-400">({s.pct}%)</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
