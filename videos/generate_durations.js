const fs = require('fs');
const mp3Duration = require('mp3-duration');

async function main() {
    const files = fs.readdirSync('public/flamingo-audio').filter(f => f.endsWith('.mp3')).sort();
    let output = {};
    for (const file of files) {
        output[file] = await mp3Duration('public/flamingo-audio/' + file);
    }
    fs.writeFileSync('src/compositions/FlamingoPromo/durations.json', JSON.stringify(output, null, 2));
    console.log("Wrote durations.json", output);
}
main();
