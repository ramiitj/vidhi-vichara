import React, { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TranslatedText } from '../contexts/LanguageContext';
import { Scale, Download, ChevronDown, ChevronUp, AlertTriangle, Shield, BookOpen, Gavel } from 'lucide-react';

// Types matching App.tsx
interface DimensionScore {
  score: number;
  rationale: string;
  drift_indicators: string[];
}

interface ProvisionMapping {
  instrument_provision: string;
  act_section: string;
  alignment: 'conforming' | 'exceeding' | 'narrowing' | 'contradicting' | 'not_traceable';
  explanation: string;
}

interface PrecedentCitation {
  case_name: string;
  year: string;
  principle: string;
  applicability: string;
}

type ScoreBand = 'fully_conforming' | 'substantially_conforming' | 'marginal' | 'significantly_drifting' | 'ultra_vires';
type AlertClassification = 'GREEN' | 'AMBER' | 'RED' | 'CRITICAL';

interface DriftResult {
  instrument_profile?: {
    title: string;
    type: string;
    issuing_authority: string;
    date: string;
    gazette_reference?: string;
    enabling_provision: string;
  };
  parent_act?: {
    name: string;
    year: string;
    delegation_clause: string;
    relevant_sections: string[];
  };
  provision_mappings?: ProvisionMapping[];
  precedent_citations?: PrecedentCitation[];
  dimensions?: {
    d1_delegation_scope: DimensionScore;
    d2_substantive_alignment: DimensionScore;
    d3_procedural_mandate: DimensionScore;
    d4_object_purpose: DimensionScore;
    d5_non_contravention: DimensionScore;
    d6_temporal_territorial: DimensionScore;
    d7_reasonableness: DimensionScore;
  };
  overall_score?: number;
  score_band?: ScoreBand;
  alert_classification?: AlertClassification;
  executive_summary: string;
  chain_of_authority: string;
  risk_areas: string[];
  suggestions: string[];
  pdf_overview?: string;
  pdf_statutory_authority?: string;
  pdf_conclusion?: string;
  drift_score: number;
  alignment_status: string;
  changes: string[];
  citations?: { source: string; target: string }[];
  timeline?: { date: string; event: string; drift_impact: string }[];
}

// Helper functions
function getScoreColor(score: number): string {
  if (score >= 90) return '#138808';
  if (score >= 75) return '#2E8B57';
  if (score >= 50) return '#FF9933';
  if (score >= 25) return '#E65100';
  return '#D32F2F';
}

function getScoreBandLabel(score: number): string {
  if (score >= 90) return 'Fully Conforming';
  if (score >= 75) return 'Substantially Conforming';
  if (score >= 50) return 'Marginal / Partially Drifting';
  if (score >= 25) return 'Significantly Drifting';
  return 'Ultra Vires';
}

function getAlertColor(alert: AlertClassification): string {
  const colors: Record<AlertClassification, string> = { GREEN: '#138808', AMBER: '#FF9933', RED: '#D32F2F', CRITICAL: '#8B0000' };
  return colors[alert] || '#FF9933';
}

function getAlertBgColor(alert: AlertClassification): string {
  const colors: Record<AlertClassification, string> = { GREEN: '#13880815', AMBER: '#FF993315', RED: '#D32F2F15', CRITICAL: '#8B000015' };
  return colors[alert] || '#FF993315';
}

function getAlignmentColor(alignment: string): string {
  const colors: Record<string, string> = {
    conforming: '#138808', exceeding: '#FF9933', narrowing: '#E65100', contradicting: '#D32F2F', not_traceable: '#8B0000'
  };
  return colors[alignment] || '#666';
}

function getAlignmentLabel(alignment: string): string {
  const labels: Record<string, string> = {
    conforming: 'Conforming', exceeding: 'Exceeding', narrowing: 'Narrowing', contradicting: 'Contradicting', not_traceable: 'Not Traceable'
  };
  return labels[alignment] || alignment;
}

