import * as fs from 'node:fs';
import * as path from 'node:path';

interface ExtensionPackageInfo {
  version: string;
}

const packageInfoCache = new Map<string, ExtensionPackageInfo>();

export function getExtensionPackageInfo(extensionPath: string): ExtensionPackageInfo {
  const cachedPackageInfo = packageInfoCache.get(extensionPath);
  if (cachedPackageInfo) {
    return cachedPackageInfo;
  }

  const packageJsonPath = path.join(extensionPath, 'package.json');
  const packageInfo = JSON.parse(
    fs.readFileSync(packageJsonPath, 'utf8'),
  ) as ExtensionPackageInfo;

  packageInfoCache.set(extensionPath, packageInfo);
  return packageInfo;
}
