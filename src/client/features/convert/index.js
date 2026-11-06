import { messages } from './messages.js';

export const feature = {
  id: 'convert', messages,
  init({ panel, messages }) {
    const input = panel.querySelector('#convert-input'), output = panel.querySelector('#convert-output');
    const status = panel.querySelector('[data-convert-status]'), notices = panel.querySelector('[data-convert-notices]');
    let revision = 0, state = 'idle', errorCode = '', warnings = [];
    const composing = new WeakSet();
    const render = () => {
      const m = messages();
      status.textContent = state === 'error' ? (m.errors[errorCode] || m.errors.fallback) : m[state];
      status.classList.toggle('is-error', state === 'error');
      notices.replaceChildren(...warnings.map(key => { const li = document.createElement('li'); li.textContent = m.warnings[key]; return li; }));
      notices.hidden = !warnings.length;
      panel.querySelectorAll('.copy-all').forEach(button => { button.textContent = m.copy; button.disabled = !panel.querySelector('#' + button.dataset.copy).value; });
    };
    const clearResult = (source, target) => {
      revision++; target.value = ''; warnings = []; source.removeAttribute('aria-invalid'); target.removeAttribute('aria-invalid'); panel.querySelectorAll('.copy-all').forEach(button => button.classList.remove('is-copied'));
    };
    const update = async (source, target, direction) => {
      clearResult(source, target);
      const current = revision;
      if (!source.value.trim()) { state = 'idle'; render(); return; }
      state = 'working'; render();
      let loaded = false;
      try {
        const { convert } = await import('./converter.js'); loaded = true;
        if (current !== revision) return;
        const result = convert(source.value, direction); target.value = result.output; warnings = result.warnings; state = 'ready';
      } catch (error) { if (current !== revision) return; errorCode = loaded ? error.message : 'load'; state = 'error'; source.setAttribute('aria-invalid', 'true'); }
      render();
    };
    const bind = (source, target, direction) => {
      source.addEventListener('compositionstart', () => { composing.add(source); clearResult(source, target); state = 'idle'; render(); });
      source.addEventListener('compositionend', () => { composing.delete(source); void update(source, target, direction); });
      source.addEventListener('input', () => {
        if (composing.has(source)) { clearResult(source, target); state = 'idle'; render(); }
        else void update(source, target, direction);
      });
    };
    bind(input, output, 'run-to-compose');
    bind(output, input, 'compose-to-run');
    panel.querySelector('form').addEventListener('submit', event => event.preventDefault());
    render();
    return { setLanguage: render };
  }
};
