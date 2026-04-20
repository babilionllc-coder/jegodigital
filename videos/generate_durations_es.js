const fs = require('fs');
const mp3Duration = require('mp3-duration');

async function main() {
    const files = fs.readdirSync('public/flamingo-audio-es').filter(f => f.endsWith('.mp3')).sort();
    let output = {};
    for (const file of files) {
        output[file] = await mp3Duration('public/flamingo-audio-es/' + file);
    }
    if (!fs.existsSync('src/compositions/FlamingoPromoES')) {
        fs.mkdirSync('src/compositions/FlamingoPromoES', { recursive: true });
    }
    fs.writeFileSync('src/compositions/FlamingoPromoES/durations.json', JSON.stringify(output, null, 2));
    console.log("Wrote durations.json", output);
}
main();
