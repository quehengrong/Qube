import {cpSync, mkdirSync} from 'node:fs';
mkdirSync('dist/renderer', {recursive:true});
cpSync('renderer', 'dist/renderer', {recursive:true});
for (const [from,to] of [['../../node_modules/@xterm/xterm/lib/xterm.js','xterm.js'],['../../node_modules/@xterm/xterm/css/xterm.css','xterm.css'],['../../node_modules/@xterm/addon-fit/lib/addon-fit.js','addon-fit.js']]) cpSync(from,`dist/renderer/${to}`);
