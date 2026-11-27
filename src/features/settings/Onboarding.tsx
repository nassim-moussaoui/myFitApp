import { saveProfile } from '../../app/actions';
import { ProfileForm } from './ProfileForm';

export function Onboarding() {
  return (
    <main class="onboarding" id="main">
      <header class="onboarding__head">
        <img class="onboarding__logo" src={`${import.meta.env.BASE_URL}apple-touch-icon.png`} width={56} height={56} alt="" />
        <h1 class="page-title">Bienvenue</h1>
        <p class="onboarding__lead">
          Quelques infos pour calculer tes objectifs. Tout reste sur ce téléphone, rien n'est envoyé.
        </p>
      </header>
      <ProfileForm
        submitLabel="Commencer"
        stickySubmit
        onSubmit={(p) => {
          saveProfile(p);
          window.scrollTo(0, 0);
        }}
      />
    </main>
  );
}
