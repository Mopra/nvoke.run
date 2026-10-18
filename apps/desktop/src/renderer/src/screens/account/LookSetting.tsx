import { Feather, SlidersHorizontal } from 'lucide-react';
import { Segmented } from '@/components/ui/segmented';
import { setLook, useLook, type Look } from '@/lib/look';
import { Setting } from './Setting';

export function LookSetting() {
  const look = useLook();
  return (
    <Setting label="Look" description="Calm is the canvas. Field is the instrument panel.">
      <Segmented<Look>
        label="Look"
        size="sm"
        value={look}
        onChange={setLook}
        options={[
          { value: 'calm', label: 'Calm', icon: Feather },
          { value: 'field', label: 'Field', icon: SlidersHorizontal },
        ]}
      />
    </Setting>
  );
}
