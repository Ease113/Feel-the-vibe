import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PDF_HIDE_SELECTOR = '[data-pdf-hide]';
const BODY_SELECTOR = '.weekly-report-modal__bd';

/**
 * 모달 DOM을 캡처해 A4 PDF로 저장한다.
 * onclone에서 스크롤·max-height를 풀고 UI 전용 요소는 숨긴다.
 */
export async function downloadElementAsPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  const canvas = await html2canvas(element, {
    scale: 2,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: true,
    onclone: (_doc, cloned) => {
      const root = cloned as HTMLElement;
      root.style.maxHeight = 'none';
      root.style.overflow = 'visible';
      root.style.boxShadow = 'none';
      const body = root.querySelector(BODY_SELECTOR) as HTMLElement | null;
      if (body != null) {
        body.style.overflow = 'visible';
        body.style.maxHeight = 'none';
      }
      root.querySelectorAll(PDF_HIDE_SELECTOR).forEach(el => {
        (el as HTMLElement).style.display = 'none';
      });
    },
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const margin = 8;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - margin * 2;
  const contentHeight = pageHeight - margin * 2;
  const imgHeight = (canvas.height * contentWidth) / canvas.width;

  let heightLeft = imgHeight;
  let offsetY = margin;

  pdf.addImage(imgData, 'PNG', margin, offsetY, contentWidth, imgHeight);
  heightLeft -= contentHeight;

  while (heightLeft > 0) {
    offsetY = margin - (imgHeight - heightLeft);
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', margin, offsetY, contentWidth, imgHeight);
    heightLeft -= contentHeight;
  }

  pdf.save(filename);
}

export function weeklyReportPdfFilename(periodStart: string, periodEnd: string): string {
  const safe = (s: string) => s.replace(/[^\d-]/g, '') || 'report';
  return `주간보고서_${safe(periodStart)}_${safe(periodEnd)}.pdf`;
}
