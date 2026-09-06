import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { messages, type Locale, type MessageKey } from "./messages";

const defaultValue = {
  locale: "en" as Locale,
  setLocale: (_locale: Locale) => {},
  t: (key: MessageKey): string => messages.en[key],
  number: (value: number) => value.toLocaleString("en-GB"),
};

export const LocaleContext = createContext(defaultValue);

export function LocaleProvider({ children, initialLocale = "en" }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => {
    const formatter = new Intl.NumberFormat(locale === "nl" ? "nl-NL" : "en-GB");
    return { locale, setLocale, t: (key: MessageKey) => messages[locale][key], number: (value: number) => formatter.format(value) };
  }, [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export const useTranslation = () => useContext(LocaleContext);
