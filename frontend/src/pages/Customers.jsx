import { Users } from 'lucide-react';
import PartiesPage from '../components/PartiesPage';

export default function Customers() {
  return <PartiesPage type="customer" icon={Users} title="Customers" subtitle="Customer profiles, loyalty points and ledgers" />;
}
