// Spec 060: public legal page « conditions » (content in i18n/legal.fr.ts and legal.en.ts).
import { createFileRoute } from '@tanstack/react-router';
import { LegalPageView } from '@/components/Legal.tsx';

export const Route = createFileRoute('/conditions')({
  component: () => <LegalPageView page="terms" />,
});
