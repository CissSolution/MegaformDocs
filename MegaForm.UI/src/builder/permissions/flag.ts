import { BUILDER_PERMISSIONS_BADGE } from './badge';

if (typeof window !== 'undefined') {
  (window as any).__MF_CANONICAL_PERMISSIONS__ = true;
  (window as any).__MF_CANONICAL_PERMISSIONS_BADGE__ = BUILDER_PERMISSIONS_BADGE;
}

export {};

