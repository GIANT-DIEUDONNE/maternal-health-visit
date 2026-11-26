import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useState } from "react";
import { languageStorageKey, readStoredLanguage, supportedLanguages } from "./language.js";
import { translateText } from "./locales.js";

const textProps = new Set(["alt", "aria-label", "caption", "label", "message", "placeholder", "text", "title", "body"]);
const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readStoredLanguage);
  const setLanguage = useCallback((nextLanguage) => {
    if (!supportedLanguages.includes(nextLanguage)) {
      throw new Error("Unsupported language.");
    }
    localStorage.setItem(languageStorageKey, nextLanguage);
    setLanguageState(nextLanguage);
  }, []);
  const t = useCallback((text, values) => translateText(text, language, values), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = t("Maternal Health Visit Reminder");
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      description.setAttribute("content", t("Keep prenatal visits organized with a clear maternal care plan for mothers and nurses."));
    }
  }, [language, t]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within a LanguageProvider.");
  return context;
}

function translateNode(node, t) {
  if (typeof node === "string") {
    const leading = node.match(/^\s*/)?.[0] || "";
    const trailing = node.match(/\s*$/)?.[0] || "";
    const text = node.slice(leading.length, node.length - trailing.length);
    return text ? `${leading}${t(text)}${trailing}` : node;
  }
  if (Array.isArray(node)) {
    return node.map((child, index) => {
      const translated = translateNode(child, t);
      return isValidElement(translated) && translated.key === null
        ? cloneElement(translated, { key: `localized-${index}` })
        : translated;
    });
  }
  if (!isValidElement(node) || node.props.translate === "no") return node;

  const props = {};
  for (const [key, value] of Object.entries(node.props)) {
    if (key === "children") {
      props.children = translateNode(value, t);
    } else if (textProps.has(key) && typeof value === "string") {
      props[key] = t(value);
    }
  }
  return cloneElement(node, props);
}

export function LocalizedMarkup({ children }) {
  const { t } = useLanguage();
  return translateNode(children, t);
}
