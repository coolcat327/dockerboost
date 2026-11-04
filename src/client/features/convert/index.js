const examples = {
  'run-to-compose': 'docker run -d --name web -p 8080:80 -e TZ=Asia/Shanghai --restart unless-stopped nginx:alpine',
  'compose-to-run': 'services:\n  web:\n    image: nginx:alpine\n    container_name: web\n    ports:\n      - "8080:80"\n    environment:\n      TZ: Asia/Shanghai\n    restart: unless-stopped\n'
};
const zh = {
  tab: '转换', kicker: 'RUN ↔ COMPOSE', title: '命令与配置互转', description: '在浏览器本地转换，不上传、不执行。复杂编排与部分参数无法无损互转，请核对结果。', copy: '复制全部',
  direction: '转换方向', toCompose: 'docker run → Compose', toRun: 'Compose → docker run', input: '输入', output: '转换结果', convert: '转换', example: '载入示例', clear: '清空', placeholder: '粘贴 docker run 命令或 Compose 配置', idle: '转换结果会显示在这里', ready: '转换完成', working: '正在转换…',
  errors: { load: '转换组件加载失败，请刷新页面后重试。', empty: '请先输入内容。', size: '输入不能超过 64 KiB。', shell: '请输入单独的 docker run 命令；不支持管道、重定向、通配符或命令替换。', run: '请输入一条 docker run 或 docker container run 命令，支持反斜杠续行。', image: '每个服务必须有有效的 image；仅 build 的配置请先构建并补充镜像名。', compose: '需要包含非空 services 的 Compose YAML。', services: '最多转换 100 个服务。', variables: '请先用 docker compose config 展开环境变量，再进行转换。', result: '转换结果无法可靠解析，请检查输入。', fallback: '转换失败，请检查命令、参数或 YAML 语法。' },
  warnings: { variablesRun: '浏览器不会展开 Shell 环境变量；美元符号按字面值保留，请按需修改。', host: 'host 网络模式不会保留端口映射，请确认网络设置。', command: '已保留命令参数边界；请核对命令与入口点。', options: '部分参数或资源需要手动处理，详见输出中的注释。', external: '请核对项目名、外部网络与命名卷，并按需预先创建资源。', lifecycle: '-d 与 --rm 属于运行方式，请在 docker compose up -d 或 docker compose run --rm 中按需设置。', orchestration: '依赖等待、build、profiles、secrets、configs、deploy 等编排行为需手动处理。', review: '生成的命令默认后台运行；核对路径、网络、卷、变量与所有参数后再执行，不能保证完整往返还原。' }, attribution: '转换引擎：Composerize / Decomposerize（MIT）'
};
const en = {
  tab: 'Convert', kicker: 'RUN ↔ COMPOSE', title: 'Run ↔ Compose', description: 'Convert locally in your browser. Inputs are never uploaded or executed. Review results: orchestration and some options cannot round-trip.', copy: 'Copy all',
  direction: 'Direction', toCompose: 'docker run → Compose', toRun: 'Compose → docker run', input: 'Input', output: 'Result', convert: 'Convert', example: 'Load example', clear: 'Clear', placeholder: 'Paste a docker run command or Compose configuration', idle: 'Your result appears here', ready: 'Conversion complete', working: 'Converting…',
  errors: { load: 'The converter could not load. Refresh the page and try again.', empty: 'Enter a command or configuration first.', size: 'Input must not exceed 64 KiB.', shell: 'Use a standalone docker run command without pipes, redirects, globs, or command substitution.', run: 'Enter one docker run or docker container run command. Backslash continuations are supported.', image: 'Every service needs a valid image. Build first and add an image for build-only services.', compose: 'Compose YAML must contain non-empty services.', services: 'Convert at most 100 services.', variables: 'Expand environment variables with docker compose config first.', result: 'The result could not be parsed reliably. Check your input.', fallback: 'Conversion failed. Check the command, options, or YAML syntax.' },
  warnings: { variablesRun: 'Shell environment variables are not expanded in the browser. Dollar signs are kept literally; edit as needed.', host: 'Port publishing is omitted for host networking. Review network settings.', command: 'Command argument boundaries were preserved; review the command and entrypoint.', options: 'Some options or resources require manual handling. See comments in the output.', external: 'Review the project name, external networks, and named volumes; create resources as needed.', lifecycle: 'Set runtime options -d and --rm with docker compose up -d or docker compose run --rm as needed.', orchestration: 'Handle dependency waits, build, profiles, secrets, configs, and deploy behavior manually.', review: 'Generated commands run detached. Review paths, networks, volumes, variables, and all options before execution; full round-trip fidelity is not guaranteed.' }, attribution: 'Engines: Composerize / Decomposerize (MIT)'
};
export const feature = {
  id: 'convert', messages: { 'zh-CN': zh, en },
  init({ panel, messages }) {
    const input = panel.querySelector('#convert-input'), output = panel.querySelector('#convert-output');
    const direction = panel.querySelector('#convert-direction'), status = panel.querySelector('[data-convert-status]');
    const button = panel.querySelector('[data-convert="convert"]'), copy = panel.querySelector('.copy-all');
    const notices = panel.querySelector('[data-convert-notices]');
    let revision = 0, state = 'idle', errorCode = '', detail = '', warnings = [];
    const render = () => {
      const m = messages();
      panel.querySelectorAll('[data-convert]').forEach(node => { node.textContent = m[node.dataset.convert]; });
      input.placeholder = m.placeholder;
      copy.disabled = !output.textContent;
      status.textContent = state === 'error' ? `${m.errors[errorCode] || m.errors.fallback}${detail ? ` ${detail}` : ''}` : m[state];
      status.classList.toggle('is-error', state === 'error');
      notices.replaceChildren(...warnings.map(key => { const li = document.createElement('li'); li.textContent = m.warnings[key]; return li; }));
      notices.hidden = !warnings.length;
    };
    const invalidate = () => { revision++; output.textContent = ''; warnings = []; state = 'idle'; detail = ''; copy.classList.remove('is-copied'); input.removeAttribute('aria-invalid'); button.disabled = false; render(); };
    input.addEventListener('input', invalidate);
    direction.addEventListener('change', invalidate);
    panel.querySelector('[data-convert="example"]').addEventListener('click', () => { input.value = examples[direction.value]; invalidate(); input.focus(); input.setSelectionRange(0, 0); input.scrollLeft = 0; });
    panel.querySelector('[data-convert="clear"]').addEventListener('click', () => { input.value = ''; invalidate(); input.focus(); input.setSelectionRange(0, 0); input.scrollLeft = 0; });
    panel.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault(); invalidate(); const current = revision; state = 'working'; button.disabled = true; render();
      let loaded = false;
      try {
        const { convert } = await import('./converter.js'); loaded = true;
        if (current !== revision) return;
        const result = convert(input.value, direction.value);
        output.textContent = result.output; warnings = result.warnings; state = 'ready';
      } catch (error) {
        if (current !== revision) return;
        errorCode = loaded ? error.message : 'load'; detail = messages().errors[errorCode] ? '' : String(error.message).slice(0, 240); state = 'error'; input.setAttribute('aria-invalid', 'true');
      } finally { if (current === revision) { button.disabled = false; render(); } }
    });
    return { setLanguage: render };
  }
};
