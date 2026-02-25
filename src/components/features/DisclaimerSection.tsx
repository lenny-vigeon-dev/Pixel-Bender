import React from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Github } from 'lucide-react';

export const DisclaimerSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="w-full bg-primary/5 rounded-lg p-4 border border-primary/20 flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
      <div className="bg-primary/10 p-2 rounded-full hidden md:block">
        <AlertTriangle className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium text-foreground/80">
          {t('disclaimer')}
        </p>
      </div>
      <a
        href="https://github.com"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 px-4 py-2 bg-background border border-border rounded-md hover:bg-muted transition-colors text-sm font-medium shadow-sm"
      >
        <Github className="h-4 w-4" />
        {t('githubRepo')}
      </a>
    </section>
  );
};
