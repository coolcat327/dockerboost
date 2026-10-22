import ts from 'typescript';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative, dirname, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path));
    else if (/\.[cm]?[jt]s$/.test(entry.name)) files.push(path);
  }
  return files;
}
function references(source) {
  const imports = [];
  const visit = node => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier);
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) imports.push(node.argument.literal);
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) imports.push(node.moduleReference.expression);
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require') && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}
export async function checkApiBoundaries(directory) {
  const root = resolve(directory), files = await sourceFiles(root), known = new Set(files);
  const local = path => relative(root, path).split('\\').join('/');
  const errors = [];
  const modules = new Set();
  for (const file of files) {
    const path = local(file), owner = path.match(/^routes\/([^/]+)\//)?.[1];
    if (/^routes\/[^/]+\.[cm]?[jt]s$/.test(path)) errors.push(`${path}: 路由必须位于业务目录中`);
    if (owner) modules.add(owner);
    const source = ts.createSourceFile(file, await readFile(file, 'utf8'), ts.ScriptTarget.Latest, true);
    for (const item of references(source)) {
      if (!item.text.startsWith('.')) continue;
      const target = resolve(dirname(file), item.text);
      const candidates = extname(target) ? [target.replace(/\.js$/, '.ts'), target] : [`${target}.ts`, resolve(target, 'index.ts')];
      const resolved = candidates.find(candidate => known.has(candidate));
      if (!resolved) continue; // TypeScript checks unresolved imports; shared code may live outside api.
      const destination = local(resolved), targetOwner = destination.match(/^routes\/([^/]+)\//)?.[1];
      const line = source.getLineAndCharacterOfPosition(item.getStart()).line + 1;
      const fail = message => errors.push(`${path}:${line}: ${message} (${destination})`);
      if (path.startsWith('common/') && targetOwner) fail('common 不能依赖业务路由');
      if (path.startsWith('platforms/') && targetOwner) fail('平台入口必须通过 app.ts 使用业务路由');
      if (path.startsWith('platforms/') && destination.startsWith('platforms/') && destination !== path) fail('平台入口不能依赖其他平台');
      if (['index.ts', 'app.ts'].includes(path) && destination.startsWith('platforms/')) fail('共用应用不能依赖平台入口');
      if (owner && targetOwner && owner !== targetOwner) fail('业务模块不能引用其他业务模块，实际共享能力放 common');
      if (['index.ts', 'app.ts'].includes(path) && destination.startsWith('routes/') && !/^routes\/[^/]+\/index\.ts$/.test(destination)) fail('应用入口只能引用业务模块 index.ts');
      if ((owner || path.startsWith('common/')) && (['index.ts', 'app.ts'].includes(destination) || destination.startsWith('platforms/'))) fail('业务模块和 common 不能反向依赖应用或平台入口');
    }
  }
  for (const name of modules) if (!known.has(resolve(root, 'routes', name, 'index.ts'))) errors.push(`routes/${name}: 缺少公开路由入口 index.ts`);
  return errors;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const errors = await checkApiBoundaries(fileURLToPath(new URL('../src/api/', import.meta.url)));
  if (errors.length) { for (const error of errors) console.error(error); process.exitCode = 1; }
  else console.log('API dependency boundaries passed.');
}
