import React from 'react';
import { useTranslation } from 'react-i18next';
import { Target, AlertTriangle } from 'lucide-react';

export const InfoSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 py-12">
      <section className="bg-secondary/20 rounded-lg p-6 border border-border">
        <div className="flex items-center gap-3 mb-4">
          <Target className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">{t('goal')}</h2>
        </div>
        <p className="text-lg leading-relaxed text-muted-foreground">
          {t('goalText')}
        </p>
      </section>

      <section className="bg-destructive/10 rounded-lg p-6 border border-destructive/20">
        <div className="flex items-center gap-3 mb-4 text-destructive">
          <AlertTriangle className="h-6 w-6" />
          <h2 className="text-xl font-bold">{t('disclaimer')}</h2>
        </div>
        <p className="text-muted-foreground">
          You can inspect the source code and run it locally if you prefer.
           <a
            href="https://github.com/..."
            className="ml-2 font-medium underline underline-offset-4 hover:text-primary transition-colors"
          >
            {t('githubRepo')}
          </a>
        </p>
      </section>
    </div>
  );
};
