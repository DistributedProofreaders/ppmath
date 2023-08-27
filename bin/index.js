#!/usr/bin/env node

const fs = require("fs"); // file system
const mj = require("mathjax");
const crypto = require("crypto");

//const packageJson = require('../package.json');
//console.log("m2svg version ", packageJson.version);

const myArgs = process.argv.slice(2);
if(myArgs.length !== 2) {
    console .log("use 'm2svg infile outfile'");
    process.exit();
}

let inFile = myArgs[0];
let outFile = myArgs[1];

const imageDir = "images";
if (!fs.existsSync(imageDir)) {
    fs.mkdirSync(imageDir);
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

function writeMath(MathJax, mathTxt, inLine) {
    const svg = MathJax.tex2svg(mathTxt, {display: !inLine});
    let svgCode = MathJax.startup.adaptor.innerHTML(svg);

    // if svgCode contains error text return it.
    const reErr = /data-mjx-error="(.*?)"/;
    let result = reErr.exec(svgCode);
    if(result) {
        let errorReport = `MathJax error: ${result[1]} : ${mathTxt}`;
        reportError(errorReport);
        return errorReport;
    }

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
    // if display mode mathTxt can include inline tags
    // replace by $ to avoid processing them later
    // use $$, $ has special meaning in replace()
    let mathData = mathTxt.replace(/\\\(|\\\)/g, "$$");
    const dataTex = `data-tex="${mathData}"`;

    // indicate progress
    process.stdout.write(".");
    return `<img ${style} ${source} ${alt} ${dataTex}>`;
}

function checkParse(txt) {
    let mathRegex = /\\\[|\\\]|\\\(|\\\)|(\r\n|\n|\r)/g;
    let result;
    let lineNum = 1;
    let tag;
    let openTag = false;
    let openLine = 1;
    let ok = true;

    function repMismatch() {
        ok = false;
        reportError(`\\${openTag} at line ${openLine} followed by \\${tag} at line ${lineNum}`);
    }

    function resynch() {
        openTag = tag;
        openLine = lineNum;
    }

    while((result = mathRegex.exec(txt)) !== null) {
        if(result[1]) { // newline
            lineNum += 1;
            continue;
        }
        tag = result[0].charAt(1);
        if(!openTag) {
            if ((tag === '(') || (tag === '[')) {
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
                    openTag = false;
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
                    openTag = false;
                    break;
                }
            }
        }
    }
    if(openTag) {
        ok = false;
        reportError(`no end tag for \\${openTag} at line ${openLine}`);
    }
    return ok;
}

function convert(MathJax) {
    let textIn = fs.readFileSync(inFile, "utf8");

    if(!checkParse(textIn)) {
        return;
    }

    // process display math first so any included inline math is not processed
    let dispRe = /\\\[([^]+?)\\\]/g;

    function dispReplacer(match, p1) {
        let mathExp = writeMath(MathJax, p1, false);
        // encode inline tags so don't get processed
        return `<span class="align-center">${mathExp}</span>`;
    }

    let textOut = textIn.replace(dispRe, dispReplacer);

    // process inline math
    // include preceding nbsp if present
    // include following punctuation character or nbsp
    const inlineRe = /(&nbsp;|\u00a0)?\\\(([^]+?)\\\)(,|\.|;|:|'|\?|\)|]|(&nbsp;|\u00a0))?/g;

    function ilReplacer(match, p1, p2, p3, p4) {
        let mathExp = writeMath(MathJax, p2, true);
        if(p1 || p3) {
            let precede = p1 ? " " : "";
            let follow = "";
            // if nbsp replace by space
            if (p4) {
                follow = " ";
            } else if (p3) {
                follow = p3;
            }
            mathExp = `<span class="nowrap">${precede}${mathExp}${follow}</span>`;
        }
        return mathExp;
    }

    textOut = textOut.replace(inlineRe, ilReplacer);
    fs.writeFileSync(outFile, textOut);
    console.log("Finished");
}

mj.init({
    loader: {load: ['input/tex', 'output/svg']}
}).then(convert)
    .catch((err) => reportError(err.message));
