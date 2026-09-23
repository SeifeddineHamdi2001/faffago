import { redirect } from 'next/navigation';

/** Only Utilisateurs is built in Paramètres so far; the rest comes with its phase. */
export default function ParametresPage() {
  redirect('/admin/parametres/utilisateurs');
}
