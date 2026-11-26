export const languageStorageKey = "maternal-language";
export const supportedLanguages = ["en", "rw", "fr"];

export function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(languageStorageKey);
    return supportedLanguages.includes(stored) ? stored : "en";
  } catch {
    return "en";
  }
}
