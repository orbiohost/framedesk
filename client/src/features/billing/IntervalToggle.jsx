import { SegmentedControl } from '../../components/ui/SegmentedControl.jsx';

export function IntervalToggle({ value, onChange, offer }) {
  const options = [
    { value: 'monthly', label: 'Monthly' },
    {
      value: 'yearly',
      label: offer ? `Yearly · ${offer.percentOff}% off` : 'Yearly · 2 months free',
    },
  ];
  return (
    <SegmentedControl label="Billing period" options={options} value={value} onChange={onChange} />
  );
}
