import React from 'react';
import { useTranslation } from 'react-i18next';
import { Moon, Sun, Monitor, Github } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import clsx from 'clsx';

export const Header: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-xl">
          <span className="hidden sm:inline-block">{t('title')}</span>
          <span className="sm:hidden">LIE</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Language Selector */}
          <select
            className="bg-transparent border border-input rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={i18n.resolvedLanguage}
            onChange={(e) => changeLanguage(e.target.value)}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="es">Español</option>
            <option value="de">Deutsch</option>
            <option value="ko">한국어</option>
          </select>

          {/* Theme Toggle */}
          <div className="flex items-center border border-input rounded-md p-1">
             <button
              onClick={() => setTheme('light')}
              className={clsx(
                "p-1 rounded-sm transition-colors",
                theme === 'light' ? "bg-secondary text-secondary-foreground" : "hover:bg-muted"
              )}
              title={t('light')}
            >
              <Sun className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('system')}
              className={clsx(
                "p-1 rounded-sm transition-colors",
                theme === 'system' ? "bg-secondary text-secondary-foreground" : "hover:bg-muted"
              )}
              title={t('system')}
            >
              <Monitor className="h-4 w-4" />
            </button>
            <button
              onClick={() => setTheme('dark')}
              className={clsx(
                "p-1 rounded-sm transition-colors",
                theme === 'dark' ? "bg-secondary text-secondary-foreground" : "hover:bg-muted"
              )}
              title={t('dark')}
            >
              <Moon className="h-4 w-4" />
            </button>
          </div>

          {/* Github Link */}
          <a
            href="https://github.com/Linnchoeuh"
            target="_blank"
            rel="noreferrer"
            className="text-foreground/60 hover:text-foreground transition-colors"
          >
            <Github className="h-5 w-5" />
          </a>
        </div>
      </div>
    </header>
  );
};
