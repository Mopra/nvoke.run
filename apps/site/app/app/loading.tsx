import { LoadingState } from '@/components/app/states';

/** Shown the moment a screen is opened, so the navigation never waits on the server with the old page up. */
export default function Loading() {
  return <LoadingState />;
}
