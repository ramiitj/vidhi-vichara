import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { TranslatedText } from '../contexts/LanguageContext';
import { Scale, Download } from 'lucide-react';

interface DriftResult {
  drift_score: number;
  alignment_status: string;
  executive_summary: string;
  changes: string[];
  risk_areas: string[];
  suggestions: string[];
  citations?: { source: string; target: string }[];
  timeline?: { date: string; event: string; drift_impact: string }[];
  chain_of_authority: string;
  pdf_overview?: string;
  pdf_statutory_authority?: string;
  pdf_conclusion?: string;
}

export const AnalysisDashboard: React.FC<{ data: DriftResult, onDownload?: () => void, hideDownload?: boolean }> = ({ data, onDownload, hideDownload }) => {
  const radarData = [
    { subject: 'PROCEDURAL', A: data.drift_score },
    { subject: 'SUBSTANTIVE', A: data.drift_score * 0.8 },
    { subject: 'COMPLIANCE', A: data.drift_score * 0.6 },
    { subject: 'SCOPE', A: data.drift_score * 0.9 },
  ];

  const driftDimensions = [
    { label: 'PROCEDURAL', value: radarData[0].A },
    { label: 'SUBSTANTIVE', value: radarData[1].A },
    { label: 'COMPLIANCE', value: radarData[2].A },
    { label: 'SCOPE', value: radarData[3].A },
  ];
  const svgSize = 240;
  const cx = svgSize / 2;
  const cy = svgSize / 2;
  const maxR = 65;
  const levels = 5;
  const angles = [Math.PI * 1.5, 0, Math.PI * 0.5, Math.PI]; // top, right, bottom, left
  const levelPaths = Array.from({ length: levels }, (_, i) => {
    const r = maxR * ((i + 1) / levels);
    return angles.map((a, j) => `${j === 0 ? 'M' : 'L'} ${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`).join(' ') + ' Z';
  });
  const dataPath = driftDimensions.map((d, i) => {
    const r = maxR * Math.min(d.value / 100, 1);
    return `${i === 0 ? 'M' : 'L'} ${cx + r * Math.cos(angles[i])} ${cy + r * Math.sin(angles[i])}`;
  }).join(' ') + ' Z';

  const gaugeData = [
    { name: 'Score', value: data.drift_score },
    { name: 'Remaining', value: 100 - data.drift_score },
  ];

  const getAlignmentStatus = (status: string, score: number) => {
    if (score <= 30) return 'No Drift';
    if (score <= 70) return 'Moderate Drift';
    return 'High Drift';
  };

  const getDriftColor = (score: number) => {
    if (score <= 30) return '#138808'; // India Green (Low Drift)
    if (score <= 70) return '#FF9933'; // Saffron (Moderate Drift)
    return '#D32F2F'; // Red (High Drift)
  };

  const driftColor = getDriftColor(data.drift_score);
  const alignmentStatus = getAlignmentStatus(data.alignment_status, data.drift_score);

  return (
    <div data-analysis-dashboard className="bg-[#F4F1EA] p-8 rounded-2xl border border-[#E2DCD0] w-full font-serif print:shadow-none overflow-visible">
      <div data-pdf-internal-header className="flex items-center justify-between mb-8 border-b-2 border-[#E2DCD0] pb-4">
        <h3 className="text-2xl font-black text-[#2C1E16] tracking-tight flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-[#FF9933] flex items-center justify-center text-white shadow-lg">
            <Scale className="w-6 h-6" />
          </div>
          <TranslatedText text="Alignment Analysis" />
        </h3>
      </div>

      <div id="pdf-charts-container" className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
        <div className="flex flex-col items-center">
          <div className="h-72 w-full relative min-h-[288px]">
            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} data-pdf-chart="gauge">
              <PieChart>
                <Pie
                  data={gaugeData}
                  cx="50%"
                  cy="100%"
                  startAngle={180}
                  endAngle={0}
                  innerRadius={90}
                  outerRadius={130}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell key="cell-0" fill={driftColor} />
                  <Cell key="cell-1" fill="#E8E2D2" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute bottom-4 left-0 right-0 text-center">
              <div className="text-8xl font-black text-[#2C1E16] tracking-tighter">
                {data.drift_score}<span className="text-2xl font-normal opacity-60">%</span>
              </div>
              <div className={`mt-2 px-8 py-2 rounded-full text-xs font-bold inline-block uppercase tracking-widest border-2`} 
                   style={{ backgroundColor: `${driftColor}20`, color: driftColor, borderColor: `${driftColor}60` }}>
                {alignmentStatus}
              </div>
            </div>
          </div>
          <div className="mt-4 text-center">
            <h5 className="text-xs font-bold text-[#2C1E16] uppercase tracking-[0.2em]">
              <TranslatedText text="Overall Alignment Score" />
            </h5>
            <p className="text-[10px] text-[#5C4E46] mt-1 italic">
              <TranslatedText text="Quantitative measure of legal consistency" />
            </p>
          </div>
        </div>
        
        <div className="flex flex-col items-center">
          <div style={{ width: '100%', minHeight: '340px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ paddingLeft: '20px', paddingRight: '60px' }}>
              <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} style={{ overflow: 'visible' }}>
                {levelPaths.map((d, i) => <path key={i} d={d} fill="none" stroke="#E2DCD0" strokeWidth={1} />)}
                {angles.map((a, i) => <line key={i} x1={cx} y1={cy} x2={cx + maxR * Math.cos(a)} y2={cy + maxR * Math.sin(a)} stroke="#E2DCD0" strokeWidth={1} />)}
                <path d={dataPath} fill={driftColor} fillOpacity={0.4} stroke={driftColor} strokeWidth={2} />
                <text x={cx} y={cy - maxR - 18} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">PROCEDURAL</text>
                <text x={cx + maxR + 10} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">SUBSTANTIVE</text>
                <text x={cx} y={cy + maxR + 22} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">COMPLIANCE</text>
                <text x={cx - maxR - 10} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#2C1E16">SCOPE</text>
              </svg>
            </div>
            <h5 className="text-xs font-bold text-center mt-2" style={{ color: '#2C1E16' }}><TranslatedText text="Drift Dimensions Analysis" /></h5>
            <p style={{ fontSize: '10px', color: '#5C4E45', textAlign: 'center' }}><TranslatedText text="Categorical breakdown of regulatory variance" /></p>
          </div>
        </div>
      </div>

      {!hideDownload && onDownload && (
        <div className="mt-8 flex gap-3">
          <button 
            onClick={onDownload} 
            className="flex-1 bg-ink text-parchment px-6 py-3 rounded-xl font-bold hover:bg-saffron hover:text-navy transition-all shadow-lg flex items-center justify-center gap-2 group"
          >
            <Download className="w-5 h-5 group-hover:scale-110 transition-transform" />
            <TranslatedText text="Download PDF Report" />
          </button>
        </div>
      )}
    </div>
  );
};
