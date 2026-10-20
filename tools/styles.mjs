import { compileAsync } from 'sass';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Сначала проверяем оба исходника, затем обновляем готовые файлы.
// Ошибка SCSS оставляет предыдущий рабочий CSS для просмотра обычным файлом.
export async function compileProjectStyles(root) {
  const entries = [['src/styles/main.scss', 'styles.css'], ['Blocks/blocks.scss', 'Blocks/blocks.css']];
  const compiled = await Promise.all(entries.map(async ([input, output]) => {
    const result = await compileAsync(resolve(root, input), { style: 'expanded', sourceMap: false });
    return { path: resolve(root, output), css: result.css.replace(/\r?\n/g, '\r\n') };
  }));
  const changed = [];
  for (const item of compiled) {
    let previous;
    try { previous = await readFile(item.path, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (previous !== item.css) { await writeFile(item.path, item.css, 'utf8'); changed.push(item.path); }
  }
  return changed;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await compileProjectStyles(fileURLToPath(new URL('../', import.meta.url))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
