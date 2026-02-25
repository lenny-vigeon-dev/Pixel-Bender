import React from 'react';
import { useTranslation } from 'react-i18next';
import { Github, Linkedin, Globe } from 'lucide-react';

export const Footer: React.FC = () => {
  const { t } = useTranslation();

  return (
    <footer className="border-t border-border bg-muted/50 py-6 md:py-0">
      <div className="container flex flex-col items-center justify-between gap-4 md:h-16 md:flex-row mx-auto px-4">
        <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
          {t('footer')}
        </p>
        <div className="flex items-center gap-4">
           <a
            href="https://www.linkedin.com/in/lenny-vigeon/"
            target="_blank"
            rel="noreferrer"
             className="text-muted-foreground hover:text-foreground transition-colors"
             title={t('linkedin')}
          >
            <Linkedin className="h-4 w-4" />
          </a>
          <a
            href="https://github.com/Linnchoeuh"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={t('githubRepo')}
          >
            <Github className="h-4 w-4" />
          </a>
          <a
             href="https://www.lenny-vigeon.dev/"
             target="_blank"
             rel="noreferrer"
             className="text-muted-foreground hover:text-foreground transition-colors"
             title={t('portfolio')}
          >
            <Globe className="h-4 w-4" />
          </a>
        </div>
      </div>
    </footer>
  );
};
