import type { ReactNode } from "react";
import { useEffect } from "react";
import { apiClient } from "app";
import { authClient } from "app/auth/neon-auth-client";
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
  const { data: session } = authClient.useSession();

  // Load language preferences only when authenticated
  useEffect(() => {
    if (!session?.user) return;

    const loadLanguagePreferences = async () => {
      try {
        const response = await apiClient.get_language_preferences();
        if (response.ok) {
          const data = await response.json();
          if (data.effective_language) {
            i18n.changeLanguage(data.effective_language);
          }
        }
      } catch (error) {
        console.debug("Could not load language preferences:", error);
      }
    };

    loadLanguagePreferences();
  }, [session?.user]);

  return <>{children}</>;
};
