import React, { ReactNode } from 'react';
import { ThemeProvider } from '../../context/ThemeContext';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  return (
    <ThemeProvider defaultTheme="system" storageKey="app-theme">
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans transition-colors duration-300">
        {children}
      </div>
    </ThemeProvider>
  );
};
