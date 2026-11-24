// Spec 060: public legal page « traitement-donnees » (content in i18n/legal.fr.ts and legal.en.ts).
import { createFileRoute } from '@tanstack/react-router';
import { LegalPageView } from '@/components/Legal.tsx';

export const Route = createFileRoute('/traitement-donnees')({
  component: () => <LegalPageView page="dpa" />,
});
