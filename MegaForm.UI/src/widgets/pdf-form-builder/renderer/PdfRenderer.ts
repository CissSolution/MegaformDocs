// /src/widgets/pdf-form-builder/renderer/PdfRenderer.ts
// Loads PDF.js (CDN), renders each page to a canvas + overlay + grid layer.
//
// CRITICAL FIX (v2): pdfDoc instance is cached. We never call pdfjsLib.getDocument()
// twice for the same source — PDF.js may transfer ownership of the Uint8Array buffer
// on the first call, so a second call corrupts state and zoom breaks. On zoom we only
// rebuild canvases via `setZoom()` which calls `renderAllPages()` reusing pdfDoc.
//
// Coordinate model:
//   - PDF user-space: 1 unit = 1/72 inch, origin BOTTOM-LEFT
//   - Storage: fields are stored in user-space units, y from TOP (UI convention)
//   - Display: screenPx = userSpace × cssScale (cssScale = current zoom)
//   - Export to PDF (pdf-lib): flip y to bottom-up convention

import type { PdfPageInfo } from '../types';

declare global {
  interface Window {
    pdfjsLib?: any;
  }
}

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let pdfjsLoadingPromise: Promise<any> | null = null;

export function loadPdfJs(): Promise<any> {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (pdfjsLoadingPromise) return pdfjsLoadingPromise;
  pdfjsLoadingPromise = new Promise<any>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = PDFJS_CDN;
    s.onload = () => {
      if (!window.pdfjsLib) { reject(new Error('pdf.js loaded but window.pdfjsLib missing')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
      resolve(window.pdfjsLib);
    };
    s.onerror = () => reject(new Error('failed to load pdf.js from CDN'));
    document.head.appendChild(s);
  });
  return pdfjsLoadingPromise;
}

export interface PdfRendererOptions {
  source: { url?: string; data?: Uint8Array };
  containerEl: HTMLElement;
  zoom: number;
  showGrid?: boolean;
  gridSize?: number;
  onPagesReady?: (pages: PdfPageInfo[]) => void;
  onError?: (err: Error) => void;
}

export class PdfRenderer {
  private pdfDoc: any = null;
  private container: HTMLElement;
  private zoom: number;
  private source: PdfRendererOptions['source'];
  private showGrid: boolean;
  private gridSize: number;
  private onPagesReady?: (pages: PdfPageInfo[]) => void;
  private onError?: (err: Error) => void;

  public pageInfos: PdfPageInfo[] = [];
  public pageWrappers: HTMLElement[] = [];
  public grids = new Map<number, HTMLElement>();

  private isRendering = false;

  constructor(opts: PdfRendererOptions) {
    this.container = opts.containerEl;
    this.zoom = opts.zoom;
    this.source = opts.source;
    this.showGrid = opts.showGrid !== false;
    this.gridSize = opts.gridSize || 8;
    this.onPagesReady = opts.onPagesReady;
    this.onError = opts.onError;
  }

  /**
   * Load the PDF document ONCE. Reuses cached pdfDoc on subsequent renders.
   */
  public async load(): Promise<void> {
    if (this.pdfDoc) return; // already loaded
    try {
      const pdfjs = await loadPdfJs();
      // Pass a fresh copy of bytes if data — pdf.js may transfer the buffer
      const params = this.source.url
        ? { url: this.source.url }
        : { data: this.source.data!.slice() };
      const loadingTask = pdfjs.getDocument(params);
      this.pdfDoc = await loadingTask.promise;
    } catch (e: any) {
      if (this.onError) this.onError(e);
      throw e;
    }
  }

  /**
   * Render all pages. Safe to call multiple times (e.g. on zoom change).
   * Reuses cached pdfDoc — does NOT re-parse the PDF.
   */
  public async render(): Promise<void> {
    if (this.isRendering) return;
    this.isRendering = true;
    try {
      if (!this.pdfDoc) await this.load();
      this.container.innerHTML = '';
      this.pageInfos = [];
      this.pageWrappers = [];
      this.grids.clear();
      for (let p = 1; p <= this.pdfDoc.numPages; p++) {
        await this.renderPage(p);
      }
      if (this.onPagesReady) this.onPagesReady(this.pageInfos);
    } catch (e: any) {
      if (this.onError) this.onError(e);
    } finally {
      this.isRendering = false;
    }
  }

