import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('navigation');
  return <div>{t('home')}</div>;
}
