#!/usr/bin/env node

const fs = require("fs"); // file system
const mj = require("mathjax");
const crypto = require("crypto");

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

function gFix(txt) {
    // remove attributes from g tags that cause validation problems
    txt = txt.replace(/data-mml-node=".*?"/g, "");
    txt = txt.replace(/data-c=".*?"/g, "");
    txt = txt.replace(/data-mjx-texclass=".*?"/g, "");
    // remove role and focusable which also fail to validate in ebookmaker
    txt = txt.replace(/role=".*?"/, "");
    txt = txt.replace(/focusable=".*?"/, "");
    return txt;
}

function writeMath(MathJax, mathTxt, inLine) {
    const svg = MathJax.tex2svg(mathTxt, {display: !inLine});
    let svgCode = MathJax.startup.adaptor.innerHTML(svg);

    // make a file name from the original equation
    const hash = crypto.createHmac("md5", mathTxt).digest("hex");
    var fileName = `${imageDir}/${hash}.svg`;

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

    let style=`style="vertical-align: ${vAlign}; width: ${width}; height: ${height};"`;

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
    if(inLine) {
        toBuffer(`<img ${style} ${source}  ${alt} data-tex="(${mathTxt})">`);
    } else { // display
        toBuffer(`<span class="align-center"><img ${style} ${source} ${alt} data-tex="[${mathTxt}]"></span>`);
    }
    // indicate progress
    process.stdout.write(".");
}

function convert(MathJax) {
    const packageJson = require('../package.json');
    console.log("m2svg version ", packageJson.version);

    let textIn = fs.readFileSync(inFile, "utf8");

    let startIndex = 0;
    let txtBlock = "";
    // loolk for opening or closing tags or newlines
    let mathRegex = /\\\[|\\\]|\\\(|\\\)|(\r\n|\n|\r)/g;
    let result;
    // track line numbers for reporting errors
    let lineNum = 1;
    let openTag = false;
    while((result = mathRegex.exec(textIn)) !== null) {
        if(result[1]) { // newline
            lineNum += 1;
            continue;
        }
        let endIndex;
        let tag = result[0].charAt(1);
        if ((tag === '(') || (tag === '[')) {
            // exclude tag from text block
            endIndex = result.index;
            txtBlock = textIn.slice(startIndex, endIndex);

            if(openTag) {
                reportError(`tag at line ${openLine} not closed, \\${openTag} found at line ${lineNum}`);
            }
            // remember line for this tag in case error occurs
            openLine = lineNum;
            // resynch to this tag anyway
            openTag = tag;
            toBuffer(txtBlock);
        } else {
            // must be ) or ] include tag in text block
            endIndex = result.index + 2;
            txtBlock = textIn.slice(startIndex, endIndex);
            if(!openTag) {
                reportError(`no start tag for \\${tag} at line ${lineNum}`);
                toBuffer(txtBlock);
            } else if (((openTag === '(') && (tag === ')')) || ((openTag === '[') && (tag === ']'))) {
                // correctly matched
                let inLine = (openTag === '(');
                writeMath(MathJax, txtBlock.slice(2, -2), inLine);
            } else {
                reportError(`mismatched tags \\${tag} from line ${openLine} to line ${lineNum}`);
                toBuffer(txtBlock);
            }
            openTag = false;
        }
        startIndex = endIndex;
    }

    if (openTag) {
        reportError(`no end tag for \\${openTag} at line ${openLine}`);
    }

    // copy remaining text
    toBuffer(textIn.slice(startIndex));
    fs.writeFileSync(outFile, textOut);
    console.log("Finished");
};

mj.init({
    loader: {load: ['input/tex', 'output/svg']}
}).then(convert)
    .catch((err) => reportError(err.message));
