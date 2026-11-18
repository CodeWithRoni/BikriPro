import { Truck } from 'lucide-react';
import PartiesPage from '../components/PartiesPage';

export default function Suppliers() {
  return <PartiesPage type="supplier" icon={Truck} title="Suppliers" subtitle="Supplier profiles, payables and ledgers (rebates & commissions)" />;
}
