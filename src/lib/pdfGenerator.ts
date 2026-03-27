import { jsPDF } from 'jspdf';
import { toJpeg } from 'html-to-image';
import { UnifiedDriftResult } from '../types/analysis';

export const generatePDFReport = async (
  result: UnifiedDriftResult,
  documentName: string | null,
  conversationId: string | null
) => {
  const doc = new jsPDF('p', 'mm', 'a4');
  const margin = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 2 * margin;
  let yPos = margin;

  // Helper function to add text with wrapping and pagination
  const addText = (
    text: string,
    fontSize: number,
    isBold: boolean = false,
    color: number[] = [0, 0, 0],
    align: 'left' | 'center' | 'justify' = 'left'
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont('helvetica', isBold ? 'bold' : 'normal');
    doc.setTextColor(color[0], color[1], color[2]);

    const lines = doc.splitTextToSize(text || '', contentWidth);

    for (let i = 0; i < lines.length; i++) {
      if (yPos > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }

      if (align === 'center') {
        doc.text(lines[i], pageWidth / 2, yPos, { align: 'center' });
      } else if (align === 'justify' && i < lines.length - 1) {
        doc.text(lines[i], margin, yPos, { align: 'justify', maxWidth: contentWidth });
      } else {
        doc.text(lines[i], margin, yPos);
      }

      yPos += fontSize * 0.4;
    }
  };

  const addSpacing = (space: number) => {
    yPos += space;
    if (yPos > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
    }
  };

  // === PAGE 1: NARRATIVE TEXT ===

  // Title
  addText('Vidhi-Vichara | Legal AI Alignment Report', 14, true, [255, 153, 51], 'center');
  addSpacing(8);

  // Document Name
  if (documentName) {
    addText(`Document: ${documentName}`, 11, false, [0, 0, 0], 'center');
    addSpacing(10);
  }

  // Introduction
  addText(
    'Namaste! I am Vidhi-Vichara, an AI legal alignment assistant created by researchers at IIT Jodhpur. I have analyzed the provided Reserve Bank of India directive against its parent legislation to determine its legal alignment.',
    10,
    true,
    [44, 30, 22],
    'justify'
  );
  addSpacing(8);

  // Statutory Authority and Alignment
  addText('Statutory Authority and Alignment', 12, true, [255, 153, 51]);
  addSpacing(4);
  addText(
    result.pdf_statutory_authority || "Information not available.",
    10,
    false,
    [0, 0, 0],
    'justify'
  );
  addSpacing(8);

  // Key Changes and Compliance
  addText('Key Changes and Compliance', 12, true, [255, 153, 51]);
  addSpacing(4);
  addText(
    result.pdf_overview || "Information not available.",
    10,
    false,
    [0, 0, 0],
    'justify'
  );
  addSpacing(8);

  // Alignment Verdict
  addText(
    result.pdf_conclusion || "Information not available.",
    10,
    true,
    [0, 0, 0],
    'justify'
  );
  addSpacing(10);

  // === PAGE 2: VISUALS ===
  doc.addPage();
  yPos = margin;

  // Try to capture visual charts from the dashboard
  const dashboardElement = document.querySelector('[data-analysis-dashboard]');
  if (dashboardElement) {
    try {
      const dataUrl = await toJpeg(dashboardElement as HTMLElement, { quality: 0.95 });
      const imgWidth = contentWidth;
      const imgHeight = (dashboardElement.clientHeight / dashboardElement.clientWidth) * contentWidth;
      
      if (yPos + imgHeight > pageHeight - margin) {
        doc.addPage();
        yPos = margin;
      }
      
      doc.addImage(dataUrl, 'JPEG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    } catch (error) {
      console.error('Failed to capture dashboard image:', error);
    }
  }

  // === DISCLAIMER ===
  if (yPos > pageHeight - 40) {
    doc.addPage();
    yPos = margin;
  }

  addSpacing(10);
  addText(
    '⚖️ Disclaimer: This analysis is for informational purposes only and does not constitute legal advice. The assessment is based on computational analysis and should be verified by qualified legal professionals before being relied upon for any legal or regulatory decisions.',
    9,
    false,
    [100, 100, 100]
  );

  // Save the PDF
  const fileName = conversationId
    ? `Vidhi-Vichara_${documentName || 'Analysis'}_${conversationId}.pdf`
    : `Vidhi-Vichara_${documentName || 'Analysis'}.pdf`;
  doc.save(fileName);
};