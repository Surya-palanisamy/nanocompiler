const fs = require('fs');
const path = require('path');

function copyFolderSync(from, to) {
  if (!fs.existsSync(from)) {
    console.warn(`Source folder does not exist: ${from}`);
    return;
  }
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from).forEach(element => {
    const stat = fs.lstatSync(path.join(from, element));
    if (stat.isFile()) {
      fs.copyFileSync(path.join(from, element), path.join(to, element));
    } else if (stat.isDirectory()) {
      copyFolderSync(path.join(from, element), path.join(to, element));
    }
  });
}

function copyFileSync(from, to) {
  const dir = path.dirname(to);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(from, to);
}

// 1. Copy Monaco Editor files
const monacoSrc = path.join(__dirname, '../node_modules/monaco-editor/min/vs');
const monacoDest = path.join(__dirname, '../public/monaco/vs');
console.log(`Copying Monaco Editor from ${monacoSrc} to ${monacoDest}...`);
copyFolderSync(monacoSrc, monacoDest);

// 2. Copy Pyodide files
let pyodideSrcDir;
try {
  pyodideSrcDir = path.dirname(require.resolve('pyodide/package.json'));
} catch (e) {
  pyodideSrcDir = path.join(__dirname, '../node_modules/pyodide');
}

const pyodideFiles = [
  'pyodide.js',
  'pyodide.asm.js',
  'pyodide.asm.wasm',
  'pyodide-lock.json',
  'python_stdlib.zip'
];
const pyodideDest = path.join(__dirname, '../public/pyodide');
console.log(`Copying Pyodide files from ${pyodideSrcDir} to ${pyodideDest}...`);
pyodideFiles.forEach(file => {
  const srcFile = path.join(pyodideSrcDir, file);
  const destFile = path.join(pyodideDest, file);
  if (fs.existsSync(srcFile)) {
    copyFileSync(srcFile, destFile);
  } else {
    console.warn(`Warning: Pyodide file ${file} not found at ${srcFile}`);
  }
});

console.log('Assets copying completed!');
