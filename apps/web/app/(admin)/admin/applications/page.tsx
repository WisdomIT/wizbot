import { ApplicationsTabs } from './_components/applications-tabs';
import { ApplicationsView } from './_components/applications-view';

export default function Page() {
  return (
    <div className="flex flex-col gap-2">
      <ApplicationsTabs />
      <ApplicationsView />
    </div>
  );
}
