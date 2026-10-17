import { createContext, useContext } from 'react';

export interface Features {
  /** Table chat, speech markers and reactions (screens 16–19). Off until chat is built. */
  chat: boolean;
  /** How to Play practice hand (04a–f). */
  tutorial: boolean;
}

export const DEFAULT_FEATURES: Features = { chat: false, tutorial: true };

const FeaturesContext = createContext<Features>(DEFAULT_FEATURES);
export const FeaturesProvider = FeaturesContext.Provider;
export const useFeatures = () => useContext(FeaturesContext);
