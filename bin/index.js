#!/usr/bin/env node

const { parseArgs } = require('node:util');
const options = {
    mode: {
        type: 'string',
        short: 'm',
        default: 'i',
    },
    infile: {
        type: 'string',
        short: 'i',
    },
    outfile: {
        type: 'string',
        short: 'o',
    },
    margin: {
        type: 'string',
        short: 'g',
        default: '0.3em',
    },
    reverse: {
        type: 'boolean',
        short: 'r',
        default: false,
    },
};
const result = parseArgs({ options });
let values = result.values;
if (!(values.infile && values.outfile)) {
    console.log("use m2svg -i infile -o outfile -m mode -g margin (where mode is i: svg image, s: inline svg, m: mathml, margin is like 0.3em) (-r to revert)");
    return;
}

const fs = require("fs"); // file system
const packageJson = require('../package.json');
console.log("m2svg version ", packageJson.version);

let inFile = values.infile;
let outFile = values.outfile;

let textIn = fs.readFileSync(inFile, "utf8");

if (values.reverse) {
    console.log("reversing");
    textIn = textIn.replace(/<span.*?data-tex="(\\\[[^]*?\\])"[^]*?<\/span>/g, "$1");
    textIn = textIn.replace(/<span.*?data-tex="(\\\([^]*?\\\))"[^]*?<\/span>/g, "$1");
    textIn = textIn.replace(/<img.*?data-tex="(\\\([^]*?\\\))">/g, "$1");
    fs.writeFileSync(outFile, textIn);
    return;
}

const mj = require("mathjax");

const crypto = require("crypto");


// make styles
// for inline svg MathJax.startup.adaptor.textContent(MathJax.svgStylesheet()) works but
// contains custom elements and attributes that ebookmaker doesn't like
let mStyle = "";
let margString = `margin: ${values.margin} 0;`;

const imageDir = "images";

switch (values.mode) {
case 'i':
    mStyle = `.align-center {display: block; text-align: center; ${margString}}`;
    if (!fs.existsSync(imageDir)) {
        fs.mkdirSync(imageDir);
    }
    break;
case 's':
    mStyle = `.dispblock {display: block; text-align: center; ${margString}}
.dispflex {display: flex; ${margString}}`;
    break;
case 'm':
    mStyle = `.dispmarge {display: block; ${margString}}`;
    break;
default:
    break;
}

textIn = textIn.replace("__style_holder", mStyle);

var textOut = "";

function toBuffer(txt) {
    textOut += txt;
}

function reportError(msg) {
    console.log('\n' + msg);
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

function sFix(txt) {
    // remove attributes from inline svg tags that cause validation problems
    // remove focusable
    txt = txt.replace(/focusable=".*?"/g, "");
    // remove colon from id
    txt = txt.replace(/id="mjx-eqn:/g, `id="mjx-eqn`);
    return txt;
}

function writeMath(MathJax, mathTxt, inLine) {
    const taggedMath = inLine ? `\\(${mathTxt}\\)` : `\\[${mathTxt}\\]`;
    const dataTex = `data-tex="${taggedMath}"`;
    if (values.mode == 'm') {
        // mathjax errors will get marked in mml so no need to catch
        const mml = MathJax.tex2mml(mathTxt, {display: !inLine});
        if(inLine) {
            toBuffer(`<span ${dataTex}>${mml}</span>`);
        } else { // display
            toBuffer(`<span class="dispmarge" ${dataTex}>${mml}</span>`);
        }
    } else if (values.mode == 'i') {
        const svg = MathJax.tex2svg(mathTxt, {display: !inLine});
        let svgCode = MathJax.startup.adaptor.innerHTML(svg);

        // if svgCode contains error text return it.
        const reErr = /data-mjx-error="(.*?)"/;
        let result = reErr.exec(svgCode);
        if(result) {
            return result[1];
        }

        // make serial file numbers and put them in a map with keys so we can
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
        result = re.exec(svgCode);
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
        const imgTag = `<img ${style} ${source} ${alt} ${dataTex}>`;
        if(inLine) {
            toBuffer(imgTag);
        } else { // display
            toBuffer(`<span class="align-center">${imgTag}</span>`);
        }
    } else if (values.mode == 's') {
        const svg = MathJax.tex2svg(mathTxt, {display: !inLine});
        let svgCode = MathJax.startup.adaptor.innerHTML(svg);
        let svgContainer = MathJax.startup.adaptor.outerHTML(svg);
        // errors will be marked in svg so no need to catch
        svgCode = sFix(svgCode);
        if(inLine) {
            toBuffer(`<span ${dataTex}>${svgCode}</span>`);
        } else {
            let spanClass = svgContainer.includes(`width="full"`) ? "dispflex" : "dispblock";
            toBuffer(`<span class='${spanClass}' ${dataTex}>${svgCode}</span>`);
        }
    }
    // indicate progress
    process.stdout.write(".");
    return false;
}

function convert(MathJax) {
    let startIndex = 0;
    // look for opening or closing tags or newlines
    let mathRegex = /\\\[|\\\]|\\\(|\\\)|(\r\n|\n|\r)/g;
    let openTag = false;
    let tagIndex = 0;
    let result;
    let tag;
    // track line numbers for reporting errors
    let lineNum = 1;
    let openLine = 1;

    function repMismatch() {
        reportError(`\\${openTag} at line ${openLine} followed by \\${tag} at line ${lineNum}`);
    }

    function resynch() {
        openTag = tag;
        openLine = lineNum;
        startIndex = tagIndex + 2;
    }

    function writeOut() {
        let inLine = (openTag === '(');
        let mathText = textIn.slice(startIndex, tagIndex);
        let errorText = writeMath(MathJax, mathText, inLine);
        startIndex = tagIndex + 2;
        if(errorText) {
            reportError(`MathJax error near line ${lineNum}: ${errorText} : ${mathText}`);
        }
        openTag = false;
    }

    while((result = mathRegex.exec(textIn)) !== null) {
        if(result[1]) { // newline
            lineNum += 1;
            continue;
        }
        tag = result[0].charAt(1);
        tagIndex = result.index;
        if(!openTag) {
            if ((tag === '(') || (tag === '[')) {
                // copy preceding text
                toBuffer(textIn.slice(startIndex, tagIndex));
                resynch();
            } else {
                // closing tag
                reportError(`no start tag for \\${tag} at line ${lineNum}`);
            }
        } else {
            // already in math
            if(openTag === '[') {
                switch(tag) {
                case ']':
                    writeOut();
                    break;
                case '[':
                    repMismatch();
                    resynch();
                    break;
                default:
                    // ignore \( and \), if mismatched will get mathJax error
                    break;
                }
            } else {
                // openTag is (
                switch(tag) {
                case '[':
                case '(':
                    repMismatch();
                    resynch();
                    break;
                case ']':
                    repMismatch();
                    // into text mode
                    openTag = false;
                    break;
                default:
                    // )
                    writeOut();
                    break;
                }
            }
        }
    }
    if(openTag) {
        reportError(`no end tag for \\${openTag} at line ${openLine}`);
    }
    // copy remaining text
    toBuffer(textIn.slice(startIndex));
    fs.writeFileSync(outFile, textOut);
    console.log("Finished");
}

mj.init({
    loader: {load: ['input/tex', 'output/svg', '[tex]/unicode']},
    tex: {packages: {'[+]': ['unicode']}}
}).then(convert)
    .catch((err) => reportError(err.message));
