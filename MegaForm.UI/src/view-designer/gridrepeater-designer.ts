import { open } from './gridrepeater/editor';

const BADGE = 'GridRepeaterDesignerEntry v20260522-05';

if (typeof window !== 'undefined') {
  (window as any).__MF_GRID_REPEATER_DESIGNER_ENTRY_BADGE__ = BADGE;
  (window as any).MFGridRepeaterDesigner = { open };
}

export { open };
