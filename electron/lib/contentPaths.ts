import path from 'node:path';
export const cmsSourcePath = (root: string, relative: string) => path.resolve(root, relative);
export const cmsDirectoryPath = cmsSourcePath;
export const cmsIncludesGeneral = (relative: string): boolean => /^data\//i.test(relative);
