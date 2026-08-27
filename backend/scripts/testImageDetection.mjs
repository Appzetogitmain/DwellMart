import { detectFromBuffer } from '../src/utils/fileSignature.js';

const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const jpgHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00]);
const webpHeader = Buffer.concat([Buffer.from([0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50])]);
const svgHeader = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>');
const badHeader = Buffer.from('<!DOCTYPE html><html><body>bad</body></html>');

console.log('PNG detect:', detectFromBuffer(pngHeader));
console.log('JPG detect:', detectFromBuffer(jpgHeader));
console.log('GIF detect:', detectFromBuffer(gifHeader));
console.log('WEBP detect:', detectFromBuffer(webpHeader));
console.log('SVG detect:', detectFromBuffer(svgHeader));
console.log('BAD detect:', detectFromBuffer(badHeader));
