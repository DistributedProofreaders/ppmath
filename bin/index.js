#!/usr/bin/env node

const fs = require("fs"); // file system
const mj = require("mathjax");
const crypto = require("crypto");

const packageJson = require('../package.json');
console.log("m2svg version ", packageJson.version);

const myArgs = process.argv.slice(2);
if(myArgs.length !== 2) {
    console .log("use 'm2svg infile outfile'");
    process.exit();
}

let inFile = myArgs[0];
let outFile = myArgs[1];

var textOut = "";

const imageDir = "images";
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir);
}

function toBuffer(txt) {
    textOut += txt;
}

function reportError(msg) {
    console.log(msg);
}

let fileSerial = 0;
const fileNumbers = new Map();

function gFix(txt) {
    // remove attributes from g tags that cause validation problems
    txt = txt.replace(/data-mml-node=".*?"/g, "");
    txt = txt.replace(/data-c=".*?"/g, "");
    txt = txt.replace(/data-mjx-texclass=".*?"/g, "");
    // remove role and focusable which also fail to validate in ebookmaker
    txt = txt.replace(/role=".*?"/, "");
    txt = txt.replace(/focusable=".*?"/, "");
    // add version
    txt = txt.replace(/^<svg/, `<svg version="1.1"`);
    return txt;
}

function writeMath(MathJax, mathTxt, inLine) {
    const svg = MathJax.tex2svg(mathTxt, {display: !inLine});
    let svgCode = MathJax.startup.adaptor.innerHTML(svg);

    // make serial file nunmbers and put them in a map with keys so we can
    // re-use them for the same math.
    // make a key from the original equation including end tags in case same
    // math is both display and inline.
    const hash = crypto.createHmac("md5", mathTxt).digest("hex");
    let fileNumber = fileNumbers.get(hash);
    if(fileNumber === undefined) {
        fileSerial += 1;
        fileNumber = fileSerial;
        // add it to the map
        fileNumbers.set(hash, fileNumber);
    }
    const fileName = `${imageDir}/${fileNumber}.svg`;

    // write html to display the image
    let source = `src="${fileName}"`;

    // build style for html from svg
    // need vertical-align for html
    let re = /style="vertical-align: (.+?);"/;
    let result = re.exec(svgCode);
    let vAlign = result ? result[1] : "0px";

    // for epub to work in ADE etc. we need width and height from svg also in
    // style and to replace svg width and height with values from viewBox
    re = /width="(.+?)"/;
    result = re.exec(svgCode);
    let width = result ? result[1] : "0px";

    re = /height="(.+?)"/;
    result = re.exec(svgCode);
    let height = result ? result[1] : "0px";

    let style = `style="vertical-align: ${vAlign}; width: ${width}; height: ${height};"`;

    re = /viewBox=".+? .+? (.+?) (.+?)"/;
    result = re.exec(svgCode);
    width = result[1];
    height = result[2];
    svgCode = svgCode.replace(/ width=".*?"/, ` width="${width}px"`);
    svgCode = svgCode.replace(/ height=".*?"/, ` height="${height}px"`);

    svgCode = gFix(svgCode);

    // store svg in a file
    fs.writeFileSync(fileName, svgCode);

    let alt = `alt=" "`;
    const dataTex = `data-tex="${mathTxt}"`;
    const imgTag = `<img ${style} ${source} ${alt} ${dataTex}>`;
    if(inLine) {
        toBuffer(imgTag);
    } else { // display
        toBuffer(`<span class="align-center">${imgTag}</span>`);
    }
    // indicate progress
    process.stdout.write(".");
}

function convert(MathJax) {
    let textIn = fs.readFileSync(inFile, "utf8");

    let tagStack = [];  // holds start tag [ or (
    let stackTop;
    let startIndex = 0;
    // look for opening or closing tags or newlines
    let mathRegex = /\\\[|\\\]|\\\(|\\\)|(\r\n|\n|\r)/g;
    let result;
    // track line numbers for reporting errors
    let lineNum = 1;
    while((result = mathRegex.exec(textIn)) !== null) {
        if(result[1]) { // newline
            lineNum += 1;
            continue;
        }
        let tag = result[0].charAt(1);
        let tagIndex = result.index;
        if (tagStack.length === 0) {
            // no tags on stack
            if ((tag === '(') || (tag === '[')) {
                // exclude tag from text block
                toBuffer(textIn.slice(startIndex, tagIndex));
                // remember line for this tag in case error occurs later
                tagStack.push({tag: tag, openLine: lineNum});
            } else {
                // closing tag
                reportError(`no start tag for \\${tag} at line ${lineNum}`);
            }
            startIndex = tagIndex + 2;
        } else {
            // tags on stack
            stackTop = tagStack[tagStack.length - 1];
            // ignore non-matching tags
            let openTag = stackTop.tag;
            if (((openTag === '(') && (tag === ')')) || ((openTag === '[') && (tag === ']'))) {
                tagStack.pop();
                let inLine = (openTag === '(');
                writeMath(MathJax, textIn.slice(startIndex, tagIndex), inLine);
                startIndex = tagIndex + 2;
            }
        }
    }
    // if there are any tags on the stack mark them as errors
    while (tagStack.length !== 0) {
        stackTop = tagStack.pop();
        reportError(`no end tag for \\${stackTop.tag} at line ${stackTop.openLine}`);
    }
    // copy remaining text
    toBuffer(textIn.slice(startIndex));
    fs.writeFileSync(outFile, textOut);
    console.log("Finished");
}

mj.init({
    loader: {load: ['input/tex', 'output/svg']}
}).then(convert)
    .catch((err) => reportError(err.message));
