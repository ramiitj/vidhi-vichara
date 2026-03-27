import React from 'react';
import { Download } from 'lucide-react';
import { TranslatedText } from '../../contexts/LanguageContext';
import { UnifiedDriftResult } from '../../types/analysis';
import { DashboardHeader } from './DashboardHeader';
import { VisualGrid } from './VisualGrid';

interface ConversationDashboardProps {
  data: UnifiedDriftResult;
  onDownload?: () => void;
  hideDownload?: boolean;
}

export const ConversationDashboard: React.FC<ConversationDashboardProps> = ({
  data,
  onDownload,
  hideDownload,
}) => {
  return (
    <div data-analysis-dashboard className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-6">
        <DashboardHeader metrics={data.metrics} summary={data.summary} />
        <VisualGrid visualData={data.visual_data} metrics={data.metrics} />
        {!hideDownload && onDownload && (
          <div className="mt-6 flex justify-end">
            <button
              onClick={onDownload}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#2C1E16] text-[#FF9933] rounded-lg font-semibold text-sm hover:bg-[#3d2a1f] transition-colors"
            >
              <Download className="w-4 h-4" />
              <TranslatedText text="Export PDF Report" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};