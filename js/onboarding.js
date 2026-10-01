/**
 * First-run onboarding: a single question, "What should I call you?".
 * Resolves with the entered name once the user presses Enter.
 */

const MAX_NAME_LENGTH = 40;

export function runOnboarding(root) {
  return new Promise((resolve) => {
    const input = root.querySelector('input');
    const hint = root.querySelector('.onboarding__hint');

    root.hidden = false;
    document.body.classList.add('is-onboarding');
    requestAnimationFrame(() => {
      root.classList.add('is-visible');
      input.focus();
    });

    input.addEventListener('input', () => {
      hint.classList.toggle('is-visible', input.value.trim().length > 0);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      const name = input.value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
      if (!name) {
        input.classList.remove('shake');
        void input.offsetWidth;
        input.classList.add('shake');
        return;
      }
      root.classList.remove('is-visible');
      document.body.classList.remove('is-onboarding');
      setTimeout(() => { root.hidden = true; }, 500);
      resolve(name);
    });
  });
}
