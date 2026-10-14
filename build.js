// Concatenates src/NN_*.js into one ES module and inlines it into src/template.html.
//   index.html      full document, play locally (double-click)
//   dist/index.html the same document, the folder Vercel serves (see vercel.json)
//   artifact.html   same page without <html>/<head>/<body>, for publishing as an Artifact
//   build/game.mjs  the raw module, for `node --check`
const fs = require('fs');
const path = require('path');

const root = __dirname;
const src = path.join(root, 'src');
const parts = fs.readdirSync(src).filter(f => /^\d\d_.*\.js$/.test(f)).sort();
// recorded voices + effects (assets/audio/proc/*.mp3) ride along as base64, ahead of the audio engine
const audioDir = path.join(root, 'assets', 'audio', 'proc');
const clips = fs.existsSync(audioDir) ? fs.readdirSync(audioDir).filter(f => f.endsWith('.mp3')).sort() : [];
const audioData = `const AUDIO_DATA = {\n${clips.map(f => `  ${JSON.stringify(f.slice(0, -4))}: '${fs.readFileSync(path.join(audioDir, f)).toString('base64')}',`).join('\n')}\n};\n`;
const js = parts.map(f => (f.startsWith('02_') ? `// ===== audio data (${clips.length} clips) =====\n${audioData}\n` : '') + `// ===== ${f} =====\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
if (js.includes('</script')) throw new Error('game code must not contain a closing script tag');

const tpl = fs.readFileSync(path.join(src, 'template.html'), 'utf8');
const [, head, body] = tpl.split(/<!--\s*(?:HEAD|BODY)\s*-->/);
if (!head || !body || !body.includes('/*__GAME__*/')) throw new Error('template needs <!--HEAD--> and <!--BODY--> sections and the game marker');
const bodyWithGame = body.replace('/*__GAME__*/', () => js);

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head.trim()}
</head>
<body>
${bodyWithGame.trim()}
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'index.html'), full);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist', 'index.html'), full);
fs.writeFileSync(path.join(root, 'artifact.html'), head.trim() + '\n' + bodyWithGame.trim() + '\n');
fs.mkdirSync(path.join(root, 'build'), { recursive: true });
fs.writeFileSync(path.join(root, 'build', 'game.mjs'), js);
console.log(`built index.html ${(full.length / 1024).toFixed(1)} KB from ${parts.length} parts`);