  private async renderPage(pageNumber: number): Promise<void> {
    const page = await this.pdfDoc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: this.zoom });

    const wrapper = document.createElement('div');
    wrapper.className = 'pfb-page';
    wrapper.dataset.pageNumber = String(pageNumber);
    wrapper.style.position = 'relative';
    wrapper.style.width = viewport.width + 'px';
    wrapper.style.height = viewport.height + 'px';
    wrapper.style.margin = '0 auto 16px';
    wrapper.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    wrapper.style.background = '#fff';

    const canvas = document.createElement('canvas');
    canvas.className = 'pfb-canvas';
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.display = 'block';
    wrapper.appendChild(canvas);

    // Grid layer (between canvas and overlay)
    const grid = document.createElement('div');
    grid.className = 'pfb-grid';
    grid.style.position = 'absolute';
    grid.style.top = '0';
    grid.style.left = '0';
    grid.style.width = viewport.width + 'px';
    grid.style.height = viewport.height + 'px';
    grid.style.pointerEvents = 'none';
    grid.style.zIndex = '1';
    if (!this.showGrid) grid.classList.add('hidden');
    this.applyGridBackground(grid);
    wrapper.appendChild(grid);

    // Overlay (where fields render — above grid)
    const overlay = document.createElement('div');
    overlay.className = 'pfb-overlay';
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = viewport.width + 'px';
    overlay.style.height = viewport.height + 'px';
    overlay.style.pointerEvents = 'auto';
    overlay.dataset.pageNumber = String(pageNumber);
    wrapper.appendChild(overlay);

    this.container.appendChild(wrapper);

    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const rawViewport = page.getViewport({ scale: 1 });
    this.pageInfos.push({
      pageNumber,
      width: rawViewport.width,
      height: rawViewport.height,
      cssScale: this.zoom,
    });
    this.pageWrappers.push(wrapper);
    this.grids.set(pageNumber, grid);
  }

  private applyGridBackground(gridEl: HTMLElement): void {
    const minor = this.gridSize * this.zoom;
    const major = minor * 5;
    gridEl.style.backgroundImage =
      'linear-gradient(to right,  rgba(41,128,185,0.20) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(41,128,185,0.20) 1px, transparent 1px),' +
      'linear-gradient(to right,  rgba(41,128,185,0.08) 1px, transparent 1px),' +
      'linear-gradient(to bottom, rgba(41,128,185,0.08) 1px, transparent 1px)';
    gridEl.style.backgroundSize =
      major + 'px ' + major + 'px,' +
      major + 'px ' + major + 'px,' +
      minor + 'px ' + minor + 'px,' +
      minor + 'px ' + minor + 'px';
  }

  public async setZoom(newZoom: number): Promise<void> {
    this.zoom = newZoom;
    await this.render();   // reuses cached pdfDoc
  }

  public setGridVisible(show: boolean): void {
    this.showGrid = show;
    this.grids.forEach(g => g.classList.toggle('hidden', !show));
  }

  public setGridSize(size: number): void {
    this.gridSize = size;
    this.grids.forEach(g => this.applyGridBackground(g));
  }

  public getOverlay(pageNumber: number): HTMLElement | null {
    const w = this.pageWrappers.find(el => Number(el.dataset.pageNumber) === pageNumber);
    return w ? (w.querySelector('.pfb-overlay') as HTMLElement) : null;
  }

  public destroy(): void {
    if (this.pdfDoc) {
      try { this.pdfDoc.destroy(); } catch {}
      this.pdfDoc = null;
    }
    this.container.innerHTML = '';
    this.grids.clear();
  }
}
