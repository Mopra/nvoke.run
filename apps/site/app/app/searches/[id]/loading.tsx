import { ResultsLoading } from '@/components/app/results-screen';

/** Shown the moment a search's page is opened, so the navigation never waits on the server with the old page up. */
export default function Loading() {
  return <ResultsLoading />;
}
