import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PDF_HIDE_SELECTOR = '[data-pdf-hide]';
const BODY_SELECTOR = '.weekly-report-modal__bd';
/** 캡처 시 하단이 잘리지 않도록 clone 루트에만 적용 */
const PDF_CAPTURE_BOTTOM_PAD_PX = 56;
/** A4 페이지 여백 (mm) */
const PDF_MARGIN_X = 12;
const PDF_MARGIN_TOP = 14;
const PDF_MARGIN_BOTTOM = 18;

/**
 * 캔버스를 페이지 높이(mm) 단위로 잘라 각 PDF 페이지에 붙인다.
 * 전체 이미지를 offset으로 밀어 넣으면 jsPDF가 페이지 하단(297mm)까지
 * 그려 중복·하단 여백 없음이 발생하므로, 슬라이스 방식만 사용한다.
 */
function addCanvasSlicesToPdf(
  pdf: jsPDF,
  canvas: HTMLCanvasElement,
  marginX: number,
  marginTop: number,
  contentWidth: number,
  pageContentHeight: number,
): void {
  const pxPerMm = canvas.width / contentWidth;
  const pageSlicePx = Math.ceil(pageContentHeight * pxPerMm);

  let slicePx = 0;
  let pageIndex = 0;

  while (slicePx < canvas.height) {
    const sliceHeightPx = Math.min(pageSlicePx, canvas.height - slicePx);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;

    const ctx = pageCanvas.getContext('2d');
    if (ctx == null) break;
    ctx.drawImage(
      canvas,
      0,
      slicePx,
      canvas.width,
      sliceHeightPx,
      0,
      0,
      canvas.width,
      sliceHeightPx,
    );

    const sliceHeightMm = sliceHeightPx / pxPerMm;
    if (pageIndex > 0) pdf.addPage();
    pdf.addImage(
      pageCanvas.toDataURL('image/png'),
      'PNG',
      marginX,
      marginTop,
      contentWidth,
      sliceHeightMm,
    );

    slicePx += sliceHeightPx;
    pageIndex += 1;
  }
}

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
      root.style.paddingBottom = `${PDF_CAPTURE_BOTTOM_PAD_PX}px`;
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

  const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidth = pageWidth - PDF_MARGIN_X * 2;
  const pageContentHeight = pageHeight - PDF_MARGIN_TOP - PDF_MARGIN_BOTTOM;

  addCanvasSlicesToPdf(
    pdf,
    canvas,
    PDF_MARGIN_X,
    PDF_MARGIN_TOP,
    contentWidth,
    pageContentHeight,
  );
  pdf.save(filename);
}

export function weeklyReportPdfFilename(periodStart: string, periodEnd: string): string {
  const safe = (s: string) => s.replace(/[^\d-]/g, '') || 'report';
  return `주간보고서_${safe(periodStart)}_${safe(periodEnd)}.pdf`;
}
