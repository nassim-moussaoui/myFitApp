import { saveProfile } from '../../app/actions';
import { ProfileForm } from './ProfileForm';

export function Onboarding() {
  return (
    <main class="screen onboarding" id="main">
      <header class="onboarding__head">
        <h1 class="title-xl">Bienvenue</h1>
        <p class="muted">
          Quelques infos pour calculer tes objectifs. Tout reste sur ce téléphone, rien n'est envoyé.
        </p>
      </header>
      <ProfileForm
        submitLabel="Commencer"
        onSubmit={(p) => {
          saveProfile(p);
          window.scrollTo(0, 0);
        }}
      />
    </main>
  );
}