const DIMENSION_META: { key: string; label: string; shortLabel: string; weight: string }[] = [
  { key: 'd1_delegation_scope', label: 'Delegation Scope Compliance', shortLabel: 'D1: Scope', weight: '20%' },
  { key: 'd2_substantive_alignment', label: 'Substantive Alignment', shortLabel: 'D2: Substance', weight: '20%' },
  { key: 'd3_procedural_mandate', label: 'Procedural Mandate Adherence', shortLabel: 'D3: Procedure', weight: '15%' },
  { key: 'd4_object_purpose', label: 'Object & Purpose Fidelity', shortLabel: 'D4: Purpose', weight: '15%' },
  { key: 'd5_non_contravention', label: 'Non-Contravention', shortLabel: 'D5: Non-Contra.', weight: '15%' },
  { key: 'd6_temporal_territorial', label: 'Temporal/Territorial Compliance', shortLabel: 'D6: Temporal', weight: '5%' },
  { key: 'd7_reasonableness', label: 'Reasonableness', shortLabel: 'D7: Reasonable', weight: '10%' },
];

// ---- 7-Axis Radar Chart (SVG) ----
function SevenAxisRadar({ dimensions }: { dimensions: DriftResult['dimensions'] }) {
  if (!dimensions) return null;
  const scores = DIMENSION_META.map(d => (dimensions as any)[d.key]?.score ?? 0);
  const svgSize = 280;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const maxR = 90;
  const levels = 5;
  const n = 7;
  const angleStep = (2 * Math.PI) / n;
  const startAngle = -Math.PI / 2; // start from top

  const getPoint = (index: number, radius: number) => ({
    x: cx + radius * Math.cos(startAngle + index * angleStep),
    y: cy + radius * Math.sin(startAngle + index * angleStep),
  });

  // Grid levels
  const gridPaths = Array.from({ length: levels }, (_, lvl) => {
    const r = maxR * ((lvl + 1) / levels);
    const points = Array.from({ length: n }, (_, i) => getPoint(i, r));
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';
  });

  // Data polygon
  const dataPoints = scores.map((s, i) => getPoint(i, maxR * Math.min(s / 100, 1)));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z';

  // Average score for color
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const color = getScoreColor(avgScore);

  // Label positions with offset to avoid overlap
  const labelOffset = 18;
  const labels = DIMENSION_META.map((d, i) => {
    const p = getPoint(i, maxR + labelOffset);
    const angle = startAngle + i * angleStep;
    let textAnchor: 'start' | 'middle' | 'end' = 'middle';
    if (Math.cos(angle) > 0.3) textAnchor = 'start';
    else if (Math.cos(angle) < -0.3) textAnchor = 'end';
    return { ...d, x: p.x, y: p.y, textAnchor, score: scores[i] };
  });

  return (
    <div className="w-full flex justify-center">
      <svg
        viewBox={`0 0 ${svgSize} ${svgSize}`}
        className="w-full max-w-[320px] h-auto"
        style={{ overflow: 'visible' }}
      >
        {/* Grid */}
        {gridPaths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#E2DCD0" strokeWidth={0.8} opacity={0.7} />
        ))}
        {/* Axis lines */}
        {Array.from({ length: n }, (_, i) => {
          const p = getPoint(i, maxR);
          return <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="#E2DCD0" strokeWidth={0.8} opacity={0.5} />;
        })}
        {/* Data area */}
        <path d={dataPath} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2.5} />
        {/* Data points */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={4} fill={getScoreColor(scores[i])} stroke="#fff" strokeWidth={1.5} />
        ))}
        {/* Labels */}
        {labels.map((l, i) => (
          <g key={i}>
            <text
              x={l.x}
              y={l.y - 5}
              textAnchor={l.textAnchor}
              fontSize={9}
              fontWeight={700}
              fill="#2C1E16"
              className="select-none"
            >
              {l.shortLabel}
            </text>
            <text
              x={l.x}
              y={l.y + 7}
              textAnchor={l.textAnchor}
              fontSize={9}
              fontWeight={600}
              fill={getScoreColor(l.score)}
              className="select-none"
            >
              {l.score}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

// ---- Dimension Score Card ----
function DimensionCard({ dim, dimData }: { dim: typeof DIMENSION_META[0]; dimData: DimensionScore }) {
  const [expanded, setExpanded] = useState(false);
  const color = getScoreColor(dimData.score);
  const bandLabel = getScoreBandLabel(dimData.score);

  return (
    <div className="bg-white/60 rounded-xl border border-[#E2DCD0] overflow-hidden transition-all hover:shadow-md">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 flex items-center gap-3 text-left"
      >
        {/* Score circle */}
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 font-black text-sm border-2"
          style={{ borderColor: color, color, backgroundColor: `${color}10` }}
        >
          {dimData.score}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[#2C1E16] text-sm">{dim.label}</span>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: `${color}15`, color }}>
              {dim.weight}
            </span>
          </div>
          <p className="text-xs mt-0.5 truncate" style={{ color }}>{bandLabel}</p>
        </div>
        {/* Score bar */}
        <div className="w-20 sm:w-28 h-2 bg-[#E8E2D2] rounded-full overflow-hidden shrink-0 hidden sm:block">
          <div className="h-full rounded-full transition-all" style={{ width: `${dimData.score}%`, backgroundColor: color }} />
        </div>
        <div className="shrink-0 text-[#5C4E46]">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-[#E2DCD0] space-y-3 animate-in fade-in slide-in-from-top-1">
          <p className="text-sm text-[#5C4E46] leading-relaxed">{dimData.rationale}</p>
          {dimData.drift_indicators?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-[#2C1E16] uppercase tracking-wider mb-1.5">Drift Indicators</p>
              <ul className="space-y-1">
                {dimData.drift_indicators.map((ind, i) => (
                  <li key={i} className="text-xs text-[#5C4E46] flex gap-2">
                    <span className="shrink-0 mt-0.5" style={{ color }}>•</span>
                    <span className="break-words">{ind}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Main Dashboard Component ----
export const AnalysisDashboard: React.FC<{
  data: DriftResult;
  onDownload?: () => void;
  hideDownload?: boolean;
}> = ({ data, onDownload, hideDownload }) => {
  const [showProvisions, setShowProvisions] = useState(false);
  const [showPrecedents, setShowPrecedents] = useState(false);

  const hasNewFormat = !!data.dimensions;
  const overallScore = data.overall_score ?? data.drift_score;
  const scoreColor = getScoreColor(overallScore);
  const bandLabel = data.score_band ? getScoreBandLabel(overallScore) : (overallScore <= 30 ? 'No Drift' : overallScore <= 70 ? 'Moderate Drift' : 'High Drift');
  const alertClass = data.alert_classification ?? (overallScore >= 75 ? 'GREEN' : overallScore >= 50 ? 'AMBER' : overallScore >= 25 ? 'RED' : 'CRITICAL') as AlertClassification;
  const alertColor = getAlertColor(alertClass);

  // Gauge chart data
  const gaugeData = [
    { name: 'Score', value: overallScore },
    { name: 'Remaining', value: 100 - overallScore },
  ];

  // Legacy radar fallback
  const legacyRadar = !hasNewFormat ? [
    { label: 'PROCEDURAL', value: data.drift_score },
    { label: 'SUBSTANTIVE', value: data.drift_score * 0.8 },
    { label: 'COMPLIANCE', value: data.drift_score * 0.6 },
    { label: 'SCOPE', value: data.drift_score * 0.9 },
  ] : null;

  // Legacy SVG radar (4-axis)
  const legacySvgSize = 240;
  const legacyCx = legacySvgSize / 2;
  const legacyCy = legacySvgSize / 2;
  const legacyMaxR = 65;
  const legacyLevels = 5;
  const legacyAngles = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI];
  const legacyLevelPaths = legacyRadar ? Array.from({ length: legacyLevels }, (_, i) => {
    const r = legacyMaxR * ((i + 1) / legacyLevels);
    return legacyAngles.map((a, j) => `${j === 0 ? 'M' : 'L'} ${legacyCx + r * Math.cos(a)} ${legacyCy + r * Math.sin(a)}`).join(' ') + ' Z';
  }) : [];
  const legacyDataPath = legacyRadar ? legacyRadar.map((d, i) => {
    const r = legacyMaxR * Math.min(d.value / 100, 1);
    return `${i === 0 ? 'M' : 'L'} ${legacyCx + r * Math.cos(legacyAngles[i])} ${legacyCy + r * Math.sin(legacyAngles[i])}`;
  }).join(' ') + ' Z' : '';
  const legacyColor = legacyRadar ? (data.drift_score <= 30 ? '#138808' : data.drift_score <= 70 ? '#FF9933' : '#D32F2F') : '#FF9933';

  return (
    <div data-analysis-dashboard className="bg-[#F4F1EA] rounded-2xl border border-[#E2DCD0] w-full font-serif print:shadow-none overflow-hidden">

      {/* ===== HEADER: Alert Badge + Score + Instrument Info ===== */}
      <div className="p-6 sm:p-8 border-b-2 border-[#E2DCD0]">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-[#FF9933] flex items-center justify-center text-white shadow-lg shrink-0">
              <Scale className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl sm:text-2xl font-black text-[#2C1E16] tracking-tight">
                <TranslatedText text="Statutory Conformance Analysis" />
              </h3>
              {data.instrument_profile && (
                <p className="text-xs text-[#5C4E46] mt-1">
                  {data.instrument_profile.title} — {data.parent_act?.name} ({data.parent_act?.year})
                </p>
              )}
            </div>
          </div>
          {/* Alert Badge */}
          <div
            className="px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-widest border-2 shrink-0"
            style={{
              color: alertColor,
              backgroundColor: getAlertBgColor(alertClass),
              borderColor: `${alertColor}40`,
            }}
          >
            {alertClass === 'CRITICAL' && <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" />}
            {alertClass} Alert
          </div>
        </div>
        {/* Instrument profile chips */}
        {data.instrument_profile && (
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FF9933]/10 text-[#FF9933] border border-[#FF9933]/20">
              {data.instrument_profile.type}
            </span>
            <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#2C1E16]/5 text-[#5C4E46] border border-[#E2DCD0]">
              {data.instrument_profile.issuing_authority}
            </span>
            {data.instrument_profile.date && (
              <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#2C1E16]/5 text-[#5C4E46] border border-[#E2DCD0]">
                {data.instrument_profile.date}
              </span>
            )}
          </div>
        )}
      </div>

      <div className="p-6 sm:p-8 space-y-8">

        {/* ===== CHARTS: Gauge + Radar ===== */}
        <div id="pdf-charts-container" className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Gauge */}
          <div className="flex flex-col items-center">
            <div className="h-64 w-full relative" style={{ minHeight: '256px' }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                <PieChart>
                  <Pie
                    data={gaugeData}
                    cx="50%"
                    cy="100%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={80}
                    outerRadius={115}
                    paddingAngle={0}
                    dataKey="value"
                    stroke="none"
                  >
                    <Cell key="cell-0" fill={scoreColor} />
                    <Cell key="cell-1" fill="#E8E2D2" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute bottom-4 left-0 right-0 text-center">
                <div className="text-7xl font-black text-[#2C1E16] tracking-tighter tabular-nums">
                  {overallScore}<span className="text-xl font-normal opacity-60">%</span>
                </div>
                <div
                  className="mt-2 px-6 py-1.5 rounded-full text-[10px] font-bold inline-block uppercase tracking-widest border-2"
                  style={{ backgroundColor: `${scoreColor}15`, color: scoreColor, borderColor: `${scoreColor}40` }}
                >
                  {bandLabel}
                </div>
              </div>
            </div>
            <div className="mt-2 text-center">
              <h5 className="text-xs font-bold text-[#2C1E16] uppercase tracking-[0.2em]">
                <TranslatedText text="Overall Conformance Score" />
              </h5>
              <p className="text-[10px] text-[#5C4E46] mt-1 italic">
                <TranslatedText text="Weighted mean of 7 statutory dimensions" />
              </p>
            </div>
          </div>

          {/* Radar */}
          <div className="flex flex-col items-center">
            {hasNewFormat ? (
              <>
                <SevenAxisRadar dimensions={data.dimensions} />
                <h5 className="text-xs font-bold text-[#2C1E16] uppercase tracking-[0.2em] mt-4 text-center">
                  <TranslatedText text="7-Dimension Statutory Conformance" />
                </h5>
                <p className="text-[10px] text-[#5C4E46] mt-1 italic text-center">
                  <TranslatedText text="Per-dimension scores against parent Act" />
                </p>
              </>
            ) : (
              <>
                <div style={{ width: '100%', minHeight: '280px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ paddingLeft: '20px', paddingRight: '60px' }}>
                    <svg width={legacySvgSize} height={legacySvgSize} viewBox={`0 0 ${legacySvgSize} ${legacySvgSize}`} style={{ overflow: 'visible' }}>
                      {legacyLevelPaths.map((d, i) => <path key={i} d={d} fill="none" stroke="#E2DCD0" strokeWidth={1} />)}
                      {legacyAngles.map((a, i) => <line key={i} x1={legacyCx} y1={legacyCy} x2={legacyCx + legacyMaxR * Math.cos(a)} y2={legacyCy + legacyMaxR * Math.sin(a)} stroke="#E2DCD0" strokeWidth={1} />)}
                      <path d={legacyDataPath} fill={legacyColor} fillOpacity={0.4} stroke={legacyColor} strokeWidth={2} />
                      <text x={legacyCx} y={legacyCy - legacyMaxR - 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">PROCEDURAL</text>
                      <text x={legacyCx + legacyMaxR + 10} y={legacyCy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">SUBSTANTIVE</text>
                      <text x={legacyCx} y={legacyCy + legacyMaxR + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">COMPLIANCE</text>
                      <text x={legacyCx - legacyMaxR - 10} y={legacyCy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">SCOPE</text>
                    </svg>
                  </div>
                </div>
                <h5 className="text-xs font-bold text-[#2C1E16] uppercase tracking-[0.2em] mt-2 text-center">
                  <TranslatedText text="Drift Dimensions Analysis" />
                </h5>
                <p className="text-[10px] text-[#5C4E46] mt-1 italic text-center">
                  <TranslatedText text="Categorical breakdown of regulatory variance" />
                </p>
              </>
            )}
          </div>
        </div>

        {/* ===== DIMENSION SCORE CARDS (7) ===== */}
        {hasNewFormat && data.dimensions && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 font-bold text-[#2C1E16] text-sm uppercase tracking-wider">
              <Shield className="w-4 h-4 text-[#FF9933]" />
              <TranslatedText text="Dimension-wise Assessment" />
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {DIMENSION_META.map((dim) => {
                const dimData = (data.dimensions as any)[dim.key] as DimensionScore | undefined;
                if (!dimData) return null;
                return <DimensionCard key={dim.key} dim={dim} dimData={dimData} />;
              })}
            </div>
          </div>
        )}

        {/* ===== PROVISION MAPPING TABLE ===== */}
        {data.provision_mappings && data.provision_mappings.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowProvisions(!showProvisions)}
              className="flex items-center gap-2 font-bold text-[#2C1E16] text-sm uppercase tracking-wider hover:text-[#FF9933] transition-colors w-full text-left"
            >
              <BookOpen className="w-4 h-4 text-[#FF9933]" />
              <TranslatedText text="Provision-Level Mapping" />
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#2C1E16]/5 text-[#5C4E46]">
                {data.provision_mappings.length}
              </span>
              <span className="ml-auto text-[#5C4E46]">
                {showProvisions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {showProvisions && (
              <div className="overflow-x-auto rounded-xl border border-[#E2DCD0] animate-in fade-in slide-in-from-top-1">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-[#E2DCD0]/50 text-[#2C1E16]">
                      <th className="text-left p-3 font-bold text-xs uppercase tracking-wider min-w-[140px]">Instrument Provision</th>
                      <th className="text-left p-3 font-bold text-xs uppercase tracking-wider min-w-[140px]">Act Section</th>
                      <th className="text-left p-3 font-bold text-xs uppercase tracking-wider min-w-[100px]">Status</th>
                      <th className="text-left p-3 font-bold text-xs uppercase tracking-wider min-w-[200px]">Explanation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.provision_mappings.map((pm, i) => (
                      <tr key={i} className="border-t border-[#E2DCD0]/60 hover:bg-white/40 transition-colors">
                        <td className="p-3 text-[#2C1E16] font-medium whitespace-normal break-words">{pm.instrument_provision}</td>
                        <td className="p-3 text-[#5C4E46] whitespace-normal break-words">{pm.act_section}</td>
                        <td className="p-3">
                          <span
                            className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                            style={{ color: getAlignmentColor(pm.alignment), backgroundColor: `${getAlignmentColor(pm.alignment)}12` }}
                          >
                            {getAlignmentLabel(pm.alignment)}
                          </span>
                        </td>
                        <td className="p-3 text-[#5C4E46] text-xs whitespace-normal break-words">{pm.explanation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ===== PRECEDENT CITATIONS ===== */}
        {data.precedent_citations && data.precedent_citations.length > 0 && (
          <div className="space-y-3">
            <button
              onClick={() => setShowPrecedents(!showPrecedents)}
              className="flex items-center gap-2 font-bold text-[#2C1E16] text-sm uppercase tracking-wider hover:text-[#FF9933] transition-colors w-full text-left"
            >
              <Gavel className="w-4 h-4 text-[#FF9933]" />
              <TranslatedText text="Precedent Review" />
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#2C1E16]/5 text-[#5C4E46]">
                {data.precedent_citations.length}
              </span>
              <span className="ml-auto text-[#5C4E46]">
                {showPrecedents ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </span>
            </button>
            {showPrecedents && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                {data.precedent_citations.map((pc, i) => (
                  <div key={i} className="bg-white/60 rounded-xl border border-[#E2DCD0] p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#FF9933]/10 flex items-center justify-center shrink-0">
                        <Gavel className="w-4 h-4 text-[#FF9933]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-[#2C1E16] text-sm break-words">
                          {pc.case_name} <span className="font-normal text-[#5C4E46]">({pc.year})</span>
                        </p>
                        <p className="text-xs text-[#5C4E46] mt-1 break-words">{pc.principle}</p>
                        <p className="text-xs text-[#FF9933] mt-1 font-medium break-words">{pc.applicability}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== DOWNLOAD BUTTON ===== */}
      {!hideDownload && onDownload && (
        <div className="p-6 sm:p-8 pt-0">
          <button
            onClick={onDownload}
            className="w-full bg-[#2C1E16] text-[#F4F1EA] px-6 py-3 rounded-xl font-bold hover:bg-[#FF9933] hover:text-[#000080] transition-all shadow-lg flex items-center justify-center gap-2 group"
          >
            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <TranslatedText text="Download PDF Report" />
          </button>
        </div>
      )}
    </div>
  );
};
