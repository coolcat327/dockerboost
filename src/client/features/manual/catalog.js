import { staticAssetUrl } from '../../common/download-cache-policy.js';

let catalogRequest;

// Failed requests may be retried; successful requests are shared for this page.
export function loadCatalog() {
  if (!catalogRequest) {
    catalogRequest = fetch(staticAssetUrl('command-manual.json'))
      .then(response => {
        if (!response.ok) throw new Error('Unable to load command manual');
        return response.json();
      })
      .then(commands => {
        if (!Array.isArray(commands) || !commands.length) throw new Error('Invalid command manual');
        return commands;
      })
      .catch(error => { catalogRequest = undefined; throw error; });
  }
  return catalogRequest;
}

export function searchCommands(commands, query = '', family = 'all') {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return commands.filter(item => {
    if (family !== 'all' && family !== item.family) return false;
    if (!terms.length) return true;
    const text = [item.command, item.usage, ...Object.values(item.summary), ...item.examples.flatMap(example => [example.code, ...Object.values(example.description)]), ...item.options.flatMap(option => [option.flag, ...Object.values(option.description)])].join(' ').toLowerCase();
    return terms.every(term => text.includes(term));
  });
}
