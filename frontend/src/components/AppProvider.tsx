import type { ReactNode } from "react";
import { useEffect } from "react";
import { apiClient } from "app";
import i18n from "../utils/i18n";
import "../utils/i18n"; // Initialize i18n

interface Props {
  children: ReactNode;
}

/**
 * A provider wrapping the whole app.
 *
 * You can add multiple providers here by nesting them,
 * and they will all be applied to the app.
 */
export const AppProvider = ({ children }: Props) => {
  // Load language preferences on app start
  useEffect(() => {
    const loadLanguagePreferences = async () => {
      try {
        const response = await apiClient.get_language_preferences();
        if (response.ok) {
          const data = await response.json();
          // Apply the effective language (user preference or family default)
          if (data.effective_language) {
            i18n.changeLanguage(data.effective_language);
          }
        }
      } catch (error) {
        // Silently fail if user is not authenticated or endpoint fails
        console.debug("Could not load language preferences:", error);
      }
    };

    loadLanguagePreferences();
  }, []);

  return <>{children}</>;
};
