import { start } from './core/shell.js';

start().catch((err) => {
  console.error(err);
  document.body.textContent = `De app kon niet starten: ${err.message}`;
});
