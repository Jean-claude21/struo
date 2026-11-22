// Spec 060: public legal page « confidentialite » (content in i18n/legal.fr.ts and legal.en.ts).
import { createFileRoute } from '@tanstack/react-router';
import { LegalPageView } from '@/components/Legal.tsx';

export const Route = createFileRoute('/confidentialite')({
  component: () => <LegalPageView page="privacy" />,
});
