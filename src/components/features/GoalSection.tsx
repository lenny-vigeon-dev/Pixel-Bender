import React from 'react';
import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';

export const GoalSection: React.FC = () => {
  const { t } = useTranslation();

  return (
    <section className="bg-secondary/20 rounded-lg p-8 border border-border mt-8">
      <div className="flex items-center gap-3 mb-4">
        <Target className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">{t('goal')}</h2>
      </div>
      <p className="text-lg leading-relaxed text-muted-foreground text-justify">
        {t('goalText')}
      </p>
    </section>
  );
};
