import { badge, open } from './datarepeater/editor';
import type { DataRepeaterDesignerOpts } from './datarepeater/types';

(function bootstrap() {
  (window as any).MFDataRepeaterDesigner = { open, badge };
})();

export { badge, open };
export type { DataRepeaterDesignerOpts };
