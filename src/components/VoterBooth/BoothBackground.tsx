import React from 'react';
import { PageBackground } from '../Common/PageBackground';
import { BackgroundThemeOption } from '../../types';

interface BoothBackgroundProps {
  children: React.ReactNode;
  variant?: 'login' | 'ballot' | 'confirmation';
  customImageUrl?: string;
  customTheme?: BackgroundThemeOption;
}

export const BoothBackground: React.FC<BoothBackgroundProps> = ({
  children,
  variant = 'login',
  customImageUrl,
  customTheme,
}) => {
  return (
    <PageBackground
      theme="booth"
      subvariant={variant}
      customImageUrl={customImageUrl}
      customTheme={customTheme}
    >
      {children}
    </PageBackground>
  );
};
