import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// Booking is a sequence of steps, not a hierarchy, so each step needs an
// explicit way back. The target carries the parameters needed to restore the
// previous step rather than dropping the user at a blank form.
export default function BackLink({ to, label }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-mqd-title transition"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  );
}
