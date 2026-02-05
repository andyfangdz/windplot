'use client';

import { useState, useEffect } from 'react';

// Common runway surface types
const SURFACE_TYPES = [
  { id: 'ASPH', label: 'Asphalt', description: 'Paved asphalt surface' },
  { id: 'CONC', label: 'Concrete', description: 'Paved concrete surface' },
  { id: 'ASPH-CONC', label: 'Asphalt/Concrete', description: 'Mixed paved surface' },
  { id: 'TURF', label: 'Turf/Grass', description: 'Grass surface' },
  { id: 'GRVL', label: 'Gravel', description: 'Gravel surface' },
  { id: 'GRAVEL', label: 'Gravel (alt)', description: 'Gravel surface' },
  { id: 'DIRT', label: 'Dirt', description: 'Unpaved dirt surface' },
  { id: 'WATER', label: 'Water', description: 'Seaplane runway' },
];

// Surfaces that match "paved" category
const PAVED_SURFACES = ['ASPH', 'CONC', 'ASPH-CONC', 'ASPH-TRTD', 'PEM'];

export interface Settings {
  allowedSurfaces: string[];
}

const DEFAULT_SETTINGS: Settings = {
  allowedSurfaces: PAVED_SURFACES, // Default to paved runways only
};

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
}

export function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const saved = localStorage.getItem('windplot-settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem('windplot-settings', JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings:', e);
  }
}

export default function SettingsModal({ isOpen, onClose, settings, onSave }: SettingsModalProps) {
  const [allowedSurfaces, setAllowedSurfaces] = useState<string[]>(settings.allowedSurfaces);

  useEffect(() => {
    setAllowedSurfaces(settings.allowedSurfaces);
  }, [settings]);

  if (!isOpen) return null;

  const toggleSurface = (surface: string) => {
    setAllowedSurfaces((prev) =>
      prev.includes(surface)
        ? prev.filter((s) => s !== surface)
        : [...prev, surface]
    );
  };

  const selectAllPaved = () => {
    setAllowedSurfaces(PAVED_SURFACES);
  };

  const selectAll = () => {
    setAllowedSurfaces(SURFACE_TYPES.map((s) => s.id));
  };

  const handleSave = () => {
    const newSettings: Settings = { allowedSurfaces };
    saveSettings(newSettings);
    onSave(newSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-[var(--bg-secondary)] border border-[var(--border-color-strong)] rounded-2xl max-w-md w-full max-h-[80vh] overflow-hidden shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">Settings</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-1 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          <div className="mb-4">
            <h3 className="text-sm font-medium text-[var(--text-primary)] mb-1.5">Runway Surface Types</h3>
            <p className="text-xs text-[var(--text-tertiary)] mb-4">
              Select which runway surface types to include in the wind component table.
            </p>

            <div className="flex gap-2 mb-4">
              <button
                onClick={selectAllPaved}
                className="text-xs px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] hover:border-[var(--border-color-strong)] text-[var(--text-secondary)] rounded-lg transition-all font-medium"
              >
                Paved Only
              </button>
              <button
                onClick={selectAll}
                className="text-xs px-3 py-1.5 bg-[var(--bg-primary)] border border-[var(--border-color)] hover:border-[var(--border-color-strong)] text-[var(--text-secondary)] rounded-lg transition-all font-medium"
              >
                All Types
              </button>
            </div>

            <div className="space-y-1">
              {SURFACE_TYPES.map((surface) => (
                <label
                  key={surface.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={allowedSurfaces.includes(surface.id)}
                    onChange={() => toggleSurface(surface.id)}
                    className="w-4 h-4 rounded border-[var(--border-color-strong)] bg-[var(--bg-primary)] text-[#1d9bf0] focus:ring-[#1d9bf0] focus:ring-offset-0"
                  />
                  <div>
                    <div className="text-sm text-[var(--text-primary)]">{surface.label}</div>
                    <div className="text-xs text-[var(--text-tertiary)]">{surface.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 p-5 border-t border-[var(--border-color)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-medium"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 text-sm bg-[#1d9bf0] hover:bg-[#1a8cd8] text-white rounded-lg transition-all font-medium shadow-[0_0_12px_rgba(29,155,240,0.25)]"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
