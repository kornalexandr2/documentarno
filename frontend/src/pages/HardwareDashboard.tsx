import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { getErrorMessage } from '../api/client';
import { getMetricsHistory, getWebSocketUrl } from '../api/system';

interface MetricPoint {
  time: string;
  cpu: number;
  ram: number;
  gpu: number;
  vramUsed: number;
  vramTotal: number;
  sysDiskUsed: number;
  sysDiskTotal: number;
  srcDiskUsed: number;
  srcDiskTotal: number;
}

interface LiveMetricPayload {
  recorded_at: string;
  cpu_usage_percent: number;
  ram_usage_percent: number;
  gpu_utilization_percent: number | null;
  vram_used_mb: number | null;
  vram_total_mb: number | null;
  disk_system_used_gb: number;
  disk_system_total_gb: number;
  disk_source_used_gb: number;
  disk_source_total_gb: number;
}

const HardwareDashboard: React.FC = () => {
  const { t } = useTranslation();
  const [liveMode, setLiveMode] = useState(true);
  const [historyPeriod, setHistoryPeriod] = useState<'1h' | '24h' | '7d'>('24h');
  const [data, setData] = useState<MetricPoint[]>([]);
  const [currentMetrics, setCurrentMetrics] = useState<MetricPoint | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = liveMode ? getWebSocketUrl() : null;
  const authError = liveMode && !wsUrl ? t('common.error', 'Authentication is required to connect to metrics') : null;

  useEffect(() => {
    if (!liveMode) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      let cancelled = false;
      getMetricsHistory(historyPeriod)
        .then((history) => {
          if (cancelled) {
            return;
          }

          const formattedHistory: MetricPoint[] = history.map((item) => ({
            time: new Date(item.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            cpu: item.cpu,
            ram: item.ram,
            gpu: item.gpu || 0,
            vramUsed: item.vram_used || 0,
            vramTotal: item.vram_total || 0,
            sysDiskUsed: item.disk_system_used_gb,
            sysDiskTotal: item.disk_system_total_gb,
            srcDiskUsed: item.disk_source_used_gb,
            srcDiskTotal: item.disk_source_total_gb,
          }));

          setData(formattedHistory);
          setCurrentMetrics(formattedHistory.at(-1) ?? null);
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setError(getErrorMessage(err, t('common.error', 'Failed to load metrics history')));
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (!wsUrl) {
      return;
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const metrics = JSON.parse(event.data) as LiveMetricPayload;
        const formatted: MetricPoint = {
          time: new Date(metrics.recorded_at).toLocaleTimeString(),
          cpu: metrics.cpu_usage_percent,
          ram: metrics.ram_usage_percent,
          gpu: metrics.gpu_utilization_percent || 0,
          vramUsed: metrics.vram_used_mb || 0,
          vramTotal: metrics.vram_total_mb || 0,
          sysDiskUsed: metrics.disk_system_used_gb,
          sysDiskTotal: metrics.disk_system_total_gb,
          srcDiskUsed: metrics.disk_source_used_gb,
          srcDiskTotal: metrics.disk_source_total_gb,
        };

        setCurrentMetrics(formatted);
        setData((prev) => {
          const next = [...prev, formatted];
          return next.length > 60 ? next.slice(next.length - 60) : next;
        });
      } catch (parseError) {
        console.error('Failed to parse WS message', parseError);
      }
    };

    ws.onerror = () => {
      setError(t('common.error', 'Failed to connect to metrics stream'));
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [historyPeriod, liveMode, t, wsUrl]);

  const switchToLiveMode = () => {
    setError(null);
    setData([]);
    setCurrentMetrics(null);
    setLiveMode(true);
  };

  const switchToHistoryMode = (period: '1h' | '24h' | '7d') => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setError(null);
    setData([]);
    setCurrentMetrics(null);
    setLiveMode(false);
    setHistoryPeriod(period);
  };

  const renderGauge = (title: string, value: number, warningThreshold = 80, criticalThreshold = 95) => {
    let colorClass = 'text-green-400';
    if (value >= criticalThreshold) colorClass = 'text-red-500';
    else if (value >= warningThreshold) colorClass = 'text-yellow-400';

    return (
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h3 className="text-gray-400 text-sm font-medium mb-1">{title}</h3>
        <div className={`text-3xl font-bold ${colorClass}`}>
          {value.toFixed(1)}%
        </div>
      </div>
    );
  };

  const renderDiskBar = (title: string, used: number, total: number, warningPercent = 85, criticalPercent = 95) => {
    const percent = total > 0 ? (used / total) * 100 : 0;
    let barColor = 'bg-blue-500';
    if (percent >= criticalPercent) barColor = 'bg-red-500';
    else if (percent >= warningPercent) barColor = 'bg-yellow-500';

    return (
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 col-span-2 md:col-span-1">
        <div className="flex justify-between mb-1">
          <span className="text-sm font-medium text-white">{title}</span>
          <span className="text-sm font-medium text-white">{used.toFixed(1)} / {total.toFixed(1)} GB ({percent.toFixed(1)}%)</span>
        </div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div className={`h-2.5 rounded-full ${barColor}`} style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
      </div>
    );
  };

  const displayError = authError ?? error;

  return (
    <div className="p-6 text-white h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{t('hardware.title', 'Hardware Dashboard')}</h1>

        <div className="flex space-x-2 bg-gray-800 p-1 rounded-lg">
          <button
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${liveMode ? 'bg-red-600 shadow-lg shadow-red-900/50' : 'hover:bg-gray-700'}`}
            onClick={switchToLiveMode}
          >
            ● {t('hardware.live', 'Live')}
          </button>
          <button
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${!liveMode && historyPeriod === '1h' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            onClick={() => switchToHistoryMode('1h')}
          >
            {t('hardware.1h', '1 Hour')}
          </button>
          <button
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${!liveMode && historyPeriod === '24h' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            onClick={() => switchToHistoryMode('24h')}
          >
            {t('hardware.24h', '24 Hours')}
          </button>
          <button
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${!liveMode && historyPeriod === '7d' ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
            onClick={() => switchToHistoryMode('7d')}
          >
            {t('hardware.7d', '7 Days')}
          </button>
        </div>
      </div>

      {displayError && (
        <div className="mb-4 p-4 text-red-300 bg-red-900/40 border border-red-800 rounded">
          {displayError}
        </div>
      )}

      {currentMetrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {renderGauge(t('hardware.cpu', 'CPU Usage'), currentMetrics.cpu, 80, 95)}
          {renderGauge(t('hardware.ram', 'RAM Usage'), currentMetrics.ram, 85, 95)}
          {renderGauge(t('hardware.gpu', 'GPU Utilization'), currentMetrics.gpu, 85, 95)}
          {renderGauge(t('hardware.vram', 'VRAM Usage'), currentMetrics.vramTotal > 0 ? (currentMetrics.vramUsed / currentMetrics.vramTotal) * 100 : 0, 85, 95)}

          {renderDiskBar(t('hardware.sys_disk', 'System Disk (DB & Index)'), currentMetrics.sysDiskUsed, currentMetrics.sysDiskTotal, 85, 95)}
          {renderDiskBar(t('hardware.src_disk', 'Source Disk (PDF Originals)'), currentMetrics.srcDiskUsed, currentMetrics.srcDiskTotal, 90, 98)}
        </div>
      )}

      <div className="flex-1 bg-gray-800 rounded-lg border border-gray-700 p-4 min-h-[300px]">
        <h3 className="text-gray-400 mb-4 font-medium">{t('hardware.chart_title', 'Resource Utilization Over Time')}</h3>
        <ResponsiveContainer width="100%" height="90%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis dataKey="time" stroke="#9CA3AF" fontSize={12} tickMargin={10} />
            <YAxis stroke="#9CA3AF" fontSize={12} domain={[0, 100]} />
            <Tooltip
              contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151', color: '#fff' }}
              itemStyle={{ color: '#fff' }}
            />
            <Area type="monotone" dataKey="cpu" name="CPU %" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.1} />
            <Area type="monotone" dataKey="ram" name="RAM %" stroke="#10B981" fill="#10B981" fillOpacity={0.1} />
            <Area type="monotone" dataKey="gpu" name="GPU %" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.1} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default HardwareDashboard;
