import { redirect } from 'next/navigation';

export default function VerticalFlowPage() {
  redirect('/energy-flow?mode=vertical');
}
