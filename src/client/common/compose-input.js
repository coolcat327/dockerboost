// Owns local input timing and file reads; parsing and task handling stay separate.
export function bindComposeInput({ input, upload, onChange, onParse, onError, delay = 250 }) {
  let revision = 0, timer, composing = false;
  const invalidate = () => { clearTimeout(timer); revision++; onChange(); };
  const schedule = () => { if (!composing) timer = setTimeout(onParse, delay); };
  input.addEventListener('input', () => { invalidate(); upload.value = ''; schedule(); });
  input.addEventListener('compositionstart', () => { composing = true; clearTimeout(timer); });
  input.addEventListener('compositionend', () => { composing = false; invalidate(); schedule(); });
  async function readFiles(files) {
    if (!files.length) return;
    invalidate();
    const current = revision;
    try {
      if (files.length !== 1) throw new Error('Please choose one Compose YAML file');
      const file = files[0];
      if (!/\.(ya?ml|txt)$/i.test(file.name)) throw new Error('Choose a .yaml, .yml or .txt file');
      if (file.size > 1024 * 1024) throw new Error('Compose exceeds 1 MiB');
      const text = await file.text();
      if (current !== revision) return;
      input.value = text;
      onParse();
    } catch (error) { if (current === revision) onError(error); }
    finally { if (current === revision) upload.value = ''; }
  }
  upload.addEventListener('change', () => { void readFiles([...upload.files]); });
  const hasFiles = event => [...(event.dataTransfer?.types || [])].includes('Files');
  input.addEventListener('dragover', event => {
    if (!hasFiles(event)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; input.classList.add('is-dragging');
  });
  input.addEventListener('dragleave', () => input.classList.remove('is-dragging'));
  input.addEventListener('drop', event => {
    input.classList.remove('is-dragging');
    if (!hasFiles(event)) return;
    event.preventDefault(); void readFiles([...event.dataTransfer.files]);
  });
}
