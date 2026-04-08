import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PreviewState {
  isPreviewMode: boolean;
  previewChildId: string | null;
  previewChildName: string | null;
  enterPreviewMode: (childId: string, childName: string) => void;
  exitPreviewMode: () => void;
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      isPreviewMode: false,
      previewChildId: null,
      previewChildName: null,
      enterPreviewMode: (childId: string, childName: string) =>
        set({ isPreviewMode: true, previewChildId: childId, previewChildName: childName }),
      exitPreviewMode: () =>
        set({ isPreviewMode: false, previewChildId: null, previewChildName: null }),
    }),
    {
      name: 'preview-mode-storage',
    }
  )
);
